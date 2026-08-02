import { existsSync } from 'node:fs';
import type { LearnerManifest, LearnerManifestRow } from '../types/learnerManifest';

export interface LearnerManifestValidationContext {
  /** Asset-existence probe. Defaults to `public<path>` on disk. */
  assetExists?: (assetPath: string) => boolean;
}

export const PRODUCTION_ID_PATTERN = /^teacher-star-1-[0-9a-f]{12}$/;
export const LEARNER_ID_PREFIX = 'teacher-learner-';

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
  const { assetExists = (path) => existsOnDisk(path) } = context;

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
    // must use the stable derived prefix — never array position or sort order.
    if (row.learnerId.startsWith('teacher-star-')) {
      assert(
        PRODUCTION_ID_PATTERN.test(row.learnerId),
        `invalid production learner identity '${row.learnerId}'`,
      );
    } else {
      assert(
        row.learnerId.startsWith(LEARNER_ID_PREFIX),
        `invalid derived learner identity '${row.learnerId}'`,
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
      assetExists(row.image.assetPath),
      `row '${row.learnerId}' references missing asset '${row.image.assetPath}'`,
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
  assert(
    manifest.productionContract.excludedIds.every((id) => !productionRowIds.includes(id)),
    'production contract excludedIds overlap preserved rows',
  );
  for (const id of productionRowIds) {
    assert(manifest.productionContract.ids.includes(id), `production row '${id}' missing from frozen contract`);
  }
  // excludedIds is the subset of frozen IDs that carry no eligible image and
  // therefore do not appear as rows; it must reference only frozen IDs.
  for (const id of manifest.productionContract.excludedIds) {
    assert(manifest.productionContract.ids.includes(id), `excluded production ID '${id}' missing from frozen contract`);
  }
}

/** Static guard for optional fields: present values are truthful; absent
 * optional fields must stay absent rather than being fabricated. */
export function assertOptionalFieldsAreNotFabricated(
  rows: readonly LearnerManifestRow[],
): void {
  for (const row of rows) {
    for (const field of ['traditional', 'pinyin', 'japanese', 'difficulty'] as const) {
      const value = row[field];
      if (value !== undefined) {
        assert(value.trim().length > 0, `row '${row.learnerId}' has an empty optional field '${field}'`);
      }
    }
  }
}

function existsOnDisk(assetPath: string): boolean {
  return existsSync(`public${assetPath}`);
}
