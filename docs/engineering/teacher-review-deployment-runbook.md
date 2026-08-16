# Teacher-Review Portal Deployment and Rollback Runbook

This runbook describes deployment, Cloudflare Access and D1 configuration, pre-production verification, and rollback for the `/teacher-review` teacher-review entry point from Issue #363. It corresponds to the Deployment/Runbook acceptance surface for the #360 human-review thin slice.

Source: Issue #363 (#360 human-review thin slice). This document preserves the reusable deployment/rollback workflow and does not restate domain runtime behavior.

## 1. Architecture remains unchanged

- Chabiko preserves ADR-0001 static-first: `astro.config.mjs` remains `output: 'static'`, with no SSR adapter and no Astro server endpoint.
- `/teacher-review` is a static Astro page shell. Review data is fetched at runtime by the browser through the **same-origin** Pages Functions API at `/teacher-review/api/*`.
- The only serverless boundary is Cloudflare Pages Functions under `functions/teacher-review/api/*`. Do not add a separate Worker, service, or framework.
- Learner routes such as `/`, `/phrasebook/`, and `/vocabulary/basic/`, plus existing Supabase behavior, remain unchanged.

## 2. Repository surfaces introduced by the portal

| Path | Purpose |
| --- | --- |
| `src/pages/teacher-review/index.astro` | Static shell (`robots=noindex,nofollow`, no learner navigation) |
| `src/client/teacherReview.ts` | Review UX client: one record at a time, filters, Accept/Needs changes, summary, export after completion |
| `src/domain/teacherReview.ts` | Pure domain: resolver (24+6+6 fail-closed), semantic fingerprint, decision validation, artifact builder |
| `src/domain/teacherReviewPublic.ts` | Projects canonical review records into teacher-readable payloads and removes raw provenance enums, internal refs, and engineering metadata |
| `src/domain/teacherReviewUi.ts` | Pure UI state machine |
| `src/content/loadTeacherReviewCampaign.ts` | Shared loader used by Astro, Functions, and tests |
| `functions/teacher-review/api/*` | Pages Functions: Access JWT middleware, records, decisions, export |
| `d1/migrations/0001_teacher_review_decisions.sql` | D1 schema: one decision per `(campaign_id, record_id)` |
| `functions/tsconfig.json` | Independent typecheck project for Pages Functions |
| `docs/engineering/teacher-review-deployment-runbook.md` | This file |

The repository intentionally has **no `wrangler.toml`** for this surface. Production Pages deployment is configured through the dashboard (build command, output directory, bindings, variables) so a repository `wrangler.toml` cannot interfere with the existing Pages deployment. D1 and local tooling are configured explicitly by the commands in this runbook.

## 3. D1 configuration

### 3.1 Create the database and apply the migration

**Production through the Cloudflare dashboard:**

1. Dashboard → **D1** → **Create database** → name it `teacher-review`.
2. Dashboard → **D1 → teacher-review → Console**, then execute the contents of `d1/migrations/0001_teacher_review_decisions.sql`.

**Or through Wrangler CLI, after Wrangler is installed and the database ID is known:**

```sh
pnpm exec wrangler d1 create teacher-review        # returns database_id
pnpm exec wrangler d1 execute teacher-review \
  --database-id=<database_id> --remote \
  --file=d1/migrations/0001_teacher_review_decisions.sql
```

**Local, optional:**

```sh
pnpm exec wrangler d1 execute teacher-review --database-id=<database_id> \
  --local --file=d1/migrations/0001_teacher_review_decisions.sql
```

### 3.2 Pages binding

Cloudflare dashboard → **Workers & Pages → chabiko → Settings → Bindings → Add → D1 database bindings**:

- **Variable name (binding):** `TEACHER_REVIEW_DB`
- **D1 database:** `teacher-review`
- Save and **redeploy** before expecting the binding to exist at runtime.

### 3.3 Schema contract

`teacher_review_decisions` stores one current decision for each `(campaign_id, record_id)`.

- `fingerprint` — semantic fingerprint of the reviewed content, binding the decision to the exact version.
- `outcome` — `accepted | needs_changes`, enforced by CHECK.
- `note` — required for `needs_changes`; optional for `accepted`.
- `reviewer_identity`, `reviewer_email`, `reviewer_name` — derived from the validated Access JWT, never from browser-supplied fields.
- `reviewer_role` — primary role from bounded campaign configuration. The complete role → scope authority mapping is frozen in section 5 and exported per role.
- `updated_at` — ISO 8601.

