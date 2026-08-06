-- Corrective migration: stale-generation writes must surface as the FK 23503
-- error (`stale-generation`), not as an RLS 42501 (`forbidden`).
--
-- Issue #291. The historical migration's `basic_vocabulary_progress` insert and
-- update with-check policies duplicated the stale-generation guard with an
-- `exists(...)` subquery over `basic_vocabulary_course_state`. On a stale write
-- (a progress row at a reset generation that no longer exists after a reset),
-- that RLS subquery denied the write as 42501/forbidden — the exact same shape
-- as a genuine owner mismatch — so the repository could not reliably map the
-- stale write to `stale-generation`.
--
-- This migration drops those two policies and recreates them ownership-only
-- (`(select auth.uid()) = user_id`). The progress FK
-- `(user_id, course_id, reset_generation) -> course_state` is the single
-- database-level guarantee of generation validity: a stale write passes RLS
-- (owner matches) and is then rejected by the FK as 23503, which the
-- repository maps to `stale-generation`. Owner isolation and cross-user
-- rejection are unchanged.

drop policy if exists "basic_vocabulary_progress_insert" on public.basic_vocabulary_progress;
drop policy if exists "basic_vocabulary_progress_update" on public.basic_vocabulary_progress;

create policy "basic_vocabulary_progress_insert" on public.basic_vocabulary_progress
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "basic_vocabulary_progress_update" on public.basic_vocabulary_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
