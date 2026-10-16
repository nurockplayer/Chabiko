// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initHskQuiz } from '../src/client/hskQuiz';
import { readHskQuizBest } from '../src/domain/hskQuizBestScore';

const entries = Array.from({ length: 25 }, (_, i) => ({ id: `w${i}`, simplified: String.fromCodePoint(0x4e00 + i * 3), japanese: `いみ${i}`, pinyin: `pinyin${i}`, simplifiedStatus: 'authored' }));
let cleanup: (() => void) | undefined;
function root() {
  const el = document.createElement('section');
  el.dataset.hskQuiz = JSON.stringify({ level: 1, ids: entries.map((e) => e.id), answerSource: '/data/hsk/1.json' });
  el.innerHTML = `<form data-quiz-setup><input name="length" value="10"><input name="direction" value="zh-to-ja"><button data-quiz-start type="submit" disabled>Start</button></form><p data-quiz-status role="status"></p><div data-quiz-card></div>`;
  document.body.replaceChildren(el);
  return el;
}
const click = (el: HTMLElement, selector: string) => el.querySelector<HTMLButtonElement>(selector)!.click();
async function loaded(el: HTMLElement) {
  cleanup = initHskQuiz(el, () => 0.5);
  await vi.waitFor(() => expect(el.querySelector<HTMLButtonElement>('[data-quiz-start]')!.disabled).toBe(false));
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 1, entries }) }));
});
afterEach(() => { cleanup?.(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('HSK quiz browser session', () => {
  for (const direction of ['zh-to-ja', 'ja-to-zh']) {
    it(`conceals answers, scores once, reveals pronunciation, completes and resets: ${direction}`, async () => {
      const el = root();
      el.querySelector<HTMLInputElement>('[name="direction"]')!.value = direction;
      await loaded(el);
      expect(el.innerHTML).not.toContain('pinyin');
      expect(el.querySelectorAll('[data-pronunciation-button]')).toHaveLength(0);
      click(el, '[data-quiz-start]');
      let correct = 0;
      let missed = 0;
      for (let i = 0; i < 10; i++) {
        expect(el.querySelectorAll('[data-action="answer"]')).toHaveLength(4);
        expect(el.querySelector('.quiz-pinyin')).toBeNull();
        expect(el.querySelector('[data-pronunciation-text]')).toBeNull();
        expect(document.activeElement).toBe(el.querySelector('h2'));
        const prompt = el.querySelector('h2')!.textContent;
        const entry = entries.find((e) => (direction === 'zh-to-ja' ? e.simplified : e.japanese) === prompt)!;
        const correctLabel = direction === 'zh-to-ja' ? entry.japanese : entry.simplified;
        const options = [...el.querySelectorAll<HTMLButtonElement>('[data-action="answer"]')];
        const picked = options.find((option) => i % 2 === 0 ? option.textContent === correctLabel : option.textContent !== correctLabel)!;
        const chosenCorrect = picked.textContent === correctLabel;
        if (chosenCorrect) correct++; else missed++;
        picked.click();
        picked.click(); // Detached stale controls cannot commit twice.
        expect(el.querySelector('.quiz-feedback')!.textContent).toContain(chosenCorrect ? '○ 正解' : '× 不正解');
        expect(el.querySelector('.quiz-pinyin')!.textContent).toBe(entry.pinyin);
        expect(el.querySelector('[data-pronunciation-text]')!.getAttribute('data-pronunciation-text')).toBe(entry.simplified);
        expect(el.querySelector('[data-pronunciation-lang]')!.getAttribute('data-pronunciation-lang')).toBe('zh-CN');
        expect(el.querySelectorAll('[data-correct]')).toHaveLength(1);
        expect(document.activeElement).toBe(el.querySelector('[data-action="next"]'));
        expect(readHskQuizBest(1)).toBeNull();
        click(el, '[data-action="next"]');
      }
      expect(el.querySelector('h2')!.textContent).toBe('テスト結果');
      expect(el.querySelector('.quiz-feedback')!.textContent).toBe(`${correct} / 10問正解（50%）`);
      expect(el.querySelectorAll('.quiz-missed li')).toHaveLength(missed);
      expect(readHskQuizBest(1)).toMatchObject({ correct: 5, total: 10, direction });
      expect(el.querySelector('a')!.getAttribute('href')).toBe('/vocabulary/hsk/1/');
      click(el, '[data-action="retry"]');
      expect(el.querySelector('[data-quiz-card]')!.textContent).toBe('');
      expect(document.activeElement).toBe(el.querySelector('[data-quiz-start]'));
      click(el, '[data-quiz-start]');
      expect(el.querySelector('[data-quiz-status]')!.textContent).toBe('1 / 10問 · 正解 0問');
    });
  }
  it('allows 20 questions and fails closed for insufficient pools', async () => {
    const el = root();
    el.querySelector<HTMLInputElement>('[name="length"]')!.value = '20';
    await loaded(el);
    click(el, '[data-quiz-start]');
    expect(el.querySelector('[data-quiz-status]')!.textContent).toContain('/ 20問');
    cleanup?.();
    const short = root();
    const subset = entries.slice(0, 9);
    short.dataset.hskQuiz = JSON.stringify({ level: 1, ids: subset.map((e) => e.id), answerSource: '/data/hsk/1.json' });
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ version: 1, entries: subset }) } as Response);
    await loaded(short);
    click(short, '[data-quiz-start]');
    expect(short.querySelectorAll('[data-action="answer"]')).toHaveLength(0);
    expect(short.textContent).toContain('十分な問題を作れません');
  });
  it('leaves start disabled on failed or mismatched loading', async () => {
    for (const response of [{ ok: false }, { ok: true, json: async () => ({ version: 1, entries: [] }) }]) {
      const el = root();
      vi.mocked(fetch).mockResolvedValue(response as Response);
      cleanup = initHskQuiz(el);
      await vi.waitFor(() => expect(el.textContent).toContain('読み込めませんでした'));
      expect(el.querySelector<HTMLButtonElement>('[data-quiz-start]')!.disabled).toBe(true);
      cleanup();
    }
  });
  it('aborts stale loads when remounted', async () => {
    const el = root();
    let resolveFirst!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    initHskQuiz(el);
    await loaded(el);
    click(el, '[data-quiz-start]');
    resolveFirst({ ok: false } as Response);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(el.querySelectorAll('[data-action="answer"]')).toHaveLength(4);
    expect(el.textContent).not.toContain('読み込めませんでした');
  });
});
