# UI Audit: Chabiko Current Learner Interface

> Generated for Issue #56 — baseline inspection of the production UI before redesign.
> Date: 2026-07-21

## Scope

This audit covers the rendered learner-facing pages served by the Astro production build as of `origin/main` (4877fa1). Inspection was performed on built pages served via `astro preview` at 390×844 (mobile) and 1440×900 (desktop) viewports in headless Chromium. All claims reference specific components, CSS, or page structure verified from the source tree.

## 1. Current Page Inventory

| Page | Route | Page type |
|------|-------|-----------|
| Home | `/` | Learning-path lesson list + goal-path slot |
| Lesson detail | `/lessons/lesson-001/` | Full lesson reading with practice |
| HSK flashcard | `/vocabulary/hsk/1/` | Vocabulary flashcard session |

All other routes (404, lesson-002, lesson-003) reuse the same layout and components.

## 2. Visual Findings

### 2.1 Generic Bootstrap-like Visual Identity

The UI uses a flat blue-on-white palette that does not communicate a product personality:

- **Accent colour:** `#2563eb` — a default Tailwind/Chakra "blue-600". Nothing distinguishes it from any other web app.
- **Surface colour:** `#ffffff` on `#fafafa` — the default light-grey background of every SaaS dashboard.
- **Link/button colour:** identical to accent, with no secondary palette.
- **CSS custom properties** (`BaseLayout.astro:30-46`) define only 8 tokens — not enough for a semantic design system. There is no `--c-success`, `--c-warning`, `--c-error`, no heading-specific tokens, and no surface variants.

**Evidence:** `src/layouts/BaseLayout.astro:30-38` — all colour tokens are flat hex values with no semantic layering.

```css
--c-bg: #fafafa;
--c-surface: #ffffff;
--c-text: #1a1a1a;
--c-text-secondary: #666;
--c-accent: #2563eb;
--c-accent-hover: #1d4ed8;
--c-border: #e5e5e5;
--c-slot-bg: #f0f0f0;
```

### 2.2 Weak Visual Hierarchy

The intended learner content hierarchy (Traditional Chinese → pinyin → Japanese → action) is not visually enforced:

