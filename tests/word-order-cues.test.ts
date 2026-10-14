import { describe, expect, it } from 'vitest';
import cues from '../data/practice/word-order-cues.json';
import { loadWordOrderPractice } from '../src/content/loadWordOrderPractice';
import { applyWordOrderCues } from '../src/content/wordOrderCues';
import { applyWordOrderAction, createWordOrderSession } from '../src/domain/wordOrderPractice';

describe('provisional word-order cues', () => {
  const items = loadWordOrderPractice();
  it('provides a Japanese meaning for every current target with truthful provenance', () => {
    expect(items).toHaveLength(22);
    for (const item of items) expect(item.promptJa).toMatch(/^この意味の文を作りましょう：.+/);
    expect(cues.humanReview).toBe(false);
    expect(cues.reviewStatus).toBe('draft');
  });

  it('accepts both time-word positions and rejects an unrelated arrangement', () => {
    const item = items[0];
    for (const [text, correct] of [['明天我去台北', true], ['我明天去台北', true], ['北台去我天明', false]] as const) {
      let state = createWordOrderSession([item]);
      for (const char of text) {
        const position = item.shownOrder.findIndex((index, position) =>
          item.chunks[index].text === char && !state.selected.includes(position));
        state = applyWordOrderAction(state, { kind: 'toggle', position }).state;
      }
      expect(applyWordOrderAction(state, { kind: 'submit' }).state.lastCorrect).toBe(correct);
    }
  });

  it('treats identical characters as interchangeable', () => {
    const item = items.find((item) => item.recordId === 'practice-025')!;
    const selected = [...item.canonicalOrder].reverse().map((index) => item.shownOrder.indexOf(index));
    // Swap the two identical 幫 tokens in an otherwise canonical answer.
    const canonical = item.canonicalOrder.map((index) => item.shownOrder.indexOf(index));
    const repeated = item.chunks.flatMap((chunk, index) => chunk.text === '幫' ? [index] : []);
    [canonical[repeated[0]], canonical[repeated[1]]] = [canonical[repeated[1]], canonical[repeated[0]]];
    expect(applyWordOrderAction({ ...createWordOrderSession([item]), selected: canonical }, { kind: 'submit' }).state.lastCorrect).toBe(true);
    expect(applyWordOrderAction({ ...createWordOrderSession([item]), selected }, { kind: 'submit' }).state.lastCorrect).toBe(false);
  });

  it('rejects missing, duplicate, stale, and impossible cue rows', () => {
    for (const mutate of [
      (copy: typeof cues) => { copy.items.pop(); },
      (copy: typeof cues) => { copy.items[1] = copy.items[0]; },
      (copy: typeof cues) => { copy.items[0].targetTraditional = 'stale'; },
      (copy: typeof cues) => { copy.items[0].acceptableAnswersTraditional = ['我去日本']; },
    ]) {
      const copy = structuredClone(cues);
      mutate(copy);
      expect(() => applyWordOrderCues(items, copy)).toThrow();
    }
  });
});
