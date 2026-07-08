# Research Summary

## Stack

Static-first web app with pnpm and structured content. Defer backend state until there is evidence that accounts or sync are necessary.

## Table Stakes

Beginner path, mobile-friendly lessons, Japanese-first UI, Simplified / Traditional Chinese display support, pinyin, Japanese explanations, travel phrasebook, vocabulary browsing, simple practice, and resource attribution.

## Differentiator

Make Mandarin/Japanese kanji similarity a guided learning bridge: useful for recognition, but always paired with pronunciation, tone, usage, and false-friend warnings. Chabiko should feel clearly made for Japanese speakers, not like a generic Chinese learning app with Japanese labels pasted on top.

## Script Strategy

Chabiko should not be Traditional-only or Simplified-only. The product UI and explanations are Japanese-first; Chinese learning content should support Simplified / Traditional display switching where content has both forms.

Path defaults should do the work:

- Taiwan travel path: Traditional-first, Taiwan-usage-first, with Simplified display available when possible.
- HSK, school, and general Mandarin paths: Simplified-first, with Traditional display available when possible.
- Shared vocabulary and kanji bridge content: dual-script where relevant, with caution notes when script conversion affects meaning, frequency, or regional usage.

AI-assisted script conversion can help authoring, but production content should track whether each script form is authored, verified, or generated. Meaning-sensitive entries should not rely on unreviewed runtime conversion.

## Japanese Learner Alignment

The v1 product should be grounded in prioritized Japanese learner personas and jobs-to-be-done. The most likely differentiating v1 spine is Taiwan travel readiness, with secondary paths for HSK/general Mandarin, school-credit support, business/service encounters, study abroad, and Chinese media curiosity.

Content and practice should explicitly handle Japanese-native learner pain points:

- Mandarin tones and pinyin pronunciation.
- Kanji false friends and same-looking words with different usage.
- Word order, measure words, aspect particles, and complements.
- Simplified/Traditional and Taiwan/Mainland usage differences.

## Learning Strategy

Chabiko should use a repeatable lesson loop:

1. Goal or Taiwan travel hook.
2. Can-do goal.
3. Core sentence.
4. Chunk breakdown.
5. Kanji bridge.
6. Single sound or tone focus.
7. Mini practice.
8. Practical task.
9. Review hook.

Motivation should be based on practical readiness by scenario, not only lesson counts or generic streaks. See `docs/strategy/learning-and-motivation-strategy.md`.

## External Resource Strategy

Candidate resources:

- `https://lmit.edu.tw/` — official Taiwan Mandarin learning gateway.
- `https://tocfl.edu.tw/` — official Chinese proficiency reference point.
- `https://jp.taiwan.net.tw/` — Taiwan Tourism Administration Japanese travel content.
- `https://cc-cedict.org/wiki/` — open Chinese dictionary data candidate.
- `https://www.edrdg.org/edrdg/licence.html` — EDRDG license reference for JMdict/KANJIDIC-related resources.
- `https://kanjivg.tagaini.net/` — kanji data candidate.
- `https://www.unicode.org/charts/unihan.html` — Unihan reference candidate.
- HSK references — candidate only; exact source and licensing need verification before import.

No external data is approved for import until exact license, attribution, and transformation requirements are documented.

## Watch Outs

- Content review matters as much as code review.
- Taiwan usage should be explicit when it differs from generic Mandarin resources.
- Variant notes should be useful and selective, not clutter every beginner card.
- Simplified / Traditional switching should not silently change meaning or regional usage.
- The product should not become a dictionary clone.
- UI should expose useful learning content immediately, not a marketing shell.
