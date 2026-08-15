/**
 * Teacher-review API middleware (Issue #363).
 *
 * Server-side Cloudflare Access JWT validation for every `/teacher-review/api/*`
 * request. The reviewer identity is derived ONLY from the validated Access
 * JWT (`Cf-Access-Jwt-Assertion` header), never from a client-supplied
 * email/name field. Unauthenticated/invalid requests get a JSON 401 — the
 * static shell and the API boundary fail closed even if edge Access were
 * misconfigured.
 */

import { verifyAccessJwt } from './access-jwt';
import { readAccessConfig } from './campaign-config';
import { json } from './http';
import type { TeacherReviewEnv, TeacherReviewPagesFunction } from './types';

export const onRequest: TeacherReviewPagesFunction = async (context) => {
  const config = readAccessConfig(context.env as TeacherReviewEnv);
  if (!config.ok) {
    return json({ error: `Access not configured: ${config.reason}` }, 500);
  }

  const token =
    context.request.headers.get('cf-access-jwt-assertion') ?? '';
  if (!token) {
    return json({ error: 'Missing Cloudflare Access JWT.' }, 401);
  }

  const result = await verifyAccessJwt(token, config.teamDomain, config.aud);
  if (!result.ok) {
    return json({ error: `Access authentication failed: ${result.reason}` }, 401);
  }

  context.data.reviewer = result.identity;
  return context.next();
};
