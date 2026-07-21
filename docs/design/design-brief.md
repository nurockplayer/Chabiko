# Design Brief: Chabiko Learner UI

> Part of Issue #56 — defines the measurable design direction for the Chabiko redesign initiative.
> Date: 2026-07-21

## 1. Product & Audience

### Product
Chabiko (チャビコ) is a web-based Mandarin learning product for Japanese speakers. Its current focus is a Taiwan travel path (3 beginner lessons) plus HSK 1 vocabulary flashcards. The interface language is Japanese; the target language is Traditional Chinese (with pinyin).

### Primary Audience
- **Who:** Japanese-speaking adults (20s–40s) who know some kanji and are planning a trip to Taiwan.
- **Technical comfort:** Comfortable with web apps on mobile (Smartphone-first usage) but not necessarily "tech early adopters."
- **Motivation:** Practical readiness for travel, not academic study. They want to be able to order food, ask prices, and find locations in Chinese during their trip.
- **Pain point:** They can guess meaning from kanji but cannot produce or understand spoken Chinese.

### Secondary Audience
- Japanese learners who are studying for HSK 1 and want complementary Taiwan-travel vocabulary.
- Beginners who tried Duolingo or similar apps but found the gamification shallow and want a more purposeful, travel-oriented path.

### Learner Hierarchy (Visual Priority)

Every page, component, and layout decision must respect this hierarchy:

1. **Traditional Chinese phrase** — the primary learning object. Must be the most visually prominent content on the screen.
2. **Pinyin / pronunciation guidance** — supports reading aloud. Must be clearly associated with the Chinese phrase but visually subordinate.
3. **Japanese meaning and explanation** — comprehension support. Must be scannable and clearly separated from Chinese content.
4. **Action / progress** — navigation, completion status, practice prompts. Functional UI that must not compete with learning content.

## 2. Target Product Traits

The redesign must communicate:

| Trait | What it means |
|-------|---------------|
| **Refined** | Polished typography, intentional whitespace, no crude UI shapes. Feels crafted, not assembled. |
| **Travel-guide-like** | Evokes a slim Tokyo-published Taiwan travel guidebook. Warm, confident, Japanese in its editorial sensibility. |
| **Chinese-first** | Traditional Chinese characters are the hero. The screen reads as "a Chinese page with Japanese support," not "a Japanese page with some Chinese on it." |
| **Calm** | Low visual noise. No unnecessary borders, badges, or competing colours. Actions are where the learner expects them. |
| **Credible** | Not cartoonish, not childish. The learner trusts the content's quality. Avoids mascot-heavy gamification (no Duolingo owl aesthetic). |

### Anti-Goals

These are explicitly **not** the target:

- ❌ Generic Bootstrap/SaaS dashboard appearance.
- ❌ Duolingo or gamification-heavy style (streak flames, cartoon characters, excessive sound effects).
- ❌ Textbook page look (dense tables, thin rules, grey academic layout).
- ❌ Corporate or "modern startup" landing page (gradient CTAs, heavy shadows, large hero images).
- ❌ "Tech product" feel (dashboards, data tables, status indicators as primary content).

## 3. Visual Direction Constraints

- **Mobile-first:** All designs begin at 390px width. Desktop is a deliberate adaptation, not the starting point.
- **Light and dark themes:** The design must accommodate a single semantic token system from the start. The light theme is the primary canvas; dark mode is verified at the token level.
- **Static-first:** All styling is CSS-in-Astro via `<style>` blocks or global CSS variables. No runtime CSS-in-JS.
- **Content-preserving:** No lesson semantics, routing, data-loading, or validation logic may be changed. The prototype may introduce new CSS and markup wrappers but must preserve all existing `data-*` attributes and hydration hooks.
- **Accessibility baseline:** WCAG AA contrast minimum (4.5:1 for normal text, 3:1 for large text). Visible keyboard focus on all interactive elements.

## 4. Visual Direction Comparison Rubric (100 Points)

Each of the three prototype directions (#57, #58, #59) will be scored using this rubric. The winning direction is the one with the highest total.

| Criterion | Points | What earns a high score (9–10) | What earns a low score (0–3) |
|-----------|--------|-------------------------------|------------------------------|
| **Visual hierarchy** | 20 | Chinese text is unmistakably primary; pinyin, Japanese, and actions are clearly subordinate but easy to find. The learner hierarchy (Chinese → pinyin → Japanese → action) is instantly readable on any page. | All content appears at similar visual weight. Chinese text is the same size/colour as labels or metadata. Hard to tell where to look. |
| **Japanese/Chinese readability** | 20 | Type sizes, line heights, and contrast are comfortable for both Traditional Chinese characters and Japanese text at mobile widths. No clipping, overflow, or crowding at 390px. | Text overlaps, overflows, or requires horizontal scrolling at mobile width. Pinyin or Japanese text is too small to read. |
| **Mobile usability** | 15 | All interactive targets are ≥44px tap area. The page is fully usable one-handed at 390px. No content is hidden behind unrevealed scroll. | Tiny buttons, cramped layout, or content above the fold is empty/irrelevant. One-handed operation is impossible for core actions. |
| **Brand distinctiveness** | 15 | The design would not be mistaken for a generic Bootstrap app, Duolingo clone, or textbook. It has a clear personality that fits the travel-guide brief. | Could be any web app. Uses default blue accent, standard card borders, no typographic system. |
| **Consistency** | 10 | Spacing, colour use, type scale, and component behaviour are uniform across home, lesson, and vocabulary pages. | Each page appears to use different rules. Border radii, font sizes, and spacing vary arbitrarily. |
| **Accessibility** | 10 | WCAG AA contrast on all text and interactive elements. Visible focus indicators. Touch targets meet 44×44px. Semantic HTML structure preserved. | Below AA contrast. No visible focus. Tiny touch targets. Colour-only state differentiation. |
| **Dark-mode readiness** | 5 | The colour palette, surface layering, and contrast work as a semantic token system that naturally inverts for dark mode. No hard-coded light-only hex pairs. | Colours are baked as light-mode-only hex values. Inverting would require re-evaluating every pair. |
| **Implementation feasibility** | 5 | The design can be built with static CSS (no runtime, no new JS dependencies). It preserves all existing Astro patterns, data attributes, and hydration hooks. | Requires a CSS-in-JS library, new JS framework, or restructuring of existing page logic to achieve. |
| **Total** | **100** | | |

## 5. Content That Must Be Visible by Viewport

For every prototype direction:

### Home page (mobile + desktop)
- At least one learning-path card showing lesson number, title, and can-do description.
- A goal-path slot showing active and pending paths.
- A progress summary area.
- Header with product name.

### Lesson page (mobile + desktop)
- Core sentence (the key Chinese phrase) — at the top of the lesson content area.
- At least one example sentence with pinyin and Japanese meaning.
- At least one chunk breakdown (chunk, meaning, optional note).
- Practice area with at least one quiz prompt and its choices.
- Correct and incorrect feedback states.
- Previous/next lesson navigation at the bottom.

### Vocabulary page (mobile)
- Session setup controls (size and direction selectors).
- A flashcard showing front (Chinese or Japanese) and back (pinyin, Japanese, Traditional).
- Reveal and rating buttons.
- Session-completion state.

## 6. Content Not in Scope

Prototype directions must not redesign, modify, or restyle:
- HSK recovery data, progression, or flashcard logic.
- Lesson content schema or data files.
- Routing or static-path generation.
- Practice scoring, retry, or completion logic.
- Global styles outside the prototype's own CSS (no changes to `BaseLayout.astro`, `Header.astro`, or `:root` tokens).
