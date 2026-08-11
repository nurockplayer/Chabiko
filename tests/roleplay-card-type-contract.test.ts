import { describe, expect, it } from 'vitest';
import type {
  RoleplayCardRecord,
  RoleplayCardsDocument,
  RoleplayLine,
} from '../src/types/roleplayCard';

function makeLine(speaker: 'learner' | 'partner'): RoleplayLine {
  return {
    speaker,
    traditional: '請問這附近有捷運站嗎？',
    traditionalStatus: 'authored',
    simplified: '请问这附近有捷运站吗？',
    simplifiedStatus: 'verified',
    pinyin: 'Qǐngwèn zhè fùjìn yǒu jiéyùnzhàn ma?',
    japanese: 'すみません、この近くにMRTの駅はありますか？',
  };
}

function makeCard(): RoleplayCardRecord {
  return {
    id: 'roleplay-fixture-transport-001',
    scenario: 'transport',
    titleJa: '道案内をしてもらう',
    goalJa: '駅までの道順を中国語で尋ねられる',
    guidanceJa: '道に迷ったとき、駅や施設の場所を中国語で尋ねる練習です。',
    lessonRefs: ['lesson-003'],
    phraseRefs: ['phrase-002'],
    allLearnerTurnsRehearsed: true,
    lines: [makeLine('learner'), makeLine('partner'), makeLine('learner'), makeLine('partner')],
    reviewStatus: 'draft',
  };
}

describe('roleplay card type contract – valid record', () => {
  it('a valid transport card satisfies the record type', () => {
    const card: RoleplayCardRecord = makeCard();
    expect(card.allLearnerTurnsRehearsed).toBe(true);
    expect(card.lines).toHaveLength(4);
  });

  it('a valid document wrapper carries schemaVersion 1', () => {
    const doc: RoleplayCardsDocument = {
      schemaVersion: 1,
      roleplayCards: [makeCard()],
    };
    expect(doc.schemaVersion).toBe(1);
    expect(doc.roleplayCards[0].phraseRefs).toEqual(['phrase-002']);
  });

  it('lessonRefs is optional and may be omitted', () => {
    const card: RoleplayCardRecord = { ...makeCard() };
    delete (card as { lessonRefs?: string[] }).lessonRefs;
    expect(card.lessonRefs).toBeUndefined();
  });
});

describe('roleplay card type contract – fixed rehearsal invariant', () => {
  it('allLearnerTurnsRehearsed must be the literal true (compile-time)', () => {
    // @ts-expect-error – allLearnerTurnsRehearsed is the fixed literal `true`
    const _card: RoleplayCardRecord = { ...makeCard(), allLearnerTurnsRehearsed: false };
    expect(_card).toBeDefined();
  });

  it('scenario is a controlled union (compile-time)', () => {
    // @ts-expect-error – 'weather' is not a controlled roleplay scenario
    const _card: RoleplayCardRecord = { ...makeCard(), scenario: 'weather' };
    expect(_card).toBeDefined();
  });

  it('speaker is a controlled union (compile-time)', () => {
    // @ts-expect-error – 'both' is not a valid roleplay speaker
    const _line: RoleplayLine = { ...makeLine('learner'), speaker: 'both' };
    expect(_line).toBeDefined();
  });
});

describe('roleplay card type contract – simplified/status discriminated union', () => {
  it('mirrors the VocabularyExample combinations (compile-time)', () => {
    // 1. No simplified at all.
    const noSimplified: RoleplayLine = {
      speaker: 'partner',
      traditional: '有，往前走兩分鐘就到了。',
      traditionalStatus: 'authored',
      pinyin: 'yǒu, wǎng qián zǒu liǎng fēnzhōng jiù dào le',
      japanese: 'ありますよ。まっすぐ2分歩けば着きますよ。',
    };
    // 2. Simplified unavailable (status only).
    const unavailable: RoleplayLine = {
      ...noSimplified,
      simplifiedStatus: 'unavailable',
    };
    // 3. Simplified with an authored/verified/generated status.
    const withSimplified: RoleplayLine = {
      ...noSimplified,
      simplified: '请问这附近有捷运站吗？',
      simplifiedStatus: 'verified',
    };
    expect(noSimplified.simplified).toBeUndefined();
    expect(unavailable.simplifiedStatus).toBe('unavailable');
    expect(withSimplified.simplified).toBeTruthy();
  });

  it('rejects simplified without status (compile-time)', () => {
    // @ts-expect-error – simplified present but simplifiedStatus omitted
    const _line: RoleplayLine = {
      speaker: 'learner',
      traditional: '請問這附近有捷運站嗎？',
      traditionalStatus: 'authored',
      simplified: '请问这附近有捷运站吗？',
      pinyin: 'Qǐngwèn zhè fùjìn yǒu jiéyùnzhàn ma?',
      japanese: 'すみません、この近くにMRTの駅はありますか？',
    };
    expect(_line).toBeDefined();
  });

  it('rejects authored status without simplified (compile-time)', () => {
    // @ts-expect-error – simplifiedStatus authored but simplified omitted
    const _line: RoleplayLine = {
      speaker: 'partner',
      traditional: '有，往前走兩分鐘就到了。',
      traditionalStatus: 'authored',
      simplifiedStatus: 'authored',
      pinyin: 'yǒu, wǎng qián zǒu liǎng fēnzhōng jiù dào le',
      japanese: 'ありますよ。',
    };
    expect(_line).toBeDefined();
  });
});
