/**
 * Teacher-facing projection for the #360 review portal.
 *
 * The canonical review model intentionally contains engineering metadata used
 * for semantic fingerprinting (script provenance, source metadata, refs, etc.).
 * This projection translates only the context a human teacher needs and drops
 * raw controlled values / internal references from the browser payload.
 */

import type {
  CampaignRecord,
  DialogReviewContent,
  FormStatus,
  PhraseReviewContent,
  ReviewSourceInput,
  RoleplayReviewContent,
  TurnReviewContent,
} from './teacherReview';

export interface TeacherFacingTurn {
  speaker: 'learner' | 'partner';
  traditional: string;
  simplified?: string;
  pinyin: string;
  japanese: string;
}

export interface TeacherFacingPhraseContent {
  traditional: string;
  simplified?: string;
  pinyin: string;
  japanese: string;
  usageNotesJa: string;
  reviewContext: string[];
}

export interface TeacherFacingDialogContent {
  turns: TeacherFacingTurn[];
  reviewContext: string[];
}

export interface TeacherFacingRoleplayContent {
  titleJa: string;
  goalJa: string;
  guidanceJa: string;
  lines: TeacherFacingTurn[];
  reviewContext: string[];
}

export type TeacherFacingReviewContent =
  | TeacherFacingPhraseContent
  | TeacherFacingDialogContent
  | TeacherFacingRoleplayContent;

function statusLabel(status: FormStatus | undefined): string | null {
  if (!status) return null;
  switch (status) {
    case 'authored':
      return '人が作成した表記';
    case 'verified':
      return '人が確認済みの表記';
    case 'generated':
      return '自動生成後の確認対象';
  }
}

function sourceContext(source: ReviewSourceInput | undefined): string[] {
  // Missing source evidence must be explicit, never a silent omission: the
  // human-source-reviewer needs to know a record carries no source record.
  if (!source) {
    return ['出典情報なし（要確認）'];
  }
  if (source.note?.trim()) {
    return [`出典メモ: ${source.note.trim()}`];
  }
  return ['出典情報あり（詳細はリポジトリ側で管理）'];
}

function turnToTeacher(turn: TurnReviewContent): TeacherFacingTurn {
  return {
    speaker: turn.speaker,
    traditional: turn.traditional,
    simplified: turn.simplified,
    pinyin: turn.pinyin,
    japanese: turn.japanese,
  };
}

/** Per-form provenance for a phrase: the teacher must see which label maps to
 * Traditional vs Simplified, not a merged enum list. */
function phraseProvenanceContext(
  traditionalStatus: FormStatus | undefined,
  simplifiedStatus: FormStatus | undefined,
): string[] {
  const items: string[] = [];
  if (traditionalStatus) {
    items.push(`繁体字の表記: ${statusLabel(traditionalStatus)}`);
  }
  if (simplifiedStatus) {
    items.push(`簡体字の表記: ${statusLabel(simplifiedStatus)}`);
  }
  return items;
}

/** Conversation-level provenance: exposes whether any turn still carries a
 * `generated` (review-pending) form, so the script-verifier can judge the
 * whole exchange rather than an anonymized union. */
function turnsProvenanceContext(
  turns: readonly TurnReviewContent[],
): string[] {
  const generatedCount = turns.filter(
    (turn) =>
      turn.traditionalStatus === 'generated' ||
      turn.simplifiedStatus === 'generated',
  ).length;
  if (generatedCount > 0) {
    return [
      `表記の確認情報: ${generatedCount} 発言に自動生成後の確認対象（generated）が含まれます`,
    ];
  }
  return ['表記の確認情報: 全発言の表記が人が作成・確認済みです'];
}

/** Pain-point tags are review-relevant teaching metadata; present them
 * explicitly so the human-teaching-reviewer can judge the teaching-accuracy
 * scope (no silent omission). */
function painPointContext(tags: readonly string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return [`注意ポイント: ${tags.join('・')}`];
}

export function toTeacherFacingReviewContent(
  record: CampaignRecord,
): TeacherFacingReviewContent {
  if (record.type === 'phrase') {
    const content = record.content as PhraseReviewContent;
    return {
      traditional: content.traditional,
      simplified: content.simplified,
      pinyin: content.pinyin,
      japanese: content.japanese,
      usageNotesJa: content.usageNotesJa,
      reviewContext: [
        ...phraseProvenanceContext(
          content.traditionalStatus,
          content.simplifiedStatus,
        ),
        ...painPointContext(content.painPointTags),
        ...sourceContext(content.source),
      ],
    };
  }

  if (record.type === 'dialog') {
    const content = record.content as DialogReviewContent;
    return {
      turns: content.turns.map(turnToTeacher),
      reviewContext: [
        ...turnsProvenanceContext(content.turns),
        ...sourceContext(content.source),
      ],
    };
  }

  const content = record.content as RoleplayReviewContent;
  return {
    titleJa: content.titleJa,
    goalJa: content.goalJa,
    guidanceJa: content.guidanceJa,
    lines: content.lines.map(turnToTeacher),
    reviewContext: [
      ...turnsProvenanceContext(content.lines),
      ...sourceContext(content.source),
    ],
  };
}
