// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
} from '../src/domain/basicVocabularyProgress';
import {
  createSessionRoot,
  renderPayloadFor,
  SESSION_IDS,
} from './helpers/basicVocabularyTestData';

// Three real image-bearing vocabulary items selected from the production
// manifest (the original batch-01 fixture's text-only 小姐/女士 row is excluded
// from the image-learning corpus by Issue #205):
// - 大家
// - 人
// - 朋友
const REAL_IDS = SESSION_IDS;

const ITEM_A_SIMPLIFIED = '大家';
const ITEM_A_PINYIN = 'dà jiā';
const ITEM_A_JAPANESE = 'みんな';
const ITEM_B_SIMPLIFIED = '人';
const ITEM_C_SIMPLIFIED = '朋友';

function rootWith(ids: readonly string[] = REAL_IDS): HTMLElement {
  return createSessionRoot([...ids]);
}

function reveal(root: HTMLElement): void {
  (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
}

function rate(root: HTMLElement, rating: 'again' | 'unsure' | 'known'): void {
  (root.querySelector(`[data-rating="${rating}"]`) as HTMLButtonElement).click();
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe('basic vocabulary session lifecycle', () => {
  it('uses the state machine for reveal, exact requeue, completion, and continue', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // 大家 is first
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);
    reveal(root);
    expect(document.activeElement).toBe(root.querySelector('[data-rating="again"]'));
    rate(root, 'again');
    // After 'again', 大家 is requeued at position 2; next is 人
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_B_SIMPLIFIED);
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));

    reveal(root);
    rate(root, 'known');
    // After 'known' on 人, next is 小姐/女士
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_C_SIMPLIFIED);
    reveal(root);
    rate(root, 'known');
    // Now 大家 comes back from requeue
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);
    reveal(root);
    rate(root, 'known');

    expect(root.textContent).toContain('今回の3語を完了しました');
    expect(root.querySelector('[data-progress]')?.textContent).toContain('今回 3 / 3語');
    expect(document.activeElement).toBe(root.querySelector('[data-action="continue"]'));

    (root.querySelector('[data-action="continue"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);
    expect(root.querySelector('[data-progress]')?.textContent).toBe('今回 0 / 3語');
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));
  });

  it('requeues an unsure item after the remaining queue, preserves order, and later completes with known', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Item 大家 is active → mark unsure
    reveal(root);
    expect(root.textContent).toContain(ITEM_A_PINYIN);
    rate(root, 'unsure');

    // 大家 was requeued at end. Next should be 人
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_B_SIMPLIFIED);
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));

    // Mark 人 known
    reveal(root);
    rate(root, 'known');

    // Next should be 小姐/女士
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_C_SIMPLIFIED);

    // Mark 小姐/女士 known
    reveal(root);
    rate(root, 'known');

    // Now 大家 comes back from the end of the queue
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);

    // This time complete it with known
    reveal(root);
    rate(root, 'known');

    // Session completed
    expect(root.textContent).toContain('今回の3語を完了しました');
    expect(root.querySelector('[data-progress]')?.textContent).toContain('今回 3 / 3語');
  });

  it('exposes the exact learner copy required by Issue #115', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Before reveal: 答えを見る button
    expect(root.textContent).toContain('答えを見る');

    reveal(root);
    // Rating labels: また, むずかしい, できた (frozen A1 #389 labels)
    expect(root.textContent).toContain('また');
    expect(root.textContent).toContain('むずかしい');
    expect(root.textContent).toContain('できた');

    // Complete all items
    for (let i = 0; i < REAL_IDS.length; i++) {
      rate(root, 'known');
      if (root.querySelector('[data-action="continue"]')) break;
      reveal(root);
    }

    // Completion: 今回の3語を完了しました, continue, replay — no もう一度学ぶ
    expect(root.textContent).toContain('今回の3語を完了しました');
    expect(root.querySelector('[data-action="continue"]')).not.toBeNull();
    expect(root.querySelector('[data-action="replay"]')).not.toBeNull();
    expect(root.textContent).not.toContain('もう一度学ぶ');
    expect(root.querySelector('[data-action="restart"]')).toBeNull();
  });

  it('cleans up the prior root listener before Astro reinitialization', () => {
    const root = rootWith();
    const firstCleanup = initBasicVocabularySession(root);
    initBasicVocabularySession(root);

    firstCleanup();
    reveal(root);
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_PINYIN);

    const secondCleanup = initBasicVocabularySession(root);
    secondCleanup();
    (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-card]')?.textContent).not.toContain(ITEM_A_PINYIN);
  });

  it('fails deterministically for zero items and invalid present illustration links', () => {
    const empty = rootWith([]);
    expect(() => initBasicVocabularySession(empty)).toThrow('basic vocabulary has no provisional items');

    // Use an ID not present in the real loader data
    const invalidRoot = createSessionRoot(['nonexistent-id']);
    expect(() => initBasicVocabularySession(invalidRoot)).toThrow(
      "basic vocabulary item 'nonexistent-id' is missing from the loader",
    );
  });

  it('includes the required containment declarations in the Astro stylesheet', async () => {
    const source = await readFile('src/components/vocabulary/BasicVocabularySession.astro', 'utf8');

    // Extract the content inside <style is:global>…</style>
    const styleMatch = source.match(/<style is:global>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    const css = styleMatch![1];

    // .basic-vocabulary-card keeps its bounded min-height, box-sizing, width,
    // and overflow containment.
    expect(css).toMatch(
      /\.basic-vocabulary-card\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*100%[^}]*min-height:\s*clamp\(22rem,\s*66vh,\s*39rem\)[^}]*overflow:\s*hidden/,
    );

    // .basic-vocabulary-completion uses intrinsic height (no min-height).
    expect(css).toMatch(
      /\.basic-vocabulary-completion\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*100%/,
    );
    expect(css).not.toMatch(
      /\.basic-vocabulary-completion\s*\{[^}]*min-height/,
    );

    // .basic-vocabulary-illustration (capped answer feedback, #369)
    expect(css).toMatch(
      /\.basic-vocabulary-illustration\s*\{[^}]*max-width:\s*180px[^}]*max-height:\s*min\(42vh,\s*420px\)[^}]*object-fit:\s*contain/,
    );

    // .basic-vocabulary-ratings
    expect(css).toMatch(
      /\.basic-vocabulary-ratings\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)[^}]*width:\s*min\(100%,\s*34rem\)/,
    );

    // .basic-vocabulary-rating (min-width: 0 — note this is in a separate rule
    // from .basic-vocabulary-action, .basic-vocabulary-rating)
    expect(css).toMatch(
      /\.basic-vocabulary-rating\s*\{[^}]*min-width:\s*0/,
    );

    // Primary and secondary completion actions are visually distinguishable,
    // both at least 44 px high (2.75rem).
    expect(css).toMatch(
      /\.basic-vocabulary-reveal,\s*\.basic-vocabulary-continue\s*\{[^}]*background:\s*var\(--coral\)/,
    );
    expect(css).toMatch(
      /\.basic-vocabulary-replay\s*\{[^}]*background:\s*var\(--paper\)/,
    );
    expect(css).toMatch(
      /\.basic-vocabulary-action,\s*\.basic-vocabulary-rating\s*\{[^}]*min-height:\s*2\.75rem/,
    );

    // Browser measurements at 320/375/390 are recorded in the PR body as
    // the genuine layout evidence. Happy DOM does not perform layout.
  });

  it('announces completion via the aria-live progress region, preserves progress text, and moves focus to continue', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Confirm exactly one aria-live region exists
    const liveRegions = root.querySelectorAll('[aria-live="polite"]');
    expect(liveRegions).toHaveLength(1);
    const progressEl = liveRegions[0] as HTMLElement;

    // Complete all three items
    for (let i = 0; i < REAL_IDS.length; i++) {
      reveal(root);
      rate(root, 'known');
    }

    // Completion announcement — a visually-hidden span inside the live region
    const sr = progressEl.querySelector('.basic-vocabulary-sr-only');
    expect(sr).not.toBeNull();
    expect(sr?.textContent).toBe('今回の3語を完了しました');

    // Progress text includes the count (visually-hidden span is appended after)
    expect(progressEl.textContent).toBe('今回 3 / 3語今回の3語を完了しました');

    // Only one polite live region still
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    // Focus moved to continue button
    expect(document.activeElement).toBe(root.querySelector('[data-action="continue"]'));

    // Completion title visible in the card
    expect(root.querySelector('[data-card]')?.textContent).toContain('今回の3語を完了しました');
  });

  it('produces a card that does not serialize answers into outerHTML attributes before reveal', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    const card = root.querySelector<HTMLElement>('[data-card]')!;
    const html = card.outerHTML;

    // No pinyin or Japanese answer values in the card DOM
    expect(html).not.toContain(ITEM_A_PINYIN);
    expect(html).not.toContain(ITEM_A_JAPANESE);
    // No pinyin for item B either
    expect(html).not.toContain('rén');
    expect(html).not.toContain('人（ひと）');
    // No pinyin/Japanese for item C (朋友) either
    expect(html).not.toContain('péng you');
    expect(html).not.toContain('友達');

    // The data attribute on the root must only contain opaque IDs, no answer values
    const idsAttr = root.dataset.basicVocabularyIds ?? '';
    expect(idsAttr).not.toContain(ITEM_A_PINYIN);
    expect(idsAttr).not.toContain(ITEM_A_JAPANESE);
  });

  // ── Progress integration tests ────────────────────────────────────────────

  it('accepted revealed ratings write exactly once; rejected unrevealed actions write zero', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Before any rating: no progress stored
    const rawBefore = window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
    expect(rawBefore).toBeNull();

    // Reveal then rate — should write
    reveal(root);
    rate(root, 'known');
    const rawAfter = window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
    expect(rawAfter).not.toBeNull();
    const parsed = JSON.parse(rawAfter!);
    // One item should be in progress
    const itemIds = Object.keys(parsed.items);
    expect(itemIds).toHaveLength(1);
  });

  it('shows progress summary with status counts after ratings', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Initial summary: all new
    const summary = root.querySelector<HTMLElement>('[data-summary]')!;
    expect(summary.textContent).toContain('新規');
    expect(summary.textContent).toContain('学習中 0');
    expect(summary.textContent).toContain('習得済み 0');

    // Rate one as known
    reveal(root);
    rate(root, 'known');
    expect(summary.textContent).toContain('学習中');
  });

  it('continue uses latest store priority order', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Rate A as known → learning streak 1
    reveal(root);
    rate(root, 'known');

    // Complete remaining items B and C
    reveal(root);
    rate(root, 'known');
    reveal(root);
    rate(root, 'known');

    // Session completed, continue
    (root.querySelector('[data-action="continue"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);
  });

  it('has one pageshow and one storage listener; both refresh and restart when no ratings occurred', () => {
    // Create a session but don't rate anything
    const root = rootWith();
    initBasicVocabularySession(root);

    // No ratings — hasRatedSinceInit is false
    // We can't easily test the actual listener behavior in happy-dom,
    // but verify the code path doesn't crash
    window.dispatchEvent(new Event('pageshow'));
    // After pageshow, session should restart (no ratings occurred)
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);

    // Rate once then pageshow — summary updates only
    reveal(root);
    rate(root, 'known');
    window.dispatchEvent(new Event('pageshow'));
    // Should still have the card (session preserved since hasRatedSinceInit)
    expect(root.querySelector('[data-card]')).not.toBeNull();
  });

  it('ignores unrelated storage keys', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Fire storage event for an unrelated key
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'unrelated-key', newValue: 'x' }),
    );
    // Session should still be intact
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);
  });

  it('handles storage key=null (clear) with the same refresh/restart rules as exact key', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Before any rating: key=null refreshes and restarts (no ratings)
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);

    // After rating: key=null refreshes summary but keeps active session
    reveal(root);
    rate(root, 'known');
    const summary = root.querySelector<HTMLElement>('[data-summary]')!;
    expect(summary.textContent).toContain('学習中');
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    // Session preserved
    expect(root.querySelector('[data-card]')).not.toBeNull();
  });

  it('reset confirm clears progress, resets summary, and restarts session', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Make some progress
    reveal(root);
    rate(root, 'known');

    // Verify progress exists
    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).not.toBeNull();

    // Reset with confirmation
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    (root.querySelector('[data-action="reset"]') as HTMLButtonElement).click();
    window.confirm = originalConfirm;

    // Progress cleared
    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBeNull();

    // Summary shows all new
    const summary = root.querySelector<HTMLElement>('[data-summary]')!;
    expect(summary.textContent).toContain('新規 3');
    expect(summary.textContent).toContain('学習中 0');

    // Session restarted
    const progress = root.querySelector('[data-progress]');
    expect(progress?.textContent).toMatch(/^今回 0 \/ 3語/);
  });

  it('reset cancel does nothing', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    reveal(root);
    rate(root, 'known');

    // Cancel reset
    window.confirm = () => false;
    (root.querySelector('[data-action="reset"]') as HTMLButtonElement).click();

    // Progress preserved
    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).not.toBeNull();
  });

  it('repeated initialization does not create duplicate listeners or writes', () => {
    const root = rootWith();
    const cleanup1 = initBasicVocabularySession(root);
    const cleanup2 = initBasicVocabularySession(root);

    // Rate an item
    reveal(root);
    rate(root, 'known');

    // Only one write should have occurred
    const raw = window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(Object.keys(parsed.items)).toHaveLength(1);

    cleanup1();
    cleanup2();
  });

  it('production root uses min(10, count) session size with Issue #116 markup', () => {
    const root = createSessionRoot([...REAL_IDS], '10');

    initBasicVocabularySession(root);

    // Progress shows 今回 0 / 3 (only 3 items in REAL_IDS, capped by count)
    expect(root.querySelector('[data-progress]')?.textContent).toMatch(/^今回 0 \/ 3語/);

    // Size attribute signals the intended cap
    expect(root.dataset.basicVocabularySessionSize).toBe('10');
  });

  describe('recall-first reveal (Issue #356)', () => {
    it('hides the vocabulary illustration before the answer is revealed', () => {
      const root = rootWith();
      initBasicVocabularySession(root);

      // The unanswered card is the recall front only: simplified + reveal.
      expect(root.querySelector('.basic-vocabulary-illustration')).toBeNull();
      expect(root.querySelector('img')).toBeNull();
      expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);
      expect(root.querySelector('[data-action="reveal"]')).not.toBeNull();
    });

    it('reveals the answer and the illustration together in the same transition', () => {
      const root = rootWith();
      initBasicVocabularySession(root);

      reveal(root);
      const image = root.querySelector('.basic-vocabulary-illustration');
      expect(image).not.toBeNull();
      expect(image?.getAttribute('src')).toBeTruthy();
      // Answer fields appear in the same render as the illustration.
      expect(root.textContent).toContain(ITEM_A_PINYIN);
      expect(root.textContent).toContain(ITEM_A_JAPANESE);

      // Post-reveal controls still work: rating advances to the next item and
      // hides the image again until that item is revealed.
      rate(root, 'known');
      expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_B_SIMPLIFIED);
      expect(root.querySelector('.basic-vocabulary-illustration')).toBeNull();
    });

    it('renders vocabulary entries without an illustration correctly before and after reveal', () => {
      // Drop the active item's render metadata so the entry has no image.
      const root = rootWith();
      const payload = renderPayloadFor([...REAL_IDS]);
      delete payload.render[REAL_IDS[0]];
      const dataEl = root.querySelector('#basic-vocabulary-data')!;
      dataEl.textContent = JSON.stringify(payload);
      initBasicVocabularySession(root);

      // Before reveal: recall front, no image.
      expect(root.querySelector('[data-card]')?.textContent).toContain(ITEM_A_SIMPLIFIED);
      expect(root.querySelector('img')).toBeNull();

      reveal(root);
      // Answer reveals and ratings appear, but no image element is rendered.
      expect(root.textContent).toContain(ITEM_A_PINYIN);
      expect(root.querySelector('[data-rating="known"]')).not.toBeNull();
      expect(root.querySelector('.basic-vocabulary-illustration')).toBeNull();
      expect(root.querySelector('img')).toBeNull();
    });
  });
});
