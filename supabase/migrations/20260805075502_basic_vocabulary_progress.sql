-- Basic vocabulary account sync: owner-isolated progress schema, RLS, reset generation.
--
-- Issue #287. Two tables preserve item status, known streak, deterministic review
-- order, and reset generations for the fixed `basic-vocabulary` course. Access is
-- owner-isolated via RLS and an idempotent reset RPC; `last_reset_id` only exists so
-- one logical reset can be safely retried after a lost response or local persistence
-- failure. It is not a device/user/session identifier and is never exposed in UI.

-- Apply cleanly from an empty state; `if not exists` guards make replay safe.
create table if not exists public.basic_vocabulary_course_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  reset_generation bigint not null default 0,
  last_reset_id uuid,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, course_id),
  unique (user_id, course_id, reset_generation),
  constraint basic_vocabulary_course_state_course_id_fixed
    check (course_id = 'basic-vocabulary'),
  constraint basic_vocabulary_course_state_reset_generation_non_negative
    check (reset_generation >= 0)
);

create table if not exists public.basic_vocabulary_progress (
  user_id uuid not null,
  course_id text not null,
  item_id text not null,
  status text not null,
  known_streak integer not null,
  review_order bigint not null,
  reset_generation bigint not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, course_id, item_id),
  foreign key (user_id, course_id, reset_generation)
    references public.basic_vocabulary_course_state(user_id, course_id, reset_generation)
    on delete cascade,
  constraint basic_vocabulary_progress_course_id_fixed
    check (course_id = 'basic-vocabulary'),
  constraint basic_vocabulary_progress_item_id_non_empty
    check (length(btrim(item_id)) > 0),
  constraint basic_vocabulary_progress_status_valid
    check (status in ('learning', 'learned')),
  constraint basic_vocabulary_progress_streak_matches_status
    check (
      (status = 'learning' and known_streak in (0, 1))
      or (status = 'learned' and known_streak >= 2)
    ),
  constraint basic_vocabulary_progress_known_streak_non_negative
    check (known_streak >= 0),
  constraint basic_vocabulary_progress_review_order_non_negative
    check (review_order >= 0),
  constraint basic_vocabulary_progress_reset_generation_non_negative
    check (reset_generation >= 0)
);

-- RLS is enabled and forced on both public tables; grants to `anon`/`public` are
-- revoked and only `authenticated` receives the CRUD privileges it needs.
alter table public.basic_vocabulary_course_state enable row level security;
alter table public.basic_vocabulary_progress enable row level security;
alter table public.basic_vocabulary_course_state force row level security;
alter table public.basic_vocabulary_progress force row level security;

revoke all on public.basic_vocabulary_course_state from anon, public;
revoke all on public.basic_vocabulary_progress from anon, public;

grant select, insert, update, delete on public.basic_vocabulary_course_state to authenticated;
grant select, insert, update, delete on public.basic_vocabulary_progress to authenticated;

-- Per-table, per-operation policies. Every policy is `to authenticated` and scoped to
-- `(select auth.uid()) = user_id`; inserts/updates carry the same explicit ownership
-- `with check`. No role/metadata/email claims and no always-true predicates.
create policy "basic_vocabulary_course_state_select" on public.basic_vocabulary_course_state
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "basic_vocabulary_course_state_insert" on public.basic_vocabulary_course_state
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "basic_vocabulary_course_state_update" on public.basic_vocabulary_course_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "basic_vocabulary_course_state_delete" on public.basic_vocabulary_course_state
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "basic_vocabulary_progress_select" on public.basic_vocabulary_progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "basic_vocabulary_progress_insert" on public.basic_vocabulary_progress
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.basic_vocabulary_course_state s
      where s.user_id = basic_vocabulary_progress.user_id
        and s.course_id = basic_vocabulary_progress.course_id
        and s.reset_generation = basic_vocabulary_progress.reset_generation
    )
  );

create policy "basic_vocabulary_progress_update" on public.basic_vocabulary_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.basic_vocabulary_course_state s
      where s.user_id = basic_vocabulary_progress.user_id
        and s.course_id = basic_vocabulary_progress.course_id
        and s.reset_generation = basic_vocabulary_progress.reset_generation
    )
  );

create policy "basic_vocabulary_progress_delete" on public.basic_vocabulary_progress
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- `updated_at` is server-authored only. A narrowly scoped trigger keeps it in sync on
-- writes without bypassing RLS and without becoming a broad mutation API. Client
-- timestamps never decide conflicts.
create function public.basic_vocabulary_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger basic_vocabulary_set_updated_at
  before update on public.basic_vocabulary_course_state
  for each row
  execute function public.basic_vocabulary_set_updated_at();

create trigger basic_vocabulary_set_updated_at
  before update on public.basic_vocabulary_progress
  for each row
  execute function public.basic_vocabulary_set_updated_at();

-- Idempotent transactional reset. Frozen seven-step behavior; security invoker with an
-- empty search path, all objects schema-qualified, no security definer and no
-- service-role dependency.
create or replace function public.reset_basic_vocabulary_progress(p_reset_id uuid)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_generation bigint;
begin
  if v_uid is null then
    raise exception 'reset_basic_vocabulary_progress: not authenticated';
  end if;
  if p_reset_id is null then
    raise exception 'reset_basic_vocabulary_progress: reset id must not be null';
  end if;

  insert into public.basic_vocabulary_course_state (user_id, course_id, reset_generation, last_reset_id)
  values (v_uid, 'basic-vocabulary', 0, null)
  on conflict (user_id, course_id) do nothing;

  select reset_generation into v_generation
  from public.basic_vocabulary_course_state
  where user_id = v_uid and course_id = 'basic-vocabulary'
  for update;

  if v_generation is null then
    raise exception 'reset_basic_vocabulary_progress: missing state row';
  end if;

  if exists (
    select 1 from public.basic_vocabulary_course_state
    where user_id = v_uid and course_id = 'basic-vocabulary'
      and last_reset_id = p_reset_id
  ) then
    return v_generation;
  end if;

  delete from public.basic_vocabulary_progress
  where user_id = v_uid and course_id = 'basic-vocabulary';

  update public.basic_vocabulary_course_state
  set reset_generation = reset_generation + 1,
      last_reset_id = p_reset_id
  where user_id = v_uid and course_id = 'basic-vocabulary';

  select reset_generation into v_generation
  from public.basic_vocabulary_course_state
  where user_id = v_uid and course_id = 'basic-vocabulary';

  return v_generation;
end;
$$;

-- Execute is revoked from `public`/`anon` and granted only to `authenticated`. Done
-- after function creation so the revoke/grant resolve the function OID.
revoke all on function public.reset_basic_vocabulary_progress(uuid) from public, anon;
grant execute on function public.reset_basic_vocabulary_progress(uuid) to authenticated;
