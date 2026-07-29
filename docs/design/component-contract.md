# Chabiko — Production Component Contract

PR #165 的合併生產元件邊界、狀態責任與禁止事項。

來源驗證：`tests/direction-c-production-ui.test.ts:1-95`、`tests/lesson-practice-ui.test.ts:1-71`。

## 現有元件與頁面邊界

### BaseLayout (`src/layouts/BaseLayout.astro`)

**責任**：
- 提供完整 HTML 文件 shell（`<html lang="ja">`）
- 定義全部 `:root` light/dark CSS custom properties
- 內嵌 inline theme detection script：在 pre-paint 階段讀取 localStorage 偏好（`chabiko_theme`）或 `prefers-color-scheme`，並套用 `data-theme` 到 root 元素（無 FOUC）
- `.wrapper` + `.main-content` 佈局容器
- Global reset（`box-sizing`、`margin`、`padding`）
- Global 排版（`body` font、color、line-height）
- `:focus-visible` 無障礙樣式
- `prefers-reduced-motion` 支援
- `<slot name="header" />` + 預設 `<slot />`

**Props**：
- `title: string`（必要）
- `description?: string`（可選）
- `robots?: string`（可選）
- `themeEnabled?: boolean`（預設 `false`）

**狀態邊界**：
- pre-paint inline script 直接讀取 `localStorage.getItem('chabiko_theme')` 並設定 root `data-theme`（Header runtime script 才負責 toggle 與 write）
- 不處理路由邏輯

**禁止責任**：
- 不得包含導航、header 內容或頁面特定標記
- 不得直接導入 theme.ts（inline script 是純 JS）

### Header (`src/components/Header.astro`)

**責任**：
- 網站 header：brand、導航、主題切換按鈕、script toggle slot
- Sticky positioning（`position: sticky; top: 0; z-index: 20`）
- 主題切換按鈕的 runtime 互動：click handler 呼叫 `getNextTheme()`、更新 `document.documentElement.dataset.theme`、將新偏好寫入 `localStorage`、更新 `aria-pressed` 與 `aria-label`（日文）
- 回應式隱藏次要元素（mobile < 768px 隱藏 logo-sub 與 slot-badge）

**Props**：
- `themeEnabled?: boolean`（預設 `false`）

**DOM 結構**：
- `.site-header` > `.header-inner`
  - `.brand` (`<a href="/">`)
    - `.brand-mark`（C 圓形標記，`aria-hidden="true"`）
    - `.logo`（"Chabiko"）
    - `.logo-sub`（"チャビコ"）
  - `.nav-primary`（`aria-label="メインナビゲーション"`）
    - `.nav-link`（"ホーム"）
  - `#theme-toggle`（`type="button"`，`aria-label` 日文，`aria-pressed`）
    - `.theme-toggle__mark`（◐，`aria-hidden="true"`）
    - `.theme-toggle__label`（暗/明）
  - `.script-toggle-slot`（`aria-label="簡体字・繁体字切り替え（準備中）"`）

**狀態邊界**：
- 主題狀態：讀取 `document.documentElement.dataset.theme`（由 BaseLayout pre-paint script 設定），寫入 `localStorage`
- `aria-pressed` 反映 dark 狀態
- `aria-label` 依狀態切換（`ダークテーマに切り替える` / `ライトテーマに切り替える`）
- 觸控目標：最小 44px（theme-toggle）或 52px（含 padding）
- 不負責 initial preference resolution（該責任在 BaseLayout inline script）

**禁止責任**：
- 不得管理學習進度或課程狀態
- 不得執行路由導航（僅提供靜態連結）
- Script toggle 目前為純視覺預留，不實作功能

### GoalPathSlot (`src/components/GoalPathSlot.astro`)

**責任**：
- 顯示學習路線側欄（學習ルート）
- 路線名稱（"台湾旅行で使える中国語"）
- 路線時間軸：active path card（含課程數、標題、例句、進行中狀態）
- 待機路徑（"HSK対策" + 準備中）
- Desktop sticky sidebar（>= 1024px，`position: sticky; top: 88px`）

