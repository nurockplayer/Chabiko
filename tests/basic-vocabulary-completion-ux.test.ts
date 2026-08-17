// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
  BasicVocabularyProgressStore,
} from '../src/domain/basicVocabularyProgress';
import { buildLearnerSessionPayload } from '../src/content/learnerSessionPayload';
import { createSessionRoot, SESSION_IDS } from './helpers/basicVocabularyTestData';

const REAL_IDS = SESSION_IDS;
const ITEM_A_SIMPLIFIED = '大家';
const ITEM_B_SIMPLIFIED = '人';
const ITEM_C_SIMPLIFIED = '朋友';

/** The production corpus total surfaced by the SSR payload, independent of the
 * small ID subsets the focused tests use. */
const CORPUS_TOTAL = buildLearnerSessionPayload().totalCount;

/** Wrap selectSession on the prototype so focused tests can prove which calls
 * a user action triggers (init, continue) and which it does not (replay). */
const originalSelectSession = BasicVocabularyProgressStore.prototype.selectSession;
let selectCalls: Array<{ ids: string[]; size: number; result: string[] }> = [];

function spySelectSession(): void {
  selectCalls = [];
  BasicVocabularyProgressStore.prototype.selectSession = function (
    this: BasicVocabularyProgressStore,
    ids: readonly string[],
    sessionSize: number,
  ) {
    const result = originalSelectSession.call(this, ids, sessionSize);
    selectCalls.push({ ids: [...ids], size: sessionSize, result: [...result] });
    return result;
  };
}

function restoreSelectSession(): void {
  BasicVocabularyProgressStore.prototype.selectSession = originalSelectSession;
}

function rootWith(ids: readonly string[] = REAL_IDS): HTMLElement {
  const root = createSessionRoot([...ids]);
  // The production Astro component demotes reset under a native <details> block
  // outside the card. Mirror that exact hierarchy so the reset test proves the
  // real markup contract rather than the shared helper's simplified root.
  root.innerHTML =
    '<p data-total></p><p data-summary></p><p data-progress aria-live="polite"></p><div data-card></div>' +
    '<details class="basic-vocabulary-reset"><summary>学習データの管理</summary><button class="basic-vocabulary-reset-button" data-action="reset">学習記録をリセット</button></details>' +
    root.querySelector('#basic-vocabulary-data')!.outerHTML;
  return root;
}

