# Direction A: Japanese Editorial Travel Guide — Visual Rules

> Part of Issue #57. This document explains the visual design rules used in
> `direction-a-editorial.html`, a standalone prototype for Chabiko's editorial
> travel-guide direction.

## Design Concept

This direction positions Chabiko as a **refined Tokyo-published Taiwan travel
guidebook** — warm, editorial, and credible for adult learners. The visual
language is inspired by Japanese travel magazines (旅の本, 地球の歩き方) and
slim Taiwan guidebooks sold at Maruzen and Kinokuniya.

## Colour Palette

| Role | Value | Usage |
|------|-------|-------|
| Background | `#faf7f2` — warm off-white | Page backdrop, like aged book paper |
| Surface | `#fffcf8` — warm white | Cards, info blocks, flashcard |
| Text | `#2c2420` — deep warm brown | Main body and headings |
| Secondary text | `#7a7068` — warm grey | Can-do descriptions, labels |
| Muted text | `#736b64` — warm grey | Pinyin, metadata, secondary labels |
| Accent | `#b8432f` — restrained red | Section numbers, active paths, CTAs |
| Accent warm | `#d4764a` — terracotta | Alternate section markers, note cards |
| Accent soft | `#e8d5cc` — blush | Status pills, hover states |
| Border | `#e8e0d8` — light warm grey | Dividers, framing |
| Success | `#4a7c59` — muted green | Correct feedback |
| Error | `#b84a4a` — muted red | Incorrect feedback |

The palette avoids generic blue SaaS colours. Reds and terracottas evoke
Taiwan's temple architecture, night-market signage, and traditional lanterns
without becoming a tourism poster.

## Typography

| Role | Font | Scale |
|------|------|-------|
| Traditional Chinese | `Noto Serif TC` (serif) | 2.5rem (hero), 1.25rem (examples), 1rem (chunks) |
| Pinyin | `Noto Sans` (sans) | 0.9375rem (hero), 0.8125rem (inline) |
| Japanese UI | `Noto Sans JP` (sans) | 0.9375rem–0.75rem (body/labels) |

Chinese uses a serif font to establish visual authority and distinguish it from
Japanese UI text (sans-serif). This directly implements the "Chinese-first"
hierarchy from the design brief (section 1, Learner Hierarchy).

## Layout Principles

- **Narrow content column** (max-width 640px mobile, 840–960px desktop) — like
  a book's text measure, not a full-width dashboard.
- **Generous whitespace** between sections — the page breathes like a magazine
  spread.
- **Left accent border** on cards and info blocks — replaces heavy card shadows
  with an editorial detail.
- **Red gradient top bar** on the hero sentence block — echoes a guidebook's
  chapter header ribbon.
- **Desktop adaptations at 1024px+** — two-column layouts for content sections.

## Section Numbering

Each major section is prefixed with a numbered red circle badge — inspired by
chapter numbering in Japanese guidebooks (第1章, 第2章).

## Feedback States

- **Correct:** Green left border, soft green background, checkmark icon,
  「正解！」
- **Incorrect:** Red left border, soft red background, cross icon,
  「不正解。」+ correct answer

## Key Editorial Details

1. **Path card** uses a left border accent instead of a full card frame —
   reduces visual clutter while maintaining hierarchy.
2. **Goal paths** are rendered as a compact editorial listing (path-row),
   avoiding dashboard-style progress bars.
3. **Sound focus** and **kanji bridge** notes use a left terracotta border and
   compact layout — like a guidebook's margin note or tip box.
4. **Section headings** include a red underline accent — subtle but directional.
5. **Progress summary** is presented as simple statistics, not a progress bar.

## Anti-patterns Avoided

- No generic blue accent colour
- No rounded card containers with heavy shadows
- No Bootstrap-style navbars or sidebar
- No gradient CTAs or hero images
- No Duolingo-style streak or badge elements
- No competing colours or information density

## Accessibility Notes

- All normal text meets WCAG AA contrast (4.5:1 minimum); large text (≥24px/19px bold) meets 3:1.
- Interactive elements have visible `:focus-visible` outlines.
- Interactive touch targets meet ≥44px height; non-interactive badges may be smaller.
- State differentiation (e.g. active control button) uses both colour and font-weight.