- **Core sentence** (the most important content) is rendered as blue text (`color: var(--c-accent)`) with size `clamp(1.5rem, 7vw, 2rem)` — same accent colour as every link and button. There is no dedicated treatment that elevates Chinese text above the surrounding UI.
- **Japanese headings** (`h2`) are `1.05rem` / `#1a1a1a` — visually equal to body text weight. Section headings ("基本表現", "コア表現", "フレーズを分けてみよう") use a small uppercase style (`0.8rem`, `#666`, uppercase) that reduces scannability for Japanese readers who are not accustomed to all-caps.
- **Pinyin** and **Japanese explanation** share `color: var(--c-text-secondary)` (#666) — they are indistinguishable at a glance.
- The **lesson title** on the lesson page uses `h1` / `clamp(1.65rem, 7vw, 2.25rem)`, which is only marginally larger than the core sentence, making the page heading compete with the primary content.

**Evidence:** `src/pages/lessons/[id].astro:201-206`, `src/layouts/BaseLayout.astro:51`.

### 2.3 Typography Lacks a System

- The font stack (`-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', sans-serif`) consists entirely of system/web-safe fonts. There is no brand-ownable typeface.
- There is no defined type scale. Font sizes are assigned ad-hoc per component (`0.75rem`, `0.8rem`, `0.85rem`, `0.875rem`, `0.9rem`, `0.95rem`, `1rem`, `1.05rem`, `1.1rem`, `1.125rem`, `1.25rem`, `1.5rem`, `1.65rem`, `1.75rem`, `2.25rem`).
- Line‑height is a uniform `1.7` for body and `1.3` for headings — no distinction for CJK readability versus pinyin.

**Evidence:** `src/layouts/BaseLayout.astro:55-56` (font stack); component-level `font-size` values throughout `src/pages/` and `src/components/`.

### 2.4 Card Design is Functional but Not Distinctive

Three variants exist — all share the same structure (border, white background, 8px radius):

| Variant | Background | Border | Example |
|---------|-----------|--------|---------|
| Lesson list item | `--c-surface` (#fff) | `--c-border` (#e5e5e5) | Home page lesson cards |
| Path card | `--c-surface` (#fff) | `--c-border` (#e5e5e5) | GoalPathSlot |
| Practice section | `--c-slot-bg` (#f0f0f0) | `--c-border` (#e5e5e5) | LessonPractice |

The only hover effect on lesson cards is a background shift to `--c-slot-bg` and border shift to the accent colour. The lesson list item is a full-width card with number badge (accent blue circle, white number), title, subtitle, and optional example sentence. The spacing inside cards is `--space-md` (1rem) with a desktop breakpoint of `--space-lg` (1.5rem).

**Screenshot evidence:** `docs/design/baseline/home-desktop-1440x900.png` — lesson list cards, path cards, progress footer. `docs/design/baseline/home-mobile-390x844.png` — same cards at narrow width.

### 2.5 Navigation is Minimal

- The **header** (`Header.astro`) contains only one nav link ("ホーム") plus a greyed‑out script‑toggle placeholder. No lesson-breadcrumb or path‑aware navigation exists.
- **Lesson navigation** (`[id].astro:138-153`) is a pair of bordered links (prev / next) that stack full‑width below 640px. The "complete" link to return to the path list uses accent-blue colour, creating an unintentional CTA conflict with the practice section.
- The **back link** pattern ("← 台湾旅行パスに戻る", "← ホームに戻る") is manually repeated on every child page with no shared breadcrumb component.

**Screenshot evidence:** `docs/design/baseline/lesson-mobile-390x844.png` — lesson nav links stacked at mobile width. `docs/design/baseline/lesson-desktop-1440x900.png` — lesson nav inline at desktop.

### 2.6 Responsiveness is Basic

- The layout uses a single breakpoint at 768px (tablet), switching `--space-md` / `--space-lg` padding and `--space-lg` / `--space-xl` card padding.
- Body max‑width is `48rem` (768px) — comfortable on mobile, but on desktop (1440px) the content is a narrow centred strip with large unused margins.
- No tablet‑specific treatment (e.g. two‑column layout) at intermediate widths.
- The lesson‑nav links switch from stacked (`flex: 1 1 100%`) to inline (`flex: 1 1 auto`) at 640px, but no other component has a breakpoint below 768px.
- The emoji‑based path icons ("🏃", "📚") are large (`1.1rem`) relative to the surrounding label text (`0.85rem`) and appear visually unbalanced.

**Screenshot evidence:** `docs/design/baseline/home-desktop-1440x900.png` — narrow centred content on wide viewport.

### 2.7 Spacing is Uniform but Loose

- The spacing scale (`--space-xs` 0.25rem through `--space-xl` 2rem) is a linear 4‑point scale with only 5 steps.
- Vertical spacing between major sections is `--space-xl` (2rem) or `--space-lg` (1.5rem) — enough for breathing room but without deliberate rhythm (e.g. no space variation between heading types).
- The `.main-content` padding is `--space-md` (1rem) on mobile and `--space-lg` `--space-xl` (1.5rem / 2rem) on desktop.

**Evidence:** CSS custom properties in `BaseLayout.astro:39-44`.

### 2.8 Missing Interactive States

- No `:focus-visible` outlines exist on lesson list links, practice choices, or lesson nav links.
- Practice buttons have a `:disabled` state with `opacity: 0.5` and no pointer‑events — no distinct visual feedback beyond dimming.
- The header script‑toggle placeholder is marked as "準備中" but is still focusable and clickable (no `disabled` or `aria-disabled`).
- No loading, empty, or error states exist for lesson content (the fallback message is a plain text card).

**Evidence:** Absence of focus styles in `src/pages/index.astro` lesson-list-link styles; `Header.astro:68-73` (script-toggle slot without `aria-disabled`).

### 2.9 Dark Mode is Entirely Absent

- All colours are hard‑coded as light‑mode hex values in `:root`. There is no `@media (prefers-color-scheme: dark)` block.
- A future dark‑mode implementation would require every colour token to be re‑evaluated because the current tokens are not semantically layered (e.g. `--c-surface` is always `#ffffff`).

**Evidence:** `BaseLayout.astro:30-46` — single `:root` block with no dark variant.

## 3. Summary of Issues

| # | Issue | Severity | Component |
|---|-------|----------|-----------|
| 1 | Generic blue‑on‑white palette, no brand identity | High | Global (`:root`) |
| 2 | Traditional Chinese not visually elevated above UI | High | Lesson page |
| 3 | No font system — ad‑hoc sizes, no brand typeface | Medium | Global |
| 4 | Card design lacks hierarchy and distinction | Medium | LessonCard, path cards |
| 5 | No breadcrumb or path‑aware navigation | Medium | Header, lesson nav |
| 6 | Narrow desktop layout — unused margins at 1440px | Low | BaseLayout |
| 7 | Pinyin and Japanese explanation visually identical | Medium | Lesson page |
| 8 | Missing interactive/focus states | Medium | All interactive elements |
| 9 | No dark‑mode support | Low | `:root` only |
| 10 | Spacing lacks deliberate rhythm | Low | Global |

## Baseline Screenshots

All baseline screenshots are located under `docs/design/baseline/`:

| File | Viewport | Content |
|------|----------|---------|
| `home-mobile-390x844.png` | 390×844 | Home page with lesson list, path slot, progress footer |
| `home-desktop-1440x900.png` | 1440×900 | Home page at wide viewport |
| `lesson-mobile-390x844.png` | 390×844 | Lesson 001 at mobile width |
| `lesson-desktop-1440x900.png` | 1440×900 | Lesson 001 at desktop width |
| `vocabulary-mobile-390x844.png` | 390×844 | HSK 1 flashcard setup panel |
