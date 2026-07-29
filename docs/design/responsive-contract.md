# Chabiko — Production Responsive Contract

PR #165 的合併生產回應式行為規則，基於提交的瀏覽器證據與測試。

## 證據來源

所有規則以 `docs/design/evidence/issue-162/README.md` 中記錄的瀏覽器驗證為基礎。證據在以下 viewport 寬度擷取：

- **320px**（小手機）
- **375px**（iPhone SE 級別）
- **390px**（iPhone 12/13/14 級別，多數證據擷取尺寸）
- **768px**（平板）
- **1440px**（桌面，多數證據擷取尺寸）

來源：`docs/design/evidence/issue-162/README.md:9-62`。

## 斷點系統

所有斷點定義在 `src/layouts/BaseLayout.astro`、`src/pages/index.astro`、`src/pages/lessons/[id].astro`、`src/components/Header.astro`、`src/components/GoalPathSlot.astro`、`src/components/LessonPractice.astro`。

### 共用斷點

| 斷點 | 媒體查詢 | 來源檔案 |
|---|---|---|
| 小手機（<= 374px） | `@media (width <= 374px)` | `BaseLayout.astro:180-183`、`Header.astro:184-199`、`index.astro:355-369`、`[id].astro:559-572`、`LessonPractice.astro:406-410` |
| 平板（>= 640px） | `@media (width >= 640px)` | `[id].astro:573-578`（nav-link flex） |
| 平板（>= 768px） | `@media (width >= 768px)` | `BaseLayout.astro:185-189`、`index.astro:371-375` |
| 桌面（>= 1024px） | `@media (width >= 1024px)` | `BaseLayout.astro:190-194`、`GoalPathSlot.astro:175-185`、`index.astro:376-390`、`[id].astro:578-596` |

### Header 特定

| 斷點 | 行為 | 來源 |
|---|---|---|
| `<= 767px` | 隱藏 `.logo-sub` 與 `.slot-badge` | `Header.astro:178-183` |
| `<= 374px` | 縮小 header padding、隱藏 `.theme-toggle__mark`、縮小 `.script-toggle-slot` 字體 | `Header.astro:184-199` |

### 首頁（Home）特定

| 斷點 | 行為 | 來源 |
|---|---|---|
| `<= 374px` | 減少 list-item padding、調整 marker 位置、進度 footer 改為垂直排列 | `index.astro:355-369` |
| `>= 768px` | 增加 lesson-list-link padding | `index.astro:371-375` |
| `>= 1024px` | 切換為兩欄 grid（300px sidebar + minmax(0, 720px) 內容）、減少卡片高度 | `index.astro:376-390` |

### 課程頁面（Lesson）特定

| 斷點 | 行為 | 來源 |
|---|---|---|
| `<= 374px` | 減少 core-card padding、core-sentence 2.25rem、detail-list 單欄 | `[id].astro:559-572` |
| `>= 640px` | nav-link flex 從 `1 1 100%` 改為 `1 1 0`（並排顯示） | `[id].astro:573-578` |
| `>= 1024px` | 切換為兩欄 grid（300px sticky sidebar + 720px 內容）、core-sentence 放大至 3rem | `[id].astro:578-596` |

### GoalPathSlot 特定

| 斷點 | 行為 | 來源 |
|---|---|---|
| `>= 1024px` | Sidebar 改為 sticky（`position: sticky; top: 88px`）、移除底部邊框、改為右邊框分隔 | `GoalPathSlot.astro:175-185` |

## 回應式布局規則

### 一般規則

1. **無水平溢出**：所有 viewport（320–1440px）中 `documentElement.scrollWidth <= clientWidth`。PR #165 證據確認（`evidence/issue-162/README.md:49-51`）。

2. **控制項在 viewport 內**：header、導航、主題切換、script slot、課程導航與練習控制項在 320–1440px 範圍內不超出 drawable viewport（`evidence/issue-162/README.md:51-53`）。

3. **文字換行**：長中文、拼音與日文字串在 `overflow-wrap: anywhere` 或 `overflow-wrap: break-word` 下正確換行，無裁剪（`evidence/issue-162/README.md:53-54`）。

4. **內容最大寬度**：`.main-content` 使用 `max-width: var(--max-w)`（80rem）搭配 `margin: 0 auto` 置中。

5. **流程字型大小**：標題與核心句子使用 `clamp()` 函數實現流體縮放：

   - 首頁標題：`clamp(1.5rem, 7vw, 2rem)`（`index.astro:229`）
   - 課程標題：`clamp(1.75rem, 7vw, 2.5rem)`（`[id].astro:367`）
   - 核心句子 mobile：`clamp(2.25rem, 11vw, 2.75rem)`（`[id].astro:418`）
   - 核心句子 desktop（>= 1024px）：`3rem`（`[id].astro:594`）

### Grid 佈局

兩頁面皆在 >= 1024px 時切換為兩欄 grid：

- **Sidebar**：300px 固定寬度，`position: sticky; top: 88px`，`border-right: 1px solid var(--c-border)`，`min-height: calc(100dvh - 136px)`
- **內容**：`minmax(0, 720px)`，內容區 `min-width: 0` 防止溢出

### 練習元件

- 選擇按鈕：全寬（`width: 100%`），最小高度 `52px`
- <= 374px 時減少 horizontal padding 至 `--space-md`
- 回饋區使用 `min-height: 0` + transition

## 主題切換回應式行為

主題切換按鈕在所有 viewport 維持最小 44px 觸控目標：

- 預設：`min-width: 52px; min-height: 44px`
- <= 374px：`min-width: 44px`，隱藏 `theme-toggle__mark`，減少 horizontal padding

來源：`src/components/Header.astro:142-199`。

## 無障礙回應式規則

- `prefers-reduced-motion: reduce` 時，所有 transition 與 animation 設為 `0.01ms`（`BaseLayout.astro:195-204`）
- Focus outline 在所有寬度保持可見（`:focus-visible` 在 `BaseLayout.astro:164-167`）
- `aria-current="step"` 在所有寬度保持正確（`GoalPathSlot.astro:13`、`index.astro:106`）

## 驗證記錄

PR #165 的瀏覽器驗證（`evidence/issue-162/README.md:49-62`）：

- Light/dark home + lesson/practice 在 320、375、390、768、1440px 檢查通過
- 無水平溢出
- 控制項在 viewport 內
- 文字正確換行，無裁剪
- 無瀏覽器主控台警告或錯誤
