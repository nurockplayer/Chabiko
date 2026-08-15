/**
 * Campaign resolution with fail-closed drift handling (Issue #363).
 *
 * The #360 launch target is resolved from live content at runtime; if the
 * content no longer matches the exact contract (24 + 6 + 6, fixture excluded),
 * the endpoint returns a structured 500 instead of silently redefining the
 * campaign. The UI surfaces the drift message to the teacher.
 */

import { resolveCurrentCampaign } from '../../../src/content/loadTeacherReviewCampaign';
import type { CampaignResolution } from '../../../src/domain/teacherReview';
import { json } from './http';

export type ResolveCampaignResult =
  | { resolution: CampaignResolution }
  | { response: Response };

export async function resolveCampaignOr500(): Promise<ResolveCampaignResult> {
  try {
    return { resolution: await resolveCurrentCampaign() };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return {
      response: json(
        {
          error:
            '#360 review campaign drift: the launch target no longer matches the exact contract. Reconcile the review campaign before continuing.',
          detail: message,
        },
        500,
      ),
    };
  }
}
