import type { LearnerPartOfSpeech } from '../types/learnerManifest';
import type { TeacherVocabularyReviewItem } from '../content/teacherVocabularyReviewOverview';

export const TEACHER_VOCABULARY_REVIEW_PAGE_SIZE = 50;

export type TeacherVocabularyDecisionFilter = 'all' | 'unreviewed' | 'accepted' | 'needs_changes';
export type TeacherVocabularyPartOfSpeechFilter = 'all' | LearnerPartOfSpeech;

export interface TeacherVocabularyReviewQuery {
  readonly searchText: string;
  readonly sourceSheet: string;
  readonly partOfSpeech: TeacherVocabularyPartOfSpeechFilter;
  readonly decision: TeacherVocabularyDecisionFilter;
  readonly page: number;
}

export interface TeacherVocabularyReviewPage {
  readonly totalCount: number;
  readonly filteredCount: number;
  readonly page: number;
  readonly pageCount: number;
  readonly items: readonly TeacherVocabularyReviewItem[];
  /** This read-only v1 has no compatible campaign decision storage. */
  readonly progress: { readonly accepted: number; readonly needsChanges: number; readonly unreviewed: number };
}

export function normalizeTeacherVocabularyReviewSearch(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function fieldIncludes(value: string | undefined, needle: string): boolean {
  return value !== undefined && normalizeTeacherVocabularyReviewSearch(value).includes(needle);
}

function matchesSearch(item: TeacherVocabularyReviewItem, needle: string): boolean {
  return fieldIncludes(item.simplified, needle) || fieldIncludes(item.traditional, needle) ||
    fieldIncludes(item.pinyin, needle) || fieldIncludes(item.japanese, needle);
}

/** Deterministic, read-only selection. Production order is never re-sorted. */
export function selectTeacherVocabularyReviewPage(
  items: readonly TeacherVocabularyReviewItem[],
  query: TeacherVocabularyReviewQuery,
): TeacherVocabularyReviewPage {
  const search = normalizeTeacherVocabularyReviewSearch(query.searchText);
  const filtered = items.filter((item) =>
    (query.sourceSheet === 'all' || item.sourceSheet === query.sourceSheet) &&
    (query.partOfSpeech === 'all' || item.partOfSpeech === query.partOfSpeech) &&
    // No compatible #363 campaign exists for these records. Do not infer one.
    (query.decision === 'all' || query.decision === 'unreviewed') &&
    (search.length === 0 || matchesSearch(item, search)),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / TEACHER_VOCABULARY_REVIEW_PAGE_SIZE));
  const requested = Number.isInteger(query.page) && query.page > 0 ? query.page : 1;
  const page = Math.min(requested, pageCount);
  const start = (page - 1) * TEACHER_VOCABULARY_REVIEW_PAGE_SIZE;
  return {
    totalCount: items.length,
    filteredCount: filtered.length,
    page,
    pageCount,
    items: filtered.slice(start, start + TEACHER_VOCABULARY_REVIEW_PAGE_SIZE),
    progress: { accepted: 0, needsChanges: 0, unreviewed: items.length },
  };
}
