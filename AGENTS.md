# Chabiko — Agent Guidelines

## 語言設定

永遠使用台灣正體中文回覆。日文內容只用於學習材料、例句、UI 標籤、語法說明或面向日本學習者的文案。

## 專案定位

Chabiko | チャビコ 是給日本人學中文的網站。目標是讓零基礎或初學者從「看得懂一些漢字」進到「可以用簡單中文在台灣旅行」。

產品核心：

- Chinese content dual-script：台灣旅遊路徑以繁體為主；HSK／學校課業／一般中文路徑可預設簡體。產品 UI 與解說始終以日文為主。
- 日文解釋優先，服務日本語使用者。
- 內容要有趣、短、讓人想繼續看。
- 使用中日漢字與音讀相近性降低入門門檻，但必須明確標示 false friends、聲調差異、台灣用法。
- 學習成果以 Travel Quest / 情境準備度呈現，不只是課程完成數。

## Source Of Truth

開始實作前，先讀取當前 GitHub issue body，再只讀取與本次 scope 直接相關的 source of truth。

衝突時優先順序：

1. 使用者本次明確指示
2. 當前 GitHub issue body
3. 已合併且仍有效的 phase context
4. `.planning/REQUIREMENTS.md` — v1 可驗收需求。
5. `.planning/ROADMAP.md` — phase 邊界與 issue 對應。
6. `.planning/PROJECT.md` — 專案定位、核心價值、限制、決策。
7. strategy、draft 或研究文件

不得為了確認簡單任務而全面讀取所有規劃文件。

若文件互相衝突且會影響 correctness，停止擴大實作，回報衝突；除非使用者明確要求，不得自行更新 source of truth 或建立 issue。

## Shell 指令

- `git` / `gh` 相關 shell 指令必須用 `rtk` 降低輸出 token。
- 非 git 指令不要加 `rtk`，例如 `sed`、`grep`、`find`、`pnpm`、`node`、`pytest`、`make`。

例：

```bash
rtk git --no-optional-locks status
rtk git diff --stat
rtk gh issue view 12
pnpm test
sed -n '1,120p' AGENTS.md
```


## 技術基線

目前專案已採用：

- Astro
- TypeScript
- pnpm
- Vitest
- Structured content files
- uv + Python 3.14+ validation tooling
- LocalStorage-based v1 progress

現有架構、schema 與測試是 implementation baseline。除非 issue 明確要求，不得重新選型、替換框架或重建 scaffold。


## Scope 邊界

- PR 只做 GitHub issue 明確列出的任務。
- 不要把未要求的功能、重構或 future work 混進同一個變更。
- 發現 scope 外需求或技術債時，不得直接塞進當前 PR。只在回報中簡短列為 deferred finding。
- 若需要新增依賴、調整架構或擴大功能範圍，先說明理由、替代方案與風險。
- 高衝擊自動化，例如 auto-close PR、dependency auto-merge，預設禁止，除非使用者明確確認。

## 實作前檢查

這些規則來自 Issue #193 反覆 review 循環的教訓，實作前必須確認，避免同類缺陷重演：

- 移除或收窄任何安全機制（build guard、`.gitignore` 規則、驗證 gate）前，先找出所有**寫入該路徑**的來源與**依賴該機制**的 consumer，確認沒有其他 writer 後才能動手。
- 變更跨檔契約（rights、state、schema、資料結構）時，列出完整 consumer 清單（資料檔、loader、validator、UI、測試），在同一個變更內全部同步，不得「加檔後續補」。
- 文件化的 workflow 命令必須由 self-test 斷言其行為本身，不能只測被呼叫的函式。
- Regression 測試的 cleanup 只刪除自己建立的檔案與目錄，預設工作區含有其他開發者的檔案；不得假設環境是乾淨的。

## Flash 任務大小 Gate

本節適用於 DeepSeek v4 Flash 或其他低成本 implementation model，也約束產生實作或 review-fix prompt 的 coordinator。

- Review findings 不是一個可直接整包委派的 executable task。委派前必須依 root cause 與 implementation mechanism 分組。
- 每個 implementation cycle 只能有一個 primary mechanism，以及與該機制直接耦合的 targeted tests。
- 同一 cycle 不得同時包含 production logic／architecture 修改、test harness／mocking／fixture 重設計，以及 GitHub／CI／review thread／PR cleanup。
- 多個 findings 只有在 root cause、主要修改檔案、implementation mechanism 與 validation boundary 都相同時才可合併。
- 其餘 findings 必須在同一 branch／PR 上依序拆成 bounded cycles：production correctness、failure-path tests／test harness、final integration／delivery cleanup。
- 非 final cycle 到 targeted validation 與精簡回報即停止。完整 validation、reviewer rerun、thread resolution、PR body 更新與 CI 確認只放在 final integration cycle。
- 若 prompt 含有超過一個獨立 primary mechanism，coordinator 必須在委派前拆分；implementer 若收到違反本 Gate 的任務，必須在修改前停止並回報建議拆法。
- Prompt 長度必須依任務規模裁剪，不得重複 Issue、`AGENTS.md` 或 `CLAUDE.md` 已明定的要求。
- 單一 cycle 完成不得被表述為整個 PR 已 merge-ready，除非 final integration、完整驗證與 reviewer gate 均已完成。

