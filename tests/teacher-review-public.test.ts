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
    expect(json).toContain('人が確認済みの表記');
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
});
