# Chabiko — Claude Agent Guidelines

## 語言設定

永遠使用台灣正體中文回覆。日文內容只用於學習材料、例句、UI 標籤、語法說明或面向日本學習者的文案。

## 專案定位

Chabiko | チャビコ 是給日本人學中文的網站。目標是讓零基礎或初學者從「看得懂一些漢字」進到「可以用簡單中文在台灣旅行」。

產品核心：

- 繁體中文優先，因為 v1 目標是台灣旅行。
- 日文解釋優先，服務日本語使用者。
- 內容要有趣、短、讓人想繼續看。
- 使用中日漢字與音讀相近性降低入門門檻，但必須明確標示 false friends、聲調差異、台灣用法。
- 學習成果以 Travel Quest / 情境準備度呈現，不只是課程完成數。

## Source Of Truth

實作前先讀相關 source of truth：

- `.planning/PROJECT.md` — 專案定位、核心價值、限制、決策。
- `.planning/REQUIREMENTS.md` — v1 可驗收需求。
- `.planning/ROADMAP.md` — phase 邊界與 issue 對應。
- `.planning/phases/*/*-CONTEXT.md` — phase 實作決策。
- `docs/strategy/learning-and-motivation-strategy.md` — 學習動機、lesson loop、Travel Quest、練習策略。
- `docs/content/content-model-draft.md` — 內容資料模型草案。
- GitHub issue body — 當前任務的直接 scope。

文件、研究草稿與聊天討論不能自動視為 implementation source of truth；若和上述文件衝突，先更新 source of truth 或另開 issue。

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

## 技術方向

目前是 greenfield web project。Phase 1 決定具體框架前，預設方向如下：

- Static-first web app。
- pnpm。
- TypeScript。
- Structured content files。
- LocalStorage 可用於 v1 練習進度。
- v1 不需要後端、登入、雲端同步、付款、語音辨識或 AI 自動解釋生成。

## Scope 邊界

- PR 只做 GitHub issue 明確列出的任務。
- 不要把未要求的功能、重構或 future work 混進同一個變更。
- 發現新需求時，開新 issue 或更新 roadmap，不要直接塞進當前 PR。
- 若需要新增依賴、調整架構或擴大功能範圍，先說明理由、替代方案與風險。
- 空專案初期可以調整腳手架，但仍要避免無關檔案與 metadata churn。
- 高衝擊自動化，例如 auto-close PR、dependency auto-merge，預設禁止，除非使用者明確確認。

## Git 規範

- Branch 命名預設使用 `codex/<short-description>`，除非使用者指定其他名稱。
- Commit 訊息使用簡潔英文祈使句或 `<type>: <short description>`。
- 在 mixed worktree 中不得使用 `git add -A` 或 `git add .`；只 stage 本次任務需要的檔案。
- 不要 revert 使用者未要求 revert 的變更。
- GitHub / git 指令必須 non-interactive。
- PR 必須列出 source of truth、變更內容、明確不做的事與驗證結果。

## JavaScript Package Manager

- 使用 pnpm。
- 建立 app scaffold 時加入 `"packageManager": "pnpm@10"`，除非 repo 已指定更精確版本。
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

## 內容與資料規則

- v1 以繁體中文為主，不做簡體中文優先教材。
- 內容必須存在 structured, reviewable files，不要硬塞在 React component 裡。
- 每個 vocabulary entry 至少支援：繁體中文、pinyin、日文說明、類別、例句、tone note、caution/source/review metadata。
- 每個核心 lesson 必須符合 `docs/strategy/learning-and-motivation-strategy.md` 的 lesson loop。
- 中日音讀相近性只能作為 learning bridge，不得在沒有來源時做詞源或語音等同宣稱。
- false friends、聲調陷阱、台灣用法差異必須明確標示。

## 測試與驗證

宣稱完成前至少回報實際執行過的驗證。

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
- 遇到錯誤時先給診斷與建議修法，再問是否繼續。