## Git 規範

- Branch 名稱使用 `<agent-or-purpose>/<short-description>`，並優先遵循使用者或當前 workflow 指定的命名方式。
- Commit 訊息使用簡潔英文祈使句或 `<type>: <short description>`。
- 在 mixed worktree 中不得使用 `git add -A` 或 `git add .`；只 stage 本次任務需要的檔案。
- 不要 revert 使用者未要求 revert 的變更。
- GitHub / git 指令必須 non-interactive。
- PR 必須列出 source of truth、變更內容、明確不做的事與驗證結果。

## JavaScript Package Manager

- 使用 pnpm。
- 使用 `package.json` 中既有的精確 `packageManager` 版本。不得自行降級、升級或改寫版本，除非 issue 明確要求。
- 不得引入 `package-lock.json`、`yarn.lock`、`bun.lock` 或 `bun.lockb`。
- 不得新增 `preinstall`。
- 不得用 lifecycle script 強制 package manager。

## 供應鏈安全

- 不得自行新增依賴，除非任務需要且已說明原因。
- 不得執行 `npx`、`pnpm dlx`、`npm exec`、`curl | bash`、`wget | sh` 這類遠端即時執行指令，除非使用者明確批准。
- `package.json` 與 lockfile 改動必須在回報中明確說明。
- 外部教材、字典資料、音訊、圖片或例句不得直接匯入，除非 license、attribution 與 allowed use 已文件化。

## 前端品質重點

- 設計或重設前端頁面前，先使用 `design-taste-frontend`。
- 第一畫面應該快速呈現實際學習內容或練習，不是 landing page。
- UI 應該 mobile-first、內容導向、輕快但不幼稚。
- 日文用於學習者說明；繁體中文用於目標語內容；台灣正體中文可用於開發/管理介面。
- Lesson 頁面要清楚呈現：hook、can-do goal、core sentence、chunk breakdown、kanji bridge、sound focus、mini practice、travel task。
- Travel Quest / scenario readiness 要比泛用 streak 更優先。
- 手機與桌面都要檢查文字不重疊、不截斷，尤其是日文長句、拼音、繁體中文字卡與按鈕。

## JS-free 互動與瀏覽器證據

JS-free 互動工作必須：

- 使用原生控制項與原生瀏覽器語意（例如 `details`/`summary`、radio、`<a href="#id">`、`<button type="button">`）。
- 不得用 focusable label、泛用元素或 inert anchor 模擬按鈕；不得用靜態 ARIA state 模仿可變的原生 state。
- 在唯讀 arbiter review 前，先產生瀏覽器互動、accessible-name、focus、viewport 與截圖證據。
- 確認截圖片段中每個必要證據元素與每個可見互動控制項都完整位於 viewport 內。

詳細的互動決策表、per-control 契約、瀏覽器煙霧測試矩陣、截圖／viewport 證據規則、arbiter 能力邊界與 review/merge 規則，見 `docs/engineering/frontend-interaction-evidence-playbook.md`。

## 內容與資料規則

- 內容與資料支援繁簡雙語顯示；台灣旅遊路徑以繁體為主，HSK／學校課業／一般中文路徑可預設簡體。
- 內容必須存在 structured、reviewable 的資料檔案，不得硬編碼在 Astro page、UI component 或 rendering logic 中。
- 每個 vocabulary entry 至少支援：繁體中文、pinyin、日文說明、類別、例句、tone note、caution/source/review metadata。
- 每個核心 lesson 必須符合 `docs/strategy/learning-and-motivation-strategy.md` 的 lesson loop。
- 中日音讀相近性只能作為 learning bridge，不得在沒有來源時做詞源或語音等同宣稱。
- false friends、聲調陷阱、台灣用法差異必須明確標示。

## 測試與驗證

宣稱完成前至少回報實際執行過的驗證。
只執行與本次變更直接相關的 targeted validation；不得為 bounded change 無條件執行所有測試類別。
若修改跨越共用 domain、schema、build configuration 或 package metadata，再擴大至相應的完整驗證。

優先測：

- Content schema validation。
- Lesson loop 欄位完整性。
- On-yomi bridge vocabulary 的 caution/source/review metadata。
- Practice scoring、retry、local progress。
- Travel Quest readiness 計算。
- Mobile / desktop 主要畫面無重疊、無截斷。
- pnpm lockfile policy。

## 回報格式

回報保持精簡：

- 只列出關鍵變更：檔案名稱 + 一句說明。
- 測試結果只報 pass/fail 與失敗原因，不貼完整 log。
- 有新增依賴、package manager、license 或外部資料風險時必須明確說明。
- 遇到可在當前 issue scope 內安全修復的錯誤，先診斷並做最小修正，再重新驗證。
- 只有在修正會擴大 scope、改變架構、增加依賴、破壞相容性或需要產品決策時，才停止並請使用者決定。
