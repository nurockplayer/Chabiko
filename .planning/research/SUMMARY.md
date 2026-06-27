# Research Summary

## Stack

Static-first web app with pnpm and structured content. Defer backend state until there is evidence that accounts or sync are necessary.

## Table Stakes

Beginner path, mobile-friendly lessons, Traditional Chinese, pinyin, Japanese explanations, travel phrasebook, vocabulary browsing, simple practice, and resource attribution.

## Differentiator

Make Mandarin/Japanese on-yomi similarity a guided learning bridge: useful for recognition, but always paired with pronunciation, tone, usage, and false-friend warnings.

## Learning Strategy

Chabiko should use a repeatable lesson loop:

1. Taiwan travel hook.
2. Can-do goal.
3. Core sentence.
4. Chunk breakdown.
5. Kanji bridge.
6. Single sound or tone focus.
7. Mini practice.
8. Travel task.
9. Review hook.

Motivation should be based on travel readiness by scenario, not only lesson counts or generic streaks. See `docs/strategy/learning-and-motivation-strategy.md`.

## External Resource Strategy

Candidate resources:

- `https://lmit.edu.tw/` — official Taiwan Mandarin learning gateway.
- `https://tocfl.edu.tw/` — official Chinese proficiency reference point.
- `https://jp.taiwan.net.tw/` — Taiwan Tourism Administration Japanese travel content.
- `https://cc-cedict.org/wiki/` — open Chinese dictionary data candidate.
- `https://www.edrdg.org/edrdg/licence.html` — EDRDG license reference for JMdict/KANJIDIC-related resources.
- `https://kanjivg.tagaini.net/` — kanji data candidate.
- `https://www.unicode.org/charts/unihan.html` — Unihan reference candidate.

No external data is approved for import until exact license, attribution, and transformation requirements are documented.

## Watch Outs

- Content review matters as much as code review.
- Taiwan usage should be explicit when it differs from generic Mandarin resources.
- The product should not become a dictionary clone.
- UI should expose useful learning content immediately, not a marketing shell.
