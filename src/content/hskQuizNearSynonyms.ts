import data from '../../data/hsk-quiz/near-synonym-groups.json';
import type { HskQuizGroupOf } from '../domain/hskQuiz';

// These groups only exclude competing quiz choices; they make no learner-facing
// claim of equivalence. Overlapping senses are merged conservatively in the data.
const groups = new Map(data.groups.flatMap((ids, group) => ids.map((id) => [id, group] as const)));

export const hskQuizNearSynonymGroupOf: HskQuizGroupOf = (id) => groups.get(id);
