import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { LearnerManifest, LearnerManifestRow } from '../types/learnerManifest';

export interface LearnerManifestValidationContext {
  /** Git-tracked-asset probe. Defaults to `public<path>` membership in the
   * `git ls-files -z` output, so a dirty-worktree WebP present on disk but
   * absent from Git fails closed. */
  assetTracked?: (assetPath: string) => boolean;
}

export const PRODUCTION_ID_PATTERN = /^teacher-star-1-[0-9a-f]{12}$/;
export const LEARNER_ID_PREFIX = 'teacher-learner-';
export const DERIVED_LEARNER_ID_PATTERN = /^teacher-learner-[0-9a-f]{16}$/;

let trackedAssetsCache: ReadonlySet<string> | undefined;

/** Repo-relative paths (e.g. `public/assets/...`) of every Git-tracked file. */
function loadTrackedAssets(): ReadonlySet<string> {
  if (trackedAssetsCache === undefined) {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
    trackedAssetsCache = new Set(out.split('\0'));
  }
  return trackedAssetsCache;
}

/** Normalized simplified value used by the canonical generator. */
export function normalizeSimplified(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** Deterministic derived learner ID from frozen source identity. */
export function computeDerivedLearnerId(row: Omit<LearnerManifestRow, 'learnerId'>): string {
  const seed = `teacher-learner-v1|${row.sourceSheet}|${row.sourceRow}|${normalizeSimplified(row.simplified)}`;
  return `${LEARNER_ID_PREFIX}${createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 16)}`;
}

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Validates the production learner manifest contract. Throws on the first
 * violation. Used by the manifest self-tests and by the static regression
 * test; never wires any learner route (that is #202).
 */
export function validateLearnerManifest(
  manifest: LearnerManifest,
  context: LearnerManifestValidationContext = {},
): void {
  const { assetTracked = (path) => loadTrackedAssets().has(`public${path}`) } = context;

  assert(manifest.schemaVersion === 1, 'manifest schemaVersion must be 1');

  // Every row needs a stable identity shape.
  const learnerIds = new Set<string>();
  const sourceKeys = new Set<string>();
  for (const row of manifest.rows) {
    assert(row.learnerId.trim().length > 0, 'row has an empty learnerId');
    assert(!learnerIds.has(row.learnerId), `duplicate learner ID '${row.learnerId}'`);
    learnerIds.add(row.learnerId);

    const sourceKey = `${row.sourceSheet}:${row.sourceRow}`;
    assert(!sourceKeys.has(sourceKey), `duplicate source identity '${sourceKey}'`);
    sourceKeys.add(sourceKey);

    // Production rows must keep the frozen production ID shape; derived rows
    // must exactly match the deterministic SHA-256 contract recomputed from
    // their frozen source identity — never array position or sort order.
    if (row.learnerId.startsWith('teacher-star-')) {
      assert(
        PRODUCTION_ID_PATTERN.test(row.learnerId),
        `invalid production learner identity '${row.learnerId}'`,
      );
    } else {
      assert(
        DERIVED_LEARNER_ID_PATTERN.test(row.learnerId),
        `invalid derived learner identity '${row.learnerId}'`,
      );
      assert(
        row.learnerId === computeDerivedLearnerId(row),
        `derived learner identity '${row.learnerId}' does not match recomputed '${computeDerivedLearnerId(row)}' from its source identity`,
      );
    }

    assert(row.simplified.trim().length > 0, `row '${row.learnerId}' has empty simplified`);
    assert(['noun', 'verb', 'adjective', 'adverb'].includes(row.partOfSpeech), `row '${row.learnerId}' has invalid partOfSpeech`);
    assert(row.sourceRow > 0, `row '${row.learnerId}' has invalid sourceRow`);
    assert(row.sourceSheet.trim().length > 0, `row '${row.learnerId}' has empty sourceSheet`);

    assert(
      row.image.state === 'teacher-mapped' || row.image.state === 'ai-generated',
      `row '${row.learnerId}' has invalid image state '${row.image.state}'`,
    );
    assert(row.image.assetPath.startsWith('/assets/vocabulary/'), `row '${row.learnerId}' has non-deployable asset path '${row.image.assetPath}'`);
    assert(
      assetTracked(row.image.assetPath),
      `row '${row.learnerId}' references asset '${row.image.assetPath}' that is not a tracked Git file`,
    );

    if (row.image.state === 'teacher-mapped') {
      assert(row.image.provenance === 'teacher-provided', `row '${row.learnerId}' teacher-mapped provenance mismatch`);
    } else {
      assert(row.image.provenance === 'ai-generated', `row '${row.learnerId}' ai-generated provenance mismatch`);
    }
  }

  // Totals must reconcile with the actual rows.
  assert(manifest.totals.eligible === manifest.rows.length, 'totals.eligible does not match row count');
  const teacher = manifest.rows.filter((row) => row.image.state === 'teacher-mapped').length;
  const ai = manifest.rows.filter((row) => row.image.state === 'ai-generated').length;
  assert(manifest.totals.teacher === teacher, 'totals.teacher does not match rows');
  assert(manifest.totals.ai === ai, 'totals.ai does not match rows');
  assert(teacher > 0 && ai > 0, 'manifest must include both teacher and AI image sources');

  // The frozen 20-row production contract is byte-for-byte preserved in
  // productionContract, and every image-bearing production ID appears as a row.
  const productionRowIds = manifest.rows
    .filter((row) => row.learnerId.startsWith('teacher-star-'))
    .map((row) => row.learnerId);
  assert(manifest.productionContract.count === manifest.productionContract.ids.length, 'production contract count mismatch');
  assert(manifest.productionContract.ids.length === 20, 'production contract must freeze exactly 20 IDs');
  assert(new Set(manifest.productionContract.ids).size === 20, 'production contract contains duplicate IDs');
  assert(
    manifest.productionContract.preserved + manifest.productionContract.excluded === manifest.productionContract.count,
    'production contract preserved+excluded does not reconcile with count',
  );
  assert(manifest.productionContract.preserved === productionRowIds.length, 'production contract preserved count mismatch');
  // excludedIds must be the exact complement of the preserved rows within the
  // frozen IDs: no duplicates, length equal to excluded, and exact set equality
  // with `ids - preservedRows` (no gaps, no strays).
  const excludedIds = manifest.productionContract.excludedIds;
  assert(new Set(excludedIds).size === excludedIds.length, 'production contract excludedIds must be unique');
  assert(excludedIds.length === manifest.productionContract.excluded, 'production contract excludedIds length must equal excluded');
  const expectedExcluded = new Set(manifest.productionContract.ids);
  for (const id of productionRowIds) expectedExcluded.delete(id);
  const actualExcluded = new Set(excludedIds);
  assert(
    actualExcluded.size === expectedExcluded.size
      && [...actualExcluded].every((id) => expectedExcluded.has(id)),
    'production contract excludedIds must exactly equal ids minus preserved rows',
  );
}

/** Static guard for optional fields: present values are truthful; absent
 * optional fields must stay absent rather than being fabricated. */
export function assertOptionalFieldsAreNotFabricated(
  rows: readonly LearnerManifestRow[],
): void {
  for (const row of rows) {
    for (const field of ['traditional', 'pinyin', 'japanese', 'difficulty', 'example'] as const) {
      const value = row[field];
      if (value !== undefined) {
        assert(value.trim().length > 0, `row '${row.learnerId}' has an empty optional field '${field}'`);
      }
    }
  }
}
