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
  if (!source) return [];
  const items: string[] = [];
  if (source.note?.trim()) {
    items.push(`出典メモ: ${source.note.trim()}`);
  } else {
    // Preserve the fact that source context exists without exposing the raw
    // source-type enum to the teacher-facing payload.
    items.push('出典情報あり（詳細はリポジトリ側で管理）');
  }
  return items;
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

function provenanceContext(statuses: readonly (FormStatus | undefined)[]): string[] {
  const labels = [...new Set(statuses.map(statusLabel).filter((value): value is string => value !== null))];
  return labels.length > 0 ? [`表記の確認情報: ${labels.join('・')}`] : [];
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
        ...provenanceContext([
          content.traditionalStatus,
          content.simplifiedStatus,
        ]),
        ...sourceContext(content.source),
      ],
    };
  }

  if (record.type === 'dialog') {
    const content = record.content as DialogReviewContent;
    return {
      turns: content.turns.map(turnToTeacher),
      reviewContext: [
        ...provenanceContext(
          content.turns.flatMap((turn) => [
            turn.traditionalStatus,
            turn.simplifiedStatus,
          ]),
        ),
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
      ...provenanceContext(
        content.lines.flatMap((turn) => [
          turn.traditionalStatus,
          turn.simplifiedStatus,
        ]),
      ),
      ...sourceContext(content.source),
    ],
  };
}
