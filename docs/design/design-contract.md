# Chabiko — Historical Production UI Design Contract (Direction C)

Direction C design contract for the production implementation merged in PR #165 (commit `04759286`).

> **Status: HISTORICAL PRODUCTION BASELINE.** This document preserves the visual
> language that Direction C introduced into production and the evidence used to
> validate it at that time. It is no longer the current learner-facing visual
> contract. Issue #389 froze Direction A1 Editorial Calm in
> `reference-family-389.md`, and #393/#394–#397 subsequently propagated A1 to
> the shared foundation and non-HSK learner surfaces. Current token and migration
> state is recorded in `token-contract.json`. Keep this document for provenance;
> do not use its Direction C values as the target for new learner-facing work.

## Selected visual direction

**Direction C (City Exploration)**, selected in PR #161.

Source files:
- `docs/design/approved-direction.md` — direction-selection record
- `docs/design/direction-review.md` — direction-review detail

## Production-proven design characteristics

### Color system

A black/white/gray urban base with warm-gold accent route markers (`src/layouts/BaseLayout.astro:52-130`).

- **Base page/surface/text:** warm gray-white in light mode and deep gray-blue-black in dark mode, from `--color-page`, `--color-surface`, `--color-text`.
- **Primary:** deep blue-gray `#1a2744` (light) / pale blue-gray `#a9bee9` (dark), used for links, primary buttons, and route-marker borders.
- **Accent:** warm gold/orange `#d48c2b` (light) / `#efb45b` (dark), used inside route markers, the brand mark, and the can-do section's left border.
- **Status colors:** success (green-blue family), error (red-brown family), current (deep-gold family), each with a corresponding soft background.
- **Header:** dedicated semantic colors `--color-header`, `--color-header-text`, `--color-header-muted`, not shared with body tokens.

See [`token-contract.json`](./token-contract.json) for the complete token list and alias relationships.

### Font hierarchy

- **Traditional Chinese:** `--font-zh` → PingFang TC → Noto Sans TC → Hiragino Sans → sans-serif.
- **Japanese UI:** `--font-ja` → Hiragino Sans → Noto Sans JP → Helvetica Neue → Arial → sans-serif; this is the body default.
- **Pinyin:** `--font-pinyin` → Hiragino Sans → Noto Sans → Helvetica Neue → Arial → sans-serif.

Language markers: `lang="ja"` on the document root, `lang="zh-Hant"` on Traditional-Chinese content, and `lang="zh-Latn"` on pinyin.

Source: `src/layouts/BaseLayout.astro:17,92-94`, verified by `tests/direction-c-production-ui.test.ts:76-82`.

### Typography

- Maximum content width: `80rem` (`--max-w`).
- Headings use fluid `clamp()` sizes:
  - Home title: `clamp(1.5rem, 7vw, 2rem)`.
  - Lesson title: `clamp(1.75rem, 7vw, 2.5rem)`.
  - Core example sentence: `clamp(2.25rem, 11vw, 2.75rem)` on mobile / `3rem` on desktop >= 1024px.
- Ordinary cards and containers use square corners (`--radius: 0`). Explicit circular exceptions are production markers: brand mark, wayfinding station/route station dots, lesson markers, practice-choice indicators, feedback icon, and completion icon all use `border-radius: 50%`.

### Spacing system

Uses `0.25rem` as the base unit, from `--space-xs` through `--space-3xl`. See [`token-contract.json`](./token-contract.json) for exact values.

### Borders and dividers

- Border color: `--c-border`, `1px solid`.
- Major sections use a `4px solid` top accent line (`.lesson-list-link`, `.core-card`, `.bridge-section`).
- Can-do blocks and travel tasks use a `4px solid --c-accent` left accent line.
- Route timelines use a `2px` vertical line (`--c-route-line`).

### Route / wayfinding

The Home route uses a vertical timeline (`src/pages/index.astro:247-257`):
- `2px` vertical route line on the left.
- `18px` circular station markers: current is filled primary + accent inner dot; done is success + ✓; future is hollow.
- Every lesson card has a `4px` primary top line.

The lesson-page sidebar route (`src/pages/lessons/[id].astro:249-255`) uses:
- a `2px` left route line;
- the same `18px` circular station marker;
- route information containing location, title, can-do, example sentence, and status label.

### Status presentation

Three progress states (`src/pages/index.astro:82-110`):

