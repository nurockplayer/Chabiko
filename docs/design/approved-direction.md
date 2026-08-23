# Approved Direction: C — Taiwan City Exploration

> **Historical Direction C / Issue #60 record.** Direction C was selected under
> Issue #60/#61 and implemented in PR #165. The current learner-facing visual
> target is A1 Editorial Calm, frozen in `reference-family-389.md`; its core
> production propagation is complete, and remaining work is owned by live GitHub
> Issues. This document preserves the original decision and rationale.

> Part of Issue #60. Implementation baseline for Issue #61 (contract) and
> subsequent implementation tickets.

## Selected Direction

**Direction C: Taiwan City Exploration** — selected by independent evaluation
at 87/100 (Issue #60 / `docs/design/direction-review.md`), after tie-rule
application (totals tied A:87, C:87; C's higher accessibility score 9 > 7
broke the tie).

Rejected directions:
- Direction A (Japanese Editorial Travel Guide, 87/100) — tied on total but
  lost on accessibility tiebreaker: 4 normal-text contrast failures found in
  comprehensive audit (section badge, status pill, incorrect-feedback
  correct-answer, pending status).
- Direction B (Premium Modern Learning App, 84/100) — weakest brand
  distinctiveness (11/15); Chinese/Japanese font differentiation weakest.

## Design Concept

Chabiko's learner-facing UI presents as a wayfinding-guided city exploration
journey — the learner navigates Chinese through real-world travel scenarios
anchored by a route-line and station motif. The visual language is inspired by
Taipei's transit signage, night-market warmth, and the calm authority of urban
wayfinding systems.

## Colour Palette

| Role | Value | Usage |
|---|---|---|
| Background | `#f4f1ec` — warm stone | Page backdrop, urban plaza warmth |
| Surface | `#ffffff` — white | Phrase card, quiz options, feedback |
| Text primary | `#1a1a2e` — deep navy-black | Headings, main body, Chinese hero |
| Text secondary | `#555570` — medium slate | Can-do descriptions, section labels |
| Text muted | `#6a6a7d` — muted slate | Pinyin, secondary metadata, timestamps |
| Primary | `#1a2744` — deep indigo | Route line, active station markers, focus rings, CTAs |
| Primary light | `#e8ecf3` — pale indigo | Hover states, subtle indicators |
| Accent | `#d48c2b` — warm amber | Active station glow, emphasis markers, success highlights |
| Accent light | `#f5e8d0` — pale amber | Active item background, warm notes |
| Route line | `#d0ccc4` — light warm grey | Route line alongside active station |
| Border | `#e0dcd4` — light stone | Dividers, card outlines, separators |
| Success | `#3d7b80` — muted teal-green | Correct feedback accent |
| Success bg | `#e8f0f0` — pale teal | Correct feedback surface |
| Error | `#b84a3a` — warm red | Incorrect feedback accent |
| Error bg | `#f5e8e4` — pale rose | Incorrect feedback surface |

The indigo + amber palette deliberately avoids the red/terracotta editorial
warmth (Direction A) and the cool teal productivity feel (Direction B), instead
evoking Taipei's distinctive visual identity: deep indigo MRT signage, warm
night-market lantern light, and the calm readability of urban wayfinding.

## Typography

| Role | Font | Scale |
|---|---|---|
| Traditional Chinese | PingFang TC, Noto Sans TC, Hiragino Sans, sans-serif | 2.75rem (hero, mobile), 3rem (desktop), 1rem (labels) · 375–389px: 2.5rem · 320–374px: 2.25rem |
| Pinyin | Hiragino Sans, Noto Sans, sans-serif | 1rem (hero), 0.875rem (inline) |
| Japanese UI | Hiragino Sans, Noto Sans JP, sans-serif | 0.9375rem–0.75rem (body/labels) |

Chinese uses a bold sans-serif with generous letter-spacing, evoking station
signage legibility. Pinyin is set in a lighter colour and weight, clearly
subordinate but immediately discoverable.

## Route / Wayfinding Motif

The route motif is a focused "one active stop" wayfinding system. A vertical
route line runs alongside the active lesson station with a circular indicator
(18px): filled indigo circle with amber inner dot and amber glow shadow. A
separate pending-path row communicates planned expansion (HSK対策) with a
hollow dot and "準備中" badge.

## Layout Principles

- **Mobile-first single column** (default): route panel flows above lesson
  content as compact wayfinding reference. Route line runs along the left edge
  of the active station.
- **Desktop two-column** (1024px+): sticky route panel (300px) on the left with
  a `border-right` separator. Content panel on the right with max-width 720px
  for reading.
- **Fluid mobile layout**: content width determined by horizontal padding
  (24px default, 16px at 320–374px) rather than fixed max-width.
- **Narrow mobile breakpoint** (320–374px): reduced padding and smaller font
  sizes (Chinese 2.25rem, title 1.25rem) to prevent overflow.
- **Dedicated mid-small breakpoint** (375–389px): Chinese 2.5rem for smooth
  scaling.
- **Generous vertical rhythm**: 32–48px between major sections, 16–24px within
  sections.

## Approved Refinements (from direction-review.md)

The following bounded refinements are approved as part of the implementation
baseline. They do not alter the wayfinding direction character.

### Refinement 1: Carry Direction C's semantic landmark patterns into production contracts

Carry forward the ARIA and semantic HTML patterns established in Direction C's
prototype into the production component contracts. Affected contracts (to be
frozen by #61) include:

- active lesson indicators: `aria-current="step"`
- quiz feedback regions: `role="status"` and `aria-live="polite"`
- lesson and vocabulary section labelling: `aria-labelledby`
- primary and lesson navigation: explicit `aria-label`

This refinement consolidates existing prototype practice rather than introducing
external patterns. It does not alter visual design or the wayfinding direction
character.

### Refinement 2: Semantic light/dark CSS custom property contract

Restructure `:root` CSS custom properties from flat light-mode hex values to
a semantic light/dark token contract compatible with
`<html data-theme="light|dark">`. Direction C's indigo/amber palette values are
the light-mode base tokens; dark-mode values maintain WCAG AA contrast against
dark backgrounds. OS preference resolution belongs to #54. Token application
must remain compatible with `<html data-theme="light|dark">` and must not depend
solely on `prefers-color-scheme`. Exact selectors, token names, and values are
frozen by #61/#62. This is a technical foundation change that does not modify
the approved visual direction or its wayfinding character.

## Anti-patterns Avoided

The implementation must not introduce:

- Generic blue accent or SaaS dashboard appearance
- Serif Chinese or editorial magazine styling (Direction A territory)
- Cool slate-teal palette or rounded-everything card system (Direction B)
- Tourism-poster imagery, Taipei 101 silhouettes, night market photos, or map
  tiles
- Transit dashboard UI (train icons, route maps, station name signs)
- Duolingo-style streaks, badges, or mascot elements
- Progress bars or percentage circles
- Colour-only state differentiation
- One-column-card approach (Direction B's territory)
- Editorial travel-guide language (Direction A's territory)

## Accessibility Baseline

- All normal text meets WCAG AA contrast (4.5:1 minimum);
  large text (≥24px or ≥19px bold) meets 3:1.
- Interactive elements have visible `:focus-visible` outlines (2px + 3px offset).
- All touch targets meet ≥44px height and width where interactive.
- State differentiation uses text label + icon + colour, never colour alone.
- Correct/incorrect feedback includes icon, text, and background tint.
- Route station status includes text labels ("進行中", "準備中") in addition to
  visual dot state.
- ARIA landmarks (`aria-current`, `aria-live`, `aria-labelledby`, `aria-label`)
  and semantic HTML (`<aside>`, `<main>`, `<nav>`, `<section>`) are present.
- The page avoids horizontal overflow at all required breakpoints (320px,
  375px, 390px, 1440px).

## Implementation Sequencing

The approved direction feeds into:

1. **Issue #61** — contract-only ticket freezing tokens, component APIs,
   file ownership, packages, viewports, fixtures, tests, and
   `implementation-map.json`.
2. **Issue #62** — semantic tokens / base typography.
3. **Issue #63** — Chinese/pinyin/Japanese primitives.
4. **Issue #64** — controls/header/navigation.
5. **Issue #65** — learning-path/progress primitives.
6. **Issue #66** — quiz/feedback/completion primitives.
7. **Issue #67–#69** — production page integration (home, lesson, practice).
8. **Issue #54** — theme preference/control (after #62/#64).

## Validation

Every implementation ticket must execute on its fresh branch head:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

No ticket may skip or declare a command not applicable.
