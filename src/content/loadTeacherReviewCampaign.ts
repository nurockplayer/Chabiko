/**
 * Shared teacher-review campaign loader (Issue #363).
 *
 * Environment-agnostic: statically imports the parsed content files so the
 * same module resolves the #360 launch target in the Astro build, the Pages
 * Functions runtime, and tests. The domain resolver stays pure (records as
 * input); this module is the data adapter.
 */

import {
  resolveLaunchReviewTarget,
  type CampaignResolution,
  type TeacherReviewInputs,
} from '../domain/teacherReview';
import phrasebookData from '../../data/examples/valid/phrasebook.json';
import dialogsData from '../../data/examples/valid/phrasebook-dialogs.json';
import { loadRoleplayCards } from './loadRoleplayCards';

/** SHA-256 hex digest via the Web Crypto API (available in Workers and in
 * Node 18+ / vitest). Deterministic across environments. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function collectionOf<T>(data: unknown, key: string): T[] {
  const parsed = data as Record<string, unknown>;
  const value = parsed[key];
  if (!Array.isArray(value)) {
    throw new Error(`Teacher-review loader: expected '${key}' array in content file.`);
  }
  return value as T[];
}

/** Load the parsed content files into the domain input shape. */
export function loadTeacherReviewInputs(): TeacherReviewInputs {
  return {
    phrases: collectionOf<unknown>(phrasebookData, 'phrasebook') as TeacherReviewInputs['phrases'],
    dialogs: collectionOf<unknown>(dialogsData, 'phrasebookDialogs') as TeacherReviewInputs['dialogs'],
    roleplayCards: loadRoleplayCards() as TeacherReviewInputs['roleplayCards'],
  };
}

/**
 * Resolve the current #360 launch review target from live content. Fails
 * closed (throws) on any drift so both the runtime API and build-time tests
 * refuse to redefine the campaign silently.
 */
export async function resolveCurrentCampaign(): Promise<CampaignResolution> {
  return resolveLaunchReviewTarget(loadTeacherReviewInputs(), sha256Hex);
}
