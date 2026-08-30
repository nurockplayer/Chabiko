import type { TrackAvailability } from './crossTrackProgress';

/** The minimal source shape required to derive learner-visible HSK truth. */
export interface HskProjectionEntry {
  readonly id: string;
  readonly reviewStatus: string;
  readonly hsk: {
    readonly introducedAtLevel: number;
  };
}

export interface HskLearnerLevelProjection {
  readonly level: number;
  readonly ids: readonly string[];
}

/**
 * Shared learner projection consumed by Home and /paths/.
 *
 * `eligibleIds` contains only production-eligible entries that have a current
 * learner route. `destination` is therefore non-null exactly when the track is
 * available; a production-eligible entry for an unrouted level cannot
 * fabricate a route or denominator.
 */
export interface HskLearnerProjection {
  readonly availability: TrackAvailability;
  readonly destination: string | null;
  readonly statusLabelJa: '利用できます' | '準備中です';
  readonly eligibleIds: readonly string[];
  readonly levels: readonly HskLearnerLevelProjection[];
}

const PRODUCTION_REVIEW_STATUSES = new Set(['reviewed', 'published']);

/** Existing learner routes. Expanding this registry requires its own release authority. */
export const HSK_LEVEL_ONE_DESTINATION = '/vocabulary/hsk/1/';

const LEARNER_ROUTES = Object.freeze([
  Object.freeze({ level: 1, destination: HSK_LEVEL_ONE_DESTINATION }),
]);

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const object = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(object)) deepFreeze(object[key]);
  return Object.freeze(value);
}

/** Derive the complete learner-visible HSK availability contract. */
export function buildHskLearnerProjection(
  entries: readonly HskProjectionEntry[],
): HskLearnerProjection {
  const levels = LEARNER_ROUTES.map(({ level }) => ({
    level,
    ids: entries
      .filter(
        (entry) =>
          PRODUCTION_REVIEW_STATUSES.has(entry.reviewStatus) &&
          entry.hsk.introducedAtLevel === level,
      )
      .map((entry) => entry.id),
  }));
  const eligibleIds = levels.flatMap((level) => level.ids);
  const firstAvailableRoute = LEARNER_ROUTES.find(
    (route) =>
      levels.find((level) => level.level === route.level)?.ids.length !== 0,
  );
  const available = firstAvailableRoute !== undefined;

  return deepFreeze({
    availability: available ? 'available' : 'unavailable',
    destination: firstAvailableRoute?.destination ?? null,
    statusLabelJa: available ? '利用できます' : '準備中です',
    eligibleIds,
    levels,
  });
}
