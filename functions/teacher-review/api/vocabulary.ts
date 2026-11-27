import { loadTeacherVocabularyReviewOverview } from '../../../src/content/teacherVocabularyReviewOverview';
import type { TeacherReviewPagesFunction } from './types';

export const onRequestGet: TeacherReviewPagesFunction = () =>
  Response.json(loadTeacherVocabularyReviewOverview(), {
    headers: { 'Cache-Control': 'no-store' },
  });
