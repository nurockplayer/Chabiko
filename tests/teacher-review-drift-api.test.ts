// @vitest-environment node
/**
 * Fail-closed drift handling at the API boundary (Issue #363).
 *
 * When live content no longer matches the exact #360 launch contract, the API
 * returns a structured JSON 500 (never silently redefining the campaign).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveCurrentCampaign: vi.fn(),
}));

vi.mock('../src/content/loadTeacherReviewCampaign', () => ({
  resolveCurrentCampaign: mocks.resolveCurrentCampaign,
}));

import { resolveCampaignOr500 } from '../functions/teacher-review/api/resolve-campaign';

beforeEach(() => {
  mocks.resolveCurrentCampaign.mockReset();
});

describe('resolveCampaignOr500', () => {
  it('returns the resolution when the target reconciles', async () => {
    const resolution = { campaignId: 'issue-360-launch-v1', records: [], counts: { phrases: 24, dialogs: 6, roleplay: 6 } };
    mocks.resolveCurrentCampaign.mockResolvedValue(resolution);
    const result = await resolveCampaignOr500();
    expect('resolution' in result).toBe(true);
    if ('resolution' in result) {
      expect(result.resolution).toBe(resolution);
    }
  });

  it('returns a structured 500 JSON on drift instead of silently redefining the campaign', async () => {
    mocks.resolveCurrentCampaign.mockRejectedValue(
      new Error('#360 target drift: expected 24 draft phrasebook phrases, got 20.'),
    );
    const result = await resolveCampaignOr500();
    expect('response' in result).toBe(true);
    if ('response' in result) {
      expect(result.response.status).toBe(500);
      const body = await result.response.json();
      expect(body.error).toMatch(/campaign drift/);
      expect(body.detail).toMatch(/target drift/);
    }
  });
});