| State | Learner-facing label | Background | Text color |
| --- | --- | --- | --- |
| Current | `進行中` | `--c-accent-light` | `--color-status-current` |
| Done | `✓ 完了` | `--c-success-bg` | `--color-status-success` |
| Future | `このあと` | `--c-primary-light` | `--c-text-secondary` |

The lesson completion badge (`src/pages/lessons/[id].astro:203-218`) uses `completion-badge--done` with `--color-status-success` + `--c-success-bg`.

### Practice feedback states

Source: `src/components/LessonPractice.astro:116-150`.

- **Correct:** option border and indicator use `--c-success` (filled circle + inner dot), background uses `--c-success-bg`, feedback icon ✓, text `正解！`; after 1200ms advance to the next question or completion screen.
- **Incorrect:** option border and indicator use `--c-error` (✕), background uses `--c-error-bg`, feedback icon ✕, text `不正解。`, and the correct answer is shown; after 2000ms retry.
- **Complete:** message `✓ 練習完了！レッスンをクリアしました。` + primary circular icon.

Non-color cues:
- **Source / focused tests** (`tests/direction-c-production-ui.test.ts:84-94`) confirm the practice component contains:
  - `.practice-choice__indicator`;
  - `role="group" aria-label="回答を選択"`;
  - `role="status" aria-live="polite"`;
  - lifecycle calls to `store.markComplete()` and `timer.schedule()`;
  - `pageshow` and `storage` listeners.
- **Committed browser evidence** (`docs/design/evidence/issue-162/`) confirms in actual states:
  - **Incorrect feedback** (`.practice-incorrect-*.png`, `dark-practice-feedback-*.png`): ✕ indicator, red border, `不正解。` + correct answer, and ✕ feedback icon are visible in light and dark.
  - **Completion** (`.practice-complete-*.png`, `dark-completion-*.png`): `✓ 練習完了！` message and primary circular icon are visible.
  - **Correct transient feedback:** there is no dedicated capture. It is covered only by the browser check in `evidence/issue-162/README.md:55-61`, which verifies that correct, incorrect, and completion states retain icon, text, border, and accessible-name cues in addition to color. During the 1200ms transition, ✓ feedback icon, green border, and `正解！` are visible.
  - `aria-label` updates after click to `正解:` / `不正解:`; PR #165 browser verification is recorded in `evidence/issue-162/README.md:55-61`.

### Header component

Source: `src/components/Header.astro:9-38`.

- Sticky header with `z-index: 20`.
- Brand mark (accent circle + white C) + Chabiko + チャビコ.
- Navigation: `ホーム` link.
- Theme-toggle button: native `<button>`, `aria-pressed`, Japanese `aria-label`, minimum 44px touch target.
- Script-toggle slot: `繁｜簡 準備中`, visual placeholder only.

### Home

Source: `src/pages/index.astro:10-75`.

- Grid layout: sidebar (`GoalPathSlot`) + main content.
- Lesson list is an ordered `<ol>`; every item is a linked card.
- Each card contains number, Japanese title, can-do, Traditional-Chinese example sentence, pinyin, and completion state.
- Progress footer contains progress summary + reset button with confirmation dialog.

### Lesson page

Source: `src/pages/lessons/[id].astro:60-197`.

- Grid layout: route sidebar + lesson content.
- Lesson sequence: hook → can-do → core expression → reading sections → chunks → kanji bridge → pronunciation focus → examples → LessonPractice → travel task → navigation.
- Static paths are generated by `loadAllRenderableLessons()`.
- Previous/next lesson navigation links.

### Dark theme

Theme mechanism (`src/lib/theme.ts`):
- Independent storage key `chabiko_theme`, separate from learner-progress keys.
- Inline `<script>` runs in BaseLayout to prevent FOUC.
- BaseLayout's `themeEnabled` prop controls opt-in.
- Enabled only on production Home and lesson routes, verified by `tests/direction-c-production-ui.test.ts:45-56`.
- HSK, 404, and dev-preview routes do not enable it.

See [`token-contract.json`](./token-contract.json) for corresponding dark values.

## Resources

- Visual direction selection: [Direction Review](./direction-review.md)
- Approved direction: [Approved Direction](./approved-direction.md)
- Token contract: [token-contract.json](./token-contract.json)
- Component contract: [component-contract.md](./component-contract.md)
- Responsive contract: [responsive-contract.md](./responsive-contract.md)
- Implementation map: [implementation-map.json](./implementation-map.json)
- Figma handoff: [figma-handoff.md](./figma-handoff.md)
- Browser evidence: [evidence/issue-162/README.md](./evidence/issue-162/README.md)