**資料來源**：
- `loadAllRenderableLessons()` → 取得第一個課程名稱/例句
- 不讀取進度儲存

**狀態邊界**：
- 不管理任何動態狀態
- 所有內容為 build-time static
- `aria-current="step"` 為靜態標記（總是第一課）

**禁止責任**：
- 不得顯示實際完成狀態（無 localStorage 讀取）
- 不得處理點擊互動

### LessonPractice (`src/components/LessonPractice.astro`)

**責任**：
- 練習題目渲染與互動（render、answer、feedback、complete）
- 狀態管理：question index、session、timer
- 生命週期：pageshow（bfcache）、storage（cross-tab sync）
- 無障礙：`role="group"`、`role="status" aria-live="polite"`、`aria-label="回答を選択"`
- 正確答案延遲（1200ms）、錯誤答案延遲（2000ms）

**Props**：
- `lesson: Lesson`

**資料來源**：
- `generateQuestions(lesson)`（`src/lib/practice.ts`）
- 題目透過 `data-questions` attribute 以 JSON 傳入

**DOM 結構**（由 JS 動態生成）：
- `.practice-question`
  - `.practice-progress`（質問 N / M）
  - `.practice-prompt`（日文問題）
  - `.practice-choices[role="group"]`
    - `.practice-choice`（按鈕 × N）
      - `.practice-choice__indicator`（圓形指示器）
      - `.practice-choice__label`（選項文字）
  - `.practice-feedback[role="status"]`（`aria-live="polite" aria-atomic="true"`）
- `.practice-complete`（完成畫面，`role="status"`）

**狀態邊界**：
- 會話狀態（PracticeSession，定型於 `src/lib/practiceSession.ts:4-15`）：
  - `status: 'active' | 'completed'`
  - `questions: PracticeQuestion[]`
  - `currentIndex: number`（僅 active 時有效；completed 時透過 `getCurrentIndex()` 回傳 `questions.length`）
  - `lessonId: string`
- incorrect answer 不改變 session state（`practiceSession.ts:44-50`：僅回傳 feedback，不推進 currentIndex）
- correct answer 只推進 `currentIndex`（`practiceSession.ts:51-64`）
- 最後一題答對後 status 轉為 `'completed'`（`practiceSession.ts:55-59`）
- feedback 的 `correctAnswer` 由 answer() 即時計算回傳，不寫入 session history
- 計時器（TimeoutManager）：正確 1200ms、錯誤 2000ms
- 進度儲存：只在最後一題正確時寫入 `ProgressStore.markComplete()`
- Refresh（pageshow/storage）：重新讀取 ProgressStore，計算是否需要 reset/completed

**禁止責任**：
- 不得在初始 learner-facing question UI 中顯示正確答案（`tests/lesson-practice-ui.test.ts:21-38` 驗證：initial question markup 不包含 `q.correctAnswer` 或 `正解：`）。注意：含 `correctAnswer` 的完整 questions JSON 已序列化在 `<section data-questions={json}>` attribute 中，測試只保證渲染後的 visible question UI 不揭露答案，不保證原始 HTML 不含答案資料。
- 不得修改其他元件的 DOM
- 不得直接操作 header 或 route 狀態

### index.astro (`src/pages/index.astro`)

**責任**：
- 首頁完整呈現：路線 sidebar + 課程列表 + 進度摘要
- 進度狀態管理（ProgressStore 讀取、DOM 更新）
- 生命週期：pageshow、storage 同步
- 進度重置（含 confirm 對話框）

**狀態邊界**：
- ProgressStore：讀取 localStorage、更新 DOM 類別與文字
- 每個 `.lesson-list-item` 的狀態：`--done`、`--current`、預設（future）
- `data-completable` 屬性決定是否可標記完成
- Progress summary：總完成數/總可完成數

**禁止責任**：
- 不得修改課程內容或練習題目
- 不得執行 lesson page 的練習邏輯

