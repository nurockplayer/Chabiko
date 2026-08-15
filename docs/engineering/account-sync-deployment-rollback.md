# Account-Sync Deployment and Rollback Runbook

This runbook describes Chabiko's static deployment, Supabase/Google configuration, Cloudflare Pages build, and guest-only rollback after account-sync is enabled. It corresponds to Issue #294 Deployment/Rollback acceptance (Domain 9).

Source: the account-sync implementation from Issue #293 and release acceptance from Issue #294. This document preserves the reusable deployment/rollback workflow and does not restate domain runtime behavior.

## 1. Astro remains static-first

Chabiko preserves the ADR-0001 static-first decision. `astro.config.mjs` remains `output: 'static'`; there is no SSR adapter and no server endpoint.

- Build command: `pnpm build` (`astro build`).
- Output directory: `dist/` (`.gitignore` ignores it).
- Deployment platform: Cloudflare Pages (`site` is `https://chabiko.pages.dev`).
- Enabling optional account sync does not change the static architecture. Supabase is a browser-side third-party service and does not introduce a serverless function or build-time data fetch.

## 2. Routes that must build successfully

Release acceptance requires these three routes to exist after a static build. The corresponding build assertions are in `tests/build/teacher-preview-build.test.ts`:

| Route | Output file | Key marker |
| --- | --- | --- |
| Auth callback | `dist/auth/callback/index.html` | `data-supabase-auth-callback`, `data-supabase-auth-callback-status` (`aria-live="polite"`, `robots=noindex,nofollow`) |
| Basic-vocabulary home | `dist/vocabulary/basic/index.html` | `data-basic-vocabulary-account`, `data-basic-vocabulary-session`, `id="basic-vocabulary-data"` |
| Basic-vocabulary catalog | `dist/vocabulary/basic/words/index.html` | `data-basic-vocabulary-catalog` |

Validation:

```sh
pnpm build
test -f dist/auth/callback/index.html
test -f dist/vocabulary/basic/index.html
test -f dist/vocabulary/basic/words/index.html
```

`pnpm build` must succeed even when no Supabase environment variable is configured. That is the guest-only mode required by Domain 1. CI (`.github/workflows/ci.yml`) runs the production `pnpm build` without Supabase configuration and directly asserts these three `dist/` route artifacts. Any change that makes the build depend on Supabase or breaks the Pages output directory must fail.

## 3. Secret-hygiene guarantee for build output

Account-sync auth/sync/privacy acceptance (Domains 2 and 7) depends on the guarantee that the client bundle embeds public values only.

Rules:

- Only `PUBLIC_`-prefixed values may be embedded in the client bundle: `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `.env.example` exposes only empty placeholders for those two public values.
- `src/env.d.ts` declares only those two values. `readSupabasePublicConfig()` returns `null` when the URL is not a valid absolute HTTP(S) URL or the publishable key is blank. The key only needs to be a non-empty string; only the URL must be an absolute HTTP(S) URL.
- Any non-`PUBLIC_` secret, including service-role key, JWT secret, Google client secret, and anon JWT key, remains environment-only and must never reach `dist/` through the build.

## 4. Secret-hygiene build scan

Before release or after CI, run a production-shaped build with decoy secrets and scan the output to prove secrets are not embedded in static files:

```sh
PUBLIC_SUPABASE_URL='https://acceptance-test-project.supabase.co' \
PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_acceptance_public_key_0001' \
SUPABASE_SERVICE_ROLE_KEY='sb_secret_acceptance_service_role_0001' \
SUPABASE_JWT_SECRET='jwt-secret-acceptance-decoy-0001' \
GOOGLE_CLIENT_SECRET='google-client-secret-decoy-0001' \
SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.acceptance-anon-decoy' \
pnpm build --outDir dist/scan-verify
```

Expected result:

- `https://acceptance-test-project.supabase.co` and `sb_publishable_acceptance_public_key_0001` may appear because they are intentionally public values.
- None of the four decoy-secret values may appear.
- Output must not contain the `eyJ` JWT-header signature, the `sb_secret_` prefix, or environment-name literals such as `SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SECRET_KEY`, `JWT_SECRET`, or `SUPABASE_ANON_KEY`.

This scan is automated in the `Deployment — static account-sync routes and secret hygiene` describe block in `tests/build/teacher-preview-build.test.ts` and runs with `pnpm test`.

## 5. Credential-free configuration runbook

### 5.1 Supabase

The browser/build side needs no secret. The browser uses only the public Project URL and publishable key.

- Database schema and RLS are managed by migrations under `supabase/migrations/` (basic-vocabulary progress and stale-generation policy migrations).
- The migrations use security-invoker RPC for reset generation derived from owner identity. There is no security-definer or service-role path. Forced RLS, owner permissions, and anon/other-user rejection are verified by `tests/supabase-basic-vocabulary-schema.test.ts` against a live database.
- To publish migrations to a Supabase project, a maintainer with database access normally runs:

```sh
supabase link --project-ref <PROJECT_REF>
supabase db push
```

Do not put `service_role`, anon JWT keys, or any secret in Cloudflare Pages or in the client. Supabase projects may still expose an anon key for other purposes, but Chabiko's client does not need it; configure only the public publishable key.

### 5.2 Google OAuth through Supabase Auth

The Google PKCE flow is provided by Supabase Auth's `[auth.external.google]` provider. Local `supabase/config.toml` does not enable a Google provider block (`google` appears only in the provider-list comments). Production Google OAuth credentials are configured in the Supabase dashboard and are never pushed into the Chabiko client.

