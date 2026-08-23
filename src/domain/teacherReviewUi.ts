/**
 * Teacher-review UI state machine (Issue #363).
 *
 * Pure, browser-agnostic state transitions for the one-record-at-a-time review
 * flow: navigation, scenario / needs-changes filtering, decision application
 * and progress. The client (`src/client/teacherReview.ts`) renders these
 * states; tests exercise the transitions directly.
 *
 * The UI state deliberately does NOT carry fingerprints: the teacher-facing
 * payload never exposes engineering SHAs. The server resolves decision
 * validity (fingerprint match) and only ever surfaces CURRENT-version
 * decisions here.
 */

import type {
  CampaignRecord,
  ReviewOutcome,
  ReviewRecordType,
  TeacherReviewScenario,
} from './teacherReview';
import type { TeacherFacingReviewContent } from './teacherReviewPublic';

export type ScenarioFilter = 'all' | TeacherReviewScenario;

/** The teacher-facing record shape (no fingerprint, no reviewStatus). */
export interface ReviewUiRecord {
  id: string;
  type: ReviewRecordType;
  scenario: TeacherReviewScenario;
  content: TeacherFacingReviewContent;
}

export interface RecordViewState {
  /** Outcome of the CURRENT valid decision for this record, if any. */
  outcome: ReviewOutcome | null;
  note: string;
  updatedAt: string | null;
  reviewerName: string | null;
}

export interface ReviewUiState {
  records: readonly ReviewUiRecord[];
  /** Maps record id → current-version decision state (stale decisions are
   * never surfaced). */
  views: ReadonlyMap<string, RecordViewState>;
  scenarioFilter: ScenarioFilter;
  needsChangesOnly: boolean;
  /** Index into the filtered record list. */
  currentIndex: number;
  /** In-progress reviewer note for the current record. */
  draftNote: string;
}

export interface ReviewUiSnapshot {
  visible: readonly ReviewUiRecord[];
  current: ReviewUiRecord | null;
  currentIndex: number;
  visibleCount: number;
  progress: {
    total: number;
    decided: number;
    accepted: number;
    needsChanges: number;
    unreviewed: number;
  };
  isNeedsChangesOnly: boolean;
  scenarioFilter: ScenarioFilter;
}

function buildViews(
  records: readonly ReviewUiRecord[],
  decisions: readonly (RecordViewState | null)[],
): ReadonlyMap<string, RecordViewState> {
  const views = new Map<string, RecordViewState>();
  records.forEach((record, index) => {
    const decision = decisions[index];
    if (!decision || decision.outcome === null) return;
    views.set(record.id, decision);
  });
  return views;
}

function matchesFilter(
  record: ReviewUiRecord,
  scenarioFilter: ScenarioFilter,
  needsChangesOnly: boolean,
  views: ReadonlyMap<string, RecordViewState>,
): boolean {
  if (scenarioFilter !== 'all' && record.scenario !== scenarioFilter) {
    return false;
  }
  if (needsChangesOnly) {
    return views.get(record.id)?.outcome === 'needs_changes';
  }
  return true;
}

/** Build state from the server payload: parallel records + decisions arrays.
 * `decisions[i]` is the current-version decision for `records[i]` (or null). */
export function createReviewUiState(
  records: readonly ReviewUiRecord[],
  decisions: readonly (RecordViewState | null)[],
): ReviewUiState {
  return {
    records,
    views: buildViews(records, decisions),
    scenarioFilter: 'all',
    needsChangesOnly: false,
    currentIndex: 0,
    draftNote: '',
  };
}

export function snapshot(state: ReviewUiState): ReviewUiSnapshot {
  const visible = state.records.filter((record) =>
    matchesFilter(record, state.scenarioFilter, state.needsChangesOnly, state.views),
  );
  const safeIndex =
    visible.length === 0
      ? 0
      : Math.min(Math.max(state.currentIndex, 0), visible.length - 1);

  let decided = 0;
  let accepted = 0;
  let needsChanges = 0;
  for (const record of state.records) {
    const view = state.views.get(record.id);
    if (!view || view.outcome === null) continue;
    decided += 1;
    if (view.outcome === 'accepted') accepted += 1;
    else needsChanges += 1;
  }

  return {
    visible,
    current: visible[safeIndex] ?? null,
    currentIndex: safeIndex,
    visibleCount: visible.length,
    progress: {
      total: state.records.length,
      decided,
      accepted,
      needsChanges,
      unreviewed: state.records.length - decided,
    },
    isNeedsChangesOnly: state.needsChangesOnly,
    scenarioFilter: state.scenarioFilter,
  };
}

export function setScenarioFilter(
  state: ReviewUiState,
  scenarioFilter: ScenarioFilter,
): ReviewUiState {
  return { ...state, scenarioFilter, currentIndex: 0 };
}

export function toggleNeedsChangesOnly(state: ReviewUiState): ReviewUiState {
  return {
    ...state,
    needsChangesOnly: !state.needsChangesOnly,
    currentIndex: 0,
  };
}

export function navigateNext(state: ReviewUiState): ReviewUiState {
  const visible = state.records.filter((record) =>
    matchesFilter(record, state.scenarioFilter, state.needsChangesOnly, state.views),
  );
  if (visible.length === 0) return state;
  return {
    ...state,
    currentIndex: Math.min(state.currentIndex + 1, visible.length - 1),
  };
}

export function navigatePrevious(state: ReviewUiState): ReviewUiState {
  const visible = state.records.filter((record) =>
    matchesFilter(record, state.scenarioFilter, state.needsChangesOnly, state.views),
  );
  if (visible.length === 0) return state;
  return {
    ...state,
    currentIndex: Math.max(state.currentIndex - 1, 0),
  };
}

export function selectRecord(state: ReviewUiState, recordId: string): ReviewUiState {
  const visible = state.records.filter((record) =>
    matchesFilter(record, state.scenarioFilter, state.needsChangesOnly, state.views),
  );
  const index = visible.findIndex((record) => record.id === recordId);
  if (index === -1) return state;
  return { ...state, currentIndex: index };
}

export function setDraftNote(state: ReviewUiState, note: string): ReviewUiState {
  return { ...state, draftNote: note };
}

/** Apply a confirmed decision to the state (called after the server persisted
 * it). Clears the draft note. */
export function applyConfirmedDecision(
  state: ReviewUiState,
  recordId: string,
  outcome: ReviewOutcome,
  note: string,
  updatedAt: string,
  reviewerName: string,
): ReviewUiState {
  const views = new Map(state.views);
  views.set(recordId, { outcome, note, updatedAt, reviewerName });
  return { ...state, views, draftNote: '' };
}

/** Utility type re-export so callers can type CampaignRecord inputs. */
export type { CampaignRecord };