function reveal(root: HTMLElement): void {
  (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
}

function rate(root: HTMLElement, rating: 'again' | 'unsure' | 'known'): void {
  (root.querySelector(`[data-rating="${rating}"]`) as HTMLButtonElement).click();
}

function completeSession(root: HTMLElement, count: number): void {
  for (let i = 0; i < count; i++) {
    reveal(root);
    rate(root, 'known');
  }
}

function seedProgress(
  items: Record<string, { status: 'new' | 'learning' | 'learned'; knownStreak: number }>,
): void {
  window.localStorage.setItem(
    BASIC_VOCABULARY_PROGRESS_KEY,
    JSON.stringify({ version: 1, items }),
  );
}

function completionStats(root: HTMLElement): Record<string, string> {
  const stats: Record<string, string> = {};
  root
    .querySelectorAll('.basic-vocabulary-completion-stat')
    .forEach((row) => {
      const label = row.querySelector('dt')?.textContent ?? '';
      const value = row.querySelector('dd')?.textContent ?? '';
      stats[label] = value;
    });
  return stats;
}

afterEach(() => {
  restoreSelectSession();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe('basic vocabulary completion UX (Issue #277)', () => {
  it('shows exact dynamic active labels and no ambiguous 対象 / count-only presentation', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Frozen active-session copy: 全{totalCount}語, 今回 {done} / {size}語, and
    // the unchanged status summary.
    expect(root.querySelector('[data-total]')?.textContent).toBe(`全${CORPUS_TOTAL}語`);
    expect(root.querySelector('[data-progress]')?.textContent).toBe('今回 0 / 3語');
    expect(root.querySelector('[data-summary]')?.textContent).toBe(
      '新規 3語・学習中 0語・習得済み 0語',
    );

    // No legacy ambiguous labels.
    expect(root.textContent).not.toContain('対象');
    expect(root.textContent).not.toMatch(/(?:^|\s)\d+ \/ \d+ 語/);

    reveal(root);
    rate(root, 'known');
    expect(root.querySelector('[data-progress]')?.textContent).toBe('今回 1 / 3語');
  });

  it('derives all five completion metrics from mixed new/learning/learned start states', () => {
    // Seed: 大家 new, 人 learning (streak 1), 朋友 learned (streak 2).
    seedProgress({
      [REAL_IDS[0]]: { status: 'new', knownStreak: 0 },
      [REAL_IDS[1]]: { status: 'learning', knownStreak: 1 },
      [REAL_IDS[2]]: { status: 'learned', knownStreak: 2 },
    });
    const root = rootWith();
    initBasicVocabularySession(root);

    // 人 is prioritized (learning) and leads the window.
    expect(root.querySelector('.basic-vocabulary-simplified')?.textContent).toBe(
      ITEM_B_SIMPLIFIED,
    );

    // Rate every selected unique ID once with known:
    // 人 learning(1) → learned(2); 大家 new → learning(1); 朋友 learned → learned(3).
    completeSession(root, 3);

    expect(root.textContent).toContain('今回の3語を完了しました');
    const stats = completionStats(root);
    expect(stats['新しく学んだ']).toBe('1語'); // 大家
    expect(stats['復習した']).toBe('2語'); // 人 + 朋友
    expect(stats['習得できた']).toBe('1語'); // 人
    expect(stats['出会った単語']).toBe(`3 / ${CORPUS_TOTAL}語`);
    expect(stats['習得済み']).toBe('2語'); // 人 + 朋友
  });

  it('keeps zero-value metrics present instead of hiding them', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // All three start new and each known rating only reaches learning (streak 1),
    // so reviewed/newly-learned/learned counts stay at zero.
    completeSession(root, 3);

    expect(root.textContent).toContain('今回の3語を完了しました');
    const stats = completionStats(root);
    expect(stats['新しく学んだ']).toBe('3語');
    expect(stats['復習した']).toBe('0語');
    expect(stats['習得できた']).toBe('0語');
    expect(stats['出会った単語']).toBe(`3 / ${CORPUS_TOTAL}語`);
    expect(stats['習得済み']).toBe('0語');
  });

  it('counts unique IDs despite again/unsure requeues', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // A(大家) again → requeued at index 2; B(人) unsure → appended at end;
    // C(朋友) known; then A and B each come back and are completed with known.
    reveal(root);
    rate(root, 'again');
    reveal(root);
    rate(root, 'unsure');
    reveal(root);
    rate(root, 'known');
    reveal(root);
    rate(root, 'known');
    reveal(root);
    rate(root, 'known');

    // Requeues never double-count a unique ID: 3 unique IDs completed.
    expect(root.textContent).toContain('今回の3語を完了しました');
    expect(root.querySelector('[data-progress]')?.textContent).toContain('今回 3 / 3語');
    const stats = completionStats(root);
    expect(stats['新しく学んだ']).toBe('3語');
    expect(stats['復習した']).toBe('0語');
  });

  it('primary continue re-reads the store selector and can introduce unseen IDs', () => {
    spySelectSession();

    const payload = buildLearnerSessionPayload();
    const root = rootWith(payload.ids);
    initBasicVocabularySession(root);

    // Init selected the first bounded window of 10 unseen IDs.
    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0].ids).toHaveLength(payload.ids.length);
    expect(selectCalls[0].size).toBe(10);
    expect(selectCalls[0].result).toHaveLength(10);
    expect(selectCalls[0].result.every((id) => payload.ids.indexOf(id) < 10)).toBe(true);

    // Complete the 10-item session (each item reaches learning streak 1).
    completeSession(root, 10);
    expect(root.textContent).toContain('今回の10語を完了しました');

    // Continue re-runs the canonical selector over the full corpus.
    (root.querySelector('[data-action="continue"]') as HTMLButtonElement).click();
    expect(selectCalls).toHaveLength(2);
    expect(selectCalls[1].ids).toHaveLength(payload.ids.length);
    expect(selectCalls[1].size).toBe(10);
    // The unseen quota now pulls in corpus items past index 10.
    expect(selectCalls[1].result.some((id) => payload.ids.indexOf(id) >= 10)).toBe(true);
    // The fresh session starts at the first reveal button.
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));
  });

  it('replay starts from the exact completed IDs in the same order without calling the selector', () => {
    spySelectSession();

    const root = rootWith();
    initBasicVocabularySession(root);
    expect(selectCalls).toHaveLength(1);

    // Complete the 3-item session with known ratings — order stays 大家, 人, 朋友.
    const firstOrder: string[] = [];
    for (let i = 0; i < 3; i++) {
      firstOrder.push(
        root.querySelector('.basic-vocabulary-simplified')?.textContent ?? '',
      );
      reveal(root);
      rate(root, 'known');
    }
    expect(firstOrder).toEqual([
      ITEM_A_SIMPLIFIED,
      ITEM_B_SIMPLIFIED,
      ITEM_C_SIMPLIFIED,
    ]);
    expect(root.textContent).toContain('今回の3語を完了しました');

    // Replay must not re-run the selector.
    (root.querySelector('[data-action="replay"]') as HTMLButtonElement).click();
    expect(selectCalls).toHaveLength(1);
    // Focus moves to the first 答えを見る button.
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));

    // The replayed session repeats the exact completed order.
    const replayOrder: string[] = [];
    for (let i = 0; i < 3; i++) {
      replayOrder.push(
        root.querySelector('.basic-vocabulary-simplified')?.textContent ?? '',
      );
      reveal(root);
      rate(root, 'known');
    }
    expect(replayOrder).toEqual(firstOrder);
    // The replayed session completes again and focus returns to continue.
    expect(document.activeElement).toBe(root.querySelector('[data-action="continue"]'));
  });

  it('continue and replay preserve rating transitions and per-rating writes', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // First session: each item reaches learning streak 1.
    completeSession(root, 3);
    const afterFirst = JSON.parse(
      window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!,
    );
    expect(afterFirst.items[REAL_IDS[0]]).toEqual({ status: 'learning', knownStreak: 1 });

    // Replay, then rate 大家 again — transitions to learned streak 2 and writes once.
    (root.querySelector('[data-action="replay"]') as HTMLButtonElement).click();
    reveal(root);
    rate(root, 'known');
    const afterReplayRate = JSON.parse(
      window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!,
    );
    expect(afterReplayRate.items[REAL_IDS[0]]).toEqual({ status: 'learned', knownStreak: 2 });
    expect(Object.keys(afterReplayRate.items)).toHaveLength(3);

    // Complete the replay session (人 and 朋友 also reach learned streak 2).
    completeSession(root, 2);
    expect(root.textContent).toContain('今回の3語を完了しました');

    // Continue re-selects over the now-learned corpus; the leading item is 大家.
    (root.querySelector('[data-action="continue"]') as HTMLButtonElement).click();
    expect(root.querySelector('.basic-vocabulary-simplified')?.textContent).toBe(
      ITEM_A_SIMPLIFIED,
    );
    reveal(root);
    rate(root, 'known');
    const afterContinueRate = JSON.parse(
      window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)!,
    );
    expect(afterContinueRate.items[REAL_IDS[0]]).toEqual({ status: 'learned', knownStreak: 3 });
    expect(Object.keys(afterContinueRate.items)).toHaveLength(3);
  });

  it('renders exactly the continue/replay actions and no もう一度学ぶ / restart', () => {
    const root = rootWith();
    initBasicVocabularySession(root);
    completeSession(root, 3);

    const actions = root.querySelectorAll(
      '.basic-vocabulary-completion-actions [data-action]',
    );
    expect(actions).toHaveLength(2);
    expect(root.querySelector('[data-action="continue"]')?.textContent).toBe('次の3語を学ぶ');
    expect(root.querySelector('[data-action="replay"]')?.textContent).toBe('今回の3語を復習する');
    expect(root.textContent).not.toContain('もう一度学ぶ');
    expect(root.querySelector('[data-action="restart"]')).toBeNull();
  });

  it('moves focus to continue on completion and to reveal after continue/replay, announcing once', () => {
    const root = rootWith();
    initBasicVocabularySession(root);
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    completeSession(root, 3);
    expect(document.activeElement).toBe(root.querySelector('[data-action="continue"]'));

    // Single polite announcement carries the dynamic completion title.
    const progressEl = root.querySelector('[aria-live="polite"]') as HTMLElement;
    const sr = progressEl.querySelector('.basic-vocabulary-sr-only');
    expect(sr?.textContent).toBe('今回の3語を完了しました');
    expect(progressEl.textContent).toBe('今回 3 / 3語今回の3語を完了しました');
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    // Continue moves focus to the first 答えを見る button.
    (root.querySelector('[data-action="continue"]') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));

    // Complete again and replay — focus returns to 答えを見る.
    completeSession(root, 3);
    (root.querySelector('[data-action="replay"]') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it('keeps the native details/reset hierarchy with unchanged confirm/cancel and key isolation', () => {
    const root = rootWith();
    initBasicVocabularySession(root);

    // Native <details> demotes reset outside the active/completion card.
    const details = root.querySelector('details.basic-vocabulary-reset');
    expect(details).not.toBeNull();
    expect(details?.querySelector('summary')?.textContent).toBe('学習データの管理');
    const card = root.querySelector('[data-card]')!;
    expect(card.contains(details)).toBe(false);
    const resetButton = root.querySelector('[data-action="reset"]') as HTMLButtonElement;
    expect(resetButton.textContent).toBe('学習記録をリセット');

    // Make progress and seed an unrelated key that reset must not touch.
    reveal(root);
    rate(root, 'known');
    window.localStorage.setItem('chabiko_theme', 'dark');

    // Cancel keeps progress.
    window.confirm = () => false;
    resetButton.click();
    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).not.toBeNull();
    expect(window.localStorage.getItem('chabiko_theme')).toBe('dark');

    // Accept clears only the exact basic-vocabulary key, restarts, and announces.
    window.confirm = () => true;
    resetButton.click();
    expect(window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY)).toBeNull();
    expect(window.localStorage.getItem('chabiko_theme')).toBe('dark');
    expect(root.querySelector('[data-progress]')?.textContent).toMatch(/^今回 0 \/ 3語/);
    expect(document.activeElement).toBe(root.querySelector('[data-action="reveal"]'));
    const ann = root.querySelector('.basic-vocabulary-sr-only');
    expect(ann?.textContent).toBe('この単語コースの学習記録をリセットしました');
  });

  it('uses intrinsic completion height and mobile containment declarations', async () => {
    const source = await readFile(
      'src/components/vocabulary/BasicVocabularySession.astro',
      'utf8',
    );
    const css = source.match(/<style is:global>([\s\S]*?)<\/style>/)![1];

    // Active card keeps its bounded min-height; completion uses intrinsic height.
    expect(css).toMatch(
      /\.basic-vocabulary-card\s*\{[^}]*min-height:\s*clamp\(22rem,\s*66vh,\s*39rem\)/,
    );
    expect(css).toMatch(
      /\.basic-vocabulary-completion\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*100%/,
    );
    expect(css).not.toMatch(/\.basic-vocabulary-completion\s*\{[^}]*min-height/);

    // Both completion actions share the ≥44px action height and are visually
    // distinguishable from each other.
    expect(css).toMatch(
      /\.basic-vocabulary-action,\s*\.basic-vocabulary-rating\s*\{[^}]*min-height:\s*2\.75rem/,
    );
    expect(css).toMatch(
      /\.basic-vocabulary-continue\s*\{[^}]*background:\s*var\(--coral\)/,
    );
    expect(css).toMatch(
      /\.basic-vocabulary-replay\s*\{[^}]*background:\s*var\(--paper\)/,
    );

    // Mobile containment: no clipping/overflow for long titles, ratings, and the
    // compact stat grid.
    expect(css).toMatch(
      /\.basic-vocabulary-completion-title\s*\{[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(css).toMatch(
      /\.basic-vocabulary-rating\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(css).toMatch(
      /\.basic-vocabulary-completion-stats\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0,\s*1fr\)/,
    );
    expect(css).not.toMatch(
      /\.basic-vocabulary-completion-stat dd\s*\{[^}]*white-space:\s*nowrap/,
    );
  });
});
