# Chabiko — Production Component Contract

Merged production component boundaries, state responsibilities, and forbidden responsibilities from PR #165.

> **Status: current-production contract.** Describes the Direction C components
> implemented in production. The frozen Issue #389 visual target (A1 Editorial
> Calm) does not change these component boundaries or state responsibilities;
> it changes presentation tokens and styling. See
> `reference-family-389.md` for the frozen target and `implementation-map.json`
> for propagation tracking.

Source validation: `tests/direction-c-production-ui.test.ts:1-95` and `tests/lesson-practice-ui.test.ts:1-71`.

## Current component and page boundaries

### BaseLayout (`src/layouts/BaseLayout.astro`)

**Responsibilities:**
- Provide the complete HTML document shell (`<html lang="ja">`).
- Define all `:root` light/dark CSS custom properties.
- Inline the theme-detection script: before paint, read the localStorage preference (`chabiko_theme`) or `prefers-color-scheme` and apply `data-theme` to the root element without FOUC.
- Provide `.wrapper` + `.main-content` layout containers.
- Provide the global reset (`box-sizing`, `margin`, `padding`).
- Provide global typography (`body` font, color, line-height).
- Provide `:focus-visible` accessibility styling.
- Support `prefers-reduced-motion`.
- Provide `<slot name="header" />` + the default `<slot />`.

**Props:**
- `title: string` (required)
- `description?: string` (optional)
- `robots?: string` (optional)
- `themeEnabled?: boolean` (defaults to `false`)

**State boundary:**
- The pre-paint inline script directly reads `localStorage.getItem('chabiko_theme')` and sets root `data-theme`. The Header runtime script owns later toggle/write behavior.
- Does not handle routing logic.

**Forbidden responsibilities:**
- Must not contain navigation, header content, or page-specific markup.
- Must not import `theme.ts` directly; the inline script is plain JS.

### Header (`src/components/Header.astro`)

**Responsibilities:**
- Render the site header: brand, navigation, theme-toggle button, and script-toggle slot.
- Sticky positioning (`position: sticky; top: 0; z-index: 20`).
- Theme-toggle runtime interaction: the click handler calls `getNextTheme()`, updates `document.documentElement.dataset.theme`, writes the new preference to `localStorage`, and updates `aria-pressed` plus the Japanese `aria-label`.
- Responsively hide secondary elements: below 768px, hide `logo-sub` and `slot-badge`.

**Props:**
- `themeEnabled?: boolean` (defaults to `false`)

**DOM structure:**
- `.site-header` > `.header-inner`
  - `.brand` (`<a href="/">`)
    - `.brand-mark` (circular C marker, `aria-hidden="true"`)
    - `.logo` (`Chabiko`)
    - `.logo-sub` (`チャビコ`)
  - `.nav-primary` (`aria-label="メインナビゲーション"`)
    - `.nav-link` (`ホーム`)
  - `#theme-toggle` (`type="button"`, Japanese `aria-label`, `aria-pressed`)
    - `.theme-toggle__mark` (◐, `aria-hidden="true"`)
    - `.theme-toggle__label` (`暗` / `明`)
  - `.script-toggle-slot` (`aria-label="簡体字・繁体字切り替え（準備中）"`)

**State boundary:**
- Theme state reads `document.documentElement.dataset.theme`, initialized by the BaseLayout pre-paint script, and writes to `localStorage`.
- `aria-pressed` reflects dark state.
- `aria-label` switches with state: `ダークテーマに切り替える` / `ライトテーマに切り替える`.
- Touch target: minimum 44px for the theme toggle, or 52px including padding.
- Does not own initial preference resolution; BaseLayout's inline script owns that responsibility.

**Forbidden responsibilities:**
- Must not manage learner progress or lesson state.
- Must not execute route navigation; it only exposes static links.
- The script toggle remains a visual placeholder and does not implement switching.

### GoalPathSlot (`src/components/GoalPathSlot.astro`)

**Responsibilities:**
- Render the learning-route sidebar (`学習ルート`).
- Render route name `台湾旅行で使える中国語`.
- Render the route timeline: active path card with lesson count, title, example sentence, and in-progress state.
- Render the pending path `HSK対策` + `準備中`.
- On desktop (>= 1024px), use a sticky sidebar (`position: sticky; top: 88px`).

