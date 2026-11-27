// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/teacher-review/api/_middleware';
import {
  TEACHER_VOCABULARY_REVIEW_PAGE_SIZE,
  selectTeacherVocabularyReviewPage,
} from '../src/domain/teacherVocabularyReviewOverview';
import {
  loadTeacherVocabularyReviewOverview,
  type TeacherVocabularyReviewItem,
} from '../src/content/teacherVocabularyReviewOverview';

function item(index: number, overrides: Partial<TeacherVocabularyReviewItem> = {}): TeacherVocabularyReviewItem {
  return {
    learnerId: `teacher-star-${String(index).padStart(4, '0')}`,
    simplified: `词${index}`,
    traditional: `詞${index}`,
    pinyin: `cí ${index}`,
    japanese: `単語${index}`,
    partOfSpeech: 'noun',
    sourceSheet: index % 2 === 0 ? '名詞' : '動詞',
    sourceRow: index + 1,
    ...overrides,
  };
}

const allQuery = {
  searchText: '', sourceSheet: 'all', partOfSpeech: 'all' as const, decision: 'all' as const, page: 1,
};

describe('teacher vocabulary review overview', () => {
  it('keeps reviewer records out of the static overview and requires Access for the data request', async () => {
    const route = readFileSync('src/pages/teacher-review/vocabulary/index.astro', 'utf8');
    expect(/loadTeacherVocabularyReviewOverview|data-teacher-vocabulary-review-data|sourceSheets\.map/.test(route)).toBe(false);

    const { onRequestGet } = await import('../functions/teacher-review/api/vocabulary');
    const next = vi.fn();
    const context = {
      request: new Request('https://chabiko.pages.dev/teacher-review/api/vocabulary'),
      env: {},
      data: {},
      next,
    } as unknown as Parameters<typeof onRequest>[0];

    const unavailable = await onRequest(context);
    expect(unavailable.status).toBe(500);
    expect(await unavailable.json()).toEqual({ error: expect.stringMatching(/^Access not configured:/) });
    expect(next).not.toHaveBeenCalled();

    context.env.TEACHER_REVIEW_ACCESS_TEAM_DOMAIN = 'https://test.cloudflareaccess.com';
    context.env.TEACHER_REVIEW_ACCESS_AUD = 'test-audience';
    expect((await onRequest(context)).status).toBe(401);
    expect(next).not.toHaveBeenCalled();

    const response = await onRequestGet(context);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(loadTeacherVocabularyReviewOverview())));
  });

  it('preserves the production learner order and exposes only review-readable fields', () => {
    const overview = loadTeacherVocabularyReviewOverview();
    expect(overview.length).toBeGreaterThan(0);
    expect(overview[0]).toEqual(expect.objectContaining({
      learnerId: expect.any(String), simplified: expect.any(String), sourceSheet: expect.any(String), sourceRow: expect.any(Number),
    }));
    expect(Object.keys(overview[0] ?? {})).toEqual([
      'learnerId', 'simplified', 'traditional', 'pinyin', 'japanese', 'partOfSpeech', 'sourceSheet', 'sourceRow',
    ]);
    expect(Object.isFrozen(overview)).toBe(true);
  });

  it('searches Chinese, tone-folded pinyin, and Japanese while preserving input order', () => {
    const items = [item(1, { simplified: '学习', pinyin: 'xuéxí', japanese: '勉強' }), item(2, { japanese: '学ぶ' })];
    expect(selectTeacherVocabularyReviewPage(items, { ...allQuery, searchText: 'xuexi' }).items.map((entry) => entry.learnerId))
      .toEqual(['teacher-star-0001']);
    expect(selectTeacherVocabularyReviewPage(items, { ...allQuery, searchText: '学' }).items.map((entry) => entry.learnerId))
      .toEqual(['teacher-star-0001', 'teacher-star-0002']);
  });

  it('combines source-sheet and part-of-speech filters deterministically', () => {
    const items = [item(1, { sourceSheet: '名詞', partOfSpeech: 'noun' }), item(2, { sourceSheet: '名詞', partOfSpeech: 'verb' }), item(3, { sourceSheet: '動詞', partOfSpeech: 'verb' })];
    const result = selectTeacherVocabularyReviewPage(items, { ...allQuery, sourceSheet: '名詞', partOfSpeech: 'verb' });
    expect(result.items.map((entry) => entry.learnerId)).toEqual(['teacher-star-0002']);
  });

  it('models this campaign-isolated v1 as unreviewed and never fabricates decisions', () => {
    const items = [item(1), item(2)];
    expect(selectTeacherVocabularyReviewPage(items, { ...allQuery, decision: 'unreviewed' }).filteredCount).toBe(2);
    expect(selectTeacherVocabularyReviewPage(items, { ...allQuery, decision: 'accepted' }).filteredCount).toBe(0);
    expect(selectTeacherVocabularyReviewPage(items, { ...allQuery, decision: 'needs_changes' }).filteredCount).toBe(0);
    expect(selectTeacherVocabularyReviewPage(items, allQuery).progress).toEqual({ accepted: 0, needsChanges: 0, unreviewed: 2 });
  });

  it('pages at a bounded size and clamps invalid or out-of-range pages', () => {
    const items = Array.from({ length: TEACHER_VOCABULARY_REVIEW_PAGE_SIZE + 1 }, (_, index) => item(index));
    expect(selectTeacherVocabularyReviewPage(items, { ...allQuery, page: 1 }).items).toHaveLength(TEACHER_VOCABULARY_REVIEW_PAGE_SIZE);
    const finalPage = selectTeacherVocabularyReviewPage(items, { ...allQuery, page: 99 });
    expect(finalPage.page).toBe(2);
    expect(finalPage.items.map((entry) => entry.learnerId)).toEqual(['teacher-star-0050']);
    expect(selectTeacherVocabularyReviewPage(items, { ...allQuery, page: 0 }).page).toBe(1);
  });

  it('keeps the protected route noindexed and excludes engineering-only payload fields', () => {
    const route = readFileSync('src/pages/teacher-review/vocabulary/index.astro', 'utf8');
    expect(route).toContain('robots="noindex, nofollow"');
    expect(route).toContain('data-tvro-decision');
    expect(route).not.toContain('reviewStatus');
    expect(route).not.toContain('workbookSha256');
    expect(route).not.toContain('assetChecksumSha256');
    expect(route).not.toContain('bulk accept');
  });
});