There is no audit-history table, CMS table, or generic CRUD surface. Only **human decisions** are written.

## 4. Cloudflare Access configuration: path-only protection

Goal: protect **only** `https://chabiko.pages.dev/teacher-review` and all descendants. Do **not** protect the public learner site such as `/` or `/phrasebook/`.

### 4.1 Create the path-scoped Access application

1. Zero Trust → **Access → Applications** → **Add an application → Self-hosted**.
2. **Application domain:** set `chabiko.pages.dev/teacher-review` using the **bare path, not `/*`**.
   - Under the documented Application paths behavior, a `/*` path does **not** cover the parent path itself. The bare path `chabiko.pages.dev/teacher-review` covers that exact path, while descendants such as `/teacher-review/api/*` inherit protection through policy inheritance.
   - The protection boundary stops at `/teacher-review*`; sibling learner routes such as `/` and `/phrasebook/` remain public.
3. **Policy:** allow only explicitly named reviewer and maintainer email addresses. Email One-time PIN (OTP) is sufficient; the teacher does not need another account.
   - Identity provider: enable **One-time PIN** in Access → Settings → Authentication.
4. Copy the **AUD tag** from Zero Trust → Access → Applications → the application → Overview into the Pages production variable `TEACHER_REVIEW_ACCESS_AUD`. The AUD is stable unless the application is deleted and recreated.
5. Copy the **team domain**, for example `https://<team>.cloudflareaccess.com`, into `TEACHER_REVIEW_ACCESS_TEAM_DOMAIN`.

### 4.2 Known limitation on the main `*.pages.dev` domain

Cloudflare Pages Known issues documents that **Enable Access on your `*.pages.dev` domain** may initially protect only preview deployments (`*.<site>.pages.dev`) rather than the primary `chabiko.pages.dev` domain. To protect the primary domain, edit that Access application's **Overview → Subdomain** and remove the wildcard `*`, or use the self-hosted path-scoped application from section 4.1.

**Required pre-production fail-closed verification:**

- [ ] Logged out: `https://chabiko.pages.dev/teacher-review` redirects to Access login.
- [ ] Logged out: `https://chabiko.pages.dev/teacher-review/api/records` returns either a 401 at the Access boundary or JSON 401 from the Functions JWT boundary. Either fail-closed boundary is acceptable.
- [ ] **Logged out: public learner pages such as `https://chabiko.pages.dev/`, `/phrasebook/`, and `/vocabulary/basic/` remain accessible and are not blocked by Access.**
- [ ] Logged in: `/teacher-review` and `/teacher-review/api/*` are accessible.

If path-only protection cannot be achieved, for example because `pages.dev` cannot support the path-scoped application or the configuration protects the whole public site, **STOP and report BLOCKED**. Do not protect the whole learner site, do not add a review subdomain, and do not invent application-level authentication as a workaround.

### 4.3 Variables: Cloudflare dashboard, not Git

Set these in the Pages production environment:

