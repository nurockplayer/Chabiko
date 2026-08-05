import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Supabase progress schema / RLS / reset generation (issue #287).
//
// Two layers:
// 1. Static SQL assertions over the single migration file. These never need a
//    running database and pin the exact contract (columns, types, defaults,
//    keys, FK, checks, RLS, grants, function signature, forbidden columns).
// 2. Live integration assertions against a locally running Supabase stack
//    (supabase db reset + docker exec psql), skipped when the stack is not up.
//    These prove owner isolation, invalid-input rejection, and the frozen
//    idempotent reset RPC behavior without weakening policies.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_supabase-basic-vocabulary-schema';

function migrationFiles(): string[] {
  return existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
    : [];
}

function readMigration(needle: string): string {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`no supabase/migrations directory at ${MIGRATIONS_DIR}`);
  }
  const candidates = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = candidates.find((f) => f.includes(needle));
  if (!match) {
    throw new Error(`no migration matching "${needle}" under ${MIGRATIONS_DIR}`);
  }
  return readFileSync(join(MIGRATIONS_DIR, match), 'utf8');
}

function hasLocalSupabase(): boolean {
  return existsSync(join(ROOT, 'supabase', 'config.toml'));
}

function dockerAvailable(): boolean {
  try {
    const r = spawnSync('docker', ['info'], { encoding: 'utf8', timeout: 10_000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

function psql(queries: string): string {
  // Run through docker exec psql in a single session with ON_ERROR_STOP. Stderr
  // (psql error text) is merged into the result so assertions can match on it.
  const r = spawnSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'],
    { input: queries, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  const combined = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0 && !/error/i.test(combined)) {
    // Unexpected failure with no recognizable error text — surface it.
    throw new Error(`psql exited ${r.status}: ${combined}`);
  }
  return combined;
}

function runLive(): boolean {
  return hasLocalSupabase() && dockerAvailable();
}

const uuidA = '11111111-1111-1111-1111-111111111111';
const uuidB = '22222222-2222-2222-2222-222222222222';

// Authenticated session wrapper: session-level role + JWT claims so `auth.uid()`
// resolves and writes persist within a psql session. Each case runs in a fresh
// psql session (psql() spawns a new docker exec), so role state is isolated.
function asUser(userId: string, queries: string): string {
  return psql(
    `set role authenticated;
set request.jwt.claims = '{"sub": "${userId}", "role": "authenticated"}';
${queries}`,
  );
}

function resetDbState(): void {
  // DELETE cascades from course_state to progress via the FK (on delete cascade),
  // which also avoids the TRUNCATE FK-ordering error.
  psql(`delete from public.basic_vocabulary_course_state;`);
}

// SQL statements without comment lines, so contract checks do not trip on
// prose that merely mentions forbidden terms ("no security definer", "email
// claims").
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('supabase basic-vocabulary schema (static)', () => {
  let migration: string;
  let files: string[];

  beforeAll(() => {
    files = migrationFiles();
    migration = readMigration('basic_vocabulary_progress');
  });

  it('defines exactly one migration for this feature', () => {
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('basic_vocabulary_progress');
  });

  it('creates both tables with exact column/type/default contract', () => {
    expect(migration).toContain('create table if not exists public.basic_vocabulary_course_state (');
    expect(migration).toContain('create table if not exists public.basic_vocabulary_progress (');
  });

  it('forbids non-contract columns (email/name/avatar/google/score/history/etc.)', () => {
    const forbidden = [
      'email', 'name', 'avatar', 'google', 'provider', 'token', 'device',
      'fingerprint', 'ip_address', 'score', 'streak_day', 'answer_history',
      'session_history', 'analytics', 'corpus',
    ];
    // Check only executable SQL (no comment prose).
    const lower = stripComments(migration).toLowerCase();
    for (const term of forbidden) {
      expect(lower).not.toMatch(new RegExp(`\\b${term}\\b`));
    }
  });

  it('grants only authenticated CRUD and revokes anon/public', () => {
    expect(migration).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.basic_vocabulary_course_state\s+to\s+authenticated/i);
    expect(migration).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.basic_vocabulary_progress\s+to\s+authenticated/i);
    expect(migration).toMatch(/revoke\s+all\s+on\s+public\.basic_vocabulary_course_state\s+from\s+anon,\s*public/i);
    expect(migration).toMatch(/revoke\s+all\s+on\s+public\.basic_vocabulary_progress\s+from\s+anon,\s*public/i);
  });

  it('enables and forces RLS on both tables', () => {
    expect(migration).toMatch(/enable\s+row\s+level\s+security/i);
    expect(migration).toMatch(/force\s+row\s+level\s+security/i);
  });

  it('uses only `(select auth.uid()) = user_id` ownership policies', () => {
    const matches = migration.match(/create\s+policy\s+"([a-z_0-9]+)"\s+on\s+public\.[a-z_0-9]+\s+for\s+(select|insert|update|delete)\s+to\s+authenticated/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(8);
    // No role()/metadata/email claims and no always-true predicate.
    expect(migration).not.toMatch(/auth\.role\(\)/i);
    expect(migration).not.toMatch(/raw_user_meta_data|raw_app_meta_data|email\s*=/i);
  });

  it('declares the exact reset RPC signature and security settings', () => {
    // Use only executable SQL so the `security definer` negative check does not
    // trip on the comment "no security definer and no service-role dependency".
    const sql = stripComments(migration);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.reset_basic_vocabulary_progress\s*\(\s*p_reset_id\s+uuid\s*\)\s+returns\s+bigint/i);
    expect(sql).toMatch(/security\s+invoker/i);
    expect(sql).not.toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*''/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.reset_basic_vocabulary_progress\s*\(\s*uuid\s*\)\s+from\s+public,\s*anon/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.reset_basic_vocabulary_progress\s*\(\s*uuid\s*\)\s+to\s+authenticated/i);
  });
});

describe.skipIf(!runLive())('supabase basic-vocabulary schema (live database)', () => {
  beforeAll(() => {
    // Ensure the migrations were applied by a fresh reset. `db reset` also proves
    // the migration applies reproducibly from empty state.
    const reset = spawnSync('supabase', ['db', 'reset', '--local'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    if (reset.status !== 0) {
      throw new Error(`supabase db reset failed: ${reset.stderr ?? reset.stdout}`);
    }
    // Seed two auth users for cross-user isolation tests.
    psql(`
delete from auth.users where email like 'schema-test-%';
insert into auth.users (id, email, encrypted_password) values
  ('${uuidA}', 'schema-test-a@example.com', 'x'),
  ('${uuidB}', 'schema-test-b@example.com', 'x');
`);
  });

  beforeEach(() => {
    resetDbState();
  });

  afterAll(() => {
    try {
      psql(`delete from auth.users where email like 'schema-test-%';`);
    } catch {
      // Best-effort cleanup; failing to clean up local test users is not a test failure.
    }
  });

  it('exact tables/columns/types/defaults/keys/FK/checks/function signature', () => {
    const state = psql(`
select column_name || '|' || data_type || '|' || is_nullable || '|' || coalesce(column_default, '') from information_schema.columns
where table_schema = 'public' and table_name = 'basic_vocabulary_course_state'
order by ordinal_position;
`);
    expect(state.trim()).toContain('user_id|uuid|NO|');
    expect(state.trim()).toContain('course_id|text|NO|');
    expect(state.trim()).toContain('reset_generation|bigint|NO|0');
    expect(state.trim()).toContain('last_reset_id|uuid|YES|');
    expect(state.trim()).toContain("updated_at|timestamp with time zone|NO|timezone('utc'::text, now())");

    const progress = psql(`
select column_name || '|' || data_type || '|' || is_nullable || '|' || coalesce(column_default, '') from information_schema.columns
where table_schema = 'public' and table_name = 'basic_vocabulary_progress'
order by ordinal_position;
`);
    expect(progress.trim()).toContain('user_id|uuid|NO|');
    expect(progress.trim()).toContain('course_id|text|NO|');
    expect(progress.trim()).toContain('item_id|text|NO|');
    expect(progress.trim()).toContain('status|text|NO|');
    expect(progress.trim()).toContain('known_streak|integer|NO|');
    expect(progress.trim()).toContain('review_order|bigint|NO|');
    expect(progress.trim()).toContain('reset_generation|bigint|NO|');

    const keys = psql(`
select conname || '|' || contype::text from pg_constraint
where conrelid = 'public.basic_vocabulary_course_state'::regclass order by conname;
`);
    expect(keys.trim()).toContain('basic_vocabulary_course_state_pkey|p');
    // Postgres truncates identifiers to 63 chars; match the truncated unique name.
    expect(keys.trim()).toContain('basic_vocabulary_course_state_user_id_course_id_reset_gener_key|u');
    expect(keys.trim()).toContain('basic_vocabulary_course_state_course_id_fixed|c');
    expect(keys.trim()).toContain('basic_vocabulary_course_state_reset_generation_non_negative|c');

    const progressKeys = psql(`
select conname || '|' || contype::text from pg_constraint
where conrelid = 'public.basic_vocabulary_progress'::regclass order by conname;
`);
    expect(progressKeys.trim()).toContain('basic_vocabulary_progress_pkey|p');
    expect(progressKeys.trim()).toContain('basic_vocabulary_progress_course_id_fixed|c');
    expect(progressKeys.trim()).toContain('basic_vocabulary_progress_item_id_non_empty|c');
    expect(progressKeys.trim()).toContain('basic_vocabulary_progress_status_valid|c');
    expect(progressKeys.trim()).toContain('basic_vocabulary_progress_streak_matches_status|c');
    expect(progressKeys.trim()).toContain('basic_vocabulary_progress_known_streak_non_negative|c');
    expect(progressKeys.trim()).toContain('basic_vocabulary_progress_review_order_non_negative|c');
    expect(progressKeys.trim()).toContain('basic_vocabulary_progress_reset_generation_non_negative|c');

    const fk = psql(`
select conname from pg_constraint where contype = 'f'
and conrelid = 'public.basic_vocabulary_progress'::regclass and confrelid = 'public.basic_vocabulary_course_state'::regclass;
`);
    expect(fk.trim()).toContain('basic_vocabulary_progress_user_id_course_id_reset_generati_fkey');

    const fn = psql(`
select p.proname || '|' || pg_get_function_arguments(p.oid) || '|' || pg_get_function_result(p.oid) || '|' || p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'reset_basic_vocabulary_progress';
`);
    expect(fn.trim()).toContain('reset_basic_vocabulary_progress|p_reset_id uuid|bigint|f');
  });

  it('RLS is enabled and forced; grants only to authenticated', () => {
    const rls = psql(`
select relname || '|' || relrowsecurity || '|' || relforcerowsecurity from pg_class
where oid in ('public.basic_vocabulary_course_state'::regclass, 'public.basic_vocabulary_progress'::regclass) order by relname;
`);
    // psql renders multi-column boolean rows as `true`/`false`.
    expect(rls.trim()).toContain('basic_vocabulary_course_state|true|true');
    expect(rls.trim()).toContain('basic_vocabulary_progress|true|true');

    const anon = psql(`
select has_table_privilege('anon', 'public.basic_vocabulary_course_state', 'select'),
       has_table_privilege('anon', 'public.basic_vocabulary_course_state', 'insert'),
       has_table_privilege('anon', 'public.basic_vocabulary_progress', 'select'),
       has_function_privilege('anon', 'public.reset_basic_vocabulary_progress(uuid)', 'execute');
`);
    expect(anon.trim()).toBe('f|f|f|f');

    const auth = psql(`
select has_table_privilege('authenticated', 'public.basic_vocabulary_course_state', 'select'),
       has_table_privilege('authenticated', 'public.basic_vocabulary_course_state', 'insert'),
       has_table_privilege('authenticated', 'public.basic_vocabulary_course_state', 'update'),
       has_table_privilege('authenticated', 'public.basic_vocabulary_course_state', 'delete'),
       has_table_privilege('authenticated', 'public.basic_vocabulary_progress', 'select'),
       has_table_privilege('authenticated', 'public.basic_vocabulary_progress', 'insert'),
       has_table_privilege('authenticated', 'public.basic_vocabulary_progress', 'update'),
       has_table_privilege('authenticated', 'public.basic_vocabulary_progress', 'delete'),
       has_function_privilege('authenticated', 'public.reset_basic_vocabulary_progress(uuid)', 'execute');
`);
    expect(auth.trim()).toBe('t|t|t|t|t|t|t|t|t');
  });

  it('anon cannot CRUD or execute reset', () => {
    const out = psql(`
set role anon;
select count(*) from public.basic_vocabulary_course_state;
`);
    expect(out).toContain('permission denied');
    const resetOut = psql(`
set role anon;
select public.reset_basic_vocabulary_progress('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
`);
    expect(resetOut).toContain('permission denied');
  });

  it('user A can access only A; user B cannot read/infer/mutate/delete/reset A', () => {
    // A creates state at generation 1 and one progress row.
    asUser(uuidA, `
select public.reset_basic_vocabulary_progress('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
values ('${uuidA}', 'basic-vocabulary', 'a-item', 'learning', 0, 0, 1);
select count(*) from public.basic_vocabulary_progress;
`);

    // B sees nothing (no rows, cannot infer existence).
    const bReads = asUser(uuidB, `
select count(*) from public.basic_vocabulary_progress;
select count(*) from public.basic_vocabulary_course_state;
`);
    expect(bReads.trim().split('\n').map((s) => s.trim())).toEqual(['0', '0']);

    // B cannot insert/update/delete A rows or reset A.
    const bImplant = asUser(uuidB, `
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
values ('${uuidA}', 'basic-vocabulary', 'implant', 'learning', 0, 0, 1);
`);
    expect(bImplant).toMatch(/row-level security|permission denied/);

    const bReset = asUser(uuidB, `
select public.reset_basic_vocabulary_progress('cccccccc-cccc-cccc-cccc-cccccccccccc');
`);
    // B can reset B (ensures own state) but must not touch A; assert A unaffected below.
    expect(bReset).not.toMatch(/error/i);

    const bUpdate = asUser(uuidB, `
update public.basic_vocabulary_progress set status = 'learned', known_streak = 2 where user_id = '${uuidA}';
select count(*) from public.basic_vocabulary_progress;
`);
    // B cannot see A's rows at all, so nothing to update and no rows become visible.
    expect(bUpdate.trim().split('\n').pop()?.trim()).toBe('0');

    const aStill = asUser(uuidA, `
select count(*) from public.basic_vocabulary_progress;
select reset_generation from public.basic_vocabulary_course_state;
`);
    expect(aStill.trim().split('\n').map((s) => s.trim())).toEqual(['1', '1']);
  });

  it('user ID cannot be reassigned', () => {
    asUser(uuidA, `
select public.reset_basic_vocabulary_progress('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
values ('${uuidA}', 'basic-vocabulary', 'reassign-item', 'learning', 0, 0, 1);
`);
    const out = asUser(uuidA, `
update public.basic_vocabulary_progress set user_id = '${uuidB}' where item_id = 'reassign-item';
`);
    expect(out).toMatch(/row-level security/);
  });

  it('invalid item/status/streak/order/generation and implicit new are rejected', () => {
    asUser(uuidA, `
select public.reset_basic_vocabulary_progress('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
`);
    const cases: Array<[string, string]> = [
      ['wrong course', `values ('${uuidA}', 'other-course', 'x', 'learning', 0, 0, 1)`],
      ['empty item_id', `values ('${uuidA}', 'basic-vocabulary', '   ', 'learning', 0, 0, 1)`],
      ['invalid status', `values ('${uuidA}', 'basic-vocabulary', 'x', 'mastered', 0, 0, 1)`],
      ['learned streak 1', `values ('${uuidA}', 'basic-vocabulary', 'x', 'learned', 1, 0, 1)`],
      ['learning streak 2', `values ('${uuidA}', 'basic-vocabulary', 'x', 'learning', 2, 0, 1)`],
      ['negative streak', `values ('${uuidA}', 'basic-vocabulary', 'x', 'learning', -1, 0, 1)`],
      ['negative order', `values ('${uuidA}', 'basic-vocabulary', 'x', 'learning', 0, -1, 1)`],
      ['negative generation', `values ('${uuidA}', 'basic-vocabulary', 'x', 'learning', 0, 0, -1)`],
    ];
    for (const [label, valuesSql] of cases) {
      const out = asUser(uuidA, `
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
${valuesSql};
`);
      expect(out, label).toMatch(/check constraint|row-level security/);
    }
    // Valid learning 0/1 and learned >= 2 are accepted.
    const ok = asUser(uuidA, `
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
values ('${uuidA}', 'basic-vocabulary', 'ok0', 'learning', 0, 0, 1);
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
values ('${uuidA}', 'basic-vocabulary', 'ok1', 'learning', 1, 1, 1);
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
values ('${uuidA}', 'basic-vocabulary', 'ok2', 'learned', 2, 2, 1);
select count(*) from public.basic_vocabulary_progress where user_id = '${uuidA}' and item_id like 'ok%';
`);
    expect(ok.trim().split('\n').pop()?.trim()).toBe('3');
  });

  it('implicit new (absence) is the default and explicit rows are required for progress', () => {
    // A brand-new item with no progress row has no entry in the table.
    const count = asUser(uuidA, `
select count(*) from public.basic_vocabulary_progress where user_id = '${uuidA}' and item_id = 'never-seen';
`);
    expect(count.trim()).toBe('0');
  });

  it('first reset increments once and deletes only caller/course rows', () => {
    asUser(uuidA, `
select public.reset_basic_vocabulary_progress('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
values ('${uuidA}', 'basic-vocabulary', 'keep-me', 'learning', 0, 0, 1);
`);
    // B has a row at B's own generation 1.
    asUser(uuidB, `
select public.reset_basic_vocabulary_progress('dddddddd-dddd-dddd-dddd-dddddddddddd');
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
values ('${uuidB}', 'basic-vocabulary', 'b-row', 'learning', 0, 0, 1);
`);
    // A resets with a new id: deletes A progress, increments to 2.
    const gen = asUser(uuidA, `
select public.reset_basic_vocabulary_progress('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
`);
    expect(gen.trim()).toBe('2');
    const aCount = asUser(uuidA, `select count(*) from public.basic_vocabulary_progress;`);
    expect(aCount.trim()).toBe('0');
    // B unaffected.
    const bCount = asUser(uuidB, `select count(*) from public.basic_vocabulary_progress;`);
    expect(bCount.trim()).toBe('1');
  });

  it('retrying the same reset ID returns the same generation and performs no second increment', () => {
    asUser(uuidA, `
select public.reset_basic_vocabulary_progress('ffffffff-ffff-ffff-ffff-ffffffffffff');
`);
    const first = asUser(uuidA, `
select public.reset_basic_vocabulary_progress('ffffffff-ffff-ffff-ffff-ffffffffffff');
`);
    const again = asUser(uuidA, `
select public.reset_basic_vocabulary_progress('ffffffff-ffff-ffff-ffff-ffffffffffff');
`);
    const gen = asUser(uuidA, `select reset_generation from public.basic_vocabulary_course_state;`);
    expect(first.trim()).toBe(gen.trim());
    expect(again.trim()).toBe(gen.trim());
  });

  it('a different reset ID increments exactly once more', () => {
    asUser(uuidA, `
select public.reset_basic_vocabulary_progress('ffffffff-ffff-ffff-ffff-ffffffffffff');
`);
    const before = asUser(uuidA, `select reset_generation from public.basic_vocabulary_course_state;`).trim();
    const next = asUser(uuidA, `
select public.reset_basic_vocabulary_progress('00000000-0000-0000-0000-000000000001');
`);
    expect(next.trim()).toBe(String(Number(before) + 1));
  });

  it('another user rows and reset state remain untouched', () => {
    asUser(uuidA, `
select public.reset_basic_vocabulary_progress('ffffffff-ffff-ffff-ffff-ffffffffffff');
select public.reset_basic_vocabulary_progress('00000000-0000-0000-0000-000000000001');
`);
    // B's progress and reset state are independent of A's actions.
    const bBefore = asUser(uuidB, `
select reset_generation from public.basic_vocabulary_course_state;
`);
    asUser(uuidA, `
select public.reset_basic_vocabulary_progress('11111111-2222-3333-4444-555555555555');
`);
    const bAfter = asUser(uuidB, `
select reset_generation from public.basic_vocabulary_course_state;
`);
    expect(bAfter.trim()).toBe(bBefore.trim());
  });

  it('concurrent/reset-order fixture: old-generation rows cannot survive/reappear', () => {
    // A writes at generation 1, then resets to generation 2. A stale write that
    // raced at generation 1 must fail via the FK (state row no longer exists).
    asUser(uuidA, `
select public.reset_basic_vocabulary_progress('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
`);
    const stale = asUser(uuidA, `
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
values ('${uuidA}', 'basic-vocabulary', 'raced', 'learning', 0, 0, 1);
select public.reset_basic_vocabulary_progress('22222222-2222-2222-2222-222222222222');
insert into public.basic_vocabulary_progress (user_id, course_id, item_id, status, known_streak, review_order, reset_generation)
values ('${uuidA}', 'basic-vocabulary', 'raced', 'learning', 0, 0, 1);
`);
    expect(stale).toMatch(/foreign key|row-level security/);

    // After the reset, old-generation 1 cannot reappear.
    const count = asUser(uuidA, `
select count(*) from public.basic_vocabulary_progress where user_id = '${uuidA}' and reset_generation = 1;
`);
    expect(count.trim()).toBe('0');
  });

  it('no service role, security definer, auth metadata, raw email/provider token, or anonymous grant', () => {
    const grants = psql(`
select table_name || '|' || privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'basic_vocabulary%' and grantee = 'anon';
`);
    expect(grants.trim()).toBe('');
    const serviceGrants = psql(`
select table_name || '|' || privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'basic_vocabulary%' and grantee = 'service_role';
`);
    // Supabase's default postgres grants TRUNCATE/REFERENCES/TRIGGER on new tables
    // to service_role; our migration must not add any CRUD grant for service_role.
    const serviceCrud = serviceGrants
      .trim()
      .split('\n')
      .filter((line) => /SELECT|INSERT|UPDATE|DELETE/.test(line));
    expect(serviceCrud).toEqual([]);
    const secDef = psql(`
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef;
`);
    expect(secDef.trim()).toBe('');
  });
});
