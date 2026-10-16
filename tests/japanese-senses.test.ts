import { describe, expect, it } from 'vitest';
import { japaneseSenses } from '../src/domain/japaneseSenses';

describe('workbook meaning presentation', () => {
  it('separates explicit senses without splitting punctuation inside a sense', () => {
    expect(japaneseSenses('・(もの)を見る ・(本など)を読む')).toEqual(['(もの)を見る', '(本など)を読む']);
    expect(japaneseSenses('・食べ物・飲み物 ・話す/語る')).toEqual(['食べ物・飲み物', '話す/語る']);
  });

  it('preserves ordinary Japanese middle dots and handles a single or missing meaning', () => {
    expect(japaneseSenses('食べ物・飲み物')).toEqual(['食べ物・飲み物']);
    expect(japaneseSenses('・書く')).toEqual(['書く']);
    expect(japaneseSenses(' ')).toEqual([]);
  });
});
