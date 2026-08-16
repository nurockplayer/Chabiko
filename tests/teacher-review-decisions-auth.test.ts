// @vitest-environment node
/**
 * Decision write authorization (Issue #390).
 *
 * Writes are allowed only for an Access-authenticated identity whose email is
 * present in the deployment-time eligible-reviewer allowlist. Missing/empty/
 * malformed allowlist configuration fails closed (500) and a non-eligible
 * identity gets 403 — deployment configuration can never widen access.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCurrentCampaign } from '../src/content/loadTeacherReviewCampaign';

const mocks = vi.hoisted(() => ({
  resolveCampaignOr500: vi.fn(),
  createStore: vi.fn(),
}));

vi.mock('../functions/teacher-review/api/resolve-campaign', () => ({
  resolveCampaignOr500: mocks.resolveCampaignOr500,
}));
vi.mock('../functions/teacher-review/api/d1-store', () => ({
  createD1TeacherReviewStore: mocks.createStore,
}));

// Imported after the mocks are registered.
import { onRequestPost } from '../functions/teacher-review/api/decisions';

interface DecisionContext {
  env: Record<string, unknown>;
  data: { reviewer: { email: string; name: string; sub: string; identityNonce: string } };
  request: Request;
  upsertDecision: ReturnType<typeof vi.fn>;
}

function makeContext(
  env: Record<string, string>,
  reviewerEmail: string,
  body: Record<string, unknown>,
): DecisionContext {
  const upsertDecision = vi.fn().mockResolvedValue(undefined);
  mocks.createStore.mockReturnValue({
    listDecisions: vi.fn().mockResolvedValue([]),
    upsertDecision,
  });
  return {
    env: { TEACHER_REVIEW_DB: {}, ...env },
    data: {
      reviewer: {
        email: reviewerEmail,
        name: 'Reviewer',
        sub: 'user-1',
        identityNonce: 'nonce-1',
      },
    },
    request: new Request(
      'https://chabiko.pages.dev/teacher-review/api/decisions',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
    upsertDecision,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.resolveCampaignOr500.mockReset();
  mocks.createStore.mockReset();
});

describe('POST /teacher-review/api/decisions write authorization (Issue #390)', () => {
  it('denies write when the allowlist variable is missing (fail closed, 500)', async () => {
    const campaign = await resolveCurrentCampaign();
    mocks.resolveCampaignOr500.mockResolvedValue({ resolution: campaign });
    const context = makeContext(
      {},
      'teacher@example.com',
      { recordId: campaign.records[0].id, outcome: 'accepted' },
    );
    const response = await onRequestPost(
      context as unknown as Parameters<typeof onRequestPost>[0],
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/not configured/);
    expect(context.upsertDecision).not.toHaveBeenCalled();
  });

  it('denies write when the allowlist is empty (500)', async () => {
    const campaign = await resolveCurrentCampaign();
    mocks.resolveCampaignOr500.mockResolvedValue({ resolution: campaign });
    const context = makeContext(
      { TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS: '   ' },
      'teacher@example.com',
      { recordId: campaign.records[0].id, outcome: 'accepted' },
    );
    const response = await onRequestPost(
      context as unknown as Parameters<typeof onRequestPost>[0],
    );
    expect(response.status).toBe(500);
    expect(context.upsertDecision).not.toHaveBeenCalled();
  });

  it('denies write when the allowlist is malformed (500)', async () => {
    const campaign = await resolveCurrentCampaign();
    mocks.resolveCampaignOr500.mockResolvedValue({ resolution: campaign });
    const context = makeContext(
      { TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS: 'not-an-email' },
      'teacher@example.com',
      { recordId: campaign.records[0].id, outcome: 'accepted' },
    );
    const response = await onRequestPost(
      context as unknown as Parameters<typeof onRequestPost>[0],
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/malformed email/);
    expect(context.upsertDecision).not.toHaveBeenCalled();
  });

  it('rejects an authenticated but non-eligible identity with 403 and never writes', async () => {
    const campaign = await resolveCurrentCampaign();
    mocks.resolveCampaignOr500.mockResolvedValue({ resolution: campaign });
    const context = makeContext(
      { TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS: 'teacher@example.com' },
      'maintainer@example.com',
      { recordId: campaign.records[0].id, outcome: 'accepted' },
    );
    const response = await onRequestPost(
      context as unknown as Parameters<typeof onRequestPost>[0],
    );
    expect(response.status).toBe(403);
    expect(context.upsertDecision).not.toHaveBeenCalled();
  });

  it('authorizes an eligible reviewer to write (allowlist email normalized)', async () => {
    const campaign = await resolveCurrentCampaign();
    mocks.resolveCampaignOr500.mockResolvedValue({ resolution: campaign });
    const context = makeContext(
      { TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS: 'Teacher@Example.com' },
      'teacher@example.com',
      { recordId: campaign.records[0].id, outcome: 'accepted' },
    );
    const response = await onRequestPost(
      context as unknown as Parameters<typeof onRequestPost>[0],
    );
    expect(response.status).toBe(200);
    expect(context.upsertDecision).toHaveBeenCalledTimes(1);
  });

  it('authorizes only the configured allowlist; a second configured reviewer also writes', async () => {
    const campaign = await resolveCurrentCampaign();
    mocks.resolveCampaignOr500.mockResolvedValue({ resolution: campaign });
    const context = makeContext(
      { TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS: 'a@example.com, reviewer@example.com' },
      'reviewer@example.com',
      { recordId: campaign.records[0].id, outcome: 'accepted' },
    );
    const response = await onRequestPost(
      context as unknown as Parameters<typeof onRequestPost>[0],
    );
    expect(response.status).toBe(200);
    expect(context.upsertDecision).toHaveBeenCalledTimes(1);
  });
});
