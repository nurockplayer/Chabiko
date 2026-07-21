---
name: direction-c-city-exploration
description: Visual rules for direction C — Taiwan city wayfinding learning journey prototype
metadata:
  type: reference
---

# Direction C: Taiwan City Exploration — Visual Rules

> Part of Issue #59. This document explains the visual design rules used in
> `direction-c-city-exploration.html`, a standalone prototype for Chabiko's
> Taiwan city wayfinding direction.

## Design Concept

This direction positions Chabiko as a **wayfinding-guided city exploration
journey** — the learner navigates Chinese through real-world travel scenarios
anchored by a route-line and station motif. The visual language
is inspired by Taipei's transit signage, night-market warmth, and the calm
authority of urban wayfinding systems.

Unlike Direction A (editorial travel guide — serif Chinese, red/terracotta,
magazine layout) and Direction B (premium productivity app — cool slate/teal,
sans-serif, single-column cards), Direction C uses:

- A **deep indigo and warm amber** palette evoking Taipei evening streets and MRT signage
- A **route/timeline** progress metaphor — the current lesson is an active station on a route line
- **Station markers** (numbered circles) as progress indicators, not generic progress bars
- **Two-column desktop layout** — sticky route panel (persistent wayfinding reference) + content panel
- Route motifs that directly communicate **"where you are" and "what's next"** in the learning journey

## Colour Palette

| Role | Value | Usage |
|------|-------|-------|
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

The indigo + amber palette deliberately avoids the red/terracotta editorial warmth
(Direction A) and the cool teal productivity feel (Direction B), instead evoking
Taipei's distinctive visual identity: deep indigo MRT signage, warm night-market
lantern light, and the calm readability of urban wayfinding.

## Typography

| Role | Font | Scale | Weight |
|------|------|-------|--------|
| Traditional Chinese | `PingFang TC`, `Noto Sans TC`, `Hiragino Sans` (sans-serif) | 3rem (hero), 0.875rem (examples), 1rem (labels) | 700 (hero), 600 (examples) |
| Pinyin | `Noto Sans`, `Helvetica Neue` (sans-serif) | 1rem (hero), 0.875rem (inline) | 400, letter-spaced 0.04em |
| Japanese UI | `Noto Sans JP`, `Hiragino Sans` (sans-serif) | 0.9375rem–0.75rem (body/labels) | 500–400 |

Chinese uses a **bold sans-serif** with generous letter-spacing, evoking station
signage legibility. Pinyin is set in a lighter colour and weight, clearly
subordinate but immediately discoverable. Japanese UI text uses intermediate
weights and sizes to sit comfortably between the dominant Chinese and the quiet
pinyin.

## Route / Wayfinding Motif

The route motif is a focused "one active stop" wayfinding system. Unlike a multi-station route, this prototype renders exactly one active lesson station served by a vertical route line, with a separate pending-path marker for the HSK対策 plan.

1. **Vertical route line** — a continuous 2px line running alongside the active
   lesson station, reinforcing a "you are here" wayfinding metaphor for the
   current lesson.

2. **Active station marker** — circular indicator (18px diameter): filled
   indigo circle, amber inner dot, amber glow
   (`box-shadow: 0 0 0 4px var(--color-accent-light)`).

3. **Active station card** — shows the lesson number, title, can-do
   description, and example Chinese phrase for Lesson 1.

4. **Pending marker** — a separate `HSK対策` row sits below the route timeline
   with a border-top divider, a hollow circle, and a "準備中" status badge.
   It is visually distinct from the active station (muted label, hollow dot,
   light background badge) and communicates planned expansion without
   inventing lesson details.

## Layout Principles

- **Mobile-first single column** (default): route panel flows above the
  lesson content as a compact wayfinding reference. Route line runs along the
  left edge of the active station.

- **Desktop two-column** (1024px+): sticky route panel (300px) on
  the left with a `border-right` separator. Content panel on the right with a
  comfortable max-width (720px) for reading.

- **Conscious wide-screen adaptation**: the left route panel is not merely a
  navigation bar — it is a persistent wayfinding reference that anchors the
  "where you are" context while the learner focuses on content.

- **Fluid mobile layout**: content width is determined by horizontal padding
  (16px at 390px, 12px at 320–374px) rather than a fixed max-width.
- **Desktop content max-width**: 720px within the right content column on
  viewports 1024px and wider.
- **Narrow mobile breakpoint** (320–374px): reduced padding and smaller font
  sizes (Chinese 2.25rem, title 1.25rem) to prevent overflow.

- **Generous vertical rhythm**: 32–48px between major sections (`--space-xl` to
  `--space-2xl`), 16–24px within sections.

## Key Design Details

1. **Phrase card** — white surface with a 4px deep indigo top border (evoking
   a platform sign header). Chinese phrase dominates at 3rem, pinyin sits below
   in muted colour, Japanese meaning follows in body weight.

2. **Route station as wayfinding point** — a single active station row
   integrates the timeline dot, lesson title, can-do, and Chinese example.
   A separate pending-path row follows with its own visual style for the
   HSK対策 plan. This replaces both Direction A's numbered badges and
   Direction B's single-column card list.

3. **Quiz options** — styled with radio-button-like circular indicators
   (22px diameter, `border: 2px solid var(--color-border)`). Selected state
   fills the indicator with `var(--color-success)`. Focus-visible uses 2px
   indigo outline. 52px min height touch target.

4. **Feedback blocks** — left-border accent (teal for correct, warm red for
   incorrect) plus icon and text, ensuring state differentiation without
   colour alone.

5. **Progress communication** — the route line with its active station
   is the primary progress indicator, with the HSK対策 pending path shown
   below as a planned expansion. No thin progress bars or percentage
   indicators.

6. **Desktop sidebar route** — shows the active lesson station at a glance
   with the learner's position highlighted and a pending path below for
   reference. Functions as a "you are here" map reference.

7. **Wayfinding micro-details** — subtle amber dot on the active station
   marker that rewards attention without distracting from content.

## Anti-patterns Avoided

- No generic blue accent or SaaS dashboard appearance
- No serif Chinese or editorial magazine styling (Direction A territory)
- No cool slate-teal palette or rounded-everything card system (Direction B)
- No tourism-poster imagery, Taipei 101 silhouettes, night market photos, or
  map tiles
- No transit dashboard UI (no train icons, route maps, station name signs)
- No Duolingo-style streaks, badges, or mascot elements
- No heavy card shadows or decorative borders
- No progress bars or percentage circles
- No colour-only state differentiation
- No one-column-card approach (Direction B's territory)
- No editorial travel-guide language (Direction A's territory)

## Accessibility Notes

- All normal text meets WCAG AA contrast (4.5:1 minimum); large text (≥24px or
  ≥19px bold) meets 3:1.
- Interactive elements have visible `:focus-visible` outlines (2px indigo + 3px
  offset).
- All touch targets meet ≥44px height and width where interactive.
- State differentiation uses text label + icon + colour, never colour alone.
- Correct/incorrect feedback includes icon, text, and background tint.
- Route station status includes text labels ("進行中", "準備中") in addition to
  visual dot state.
- The page avoids horizontal overflow at all required breakpoints (320px,
  375px, 390px, 1440px).
