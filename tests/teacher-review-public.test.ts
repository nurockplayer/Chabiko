// @vitest-environment node
/** Teacher-facing payload projection (Issue #363). */

import { describe, expect, it } from 'vitest';
import type { CampaignRecord } from '../src/domain/teacherReview';
import { toTeacherFacingReviewContent } from '../src/domain/teacherReviewPublic';

function record(
  type: CampaignRecord['type'],
  content: CampaignRecord['content'],
): CampaignRecord {
  return {
    id: `${type}-transport-test`,
    type,
    scenario: 'transport',
    content,
    fingerprint: 'server-only-fingerprint',
  };
}

describe('toTeacherFacingReviewContent', () => {
  it('projects phrases to human-readable context without raw provenance enums or tags', () => {
    const projected = toTeacherFacingReviewContent(
      record('phrase', {
        traditional: '請問這附近有捷運站嗎？',
        simplified: '请问这附近有捷运站吗？',
        pinyin: 'Qǐngwèn…',
        japanese: 'この近くにMRTの駅はありますか？',
        usageNotesJa: '台湾での用法。',
        traditionalStatus: 'authored',
        simplifiedStatus: 'generated',
        painPointTags: ['taiwan-mainland-usage'],
        source: { type: 'expert-authored', note: '教師資料を基に確認' },
      }),
    );

    expect(projected).toMatchObject({
      traditional: '請問這附近有捷運站嗎？',
      pinyin: 'Qǐngwèn…',
      japanese: 'この近くにMRTの駅はありますか？',
    });
    const json = JSON.stringify(projected);
    expect(json).not.toContain('traditionalStatus');
    expect(json).not.toContain('simplifiedStatus');
    expect(json).not.toContain('painPointTags');
    expect(json).not.toContain('expert-authored');
    expect(json).not.toContain('"generated"');
    expect(json).toContain('自動生成後の確認対象');
    expect(json).toContain('出典メモ: 教師資料を基に確認');
  });

  it('drops dialog internal related ids and per-turn status fields', () => {
    const projected = toTeacherFacingReviewContent(
      record('dialog', {
        turns: [
          {
            speaker: 'learner',
            traditional: '請問？',
            pinyin: 'Qǐngwèn?',
            japanese: 'すみません。',
            traditionalStatus: 'verified',
          },
        ],
        relatedPhraseIds: ['phrase-internal-001'],
        source: { type: 'generated-with-review' },
      }),
    );

    const json = JSON.stringify(projected);
    expect(json).not.toContain('relatedPhraseIds');
    expect(json).not.toContain('phrase-internal-001');
    expect(json).not.toContain('traditionalStatus');
    expect(json).not.toContain('generated-with-review');
    expect(json).toContain('全発言の表記が人が作成・確認済みです');
  });

  it('drops roleplay lesson/phrase refs and engineering rehearsal flags', () => {
    const projected = toTeacherFacingReviewContent(
      record('roleplay', {
        titleJa: '移動',
        goalJa: '駅を尋ねる',
        guidanceJa: '相手との会話を確認してください。',
        lessonRefs: ['lesson-internal-001'],
        phraseRefs: ['phrase-internal-001'],
        allLearnerTurnsRehearsed: true,
        lines: [
          {
            speaker: 'learner',
            traditional: '車站在哪裡？',
            pinyin: 'Chēzhàn zài nǎlǐ?',
            japanese: '駅はどこですか？',
            traditionalStatus: 'authored',
          },
        ],
      }),
    );

    const json = JSON.stringify(projected);
    expect(json).not.toContain('lessonRefs');
    expect(json).not.toContain('phraseRefs');
    expect(json).not.toContain('allLearnerTurnsRehearsed');
    expect(json).not.toContain('lesson-internal-001');
    expect(json).not.toContain('phrase-internal-001');
    expect(json).toContain('駅を尋ねる');
  });

  it('explicitly surfaces a missing source instead of silently omitting it', () => {
    const projected = toTeacherFacingReviewContent(
      record('phrase', {
        traditional: '請問這附近有捷運站嗎？',
        pinyin: 'Qǐngwèn…',
        japanese: 'この近くにMRTの駅はありますか？',
        usageNotesJa: '台湾での用法。',
        traditionalStatus: 'authored',
      }),
    );
    const json = JSON.stringify(projected);
    expect(json).toContain('出典情報なし（要確認）');
  });

  it('maps phrase provenance labels to the specific script form (Traditional/Simplified)', () => {
    const projected = toTeacherFacingReviewContent(
      record('phrase', {
        traditional: '請問這附近有捷運站嗎？',
        simplified: '请问这附近有捷运站吗？',
        pinyin: 'Qǐngwèn…',
        japanese: 'この近くにMRTの駅はありますか？',
        usageNotesJa: '台湾での用法。',
        traditionalStatus: 'authored',
        simplifiedStatus: 'verified',
      }),
    );
    const json = JSON.stringify(projected);
    expect(json).toContain('繁体字の表記: 人が作成した表記');
    expect(json).toContain('簡体字の表記: 人が確認済みの表記');
  });

  it('presents pain-point tags as explicit review context for the teaching reviewer', () => {
    const projected = toTeacherFacingReviewContent(
      record('phrase', {
        traditional: '請問這附近有捷運站嗎？',
        pinyin: 'Qǐngwèn…',
        japanese: 'この近くにMRTの駅はありますか？',
        usageNotesJa: '台湾での用法。',
        traditionalStatus: 'authored',
        painPointTags: ['taiwan-mainland-usage'],
      }),
    );
    const json = JSON.stringify(projected);
    // Human-readable context, not the raw field name or a raw enum.
    expect(json).not.toContain('painPointTags');
    expect(json).toContain('注意ポイント: taiwan-mainland-usage');
  });

  it('exposes which conversation turns still carry a generated (review-pending) form', () => {
    const projected = toTeacherFacingReviewContent(
      record('dialog', {
        turns: [
          {
            speaker: 'learner',
            traditional: '請問？',
            pinyin: 'Qǐngwèn?',
            japanese: 'すみません。',
            traditionalStatus: 'authored',
          },
          {
            speaker: 'partner',
            traditional: '往前走。',
            pinyin: 'wǎng qián zǒu',
            japanese: 'まっすぐ進みます。',
            traditionalStatus: 'generated',
          },
        ],
        relatedPhraseIds: ['phrase-internal-001'],
      }),
    );
    const json = JSON.stringify(projected);
    expect(json).toContain('1 発言に自動生成後の確認対象（generated）が含まれます');
    expect(json).not.toContain('"generated"');
  });
});
