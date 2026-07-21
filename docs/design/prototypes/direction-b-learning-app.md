---
name: direction-b-learning-app
description: Visual rules for direction B — premium modern learning app prototype
metadata:
  type: reference
---

# Direction B: Premium Modern Learning App — Visual Rules

> Part of Issue #58. This document explains the visual design rules used in
> `direction-b-learning-app.html`, a standalone prototype for Chabiko's premium
> modern learning-app direction.

## Design Concept

This direction positions Chabiko as a **polished, adult-oriented mobile learning
application** — confident, calm, and content-focused. The visual language is
inspired by premium productivity and learning tools that prioritise clarity
over decoration.

Unlike the editorial warmth of direction A (serif Chinese, red/terracotta
palette, magazine layout), direction B uses:

- A cool slate-based neutral palette with a restrained teal accent
- Sans-serif Chinese throughout for a clean, modern reading experience
- Selective rounded geometry and subtle elevation instead of decorative borders
- Progress communicated through thin, elegant indicators rather than numbered
  badges

## Colour Palette

| Role | Value | Usage |
|------|-------|-------|
| Background | `#f4f7fc` — cool light gray-blue | Page backdrop, clean app feel |
| Surface | `#ffffff` — white | Cards, phrase block, quiz choices |
| Elevated | `#ffffff` — white | Key surfaces with shadow |
| Text primary | `#0f172a` — dark slate | Main body, headings |
| Text secondary | `#475569` — medium slate | Can-do descriptions, labels |
| Text muted | `#6b7280` — medium slate | Pinyin, secondary metadata |
| Accent | `#0f766e` — teal | Progress fill, active states, focus ring |
| Accent light | `#f0fdfa` — pale teal | Active item background |
| Accent border | `#ccfbf1` — light teal | Selected item border |
| Border | `#e2e8f0` — light slate | Dividers, card outlines |
| Border light | `#f1f5f9` — very light slate | Subtle separators |
| Success | `#047857` — emerald | Correct feedback background accent |
| Success bg | `#ecfdf5` — pale emerald | Correct feedback surface |
| Error | `#dc2626` — red | Incorrect feedback background accent |
| Error bg | `#fef2f2` — pale red | Incorrect feedback surface |
| Progress bg | `#e2e8f0` — light slate | Empty progress bar track |

The teal accent avoids generic blue SaaS colours while evoking Taiwan's jade
and mountain landscapes — subtle, never tourist-poster.

## Typography

| Role | Font | Scale |
|------|------|-------|
| Traditional Chinese | Hiragino Sans / PingFang TC (sans-serif) | 2.75rem (hero), 1.125rem (examples) |
| Pinyin | Hiragino Sans / Noto Sans (sans-serif) | 0.875rem, muted colour, letter-spaced |
| Japanese UI | Hiragino Sans / Noto Sans JP (sans-serif) | 0.9375rem–0.75rem (body/labels) |

Chinese uses a bold sans-serif weight to establish visual authority and a modern
feel — directly contrasting direction A's serif treatment. The Chinese phrase is
the largest element on every surface, implementing the design brief's learner
hierarchy (section 1).

## Layout Principles

- **Single-column, app-like layout** on all viewports — no magazine-style
  two-column grids even on desktop (unlike direction A).
- **Content max-width 640px** (768px on desktop) — comfortable reading measure.
- **Generous vertical rhythm** between sections with no boxing of every block.
- **Cards use subtle shadow** (`box-shadow: 0 1px 3px rgba(15,23,42,0.05)`)
  rather than borders for surface distinction.
- **Selective border-radius** — `10px` on cards, `8px` on buttons, square on
  structural containers.
- **Thin progress bar** (4px, rounded) for path-level progress — understated
  and adult-oriented.

## Key Design Details

1. **Phrase card** is a floating white surface with subtle shadow and a large
   Chinese hero — no decorative top bar or left border, letting typography lead.
2. **Lesson list** uses clean rows with small numeric markers (not circled
   badges) and status badges with text + icon (not colour-only).
3. **Progress bar** is thin (4px) with rounded ends and a centered percentage
   label — visible but not dominant.
4. **Quiz choices** are full-width buttons with hover/active state styling and
   `focus-visible` outlines.
5. **Feedback blocks** use icon + title + background, ensuring states are
   distinguishable without colour alone.
6. **Status badges** show text labels ("進行中", "準備中") with distinct
   background tints — never colour-only.

## Anti-patterns Avoided

- No generic blue accent or SaaS admin appearance
- No serif Chinese or editorial magazine styling
- No large numbered circles or chapter-marker badges
- No Duolingo-style mascot, streak, or game-board elements
- No heavy card shadows or rounded-everything approach
- No decorative borders on content cards
- No competing colours or information density
- No tourism-poster imagery or scenery

## Accessibility Notes

- All text meets WCAG AA contrast (4.5:1 minimum for normal text)
- Interactive elements have visible `:focus-visible` outlines (2px teal + 2px
  offset)
- All touch targets are ≥44px tall (buttons, badges, interactive rows)
- Colour is never the only differentiator for state changes — feedback uses
  icons, text labels, and structural layout
- Correct/incorrect states show semantic text (正解！/ 不正解。) plus
  matching icons
- Japanese text uses `overflow-wrap: break-word` to prevent overflow at narrow
  widths
