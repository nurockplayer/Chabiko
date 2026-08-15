# Teacher-Review Portal 部署與 Rollback Runbook

本 runbook 描述 `/teacher-review` 教師審查入口（Issue #363）的部署、Cloudflare Access 與 D1 設定、pre-production 驗證，以及 rollback。對應 #363 的 Deployment/runbook 驗收域。

來源：Issue #363（#360 人類審查 thin slice）。本檔只保存可重用的部署與 rollback 流程，不重複記載 domain 的 runtime 行為。

## 1. 架構不變保證

- Chabiko 維持 ADR-0001 static-first：`astro.config.mjs` 保持 `output: 'static'`，沒有 SSR adapter，沒有 server endpoint。
- `/teacher-review` 是靜態 Astro 頁面 shell；所有審查資料由瀏覽器在 runtime 透過 **同源** Pages Functions API（`/teacher-review/api/*`）取得。
- 唯一的 serverless 邊界是 Cloudflare Pages Functions（`functions/teacher-review/api/*`），不引入獨立 Worker／service／framework。
- 學習者 route（`/`、`/phrasebook/`、`/vocabulary/basic/` 等）與 Supabase 行為完全不變。

## 2. 新增的 repository surface

| 路徑 | 用途 |
| --- | --- |
| `src/pages/teacher-review/index.astro` | 靜態 shell（`robots=noindex,nofollow`，無學習者導覽） |
| `src/client/teacherReview.ts` | 審查 UX client（一次一筆、過濾、Accept／Needs changes、summary、export 連結） |
| `src/domain/teacherReview.ts` | 純 domain：resolver（24+6+6 fail-closed）、semantic fingerprint、decision validation、artifact builder |
| `src/domain/teacherReviewUi.ts` | 純 UI state machine |
| `src/content/loadTeacherReviewCampaign.ts` | 共享 loader（Astro、Functions、tests 共用同一份 content） |
| `functions/teacher-review/api/*` | Pages Functions：Access JWT middleware、records、decisions、export |
| `d1/migrations/0001_teacher_review_decisions.sql` | D1 schema（decision per `(campaign_id, record_id)`） |
| `functions/tsconfig.json` | Pages Functions 的獨立 typecheck project |
| `docs/engineering/teacher-review-deployment-runbook.md` | 本檔 |

> 刻意**不**在 repo 放 `wrangler.toml`：production 的 Pages 部署由 dashboard 設定（build 指令、輸出目錄、bindings、變數），避免 repo 內的 `wrangler.toml` 干擾既有 Pages 部署。D1 設定與 local tooling 完全由本 runbook 的指令指定。

## 3. D1 設定

### 3.1 建立資料庫並套用 migration

**正式環境（Cloudflare dashboard）：**

1. Dashboard → **D1** → **Create database** → 名稱 `teacher-review`。
2. Dashboard → **D1 → teacher-review → Console**，執行 `d1/migrations/0001_teacher_review_decisions.sql` 的內容。

**或使用 wrangler CLI（需先安裝 wrangler 與填入 database id）：**

```sh
pnpm exec wrangler d1 create teacher-review        # 回傳 database_id
pnpm exec wrangler d1 execute teacher-review \
  --database-id=<database_id> --remote \
  --file=d1/migrations/0001_teacher_review_decisions.sql
```

**本地（可選）：**

```sh
pnpm exec wrangler d1 execute teacher-review --database-id=<database_id> \
  --local --file=d1/migrations/0001_teacher_review_decisions.sql
```

### 3.2 Pages binding

Cloudflare dashboard → **Workers & Pages → chabiko → Settings → Bindings → Add → D1 database bindings**：

- **Variable name（binding）：** `TEACHER_REVIEW_DB`
- **D1 database：** `teacher-review`
- 儲存後 **redeploy** 才生效。

### 3.3 Schema 合約

`teacher_review_decisions`：每個 `(campaign_id, record_id)` 只有一筆 current decision。欄位：

- `fingerprint` — 被審查內容的 semantic fingerprint（決定綁定的精確版本）。
- `outcome` — `accepted | needs_changes`（CHECK 約束）。
- `note` — `needs_changes` 必填；`accepted` 可選。
- `reviewer_identity` / `reviewer_email` / `reviewer_name` / `reviewer_role` — 來自驗證過的 Access JWT，絕非瀏覽器欄位。
- `updated_at` — ISO 8601。

沒有 audit history、沒有 CMS 表、沒有 generic CRUD。只有**人類決定**會被寫入。

## 4. Cloudflare Access 設定（path-only 保護）

目標：**只**保護 `https://chabiko.pages.dev/teacher-review` 及其所有後代路徑，**不**保護公開學習者網站（`/`、`/phrasebook/` 等）。

### 4.1 建立 path-scoped Access application

1. Zero Trust → **Access → Applications** → **Add an application → Self-hosted**。
2. **Application domain：** 設定為 `chabiko.pages.dev/teacher-review`（**裸 path，不要加 `/*`**）。
   - 官方 Application paths 規則：path 欄位的 `/*` **不**涵蓋 parent path。設定裸 path `chabiko.pages.dev/teacher-review` 會涵蓋該精確 path，且其後代路徑（如 `/teacher-review/api/*`）依 policy inheritance 繼承保護。
   - 保護範圍僅止於 `/teacher-review*`；同源的 `/`、`/phrasebook/` 等 sibling path 不受保護。
3. **Policy：** 只 allow **明確命名的 reviewer 與 maintainer email**。Email One-time PIN（OTP）即可，教師不需要另外的帳號。
   - Identity provider：在 Access → Settings → Authentication 啟用 **One-time PIN**（email OTP）。