**Data source:**
- `loadAllRenderableLessons()` provides the first lesson's name/example.
- Does not read progress storage.

**State boundary:**
- Manages no dynamic state.
- All content is build-time static.
- `aria-current="step"` is static and always marks the first lesson.

**Forbidden responsibilities:**
- Must not display actual completion state because it does not read localStorage.
- Must not handle click interaction.

### LessonPractice (`src/components/LessonPractice.astro`)

**Responsibilities:**
- Render and operate practice questions: render, answer, feedback, complete.
- Manage question index, session, and timer state.
- Handle lifecycle events: `pageshow` for bfcache and `storage` for cross-tab sync.
- Accessibility: `role="group"`, `role="status" aria-live="polite"`, `aria-label="回答を選択"`.
- Correct-answer delay: 1200ms. Incorrect-answer delay: 2000ms.

**Props:**
- `lesson: Lesson`

**Data source:**
- `generateQuestions(lesson)` from `src/lib/practice.ts`.
- Questions are passed as JSON through the `data-questions` attribute.

**DOM structure generated by JS:**
- `.practice-question`
  - `.practice-progress` (`質問 N / M`)
  - `.practice-prompt` (Japanese question)
  - `.practice-choices[role="group"]`
    - `.practice-choice` (button × N)
      - `.practice-choice__indicator` (circular indicator)
      - `.practice-choice__label` (option text)
  - `.practice-feedback[role="status"]` (`aria-live="polite" aria-atomic="true"`)
- `.practice-complete` (completion screen, `role="status"`)

**State boundary:**
- Session state (`PracticeSession`, defined in `src/lib/practiceSession.ts:4-15`):
  - `status: 'active' | 'completed'`
  - `questions: PracticeQuestion[]`
  - `currentIndex: number` (valid while active; after completion `getCurrentIndex()` returns `questions.length`)
  - `lessonId: string`
- An incorrect answer does not modify session state (`practiceSession.ts:44-50`): it returns feedback without advancing `currentIndex`.
- A correct answer advances only `currentIndex` (`practiceSession.ts:51-64`).
- After the final correct answer, status becomes `'completed'` (`practiceSession.ts:55-59`).
- Feedback `correctAnswer` is calculated and returned by `answer()` at answer time and is not written into session history.
- `TimeoutManager`: correct 1200ms; incorrect 2000ms.
- Progress storage: write `ProgressStore.markComplete()` only after the final question is answered correctly.
- Refresh/lifecycle (`pageshow` / `storage`): reread ProgressStore and determine whether reset/completed state is needed.

**Forbidden responsibilities:**
- Must not expose the correct answer in the initial learner-facing question UI. `tests/lesson-practice-ui.test.ts:21-38` verifies the initial question markup does not include `q.correctAnswer` or `正解：`. The complete questions JSON, including `correctAnswer`, is serialized in the `<section data-questions={json}>` attribute; the test guarantees only that rendered visible question UI does not reveal the answer, not that the raw HTML lacks answer data.
- Must not modify another component's DOM.
- Must not directly manipulate header or route state.

### index.astro (`src/pages/index.astro`)

**Responsibilities:**
- Render the full home experience: route sidebar, lesson list, and progress summary.
- Manage progress state by reading ProgressStore and updating the DOM.
- Handle `pageshow` and `storage` synchronization.
- Reset progress after a confirmation dialog.

**State boundary:**
- ProgressStore reads localStorage and drives DOM class/text updates.
- Every `.lesson-list-item` state is `--done`, `--current`, or default future.
- `data-completable` determines whether an item can be marked complete.
- Progress summary shows completed count / total completable count.

**Forbidden responsibilities:**
- Must not modify lesson content or practice questions.
- Must not execute lesson-page practice logic.

### lessons/[id].astro (`src/pages/lessons/[id].astro`)

**Responsibilities:**
- Render a complete lesson page: route sidebar, lesson content, and practice.
- Generate static paths through `getStaticPaths`.
- Render previous/next lesson navigation.
- Render completion-badge state by reading ProgressStore.

