# Chabiko — Production UI Design Contract

PR #165 (commit `04759286`) 的合併生產實作的 Direction C 設計契約。

## 選擇的視覺方向

**Direction C（城市探索 / City Exploration）**，於 PR #161 中選擇。

來源檔案：
- `docs/design/approved-direction.md` — 方向選擇記錄
- `docs/design/direction-review.md` — 方向審查細節

## 設計特徵（production-proven）

### 色彩系統

基於黑白灰城市底盤搭配 accent 暖金路線標記（`src/layouts/BaseLayout.astro:52-130`）。

- **底部（page/surface/text）**：暖灰白（light）與深灰藍黑（dark），來自 `--color-page`、`--color-surface`、`--color-text`
- **主色（primary）**：深藍灰 `#1a2744`（light）/ 淡藍灰 `#a9bee9`（dark），用於連結、主要按鈕、route 標記邊框
- **強調色（accent）**：暖金/橙 `#d48c2b`（light）/ `#efb45b`（dark），用於路線標記內部、brand mark、can-do 區塊左框
- **狀態色**：success（綠藍系）、error（紅棕系）、current（深金系），均帶有對應的 soft 背景色
- **header**：獨立語義色彩 `--color-header`/`--color-header-text`/`--color-header-muted`，不與 body token 共用

完整 token 清單與 alias 關聯見 [`token-contract.json`](./token-contract.json)。

### 字型層級

- **繁體中文**：`--font-zh` → PingFang TC → Noto Sans TC → Hiragino Sans → sans-serif
- **日文 UI**：`--font-ja` → Hiragino Sans → Noto Sans JP → Helvetica Neue → Arial → sans-serif（body 預設）
- **拼音**：`--font-pinyin` → Hiragino Sans → Noto Sans → Helvetica Neue → Arial → sans-serif

語言標記：`lang="ja"`（文件根）、`lang="zh-Hant"`（繁體中文內容）、`lang="zh-Latn"`（拼音）。

來源：`src/layouts/BaseLayout.astro:17,92-94`，驗證於 `tests/direction-c-production-ui.test.ts:76-82`。

### 排版

- 內容最大寬度：`80rem`（`--max-w`）
- 標題使用 `clamp()` 流體大小：
  - 首頁標題：`clamp(1.5rem, 7vw, 2rem)`
  - 課程標題：`clamp(1.75rem, 7vw, 2.5rem)`
  - 核心例句：`clamp(2.25rem, 11vw, 2.75rem)`（mobile）/ `3rem`（desktop >= 1024px）
- 一般卡片與容器使用直角（`--radius: 0`）。production markers 為明確的圓形例外：brand mark、wayfinding station/route station dots、lesson markers、practice-choice indicators、feedback icon、completion icon 均使用 `border-radius: 50%`。

### 間距系統

以 `0.25rem` 為基本單位，從 `--space-xs` 到 `--space-3xl`。實際值見 [`token-contract.json`](./token-contract.json)。

### 邊框與分隔線

- 邊框色：`--c-border`，`1px solid`
- 主要區塊頂部使用 `4px solid` 強調線（`.lesson-list-link`、`.core-card`、`.bridge-section`）
- 左側強調線用於 can-do 區塊與 travel task（`4px solid --c-accent`）
- 路線時間軸使用 `2px` 垂直線（`--c-route-line`）

### 路線導航（Route / Wayfinding）

首頁路線使用垂直時間軸模式（`src/pages/index.astro:247-257`）：
- 左側 `2px` 垂直路線線
- `18px` 圓形站點標記：current 為實心 primary + accent 內圓；done 為 success + ✓ 符號；future 為空心
- 每個課程卡片皆有 `4px` primary 頂線

課程頁面 sidebar 路線（`src/pages/lessons/[id].astro:249-255`）：
- `2px` 左側路線線
- 同樣的 `18px` 圓形站點標記
- 路線資訊含位置、標題、can-do、例句、狀態標籤

### 狀態呈現

三種進度狀態（`src/pages/index.astro:82-110`）：

| 狀態 | 標籤文字 | 背景色 | 文字色 |
|---|---|---|---|
| 進行中 | `進行中` | `--c-accent-light` | `--color-status-current` |
| 完成 | `✓ 完了` | `--c-success-bg` | `--color-status-success` |
| 待機 | `このあと` | `--c-primary-light` | `--c-text-secondary` |

課程完成徽章（`src/pages/lessons/[id].astro:203-218`）：`completion-badge--done` 使用 `--color-status-success` + `--c-success-bg`。

