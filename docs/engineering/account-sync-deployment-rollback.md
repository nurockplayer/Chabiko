# Account-Sync 部署與 Rollback Runbook

本 runbook 描述 account-sync 上線後，Chabiko 的靜態部署、Supabase／Google 設定、Cloudflare Pages 建置與 guest-only rollback 流程。對應 Issue #294 的 Deployment/rollback 驗收域（Domain 9）。

來源：Issue #293 的 account-sync 實作與 Issue #294 的 release acceptance。本檔只保存可重用的部署與 rollback 流程，不重複記載 domain 的 runtime 行為。

## 1. Astro 維持 static-first

Chabiko 維持 ADR-0001（static-first v1）決策。`astro.config.mjs` 保持 `output: 'static'`，沒有 SSR adapter、沒有 server endpoint。

- build 指令：`pnpm build`（`astro build`）。
- 產出目錄：`dist/`（`.gitignore` 已忽略）。
- 部署平台：Cloudflare Pages（`site` 為 `https://chabiko.pages.dev`）。
- 選用 account-sync 後，static 架構不變：Supabase 只是瀏覽器端的第三方服務，不引入 serverless function 或 build 時資料抓取。

## 2. 必須能建置的 route

Release acceptance 要求下列三條 route 在靜態建置後確實存在（對應的 build 測試見 `tests/build/teacher-preview-build.test.ts`）：

| Route | 產出檔 | 關鍵 marker |
| --- | --- | --- |
| Auth callback | `dist/auth/callback/index.html` | `data-supabase-auth-callback`、`data-supabase-auth-callback-status`（`aria-live="polite"`、`robots=noindex,nofollow`） |
| 基礎詞彙首頁 | `dist/vocabulary/basic/index.html` | `data-basic-vocabulary-account`、`data-basic-vocabulary-session`、`id="basic-vocabulary-data"` |
| 基礎詞彙單字表 | `dist/vocabulary/basic/words/index.html` | `data-basic-vocabulary-catalog` |

驗證方式：

```sh
pnpm build
test -f dist/auth/callback/index.html
test -f dist/vocabulary/basic/index.html
test -f dist/vocabulary/basic/words/index.html
```

即使環境完全沒有 Supabase 變數，`pnpm build` 也必須成功（guest-only 模式，Domain 1）。CI（`.github/workflows/ci.yml`）在無 Supabase 環境下執行 `pnpm build`，因此任何讓 build 依賴 Supabase 的改動都會在 CI 被攔下。

## 3. 建置輸出的機密性保證

account-sync 的 auth、sync 與 privacy 驗收（Domain 2、7）依賴「client bundle 只內嵌公開值」的保證。規則：

- 只允許透過 `PUBLIC_` 前綴把變數內嵌進 client bundle：`PUBLIC_SUPABASE_URL`、`PUBLIC_SUPABASE_PUBLISHABLE_KEY`。
- `.env.example` 只暴露這兩個公開變數的空值。
- `src/env.d.ts` 只宣告這兩個變數；`readSupabasePublicConfig()` 在 URL 非合法絕對 http(s) URL、或 publishable key 為空白時回傳 `null`（key 只需非空字串，不要求是 URL；只有 URL 需為絕對 http(s)）。
- 任何非 `PUBLIC_` 的 secret（service role key、JWT secret、Google client secret、anon key）都必須只存在於環境變數中，且不得在 build 時被任何途徑帶進 `dist/`。

## 4. 機密性 build 掃描

發佈前或 CI 之後，用 decoy secret 跑一次「production-shaped」build 並掃描輸出，確認沒有任何 secret 漏入靜態檔案：

```sh
PUBLIC_SUPABASE_URL='https://acceptance-test-project.supabase.co' \
PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_acceptance_public_key_0001' \
SUPABASE_SERVICE_ROLE_KEY='sb_secret_acceptance_service_role_0001' \
SUPABASE_JWT_SECRET='jwt-secret-acceptance-decoy-0001' \
GOOGLE_CLIENT_SECRET='google-client-secret-decoy-0001' \
SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.acceptance-anon-decoy' \
pnpm build --outDir dist/scan-verify
```

預期結果：

- `https://acceptance-test-project.supabase.co` 與 `sb_publishable_acceptance_public_key_0001` 會出現在輸出（公開值，原本就該內嵌）。
- 四個 decoy secret 的值都不得出現在輸出。
- 輸出不得出現 `eyJ`（JWT header 特徵）、`sb_secret_` 字首、或 `SERVICE_ROLE_KEY`／`GOOGLE_CLIENT_SECRET`／`SUPABASE_SECRET_KEY`／`JWT_SECRET`／`SUPABASE_ANON_KEY` 等 env name 字面。

此掃描已自動化於 `tests/build/teacher-preview-build.test.ts` 的 `Deployment — static account-sync routes and secret hygiene` describe，隨 `pnpm test` 執行。

## 5. Credential-free 設定 runbook

### 5.1 Supabase

