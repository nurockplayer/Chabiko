---
name: basic-vocabulary-placeholder
description: Dev-only flashcard prototype for future /vocabulary/basic/ UI validation
metadata:
  type: reference
---

# Basic Vocabulary Flashcard Prototype — Dev Only

> Standalone prototype for validating `/vocabulary/basic/` UI and interaction patterns
> using synthetic data and a single placeholder graphic. **Not for production use.**

## Purpose

Validate the zh-to-ja flashcard interaction model with illustration + Simplified
front, reveal-gated pinyin/Japanese/Traditional back, and self-assessment buttons,
using fake data and a generic dev placeholder image. No real teacher content,
no illustration metadata, no approved alt text.

## File Locations

| File | Path |
|------|------|
| HTML prototype | `docs/design/prototypes/basic-vocabulary-placeholder.html` |
| Structured fixture | `docs/design/prototypes/basic-vocabulary-placeholder.fixture.js` |
| Mobile screenshot | `docs/design/prototypes/basic-vocabulary-placeholder-mobile.png` |
| Desktop screenshot | `docs/design/prototypes/basic-vocabulary-placeholder-desktop.png` |

## Interaction Flow

1. **Front**: illustration placeholder (SVG silhouette + "DEV PLACEHOLDER" label)
   + Simplified Chinese word (`lang="zh-Hans"`). Card has `role="button"`.
2. **Tap / Enter / Space** → reveal.
3. **Back**: pinyin (`lang="zh-Latn"`), Japanese, Traditional Chinese (`lang="zh-Hant"`).
   Card button role is removed; answer container receives focus.
4. **Self-assessment**: `もう一度` (retry), `まだ曖昧` (shaky), `覚えた` (knew).
   Focus moves to next card (cards 1–9) or completion title (card 10).
5. After 10 cards: completion screen with stats breakdown + restart button.
6. Restart returns focus to the first card.

## Synthetic Data

20 records in `docs/design/prototypes/basic-vocabulary-placeholder.fixture.js`.
Each record includes: stable ID, simplified, traditional, pinyin, japanese,
category, source marker, and review status.

Each session uses a fixed slice of the first 10 records (`SESSION_WORDS`).
No real workbook data or preflight records used. All content is synthetic,
unreviewed, and not for production.

## Visual Design

Follows the Direction B palette (cool slate-teal, sans-serif):

| Role | Value |
|------|-------|
| Background | `#f4f7fc` |
| Surface | `#ffffff` |
| Accent | `#0f766e` (teal) |
| Text primary | `#0f172a` |
| Text muted | `#5b6570` |

Self-assessment buttons use distinct accent colours:
- もう一度 — grey (`#6b7280`)
- まだ曖昧 — amber (`#b45309`)
- 覚えた — violet (`#7c3aed`)

## Responsive Breakpoints

| Viewport | Width | Behaviour |
|----------|-------|-----------|
| Narrow mobile | 320–374px | `font-size: 15px`, smaller card, tighter padding |
| Mobile | 375–389px | Adjusted zh size and image |
| Standard mobile | 390px | Default design |
| Desktop | ≥1024px | Wider card (560px), larger zh, spacious padding |
| Desktop screenshot | 1440×900 | Full desktop view |

No horizontal overflow at 320 / 375 / 390 px.

## Accessibility

- `focus-visible` outlines on all interactive elements (2px teal + offset)
- Native `<button>` elements, min 44px touch targets
- Front card: `role="button"`, `aria-labelledby` referencing the Simplified Chinese word, `aria-describedby` referencing the tap hint
- After reveal: button role removed, answer container focused, `aria-labelledby` references pinyin/Japanese/Traditional with correct `lang` attributes
- Assessment strip uses `role="status"` + `aria-live="polite"`
- Completion heading receives programmatic focus for assistive technology notification
- Focus returns to the card on restart
- Colour is never the only differentiator: text labels accompany all states

## Anti-patterns Avoided

- No real workbook/preflight records
- No `/vocabulary/basic/` production route
- No production loaders, storage, or domain logic
- No illustration metadata or approved alt text
- No dependencies beyond the HTML file and its fixture JS
