import type { HskRenderableEntry } from '../../../src/content/loadHskVocabulary';
import type { SessionEntry } from '../../../src/client/flashcardSession';

export const entries: HskRenderableEntry[] = Array.from({ length: 22 }, (_, index) => {
  const number = String(index + 1).padStart(3, '0');
  return {
    id: `hsk2-acceptance-${number}`,
    simplified: `中合成語${number}`,
    pinyin: `zhōng hé chéng yǔ ${number}`,
    japanese: `日本語の意味${number}`,
  };
});

export const ids = entries.map((entry) => entry.id);
export const newPoolIds = ids.slice(1);

export const answerEntries: SessionEntry[] = entries.map((entry): SessionEntry => ({
  ...entry,
  simplifiedStatus: 'verified',
}));

export const answerPayload = { version: 1, entries: answerEntries } as const;