4. 記下 **AUD tag**（Zero Trust → Access → Applications → 該 application → Overview → AUD tag），填入 Pages production 變數 `TEACHER_REVIEW_ACCESS_AUD`。AUD 除非刪除重建 application，否則不變。
5. 記下 **team domain**（形如 `https://<team>.cloudflareaccess.com`），填入 `TEACHER_REVIEW_ACCESS_TEAM_DOMAIN`。

### 4.2 重要：`*.pages.dev` 主網域的已知限制

官方 Known issues（Pages）：「Enable Access on your `*.pages.dev` domain」段落在設定時會**預設只保護 preview deployments**（`*.<site>.pages.dev`），不保護主 `chabiko.pages.dev`。若要保護主網域，需編輯該 Access application 的 **Overview → Subdomain** 欄位（刪除 wildcard `*`），或改用本 runbook §4.1 的 self-hosted path-scoped application。

**pre-production 必做驗證（fail-closed）：**

- [ ] 未登入時，訪問 `https://chabiko.pages.dev/teacher-review` 會被導向 Access 登入。
- [ ] 未登入時，`https://chabiko.pages.dev/teacher-review/api/records` 回傳 401（Access 邊界）或 JSON 401（Functions JWT 邊界）——兩者任一 fail-closed 即可。
- [ ] **未登入時，`https://chabiko.pages.dev/`、`/phrasebook/`、`/vocabulary/basic/` 等公開學習者頁面仍可正常訪問，不被 Access 擋住。**
- [ ] 登入後，`/teacher-review` 與 `/teacher-review/api/*` 可訪問。

若 path-only 保護無法達成（例如：`pages.dev` 上無法建立 path-scoped application、或保護範圍擴及整個公開站），**STOP 並回報 BLOCKED**。不得改為保護整個學習者網站、不得新增 review subdomain、不得發明 application-level auth 當 workaround。

### 4.3 變數設定（Cloudflare dashboard，非 git）

在 Pages production 環境設定下列變數：

| Variable | 值 |
| --- | --- |
| `TEACHER_REVIEW_ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| `TEACHER_REVIEW_ACCESS_AUD` | Access application AUD tag |

本地開發時放在 `.dev.vars`（gitignored）；**不得 commit 真實值**。

### 4.4 伺服器端 JWT 驗證（雙層防禦）

- Cloudflare Access 在邊界保護 `/teacher-review` 與 `/teacher-review/api/*`。
- 此外，`functions/teacher-review/api/_middleware.ts` 對每個 `/teacher-review/api/*` 請求驗證 `Cf-Access-Jwt-Assertion` header 的 RS256 JWT（iss、aud、exp、nbf、iat、JWKS kid 比對），只從驗證過的 JWT 取 reviewer identity。即使邊界 Access 設定錯誤，API 也會 fail closed（JSON 401）。
- **只有**在 campaign config（`functions/teacher-review/api/campaign-config.ts`）中明確設定的 reviewer email 可以寫 decision；其餘 Access 身份可 inspect／export，但寫入會回傳 403。

## 5. 預設 campaign 設定

`functions/teacher-review/api/campaign-config.ts` 是 bounded deployment/campaign configuration（不是 user management／RBAC）：

- `TEACHER_REVIEW_ROLE` — `human-language-reviewer`。
- `TEACHER_REVIEW_SCOPES` — 本 atomic v1 decision 涵蓋的 #360 scope（learner-facing-strings、script-provenance、teaching-accuracy、regional-accuracy、source-license、pronunciation-guidance、review-status、scope-compliance）。
- `TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS` — **正式上線前必須**換成真正的 #360 指定 reviewer email。

## 6. 本地驗證

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:content
git diff --check
```

本地跑 Pages Functions（需 `.dev.vars` 設定 Access 變數，並用 `--d1` 指定本地 D1 binding）：

```sh
pnpm build
TEACHER_REVIEW_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com \
TEACHER_REVIEW_ACCESS_AUD=<aud> \
pnpm exec wrangler pages dev dist --d1 TEACHER_REVIEW_DB=<database_id>
```

## 7. Rollback

### 7.1 回到無審查入口

1. Cloudflare Pages → **Deployments → All deployments**，選擇先前已驗證的 production deployment → **Rollback to this deployment**。
2. 若要完全移除審查入口：在後續 PR 中移除 `src/pages/teacher-review/`、`functions/teacher-review/`、`src/domain/teacherReview*`、`src/content/loadTeacherReviewCampaign.ts` 與相關測試。
3. D1 資料可保留（`teacher_review_decisions` 是 human decisions 的記錄，不影響學習者行為）；若需清除，在 D1 主控台執行 `DELETE FROM teacher_review_decisions;`。

### 7.2 回到無 Access 保護

若需解除 `/teacher-review` 的 Access 保護：在 Zero Trust → Access → Applications 刪除或停用該 application，並移除 Pages 的 `TEACHER_REVIEW_ACCESS_TEAM_DOMAIN`／`TEACHER_REVIEW_ACCESS_AUD` 變數（否則 Functions 會以未設定錯誤 fail closed）。

## 8. Pre-production 檢查清單

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:content
git diff --check
```

外加手動（§4.2 的 Access path 驗證、D1 migration 已套用、AUD/team domain 變數已設定、reviewer email 已設定）。

## 9. #360 與 #250 關係（重要）

- **#363 完成不等於 #360 完成**：#360 需要真人審查，並以本入口產出的 repository-standard artifact（`/teacher-review/api/export`）作為 #360 的機械出版依據。
- **#363 不 unblock #250**：#250 仍被 #360 擋住。
- 本入口**從不**寫入 GitHub、內容檔、`reviewStatus` 或 provenance；審查完成後的機械出版（status 提升、#260/#262 canonical Unicode sync、PR/CI）由 #360 之後的既有流程執行。