| Variable | Value |
| --- | --- |
| `TEACHER_REVIEW_ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| `TEACHER_REVIEW_ACCESS_AUD` | Access application AUD tag |

For local development, place them in `.dev.vars` (gitignored). **Never commit real values.**

### 4.4 Server-side JWT validation: defense in depth

- Cloudflare Access protects `/teacher-review` and `/teacher-review/api/*` at the edge.
- In addition, `functions/teacher-review/api/_middleware.ts` validates the `Cf-Access-Jwt-Assertion` header on every `/teacher-review/api/*` request as an RS256 JWT: issuer, audience, expiration, not-before, issued-at, and JWKS `kid`. Reviewer identity comes only from the validated JWT. Even if edge Access is misconfigured, the API fails closed with JSON 401.
- **Only** reviewer email addresses explicitly configured in `functions/teacher-review/api/campaign-config.ts` may write a decision. Other Access-authenticated identities may inspect/export but receive 403 on decision writes.

## 5. Default campaign configuration and reviewer authority

`functions/teacher-review/api/campaign-config.ts` is bounded deployment/campaign configuration, not user-management or RBAC infrastructure. For `issue-360-launch-v1`, an atomic Accept/Needs changes decision represents the same designated human reviewer acting under the repository workflow in the roles below. Export records findings **separately for every role** instead of pretending all authority belongs to `human-language-reviewer`.

| Reviewer role | Approval scope |
| --- | --- |
| `human-language-reviewer` | `learner-facing-strings` |
| `human-script-verifier` | `script-provenance` |
| `human-teaching-reviewer` | `teaching-accuracy`, `pronunciation-guidance` |
| `human-regional-reviewer` | `regional-accuracy` |
| `human-source-reviewer` | `source-license` |

`review-status` and `scope-compliance` are **not** declared accepted by the teacher portal. Those remain part of #360's maintainer/mechanical publication phase. If role/scope authority changes later, create a new campaign ID. Do not reinterpret existing D1 human decisions under different authority.

Before production launch, `TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS` **must** be replaced with the real reviewer email designated for #360. Access may separately allow a maintainer to inspect/export, but an identity not present in the eligible-reviewer list cannot write decisions.

## 6. Artifact export

- `/teacher-review/api/export` is available only after **36/36 current-version records have a human decision**. Before completion, the API fails closed with 409 and the UI does not expose a clickable export link.
- Completion means all review entries are decided; it does not mean PASS. If any decision is `needs_changes`, export still produces a `needs-changes` artifact and lists blocked content.
- Export is a repository-standard artifact **bundle**. The same designated human reviewer's findings are emitted in separate artifact sections for each role in section 5, satisfying the `content-review-workflow.md` requirement that one person may act in multiple roles but findings for each role remain separately recorded.
- **Review date is derived from the date of the final valid current-version human decision**, not export time. Stale decisions do not count. Repeated exports do not change Review date. An incomplete review may not borrow export time and pretend it is the review date. The artifact separately records `Artifact generated at` for generation time.
- Teacher-facing evidence preserves required learner-language strings. The payload explicitly exposes missing-source text `出典情報なし`, pain-point text `注意ポイント`, and the script provenance for Traditional and Simplified forms. These are human-readable evidence for the corresponding reviewer roles and must not be silently omitted.
- Export never writes GitHub state, content records, `reviewStatus`, or provenance.

## 7. Local validation

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:content
git diff --check
```

To run Pages Functions locally, configure Access variables in `.dev.vars` and provide the local D1 binding through `--d1`:

```sh
pnpm build
TEACHER_REVIEW_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com \
TEACHER_REVIEW_ACCESS_AUD=<aud> \
pnpm exec wrangler pages dev dist --d1 TEACHER_REVIEW_DB=<database_id>
```

## 8. Rollback

### 8.1 Return to a site without the review entry point

1. Cloudflare Pages → **Deployments → All deployments** → select a previously validated production deployment → **Rollback to this deployment**.
2. To remove the review entry point from the repository completely, use a later scoped PR to remove `src/pages/teacher-review/`, `functions/teacher-review/`, `src/domain/teacherReview*`, `src/content/loadTeacherReviewCampaign.ts`, and their coupled tests.
3. D1 data may remain. `teacher_review_decisions` is a human-decision record and does not affect learner behavior. If an explicit deletion is required, run `DELETE FROM teacher_review_decisions;` from the D1 console.

### 8.2 Return to no Access protection

To remove `/teacher-review` Access protection, delete or disable the application in Zero Trust → Access → Applications and remove the Pages variables `TEACHER_REVIEW_ACCESS_TEAM_DOMAIN` and `TEACHER_REVIEW_ACCESS_AUD`. If the variables are removed while Functions remain configured to require them, Functions fail closed on missing configuration.

## 9. Pre-production checklist

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:content
git diff --check
```

Also complete the manual checks from section 4.2, apply the D1 migration, configure AUD/team-domain variables, and configure the real reviewer email.

## 10. Relationship to #360 and #250

- **Completing #363 does not complete #360.** #360 requires actual human review, using the repository-standard artifact produced by `/teacher-review/api/export` as the basis for mechanical publication.
- **#363 does not unblock #250.** #250 remains blocked by #360.
- The portal **never** writes GitHub state, content files, `reviewStatus`, or provenance. Mechanical publication after review, including status promotion, the #260/#262 canonical Unicode sync, PR/CI, remains part of the existing #360 flow.
