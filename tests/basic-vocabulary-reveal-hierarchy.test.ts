import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * #369 reveal hierarchy and mobile-ergonomics guard.
 *
 * Covers the study surface's post-reveal presentation contract: the answer +
 * illustration still appear together as recall feedback (never a pre-reveal
 * hint), the answer block reads as a clear reading → meaning → comparison
 * hierarchy, and the reveal illustration is capped on small screens so the
 * word, answer, and rating controls stay reachable. These are static-source
 * guards; the equivalent behavioural assertions (image hidden before reveal,
 * answer fields appear after reveal) live in basic-vocabulary-route.test.ts
 * and basic-vocabulary-session-lifecycle.test.ts.
 */

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const sessionSource = readSource(
  '../src/components/vocabulary/BasicVocabularySession.astro',
);
const sessionCss = sessionSource.match(/<style is:global>([\s\S]*?)<\/style>/)![1];
const clientSource = readSource('../src/client/basicVocabularySession.ts');

describe('recall-first reveal stays exact (#356 / #369)', () => {
  it('builds the illustration only inside the answer-revealed gate', () => {
    // The image is answer feedback: it is emitted only when the answer is
    // revealed, so an unanswered card never carries a pre-reveal hint.
    expect(clientSource).toContain(
      'if (entry.illustration && state.answerRevealed) {',
    );
    // The answer block (pinyin/japanese/traditional) is also reveal-gated.
    expect(clientSource).toMatch(/if \(state\.answerRevealed\) \{/);
  });

  it('emits the answer fields in reading → meaning → comparison order', () => {
    // The reveal hierarchy contract: pinyin (reading), then japanese (meaning),
    // then the traditional comparison. The client pushes them in exactly this
    // order into the answer container.
    const pinyinIndex = clientSource.indexOf("className: 'basic-vocabulary-pinyin'");
    const japaneseIndex = clientSource.indexOf("className: 'basic-vocabulary-japanese'");
    const traditionalIndex = clientSource.indexOf(
      "className: 'basic-vocabulary-traditional'",
    );
    expect(pinyinIndex).toBeGreaterThan(0);
    expect(japaneseIndex).toBeGreaterThan(pinyinIndex);
    expect(traditionalIndex).toBeGreaterThan(japaneseIndex);
  });
});

describe('reveal hierarchy CSS (Issue #369)', () => {
  it('visually demotes the traditional comparison below the reading/meaning unit', () => {
    const rule = sessionCss.match(
      /\.basic-vocabulary-traditional\s*\{([\s\S]*?)\n {2}\}/,
    )![1];
    expect(rule).toContain('border-top: 1px solid var(--hairline)');
    expect(rule).toContain('var(--ink-muted)');
  });

  it('keeps long reveal text wrapping and never forces a single-line nowrap', () => {
    // Simplified word, answer rows, and the traditional comparison wrap safely
    // so a long headword never overflows the card at narrow widths.
    for (const selector of [
      'basic-vocabulary-simplified',
      'basic-vocabulary-answer',
      'basic-vocabulary-pinyin',
      'basic-vocabulary-japanese',
      'basic-vocabulary-traditional',
    ]) {
      const rule = sessionCss.match(
        new RegExp(`\\.${selector}\\s*\\{([\\s\\S]*?)\\n  \\}`),
      );
      expect(rule).not.toBeNull();
      // The shared text row rule covers the four answer classes; each still
      // wraps. None of these rules may force white-space: nowrap.
      expect(rule![1]).not.toMatch(/white-space:\s*nowrap/);
    }
  });
});

describe('reveal mobile ergonomics (Issue #369)', () => {
  it('caps the illustration lower on phones so the answer and ratings stay reachable', () => {
    // The desktop/tablet illustration cap is unchanged (locked elsewhere);
    // a narrow-viewport override demotes the reveal illustration on phones.
    const mobileBlock = sessionCss.match(
      /@media \(max-width: 480px\) \{\s*([\s\S]*?)\n {2}\}/,
    )![1];
    const illustrationRule = mobileBlock.match(
      /\.basic-vocabulary-illustration\s*\{([\s\S]*?)\}/,
    );
    expect(illustrationRule).not.toBeNull();
    expect(illustrationRule![1]).toContain('max-height: min(30vh, 240px)');
  });

  it('keeps the reveal rating actions as 44px targets on the card', () => {
    const rule = sessionCss.match(
      /\.basic-vocabulary-action,\s*\.basic-vocabulary-rating\s*\{([\s\S]*?)\n {2}\}/,
    )![1];
    expect(rule).toMatch(/min-height:\s*2\.75rem/);
  });
});