**Data source:**
- `loadAllRenderableLessons()` provides static paths.
- Lesson content uses `lesson.sections`, `lesson.chunks`, `lesson.kanjiBridgeNotes`, `lesson.soundFocus`, and `lesson.examples`.

**State boundary:**
- Completion badge rereads ProgressStore on `pageshow`.
- Practice state is delegated to `LessonPractice`.

**Forbidden responsibilities:**
- Must not manage the practice session directly.
- Must not modify localStorage progress; LessonPractice owns that write.

### theme.ts (`src/lib/theme.ts`)

**Responsibilities:**
- Export `THEME_STORAGE_KEY` (`'chabiko_theme'`).
- Export `resolveTheme(stored, prefersDark)` to resolve a valid preference.
- Export `getNextTheme(current)` to switch light ↔ dark.
- Export `ThemePreference` (`'light' | 'dark'`).

**State boundary:**
- Pure functions, no side effects.
- Does not read/write localStorage or the DOM directly.
- `tests/theme-preference.test.ts:19-49` verifies all functions.

## Accessibility contract

| Requirement | Implementation | Test/evidence |
| --- | --- | --- |
| `<html lang="ja">` | `BaseLayout.astro:17` | `direction-c-production-ui.test.ts:76` |
| `lang="zh-Hant"` on Chinese content | `index.astro:41`, `[id].astro:71,97` | `direction-c-production-ui.test.ts:76-79` |
| `lang="zh-Latn"` on pinyin | `index.astro:43`, `[id].astro:99` | `direction-c-production-ui.test.ts:76-79` |
| `:focus-visible` outline | `BaseLayout.astro:164-167` | visual verification in PR #165 browser check |
| `aria-pressed` on theme toggle | `Header.astro:26` | `direction-c-production-ui.test.ts:36` |
| Japanese `aria-label` on toggle | `Header.astro:25,50-51` | `direction-c-production-ui.test.ts:37-38` |
| 44px minimum touch target | `Header.astro:137,148` | visual verification |
| `aria-current="step"` on route | `GoalPathSlot.astro:13`, `index.astro:106` | `direction-c-production-ui.test.ts:31,80` |
| `role="group"` on practice choices | `LessonPractice.astro:94` | `lesson-practice-ui.test.ts:61` |
| `role="status" aria-live="polite"` on feedback | `LessonPractice.astro:108` | `lesson-practice-ui.test.ts:62-63` |
| `prefers-reduced-motion` | `BaseLayout.astro:195-204` | `direction-c-production-ui.test.ts:27` |
| Non-color practice cues | `LessonPractice.astro:284-327`: correct-choice indicator is a success filled circle + inner dot; incorrect-choice indicator is ✕; feedback icon is ✓/✕ | Automated `direction-c-production-ui.test.ts:84-88` verifies `.practice-choice__indicator`, `role="group"`, `role="status"`, `aria-live="polite"`, timer, and storage calls. Committed `evidence/issue-162/` shows incorrect feedback (✕, red border, `不正解。`) and completion (`練習完了！`) in light/dark PNGs. Correct transient feedback (✓, green border, `正解！`) has no dedicated screenshot and is covered only by the browser check in `evidence/issue-162/README.md:55-61`: “correct, incorrect, and completion states retain icon, text, border, and accessible-name cues”. Inner dot/✕/✓ symbols, border-color changes, and dynamic `aria-label` have no automated assertion. |

## State isolation

- Theme preference key `chabiko_theme` and progress key `chabiko_completed_lessons` are completely isolated (`tests/theme-preference.test.ts:33-49`).
- Theme changes do not trigger progress refresh.
- Progress changes do not trigger theme refresh.

## Repeated structures that could be extracted later

Production does not yet contain enough repetition to justify a new shared component, but these patterns appear at least twice:

1. **Route timeline:** Home (`index.astro` `.lesson-list`) and lesson page (`[id].astro` `.route-station`) use similar vertical-route + circular-station-marker patterns. If a third route-bearing page is added later, consider extracting `RouteTimeline.astro`.
2. **Status badges:** `path-status`, `lesson-completion-status`, and `completion-badge` use similar inline-flex + padding + font-size patterns. If more state types are added later, consider extracting `StatusBadge.astro`.

These are observations only and do not require changes to current production code.