### lessons/[id].astro (`src/pages/lessons/[id].astro`)

**責任**：
- 課程完整頁面：路線 sidebar + 課程內容 + 練習
- Static path 產生（`getStaticPaths`）
- 前後課程導航
- Completion badge 狀態（讀取 ProgressStore）

**資料來源**：
- `loadAllRenderableLessons()` → static paths
- 課程內容：`lesson.sections`、`lesson.chunks`、`lesson.kanjiBridgeNotes`、`lesson.soundFocus`、`lesson.examples`

**狀態邊界**：
- Completion badge：`pageshow` 時重新讀取 ProgressStore
- 練習狀態：委派給 `LessonPractice`

**禁止責任**：
- 不得直接管理練習會話
- 不得修改 localStorage 中的進度（由 LessonPractice 處理）

### theme.ts (`src/lib/theme.ts`)

**責任**：
- 匯出 `THEME_STORAGE_KEY`（`'chabiko_theme'`）
- 匯出 `resolveTheme(stored, prefersDark)`：解析有效偏好
- 匯出 `getNextTheme(current)`：切換 light↔dark
- 匯出 `ThemePreference` 型別（`'light' | 'dark'`）

**狀態邊界**：
- 純函數，無副作用
- 不直接讀取/寫入 localStorage 或 DOM
- `tests/theme-preference.test.ts:19-49` 驗證所有函數

## 無障礙契約

| 需求 | 實作位置 | 測試驗證 |
|---|---|---|
| `<html lang="ja">` | `BaseLayout.astro:17` | `direction-c-production-ui.test.ts:76` |
| `lang="zh-Hant"` on Chinese content | `index.astro:41`, `[id].astro:71,97` | `direction-c-production-ui.test.ts:76-79` |
| `lang="zh-Latn"` on pinyin | `index.astro:43`, `[id].astro:99` | `direction-c-production-ui.test.ts:76-79` |
| `:focus-visible` outline | `BaseLayout.astro:164-167` | 視覺驗證（PR #165 browser check） |
| `aria-pressed` on theme toggle | `Header.astro:26` | `direction-c-production-ui.test.ts:36` |
| `aria-label` 日文 on toggle | `Header.astro:25,50-51` | `direction-c-production-ui.test.ts:37-38` |
| 44px min touch target | `Header.astro:137,148` | 視覺驗證 |
| `aria-current="step"` on route | `GoalPathSlot.astro:13`, `index.astro:106` | `direction-c-production-ui.test.ts:31,80` |
| `role="group"` on practice choices | `LessonPractice.astro:94` | `lesson-practice-ui.test.ts:61` |
| `role="status" aria-live="polite"` on feedback | `LessonPractice.astro:108` | `lesson-practice-ui.test.ts:62-63` |
| `prefers-reduced-motion` | `BaseLayout.astro:195-204` | `direction-c-production-ui.test.ts:27` |
| Non-color cues in practice | `LessonPractice.astro:284-327` (✓/✕ indicators) | `direction-c-production-ui.test.ts:84-88` |

## 狀態隔離

- 主題偏好鍵 `chabiko_theme` 與進度鍵 `chabiko_completed_lessons` 完全隔離（`tests/theme-preference.test.ts:33-49`）
- 主題變更不觸發進度重新整理
- 進度變更不觸發主題重新整理

## 可提取的重複結構

目前 production 中尚未出現足夠重複的模式來證明需要新的獨立共用元件，但以下模式已出現兩次以上：

1. **路線時間軸**：首頁（`index.astro` `.lesson-list`）與課程頁（`[id].astro` `.route-station`）使用相似的垂直路線 + 圓形站點標記模式。若未來新增第三個包含路線的頁面，可考慮提取 `RouteTimeline.astro`。

2. **狀態徽章**：`path-status`、`lesson-completion-status`、`completion-badge` 使用相似的 inline-flex + padding + font-size 模式。若未來新增狀態類型，可考慮提取 `StatusBadge.astro`。

以上僅為觀察，不構成對現有 production code 的修改要求。