### 練習回饋狀態

來源：`src/components/LessonPractice.astro:116-150`

- **正確**：選項 `--c-success` 邊框與 indicator（filled circle + inner dot）+ `--c-success-bg` 背景 + feedback icon ✓ + `正解！` 文字；1200ms 後移到下一題或完成畫面
- **錯誤**：選項 `--c-error` 邊框與 indicator（✕）+ `--c-error-bg` 背景 + feedback icon ✕ + `不正解。` + 正確答案顯示；2000ms 後重試
- **完成**：`✓ 練習完了！レッスンをクリアしました。` 訊息 + primary 圓形圖示

非顏色提示：
- **Source / focused tests**（`tests/direction-c-production-ui.test.ts:84-94`）確認 practice component 含有：
  - `.practice-choice__indicator` 存在
  - `role="group" aria-label="回答を選択"`（無障礙 group）
  - `role="status" aria-live="polite"`（即時回饋容器）
  - `store.markComplete()` 與 `timer.schedule()` 生命週期呼叫
  - `pageshow` 與 `storage` 事件監聽
- **Committed browser evidence**（`docs/design/evidence/issue-162/`）確認在實際狀態下：
  - **Incorrect feedback**（`.practice-incorrect-*.png`, `dark-practice-feedback-*.png`）：✕ indicator、紅邊框、`不正解。` + 正確答案、✕ feedback icon 在 light 與 dark 下可見
  - **Completion**（`.practice-complete-*.png`, `dark-completion-*.png`）：`✓ 練習完了！` 訊息與 primary 圓形圖示可見
  - **Correct transient feedback**（無 dedicated capture，僅 `evidence/issue-162/README.md:55-61` 的 browser check 覆蓋）：✓ feedback icon、green 邊框、`正解！` 文字在 1200ms 過渡期間可見（與 incorrect 及 completion 一起納入「correct, incorrect, and completion states retain icon, text, border, and accessible-name cues in addition to colour」瀏覽器檢查）
  - `aria-label` 在點擊後更新為 `正解:` / `不正解:`（PR #165 瀏覽器檢查確認，`evidence/issue-162/README.md:55-61`）

### Header 元件

來源：`src/components/Header.astro:9-38`

- Sticky header，`z-index: 20`
- Brand mark（accent 圓形 + 白色 C）+ Chabiko + チャビコ
- 導航：`ホーム` 連結
- 主題切換按鈕（native `<button>`，`aria-pressed`，`aria-label` 日文，最小 44px 觸控目標）
- Script toggle slot（`繁｜簡 準備中`，純視覺預留）

### 首頁（Home）

來源：`src/pages/index.astro:10-75`

- Grid 佈局：sidebar（GoalPathSlot）+ 主要內容區
- 課程列表為 `<ol>` 有序清單，每項為連結卡片
- 每個卡片包含：編號、日文標題、can-do、繁體中文例句、拼音、完成狀態
- Progress footer：進度摘要 + 重置按鈕（含確認對話框）

### 課程頁面（Lesson）

來源：`src/pages/lessons/[id].astro:60-197`

- Grid 佈局：路線 sidebar + 課程內容
- 課程結構：hook → can-do → 核心表現 → 閱讀段落 → chunks → 漢字橋接 → 發音重點 → 例句 → LessonPractice → travel task → 導航
- Static paths 由 `loadAllRenderableLessons()` 產生
- 前後課程導航連結

### 深色主題

主題機制（`src/lib/theme.ts`）：
- 獨立儲存鍵 `chabiko_theme`，不與學習進度鍵混淆
- 內嵌 `<script>` 在 BaseLayout 中執行，避免 FOUC
- `BaseLayout.astro` 的 `themeEnabled` prop 控制 opt-in
- 僅 production home 與 lesson 路由啟用（`tests/direction-c-production-ui.test.ts:45-56` 驗證）
- HSK、404、dev preview 路由未啟用

深色值對照見 [`token-contract.json`](./token-contract.json)。

## 資源

- 視覺方向選擇：[Direction Review](./direction-review.md)
- 已批准方向：[Approved Direction](./approved-direction.md)
- Token 契約：[token-contract.json](./token-contract.json)
- 元件契約：[component-contract.md](./component-contract.md)
- 回應式契約：[responsive-contract.md](./responsive-contract.md)
- 實作地圖：[implementation-map.json](./implementation-map.json)
- Figma 交付：[figma-handoff.md](./figma-handoff.md)
- 瀏覽器證據：[evidence/issue-162/README.md](./evidence/issue-162/README.md)
