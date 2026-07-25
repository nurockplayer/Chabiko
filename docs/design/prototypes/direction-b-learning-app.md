---
name: direction-b-learning-app
description: Visual rules for direction B — premium modern learning app prototype
metadata:
  type: reference
---

# Direction B: Premium Modern Learning App — Visual Rules

> Part of Issues #58 and #145. The standalone prototype is an evidence-complete candidate for the #60 comparison.

## Design concept

Direction B presents Chabiko as a polished, adult-oriented mobile learning application. It prioritises clarity over decoration and deliberately avoids both Direction A's editorial serif treatment and Direction C's route-map metaphor.

## Visual system

- Cool light slate background with white content surfaces.
- Dark slate text and one restrained teal accent.
- Bold sans-serif Traditional Chinese as the dominant learning object.
- Pinyin and Japanese support remain calm, legible, and subordinate.
- Selective 8–12px radii and very light elevation, not rounded-everything cards.
- Thin progress indicators and compact text-plus-icon status labels.
- Single-column reading flow on mobile and desktop, with bounded desktop width.

## Learner hierarchy

1. Traditional Chinese phrase
2. Pinyin
3. Japanese meaning and explanation
4. Controls, status, and progress

The phrase and flashcard use the largest, heaviest type. Supporting text uses progressively quieter colour and size.

## Component behaviour

- Lesson rows use small numeric markers, restrained status pills, and subtle elevation.
- Quiz options are full-width native buttons with ≥44px targets and visible focus.
- Correct and incorrect feedback use text, icon, background, and a left rule so state is never colour-only.
- Vocabulary setup uses compact segmented native buttons; the selected option is expressed by colour and weight.
- Completion is a quiet teal-tinted surface rather than a game reward.

## Shared fixture coverage

The final prototype renders the complete `docs/design/prototype-content.md` evidence set:

- active and pending learning paths plus progress;
- core phrase, chunk breakdown, example, pronunciation and kanji notes;
- quiz choices, correct and incorrect feedback, completion, and lesson navigation;
- vocabulary session sizes and directions, canonical `我 / wǒ / 私` flashcard, reveal/rating controls, and completion.

## Responsive and accessibility rules

- Mobile-first at 390px, with safeguards below 360px.
- Desktop widens the reading column and allows two-column option/feedback groupings without becoming a dashboard.
- All interactive targets are at least 44px high.
- `:focus-visible` uses a 2px teal outline with offset.
- Text and controls target WCAG AA contrast.
- Chinese and pinyin carry explicit language metadata in the HTML.
- No remote assets or runtime dependencies.
