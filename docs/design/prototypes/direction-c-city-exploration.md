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
journey** — the learner navigates Chinese through a structured route of
"stations," each representing a real-world travel scenario. The visual language
is inspired by Taipei's transit signage, night-market warmth, and the calm
authority of urban wayfinding systems.

Unlike Direction A (editorial travel guide — serif Chinese, red/terracotta,
magazine layout) and Direction B (premium productivity app — cool slate/teal,
sans-serif, single-column cards), Direction C uses:

- A **deep indigo and warm amber** palette evoking Taipei evening streets and MRT signage
- A **route/timeline** progress metaphor — lessons are "stations" connected by a vertical line
- **Station markers** (numbered circles) as progress indicators, not generic progress bars
- **Two-column desktop layout** — route map panel (persistent wayfinding reference) + content panel
- Route motifs that directly communicate **"where you are" and "what's next"** in the learning journey

## Colour Palette

| Role | Value | Usage |
|------|-------|-------|
| Background | `#f4f1ec` — warm stone | Page backdrop, urban plaza warmth |
| Surface | `#ffffff` — white | Phrase card, quiz options, feedback |
| Text primary | `#1a1a2e` — deep navy-black | Headings, main body, Chinese hero |
| Text secondary | `#5a5a72` — medium slate | Can-do descriptions, section labels |
| Text muted | `#8e8ea0` — muted slate | Pinyin, secondary metadata, timestamps |
| Primary | `#1a2744` — deep indigo | Route line, active station markers, focus rings, CTAs |
| Primary light | `#e8ecf3` — pale indigo | Hover states, subtle indicators |
| Accent | `#d48c2b` — warm amber | Active station glow, emphasis markers, success highlights |
| Accent light | `#f5e8d0` — pale amber | Active item background, warm notes |
| Route line | `#d0ccc4` — light warm grey | Connecting line between stations |
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
| Traditional Chinese | `Noto Sans TC`, `PingFang TC` (sans-serif) | 3rem (hero), 1.25rem (examples), 1rem (labels) | 700 (hero), 600 (examples) |
| Pinyin | `Noto Sans`, `Helvetica Neue` (sans-serif) | 1rem (hero), 0.875rem (inline) | 400, letter-spaced 0.04em |
| Japanese UI | `Noto Sans JP`, `Hiragino Sans` (sans-serif) | 0.9375rem–0.75rem (body/labels) | 500–400 |

Chinese uses a **bold sans-serif** with generous letter-spacing, evoking station
signage legibility. Pinyin is set in a lighter colour and weight, clearly
subordinate but immediately discoverable. Japanese UI text uses intermediate
weights and sizes to sit comfortably between the dominant Chinese and the quiet
pinyin.

## Route / Wayfinding Motif

The route motif is the core visual system that communicates progress, location,
and learning flow:

1. **Vertical route line** — a continuous 2px line connects all lesson
   "stations," solid from start to current position, dotted after.

2. **Station markers** — numbered circles (32px diameter) at each lesson:
   - **Active** (current lesson): filled indigo outer ring, amber inner glow,
     bold number
   - **Completed** (future implementation): filled indigo with checkmark
   - **Upcoming** (locked): hollow circle with light border, muted number

3. **Station cards** — each lesson station shows its title, can-do description,
   and example Chinese phrase, creating a preview of what's ahead.

4. **Progress summary** — displayed as a clear "X / Y lessons complete" line at
   the route terminus, avoiding gamified streak counters.

5. **Station-to-station transition** — the solid-to-dotted line shift
   intuitively shows how far the learner has come and how far remains.

## Layout Principles

- **Mobile-first single column** (default): route stations flow inline as the
  lesson list, followed by content sections. Route line runs along the left
  edge of the station list.

- **Desktop two-column** (1024px+): sticky route panel (minmax 260–320px) on
  the left with a border-right separator. Content panel on the right with a
  comfortable max-width (680px) for reading.

- **Conscious wide-screen adaptation**: the left route panel is not merely a
  navigation bar — it is a persistent wayfinding reference that anchors the
  "where you are" context while the learner focuses on content.

- **Content max-width**: 640px on mobile, 680px within the desktop content
  column. Text measure stays readable at all widths.

- **Generous vertical rhythm**: 32–48px between major sections, 16–24px within
  sections.

## Key Design Details

1. **Phrase card** — white surface with a 4px deep indigo top border (evoking
   a platform sign header). Chinese phrase dominates at 3rem, pinyin sits below
   in muted colour, Japanese meaning follows in body weight, and the hook is
   styled as a compact note.

2. **Route stations as lesson list** — each station row integrates the
   timeline dot, lesson title, can-do, and Chinese example. This replaces both
   Direction A's numbered badges and Direction B's single-column card list.

3. **Quiz options** — styled with radio-button-like circular indicators
   (indigo border, filled on selection). Selected state uses amber accent.
   Focus-visible uses 2px indigo outline. 44px min touch target.

4. **Feedback blocks** — left-border accent (teal for correct, warm red for
   incorrect) plus icon and text, ensuring state differentiation without
   colour alone.

5. **Progress communication** — the route timeline itself is the primary
   progress indicator, complemented by the textual "0 / 3 レッスン完了"
   summary. No thin progress bars or percentage indicators.

6. **Desktop sidebar route** — shows all 3 stations at a glance with the
   learner's current position highlighted. Functions as a "you are here" map
   reference.

7. **Wayfinding micro-details** — subtle directional cues (amber dot on active
   station, line solid/dotted shift) that reward attention without distracting
   from content.

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
