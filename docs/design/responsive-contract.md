# Chabiko — Production Responsive Contract

Merged production responsive-behavior rules from PR #165, based on committed browser evidence and tests.

## Evidence sources

All rules are based on browser validation recorded in `docs/design/evidence/issue-162/README.md`.

**Committed PNG captures:**

- **390×844** (mobile, iPhone 12/13/14 class; most mobile evidence captures)
- **1440×900** (desktop; most desktop evidence captures)

There are 15 PNGs total: 10 light and 5 dark. See the index in `evidence/issue-162/README.md`.

**Browser-only checks without screenshots:**

- **320px** (small phone)
- **375px** (iPhone SE class)
- **768px** (tablet)
- The captured **390px** and **1440px** widths were also rechecked in browser validation.

PR #165 ran browser checks for light/dark Home and lesson/practice pages at all five widths. Source: `docs/design/evidence/issue-162/README.md:49-62`.

## Breakpoint system

All breakpoints are defined in `src/layouts/BaseLayout.astro`, `src/pages/index.astro`, `src/pages/lessons/[id].astro`, `src/components/Header.astro`, `src/components/GoalPathSlot.astro`, and `src/components/LessonPractice.astro`.

### Shared breakpoints

| Breakpoint | Media query | Source files |
| --- | --- | --- |
| Small phone (<= 374px) | `@media (width <= 374px)` | `BaseLayout.astro:180-183`, `Header.astro:184-199`, `index.astro:355-369`, `[id].astro:559-572`, `LessonPractice.astro:406-410` |
| Tablet (>= 640px) | `@media (width >= 640px)` | `[id].astro:573-578` (nav-link flex) |
| Tablet (>= 768px) | `@media (width >= 768px)` | `BaseLayout.astro:185-189`, `index.astro:371-375` |
| Desktop (>= 1024px) | `@media (width >= 1024px)` | `BaseLayout.astro:190-194`, `GoalPathSlot.astro:175-185`, `index.astro:376-390`, `[id].astro:578-596` |

### Header-specific behavior

| Breakpoint | Behavior | Source |
| --- | --- | --- |
| `<= 767px` | Hide `.logo-sub` and `.slot-badge` | `Header.astro:178-183` |
| `<= 374px` | Reduce header padding, hide `.theme-toggle__mark`, reduce `.script-toggle-slot` font size | `Header.astro:184-199` |

### Home-specific behavior

| Breakpoint | Behavior | Source |
| --- | --- | --- |
| `<= 374px` | Reduce list-item padding, adjust marker position, stack the progress footer vertically | `index.astro:355-369` |
| `>= 768px` | Increase `lesson-list-link` padding | `index.astro:371-375` |
| `>= 1024px` | Switch to two-column grid: 300px sidebar + `minmax(0, 720px)` content; reduce card height | `index.astro:376-390` |

### Lesson-page-specific behavior

| Breakpoint | Behavior | Source |
| --- | --- | --- |
| `<= 374px` | Reduce core-card padding, set core sentence to 2.25rem, change detail list to one column | `[id].astro:559-572` |
| `>= 640px` | Change nav-link flex from `1 1 100%` to `1 1 0` for side-by-side display | `[id].astro:573-578` |
| `>= 1024px` | Switch to two-column grid: 300px sticky sidebar + 720px content; enlarge core sentence to 3rem | `[id].astro:578-596` |

### GoalPathSlot-specific behavior

| Breakpoint | Behavior | Source |
| --- | --- | --- |
| `>= 1024px` | Make the sidebar sticky (`position: sticky; top: 88px`), remove bottom border, add right-border divider | `GoalPathSlot.astro:175-185` |

## Responsive layout rules

### General rules

1. **No horizontal overflow:** at every validated viewport width (320, 375, 390, 768, 1440px), `documentElement.scrollWidth <= clientWidth`. Confirmed by PR #165 evidence in `evidence/issue-162/README.md:49-51`.
2. **Controls stay inside the viewport:** header, navigation, theme toggle, script slot, lesson navigation, and practice controls stay inside the drawable viewport at 320, 375, 390, 768, and 1440px (`evidence/issue-162/README.md:51-53`).
3. **Text wrapping:** long Chinese, pinyin, and Japanese strings wrap correctly under `overflow-wrap: anywhere` or `overflow-wrap: break-word` without clipping (`evidence/issue-162/README.md:53-54`).
4. **Maximum content width:** `.main-content` uses `max-width: var(--max-w)` (80rem) with `margin: 0 auto` centering.
5. **Fluid typography:** headings and core sentences use `clamp()`:
   - Home title: `clamp(1.5rem, 7vw, 2rem)` (`index.astro:229`).
   - Lesson title: `clamp(1.75rem, 7vw, 2.5rem)` (`[id].astro:367`).
   - Core sentence on mobile: `clamp(2.25rem, 11vw, 2.75rem)` (`[id].astro:418`).
   - Core sentence on desktop (>= 1024px): `3rem` (`[id].astro:594`).

### Grid layout

Both Home and lesson pages switch to a two-column grid at >= 1024px:

- **Sidebar:** fixed 300px width, `position: sticky; top: 88px`, `border-right: 1px solid var(--c-border)`, `min-height: calc(100dvh - 136px)`.
- **Content:** `minmax(0, 720px)`; the content area uses `min-width: 0` to prevent overflow.

### Practice component

- Choice buttons are full width (`width: 100%`) with minimum height `52px`.
- At <= 374px, horizontal padding is reduced to `--space-md`.
- Feedback area uses `min-height: 0` + transition.

## Responsive theme-toggle behavior

The theme-toggle button keeps a minimum 44px touch target at every viewport:

- Default: `min-width: 52px; min-height: 44px`.
- <= 374px: `min-width: 44px`, hide `theme-toggle__mark`, and reduce horizontal padding.

Source: `src/components/Header.astro:142-199`.

## Responsive accessibility rules

- Under `prefers-reduced-motion: reduce`, all transitions and animations become `0.01ms` (`BaseLayout.astro:195-204`).
- Focus outline remains visible at every width (`:focus-visible` in `BaseLayout.astro:164-167`).
- `aria-current="step"` remains correct at every width (`GoalPathSlot.astro:13`, `index.astro:106`).

## Validation record

PR #165 browser validation (`evidence/issue-162/README.md:49-62`):

- **Committed captures:** 15 PNGs at 390×844 and 1440×900 (10 light + 5 dark).
- **Browser checks:** light/dark Home + lesson/practice passed at 320, 375, 390, 768, and 1440px.
- No horizontal overflow at any validated width.
- Controls remained inside the viewport at every validated width.
- Text wrapped correctly without clipping.
- No browser-console warnings or errors.