- 不需要在 client 或 build 側設定任何 secret。瀏覽器只使用公開的 Project URL 與 publishable key。
- 資料庫 schema 與 RLS 由 migration 管理：`supabase/migrations/`（basic-vocabulary progress 與 stale-generation policy 兩個 migration）。
- migration 全部使用 security invoker RPC（owner 身分推導的 reset generation），沒有 security definer、沒有 service role 路徑。RLS 強制、owner 權限、anon／其他 user 拒絕，由 `tests/supabase-basic-vocabulary-schema.test.ts`（live database）驗證。
- 需要發布 migration 到 Supabase 專案時（一般由具備資料庫權限的維護者執行）：

```sh
supabase link --project-ref <PROJECT_REF>
supabase db push
```

- 不要在 Cloudflare Pages 或 client 端放置 `service_role`、`anon`（JWT）或任何 secret。`anon` key 在 Supabase 專案中仍有用途，但 Chabiko 的 client 不需要；只配置公開的 publishable key。

### 5.2 Google OAuth（Supabase Auth Provider）

Google PKCE 流程由 Supabase Auth 的 `[auth.external.google]` provider 提供。本地 `supabase/config.toml` 沒有啟用任何 Google provider block（`google` 只在 provider 清單註解中出現）；正式專案的 Google OAuth credentials 在 Supabase dashboard 設定，不外推到 client。

正式專案啟用時，在 Supabase dashboard 的 Authentication → Providers 設定：

- 建立 Google OAuth 2.0 client（Cloud Console），授權 callback 為 Supabase 專案的 `https://<PROJECT_REF>.supabase.co/auth/v1/callback`。
- 在 Supabase 填入 Client ID 與 Client secret（secret 只存在 Supabase 後端，不進 Chabiko repo、不進 Pages）。
- Supabase 會把回傳流量導回 Chabiko 的 auth callback route；Chabiko 的 callback 只允許 allowlist 內的回傳路徑（`/vocabulary/basic/`、`/vocabulary/basic/words/`）。

### 5.3 Cloudflare Pages

- 建置指令：`pnpm build`。
- 輸出目錄：`dist`。
- 只需要設定兩個公開環境變數（若要有帳號功能）：

```
PUBLIC_SUPABASE_URL = https://<PROJECT_REF>.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY = <publishable key>
```

- **不得**在 Pages 設定 `SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_JWT_SECRET`、`GOOGLE_CLIENT_SECRET` 或其他 secret 變數。Pages 的變數若帶 `PUBLIC_` 前綴會內嵌進 client bundle，非 `PUBLIC_` 前綴雖不會被 Astro 內嵌，但為了最小攻擊面，任何 secret 都不應出現在 Pages 的變數清單。
- 完全不安裝這兩個變數時，Pages 仍可建置並提供 guest-only 體驗（見 §7 rollback）。

## 6. 正式發布前的驗證清單

```sh
supabase db reset --local --yes
supabase db lint --local --level warning --fail-on warning
supabase db advisors --local --type all --level info --fail-on warn
pnpm lint
pnpm typecheck
pnpm test          # 含 build secret scan、live schema/repository、domain/runtime/browser 測試
pnpm build
pnpm test:visual   # 需要可用的瀏覽器環境
git diff --check
```

另外手動確認：

- callback route 在無登入狀態下 200 且不顯示任何 token。
- Google 登入後，回傳路徑只在 allowlist 內；錯的回傳路徑被安全處理（無 raw error）。
- 多裝置同步與 reset 的既有 acceptance 測試通過。

## 7. Rollback：回到 guest-only

account-sync 的設計是「local-first、optional account」：guest 學習進度存在本地 legacy key（`chabiko:basic-vocabulary-progress:v1`），帳號進度存在 user-scoped key（`chabiko:basic-vocabulary-progress:user:{userId}:v1`）。因此 rollback 不需要刪除任何人的進度。

### 7.1 靜態站 rollback（Cloudflare Pages）

1. 在 Pages dashboard 把 production branch 指回前一個已驗證的 commit，或重新部署 guest-only 的 commit。
2. 移除 `PUBLIC_SUPABASE_URL` 與 `PUBLIC_SUPABASE_PUBLISHABLE_KEY` 兩個變數（或改部署不含它們的 build）。
3. 重新建置並確認 `/auth/callback`、`/vocabulary/basic`、`/vocabulary/basic/words` 仍建置成功，且 client 回退為 guest-only（不顯示登入 UI、不嘗試連 Supabase）。
4. 驗證：`readSupabasePublicConfig()` 在缺少任一變數時回傳 `null`，`getSupabaseBrowserClient()` 回傳 `null`，頁面以 legacy guest key 正常運作。

### 7.2 進度保存保證

- 使用者的 guest 進度與帳號進度分離儲存；rollback 到 guest-only 後，同一瀏覽器仍可讀取 legacy guest key 的進度。
- 已登入使用者的 user-scoped 進度仍留在瀏覽器 local storage 與 Supabase；若日後重新啟用帳號功能，同一 Supabase user 會回到自己的進度（user ID 由 Supabase auth identity 單一來源決定，見 `src/domain/basicVocabularyProgressScope.ts`）。
- 不進行任何破壞性資料操作（不清空 local storage、不刪 Supabase rows）。

### 7.3 變更範圍

rollback 時不需要動到 migration、schema 或 RLS。只要前端 build 與 Pages 變數回退，即可恢復 guest-only 行為；正式環境不會執行任何 migration 回滾。
