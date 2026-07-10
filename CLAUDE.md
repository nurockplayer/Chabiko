# Chabiko — Claude Agent Guidelines

@~/.claude/CLAUDE.md

本檔繼承 global ~/.claude/CLAUDE.md 的全域規則；repo-specific 與 Codex 共用規則以 AGENTS.md 為並行 source of truth。git、package manager、supply-chain、scope 與安全規則必須同時參照 AGENTS.md 才能取得完整規範。

## 語言設定（覆寫全域規則）

本專案覆寫全域語言限制：
- 代理人的說明與回報使用台灣正體中文。
- 學習內容、例句、UI copy、語法說明、面向日本學習者的文案可以使用日文。
- 繁體中文用於目標語內容（詞彙、例句、拼音標註）。
- 全域禁止日文的規則不在此限。

## 專案定位

Chabiko | チャビコ 是給日本人學中文的網站。目標是讓零基礎或初學者從「看得懂一些漢字」進到「可以用簡單中文在台灣旅行」。

產品核心不可變：
- Chinese content dual-script：台灣旅遊路徑以繁體為主；HSK／學校課業／一般中文路徑可預設簡體。產品 UI 與解說始終以日文為主。
- 日文解釋優先（服務日本語使用者）。
- 內容有趣、短、讓人想繼續看。
- 中日漢字與音讀相近性只作為記憶提示，必須明確標示 false friends、聲調差異、台灣用法。
- 學習成果以 Travel Quest / 情境準備度呈現，不只是課程完成數。

## Source Of Truth 與 GSD 工作流程

實作前先讀：
- `.planning/PROJECT.md` — 專案定位、核心價值、限制、決策。
- `.planning/REQUIREMENTS.md` — v1 可驗收需求。
- `.planning/ROADMAP.md` — phase 邊界與 issue 對應。
- `.planning/phases/*/*-CONTEXT.md` — phase 實作決策（若有）。
- `docs/strategy/learning-and-motivation-strategy.md` — lesson loop、Travel Quest、練習策略。
- `docs/content/content-model-draft.md` — 內容資料模型草案。
- GitHub issue body — 當前任務的直接 scope。

GSD 鐵則：
- 執行 issue 前先確認所屬 roadmap phase 與 phase context。
- 不得跨 phase 實作未列入該 phase issue 的功能。
- 文件、研究草稿與聊天討論不能自動視為 implementation source of truth；若和上述文件衝突，先更新 source of truth 或另開 issue。

## 技術方向

Greenfield web project。Phase 1 決定具體框架前，預設方向：
- Static-first web app，TypeScript，Structured content files。
- pnpm 為唯一套件管理工具；scaffold/package.json 必須包含 `"packageManager": "pnpm@10"`；不得產生 npm/yarn/bun lockfile。
- uv 為 Python validation tooling 的管理工具；Python validators 一律用 `uv run` 執行；不得使用 Poetry、Pipenv 或 requirements.txt。
- LocalStorage 可用於 v1 練習進度。
- v1 不需要後端、登入、雲端同步、付款、語音辨識或 AI 自動解釋生成。

## 內容與資料規則

- 內容與資料支援繁簡雙語顯示；台灣旅遊路徑以繁體為主，HSK／學校課業／一般中文路徑可預設簡體。
- 內容必須放在結構化、可審核的資料檔中，不硬塞在 component 裡。
- 每個 vocabulary entry 至少支援：繁體中文、pinyin、日文說明、類別、例句、tone note、caution/source/review metadata。
- 每個核心 lesson 必須符合 `docs/strategy/learning-and-motivation-strategy.md` 的 lesson loop。
- false friends、聲調陷阱、台灣用法差異必須明確標示。
- 中日音讀相近性只能作為記憶提示；不得在沒有來源時宣稱詞源關係、發音等同或語義等同。
- 外部教材、字典資料、音訊、圖片或例句不得直接匯入，除非 license、attribution 與 allowed use 已文件化。

## 前端品質重點

- 設計或重設前端頁面前，先使用 `design-taste-frontend`。
- UI 應輕快但不幼稚；第一畫面優先呈現實際 lesson/practice/Travel Quest 狀態，不是 landing page。
- UI 必須 mobile-first、內容導向。
- Lesson 頁面要清楚呈現：hook、can-do goal、core sentence、chunk breakdown、kanji bridge、sound focus、mini practice、travel task。
- 日文長句、拼音、繁中卡片與按鈕必須在 mobile 與 desktop 檢查不重疊、不截斷。

## Git 規範（專案特有差異）

全域 Git 規則已涵蓋大部分流程。本專案差異：
- Branch 命名預設 `codex/<short-description>`，除非使用者指定其他名稱。
- PR 必須列出 source of truth、變更內容、明確不做的事與驗證結果。

## 測試與驗證

宣稱完成前至少回報實際執行過的驗證。優先測：
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

## Scope 邊界（專案特有差異）

- PR 只做 GitHub issue 明確列出的任務；不要把未要求的功能、重構或 future work 混進同一個變更。
- 發現新需求時，開新 issue 或更新 roadmap，不要直接塞進當前 PR。
- 需要新增依賴、調整架構或擴大功能範圍時，先說明理由、替代方案與風險。
- 高衝擊自動化（auto-close PR、dependency auto-merge）預設禁止，除非使用者明確確認。
- 內容型別是合約，不要隨意刪除或破壞向後相容。
- 所有領域邏輯必須在 domain 層，不在 UI 元件裡放商業邏輯。
