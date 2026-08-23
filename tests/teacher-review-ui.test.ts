// @vitest-environment node
/**
 * Teacher-review UI state machine (Issue #363).
 *
 * Navigation, scenario / needs-changes-only filtering, progress and decision
 * application over the current #360 launch target.
 */

import { describe, expect, it } from 'vitest';
import {
  applyConfirmedDecision,
  createReviewUiState,
  navigateNext,
  navigatePrevious,
  setDraftNote,
  setScenarioFilter,
  snapshot,
  toggleNeedsChangesOnly,
  type ReviewUiRecord,
} from '../src/domain/teacherReviewUi';
import { toTeacherFacingReviewContent } from '../src/domain/teacherReviewPublic';
import { resolveCurrentCampaign } from '../src/content/loadTeacherReviewCampaign';

async function loadUiRecords(): Promise<ReviewUiRecord[]> {
  const campaign = await resolveCurrentCampaign();
  return campaign.records.map((record) => ({
    id: record.id,
    type: record.type,
    scenario: record.scenario,
    content: toTeacherFacingReviewContent(record),
  }));
}

describe('teacher-review UI state', () => {
  it('shows 0/36 progress and the first record by default', async () => {
    const records = await loadUiRecords();
    const state = createReviewUiState(records, records.map(() => null));
    const snap = snapshot(state);
    expect(snap.progress.total).toBe(36);
    expect(snap.progress.decided).toBe(0);
    expect(snap.current?.id).toBe(records[0].id);
    expect(snap.visibleCount).toBe(36);
  });

  it('navigates next/previous within the filtered list and clamps boundaries', async () => {
    const records = await loadUiRecords();
    let state = createReviewUiState(records, records.map(() => null));
    state = navigateNext(state);
    expect(snapshot(state).current?.id).toBe(records[1].id);
    state = navigatePrevious(state);
    expect(snapshot(state).current?.id).toBe(records[0].id);
    state = navigatePrevious(state);
    expect(snapshot(state).current?.id).toBe(records[0].id);
    state = createReviewUiState(records, records.map(() => null));
    for (let i = 0; i < records.length + 5; i += 1) state = navigateNext(state);
    expect(snapshot(state).current?.id).toBe(records[records.length - 1].id);
  });

  it('filters by scenario and resets navigation', async () => {
    const records = await loadUiRecords();
    const foodRecords = records.filter((record) => record.scenario === 'food');
    let state = createReviewUiState(records, records.map(() => null));
    state = navigateNext(state);
    state = setScenarioFilter(state, 'food');
    const snap = snapshot(state);
    expect(snap.scenarioFilter).toBe('food');
    expect(snap.visibleCount).toBe(foodRecords.length);
    expect(snap.current?.id).toBe(foodRecords[0].id);
  });

  it('filters to needs-changes-only records', async () => {
    const records = await loadUiRecords();
    const decisions = records.map((_, index) =>
      index === 2
        ? { outcome: 'needs_changes' as const, note: '修正', updatedAt: '2026-08-15T00:00:00.000Z', reviewerName: 'Teacher' }
        : index === 3
          ? { outcome: 'accepted' as const, note: '', updatedAt: '2026-08-15T00:00:00.000Z', reviewerName: 'Teacher' }
          : null,
    );
    let state = createReviewUiState(records, decisions);
    state = toggleNeedsChangesOnly(state);
    const snap = snapshot(state);
    expect(snap.isNeedsChangesOnly).toBe(true);
    expect(snap.visible).toHaveLength(1);
    expect(snap.current?.id).toBe(records[2].id);
  });

  it('computes progress only from current decisions', async () => {
    const records = await loadUiRecords();
    const decisions = records.map((_, index) => {
      if (index === 0) {
        return { outcome: 'accepted' as const, note: '', updatedAt: '2026-08-15T00:00:00.000Z', reviewerName: 'Teacher' };
      }
      if (index === 1) {
        return { outcome: 'needs_changes' as const, note: '確認', updatedAt: '2026-08-15T00:00:00.000Z', reviewerName: 'Teacher' };
      }
      return null;
    });
    const state = createReviewUiState(records, decisions);
    const snap = snapshot(state);
    expect(snap.progress).toEqual({
      total: 36,
      decided: 2,
      accepted: 1,
      needsChanges: 1,
      unreviewed: 34,
    });
  });

  it('applies a confirmed decision and clears the draft note', async () => {
    const records = await loadUiRecords();
    let state = createReviewUiState(records, records.map(() => null));
    state = setDraftNote(state, ' 修正メモ ');
    state = applyConfirmedDecision(
      state,
      records[0].id,
      'needs_changes',
      '修正メモ',
      '2026-08-15T00:00:00.000Z',
      'Teacher',
    );
    const snap = snapshot(state);
    expect(snap.progress.decided).toBe(1);
    expect(snap.progress.needsChanges).toBe(1);
    expect(state.draftNote).toBe('');
    expect(snap.current).not.toBeNull();
  });

  it('selects a record from the summary', async () => {
    const records = await loadUiRecords();
    const state = createReviewUiState(records, records.map(() => null));
    const target = records[5].id;
    const { selectRecord } = await import('../src/domain/teacherReviewUi');
    const next = selectRecord(state, target);
    expect(snapshot(next).current?.id).toBe(target);
  });
});