For production provider setup in Supabase Authentication → Providers:

- Create a Google OAuth 2.0 client in Google Cloud Console. The authorized callback is Supabase's provider callback: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
- Enter the Client ID and Client secret in Supabase. The secret stays on the Supabase backend and never enters the Chabiko repository or Pages configuration.
- That Google Cloud callback is **Google → Supabase provider**, not Chabiko's application redirect.

Separately configure **Supabase → Chabiko application** in Supabase Authentication → URL Configuration:

- Site URL: `https://chabiko.pages.dev/`.
- Redirect URLs include the exact production URL `https://chabiko.pages.dev/auth/callback/`. The client's `redirectTo` must match this allowlist or the PKCE return is not guaranteed to reach the Chabiko callback.
- Production must not use broad `*` or `**` wildcards. Preview deployments stay guest-only by default. Only when login acceptance is explicitly needed, temporarily add that preview origin's exact `<PREVIEW_ORIGIN>/auth/callback/` and remove it afterward.
- Local Google Auth is disabled by default. If a maintainer explicitly needs local login acceptance, add only the exact origin used for that run, for example `http://localhost:4321/auth/callback/`; do not add a whole-path wildcard, and remove it after acceptance.

After Supabase completes the exchange it returns to Chabiko's auth-callback route. Chabiko then permits only application-internal return paths from its allowlist: `/vocabulary/basic/` and `/vocabulary/basic/words/`. Do not conflate the three allowlists: Google provider callback, Supabase application Redirect URLs, and Chabiko's application return paths.

### 5.3 Cloudflare Pages

- Build command: `pnpm build`.
- Output directory: `dist`.
- Only two public environment variables are needed when account functionality is enabled:

```text
PUBLIC_SUPABASE_URL = https://<PROJECT_REF>.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY = <publishable key>
```

- Do **not** configure `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, or other secrets in Pages. Variables with a `PUBLIC_` prefix are embedded into the client bundle by design. Non-`PUBLIC_` values are not embedded by Astro, but secrets still must not be present in the Pages variable list in order to minimize attack surface.
- When neither public variable is configured, Pages must still build and provide the guest-only experience described in the rollback section.

## 6. Pre-release validation checklist

```sh
supabase start
supabase db reset --local --yes
supabase db lint --local --level warning --fail-on warning
supabase db advisors --local --type all --level info --fail-on warn
pnpm lint
pnpm typecheck
CHABIKO_REQUIRE_LIVE_SUPABASE=1 pnpm test  # fail closed if stack/CLI is unavailable; live suites must not silently skip
pnpm build
pnpm test:visual   # requires the browser environment

git diff --check
```

`CHABIKO_REQUIRE_LIVE_SUPABASE=1` is a release gate. If Supabase CLI, Docker, or the local stack is unavailable, both live suites fail during collection. Ordinary GitHub/daily tests without a database may still use their explicit skip behavior.

Also verify manually:

- the callback route returns 200 while logged out and displays no token;
- Supabase Authentication → URL Configuration contains exact `https://chabiko.pages.dev/auth/callback/` and production has no broad wildcard;
- after Google login, the application return path remains inside the allowlist and an invalid return path is handled safely without displaying a raw error;
- existing multi-device synchronization and reset acceptance tests pass.

## 7. Rollback to guest-only

Account sync is local-first and optional. Guest progress uses the legacy key `chabiko:basic-vocabulary-progress:v1`; signed-in progress uses the user-scoped key `chabiko:basic-vocabulary-progress:user:{userId}:v1`. Therefore rollback does not require deleting any learner's progress.

### 7.1 Static-site rollback on Cloudflare Pages

1. If a previously successful production deployment is known to be guest-only, open Pages → **Deployments → All deployments**, use the target deployment's `…` menu, select **Rollback to this deployment**, and confirm. Only a successful production deployment is eligible; a Preview deployment cannot be a rollback target.
2. Remove `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Pages production environment so future builds also remain guest-only. This does not rewrite an already-built artifact; the rollback target from step 1 must itself already be guest-only.
3. If no guest-only production deployment is available, remove those two production variables first and trigger a fresh production build from a validated `main` commit, or use the normal PR workflow to revert to a validated guest-only commit and deploy it. Do not use the Pages production-branch setting as a commit selector.
4. Confirm `/auth/callback`, `/vocabulary/basic`, and `/vocabulary/basic/words` still load and the client falls back to guest-only behavior: no login UI and no Supabase connection attempt.
5. Verify `readSupabasePublicConfig()` returns `null` when either variable is missing, `getSupabaseBrowserClient()` returns `null`, and the learner experience continues using the legacy guest key.

### 7.2 Progress preservation guarantee

- Guest and account progress use separate storage scopes. After guest-only rollback, the same browser can still read progress from the legacy guest key.
- Signed-in users' user-scoped progress remains in browser local storage and Supabase. If account functionality is re-enabled later, the same Supabase user returns to their own progress. Supabase auth identity is the sole source of the user ID, as defined by `src/domain/basicVocabularyProgressScope.ts`.
- Perform no destructive data operation: do not clear local storage and do not delete Supabase rows.

### 7.3 Change boundary

Rollback does not require reverting migrations, schema, or RLS. Reverting the frontend build and Pages public variables is sufficient to restore guest-only behavior; production performs no migration rollback.
