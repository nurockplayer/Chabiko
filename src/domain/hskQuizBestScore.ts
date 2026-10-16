import type { HskQuizDirection, HskQuizLength } from './hskQuiz';

export const HSK_QUIZ_BEST_KEY = 'chabiko:hsk-quiz-best:v1';
export const HSK_QUIZ_SCORE_EVENT = 'hsk-quiz:score-changed';
export interface HskQuizBestScore {
  version: 1;
  correct: number;
  total: HskQuizLength;
  direction: HskQuizDirection;
}
type ScoreStorage = Pick<Storage, 'getItem' | 'setItem'>;

function valid(value: unknown): value is HskQuizBestScore {
  if (!value || typeof value !== 'object') return false;
  const score = value as HskQuizBestScore;
  return score.version === 1 && (score.total === 10 || score.total === 20) &&
    Number.isInteger(score.correct) && score.correct >= 0 && score.correct <= score.total &&
    (score.direction === 'zh-to-ja' || score.direction === 'ja-to-zh');
}

function storageOrDefault(storage?: ScoreStorage): ScoreStorage {
  return storage ?? window.localStorage;
}

export function readHskQuizBest(level: number, storage?: ScoreStorage): HskQuizBestScore | null {
  if (![1, 2, 3, 4].includes(level)) return null;
  try {
    const parsed: unknown = JSON.parse(storageOrDefault(storage).getItem(`${HSK_QUIZ_BEST_KEY}:${level}`) ?? 'null');
    return valid(parsed) ? parsed : null;
  } catch { return null; }
}

/** Compare percentages across test lengths; retain the longer test on a tie. */
export function saveHskQuizBest(level: number, score: HskQuizBestScore, storage?: ScoreStorage): boolean {
  if (![1, 2, 3, 4].includes(level) || !valid(score)) return false;
  try {
    const target = storageOrDefault(storage);
    const best = readHskQuizBest(level, target);
    if (!best || score.correct * best.total > best.correct * score.total ||
      (score.correct * best.total === best.correct * score.total && score.total > best.total)) {
      target.setItem(`${HSK_QUIZ_BEST_KEY}:${level}`, JSON.stringify(score));
    }
    return true;
  } catch { return false; }
}

export function formatHskQuizBest(score: HskQuizBestScore | null): string {
  return score ? `テスト最高 ${Math.round(score.correct / score.total * 100)}%（${score.correct}/${score.total}）` : 'テスト未受験';
}
