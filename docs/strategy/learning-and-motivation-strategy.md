# Chabiko Learning And Motivation Strategy

## Purpose

This document defines how Chabiko helps Japanese learners:

1. Develop and maintain interest in Mandarin Chinese.
2. Learn Mandarin well enough to understand and produce useful travel language.
3. Retain what they learn and use it in Taiwan travel situations.

Chabiko should not feel like a generic textbook website. It should feel like a short, useful, and fun Taiwan travel preparation system.

## Product Thesis

Japanese learners already have a partial bridge into written Chinese through kanji. Chabiko should use that bridge to create early confidence, then quickly move learners from "I can guess this character" to "I can hear it, say it, and use it in Taiwan."

The product loop is:

> Familiarity -> curiosity -> tiny win -> travel usefulness -> review -> confidence.

## Goal 1: Create And Maintain Interest

### What To Do

- Start with recognizable Traditional Chinese words before abstract pronunciation theory.
- Anchor every unit in a Taiwan travel situation.
- Use Japanese explanations that feel conversational, not textbook-like.
- Surface "I know this kanji, but Mandarin uses it differently" moments.
- Give learners visible travel readiness progress, not only lesson completion.

### Core Motivation Formats

#### Daily Taiwan Chinese

A 1-3 minute daily item:

- One useful phrase.
- One Japanese explanation.
- One pronunciation or tone point.
- One Taiwan travel/culture note.
- One instant practice prompt.

Example topic: ordering bubble tea, asking for a bag, finding the MRT platform, checking hotel breakfast time.

#### Travel Quest

A scenario-based unit ending in a task:

- Airport SIM card.
- MRT transfer.
- Night market ordering.
- Convenience store payment.
- Hotel check-in.
- Emergency help.

Each quest should answer: "What can I do in Taiwan after this?"

#### Kanji Detective

Short comparisons for Japanese learners:

- Same-looking and useful: `電話`, `交通`, `銀行`.
- Similar but not identical form: `樂` vs `楽`.
- False friend or usage warning: words that feel familiar but differ in meaning, pronunciation, tone, or Taiwan usage.

## Goal 2: Learn Mandarin Well

### Teaching Principle

Use kanji familiarity to reduce entry friction, but never let it replace pronunciation, listening, and sentence use.

### Required Lesson Loop

Every core lesson should follow this shape:

1. **Hook**: a concrete Taiwan travel situation in Japanese.
2. **Can-do goal**: "After this lesson, you can..."
3. **Core sentence**: one sentence that can actually be used.
4. **Chunk breakdown**: reusable phrase pieces instead of abstract grammar first.
5. **Kanji bridge**: what Japanese learners can recognize, and what they must not assume.
6. **Sound focus**: one pronunciation or tone point only.
7. **Mini practice**: recognition, listening, or recall.
8. **Travel task**: a small scenario prompt.
9. **Review hook**: when this will come back.

### What To Prioritize

- High-frequency chunks: `我要...`, `可以...嗎？`, `請問...在哪裡？`, `有沒有...？`.
- Listening discrimination before production pressure.
- Tone pairs and meaning contrast, especially high-risk pairs such as `買/賣`.
- Traditional Chinese recognition with pinyin and Japanese explanation.
- Taiwan usage notes where wording differs from generic Mandarin material.

### What To Avoid

- Starting with a full pinyin or tone lecture.
- Teaching grammar labels before learners have useful chunks.
- Treating on-yomi similarity as proof of same meaning or pronunciation.
- Machine-generated examples without review.
- Long lessons with no immediate task.

## Goal 3: Retain And Use Mandarin

### Retention Principle

Chabiko should not only ask "Do you remember this word?" It should ask "Can you use this in the right travel situation?"

### Practice Modes For V1

#### Recognition

Learner sees Traditional Chinese and chooses the Japanese meaning, scenario, or caution.

Use for:

- Kanji bridge confidence.
- False friend warnings.
- Taiwan travel signage.

#### Listening

Learner hears or sees pinyin/tone hints and distinguishes meaning.

Use for:

- Tone pairs.
- Similar-sounding survival phrases.
- High-frequency travel words.

If audio is not ready in v1, use pinyin/tone contour prompts as a fallback, but keep the model ready for audio metadata.

#### Recall

Learner sees Japanese scenario prompt and recalls the Chinese chunk or sentence.

Use for:

- Ordering.
- Asking location.
- Payment.
- Requests and polite phrases.

#### Scenario Roleplay

Learner completes a 3-5 turn Taiwan travel exchange.

Use for:

- End-of-unit Travel Quest.
- Integrating phrases, vocabulary, and cultural notes.

### Review Logic

V1 can use local browser state:

- Mark item as new, learning, shaky, or confident.
- Bring back shaky items sooner.
- Mix old items into new scenario practice.
- Show readiness by scenario, not only by raw score.

## Content Formats

### On-yomi Bridge Card

Required fields:

- Traditional Chinese.
- Pinyin.
- Japanese reading/explanation.
- Similarity type.
- Example sentence.
- Tone note.
- Caution or false-friend note.
- Travel scenario tag.
- Review/source metadata.

### Travel Phrase Theater

A short dialogue:

- Setting.
- Characters.
- 3-5 turns.
- Tap-to-reveal pinyin and Japanese explanation.
- Cultural note.
- Related vocabulary.
- Practice prompt.

### Tone Tale

A short mnemonic for one sound or tone contrast. Use sparingly. The tone should feel memorable, not childish.

### Culture Bite

A short Japanese note about a Taiwan custom, place, food, or travel behavior, with 3-5 Chinese terms embedded.

## Metrics

Track learning value through observable behavior:

- Lesson completion rate.
- Return rate after first lesson.
- Practice retry rate.
- Travel Quest completion.
- Scenario readiness by airport, transport, food, shopping, hotel, emergency.
- Recall accuracy for items previously marked shaky.
- User feedback on "I can use this in Taiwan."

Avoid optimizing only for streaks or page views.

## MVP Experiments

### Experiment 1: On-yomi Bridge Retention

Hypothesis: Japanese learners retain vocabulary better when on-yomi similarity is shown with caution notes.

Test: compare recall after one week for entries with and without bridge explanations.

### Experiment 2: Travel Quest Motivation

Hypothesis: scenario quests create higher completion than linear lesson lists.

Test: compare completion for "Night Market Quest" against a standard lesson sequence.

### Experiment 3: Tone Anxiety Reduction

Hypothesis: one-tone-focus lessons reduce dropout compared with upfront tone theory.

Test: compare first-session completion and practice retry rates.

### Experiment 4: Readiness Display

Hypothesis: scenario readiness increases repeat visits.

Test: show readiness by travel situation and track return rate.

## Canonical Rule

If a feature does not help one of these, it should not be v1 priority:

- Keep Japanese learners interested.
- Help them understand and produce useful Mandarin.
- Help them remember and use Mandarin in Taiwan.

