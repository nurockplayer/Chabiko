import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const VISUAL_SCHEMA_VERSION = 1;
export const MAX_HAMMING_DISTANCE = 8;
export const MAX_BATCH_SIZE = 50;
export const RENDERING_ENVIRONMENT_ID = 'playwright-chromium-unifont-v1';

type BatchInput = {
  id: string;
  distance: number;
  leftScalar: number;
  rightScalar: number;
  checksumSha256: string;
};

export function hammingDistance64(left: string, right: string): number {
  if (!/^[0-9a-f]{16}$/.test(left) || !/^[0-9a-f]{16}$/.test(right)) {
    throw new Error('perceptual hashes must be 16 lowercase hexadecimal digits');
  }
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (value !== 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(`${JSON.stringify(value)}\n`).digest('hex');
}

export function buildReviewBatches(candidates: BatchInput[]) {
  const ordered = [...candidates].sort((a, b) =>
    a.distance - b.distance || a.leftScalar - b.leftScalar || a.rightScalar - b.rightScalar,
  );
  return Array.from({ length: Math.ceil(ordered.length / MAX_BATCH_SIZE) }, (_, index) => {
    const items = ordered.slice(index * MAX_BATCH_SIZE, (index + 1) * MAX_BATCH_SIZE);
    return {
      id: `unicode-visual-review-${String(index + 1).padStart(4, '0')}`,
      candidateIds: items.map((item) => item.id),
      candidateChecksumsSha256: items.map((item) => item.checksumSha256),
      outputPath: `data/unicode/reviews/unicode-visual-review-${String(index + 1).padStart(4, '0')}.json`,
    };
  });
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function validateVisualArtifacts(candidates: any, reviewPlan: any, repoRoot: string): void {
  requireCondition(candidates?.schemaVersion === VISUAL_SCHEMA_VERSION, 'candidate schema version mismatch');
  requireCondition(reviewPlan?.schemaVersion === VISUAL_SCHEMA_VERSION, 'review-plan schema version mismatch');
  requireCondition(candidates.input?.scalarInventoryPath === 'data/unicode/generated/scalar-inventory.json', 'scalar inventory path mismatch');
  requireCondition(/^[0-9a-f]{64}$/.test(candidates.input?.scalarInventorySha256), 'malformed scalar inventory checksum');
  requireCondition(candidates.threshold?.algorithm === 'dhash-64', 'unsupported perceptual hash algorithm');
  requireCondition(candidates.threshold?.maximumHammingDistance === MAX_HAMMING_DISTANCE, 'threshold mismatch');
  requireCondition(JSON.stringify(candidates.threshold?.ordering) === JSON.stringify(['distance', 'leftScalar', 'rightScalar']), 'candidate ordering metadata mismatch');
  const inventoryPath = join(repoRoot, candidates.input.scalarInventoryPath);
  const inventoryBytes = readFileSync(inventoryPath);
  requireCondition(createHash('sha256').update(inventoryBytes).digest('hex') === candidates.input.scalarInventorySha256, 'stale scalar inventory checksum');
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));
  requireCondition(Array.isArray(inventory.scalars), 'scalar inventory is malformed');
  requireCondition(candidates.input.scalarCount === inventory.scalars.length, 'scalar inventory count mismatch');
  const inventoryScalars = new Set<number>(inventory.scalars.map((row: any) => row.scalar));
  const mechanical = JSON.parse(readFileSync(join(repoRoot, 'data/unicode/generated/mechanical-records.json'), 'utf8'));
  const expectedAuthoredPairs = mechanical.records
    .filter((record: any) => record.category === 'traditional-simplified')
    .flatMap((record: any) => {
      requireCondition(record.leftScalars.length === record.rightScalars.length, `cannot derive scalar exclusions from unequal authored pair '${record.id}'`);
      return record.leftScalars
        .map((leftScalar: number, index: number) => [leftScalar, record.rightScalars[index]] as const)
        .filter(([leftScalar, rightScalar]: readonly [number, number]) => leftScalar !== rightScalar)
        .map(([leftScalar, rightScalar]: readonly [number, number]) => [leftScalar, rightScalar].sort((a, b) => a - b).join(':'));
    })
    .filter((value: string, index: number, values: string[]) => values.indexOf(value) === index)
    .sort((left: string, right: string) => left.localeCompare(right));
  requireCondition(candidates.exclusions?.identicalScalarSequences === true, 'identical-scalar exclusion mismatch');
  requireCondition(JSON.stringify(candidates.exclusions?.authoredTraditionalSimplifiedPairKeys) === JSON.stringify(expectedAuthoredPairs), 'authored Traditional-Simplified exclusion provenance mismatch');

  const unavailable = candidates.availability?.status === 'unavailable';
  if (unavailable) {
    requireCondition(candidates.availability?.reason === 'pinned renderer unavailable or lacks complete inventory coverage', 'unavailable renderer reason mismatch');
    requireCondition(candidates.renderingEnvironment === null, 'unavailable renderer must not claim rendering metadata');
    requireCondition(candidates.glyphs.length === 0 && candidates.candidates.length === 0, 'unavailable renderer must emit no glyphs or candidates');
    requireCondition(candidates.totals?.glyphs === 0 && candidates.totals?.candidates === 0, 'unavailable renderer totals mismatch');
  } else {
    requireCondition(candidates.availability?.status === 'available', 'artifact availability status mismatch');
    requireCondition(candidates.renderingEnvironment?.id === RENDERING_ENVIRONMENT_ID, 'stale rendering environment');
    requireCondition(candidates.renderingEnvironment?.reference === 'docs/content/unicode-rendering-inventory.md#pinned-reference-renderer', 'stale rendering reference');
    requireCondition(candidates.renderingEnvironment?.playwrightImage === 'mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48', 'stale Playwright image digest');
    requireCondition(candidates.renderingEnvironment?.browser === 'chromium-149.0.7827.55', 'stale browser version');
    requireCondition(candidates.renderingEnvironment?.fontInput === 'Ubuntu fonts-unifont 1:15.1.01-1build1 / Unifont Regular', 'stale font input');
    requireCondition(/^[0-9a-f]{64}$/.test(candidates.renderingEnvironment?.fontAggregateSha256), 'malformed font checksum');
    requireCondition(JSON.stringify(candidates.renderingEnvironment?.canvas) === JSON.stringify({ width: 64, height: 64, fontSizePx: 48, weight: 400, grayscale: 'integer-rec601', background: 'white', foreground: 'black' }), 'canvas rendering conditions mismatch');
    requireCondition(candidates.totals?.glyphs === candidates.glyphs.length && candidates.totals?.candidates === candidates.candidates.length, 'available renderer totals mismatch');
  }

  const glyphIds = new Set<string>();
  const glyphScalars = new Set<number>();
  for (const glyph of candidates.glyphs) {
    requireCondition(!glyphIds.has(glyph.id), `duplicate glyph id ${glyph.id}`);
    glyphIds.add(glyph.id);
    requireCondition(/^u[0-9a-f]{4,6}$/.test(glyph.id), 'malformed glyph id');
    requireCondition(Number.isInteger(glyph.scalar) && glyph.id === `u${glyph.scalar.toString(16).padStart(4, '0')}`, 'glyph scalar/id mismatch');
    requireCondition(inventoryScalars.has(glyph.scalar), 'glyph scalar is not in the pinned inventory');
    requireCondition(!glyphScalars.has(glyph.scalar), `duplicate glyph scalar ${glyph.scalar}`);
    glyphScalars.add(glyph.scalar);
    requireCondition(/^[0-9a-f]{16}$/.test(glyph.perceptualHash64), 'malformed perceptual hash');
    requireCondition(/^[0-9a-f]{64}$/.test(glyph.derivativeSha256), 'malformed derivative checksum');
  }
  requireCondition(unavailable || glyphScalars.size === inventoryScalars.size, 'glyph inventory coverage is incomplete');

  const authoredPairs = new Set(expectedAuthoredPairs);
  const candidateIds = new Set<string>();
  const glyphById = new Map(candidates.glyphs.map((glyph: any) => [glyph.id, glyph]));
  let prior: [number, number, number] | undefined;
  for (const item of candidates.candidates) {
    requireCondition(!candidateIds.has(item.id), `duplicate candidate id ${item.id}`);
    candidateIds.add(item.id);
    requireCondition(item.leftScalar < item.rightScalar, 'candidate scalar order or identical scalar violation');
    requireCondition(item.id === `visual-u${item.leftScalar.toString(16).padStart(4, '0')}-u${item.rightScalar.toString(16).padStart(4, '0')}`, 'candidate id does not match scalar evidence');
    requireCondition(!authoredPairs.has(`${item.leftScalar}:${item.rightScalar}`), 'authored Traditional-Simplified pair leaked');
    requireCondition(glyphIds.has(item.leftGlyphRef) && glyphIds.has(item.rightGlyphRef), 'stale glyph evidence ref');
    requireCondition(glyphById.get(item.leftGlyphRef).scalar === item.leftScalar && glyphById.get(item.rightGlyphRef).scalar === item.rightScalar, 'candidate scalar does not match glyph evidence');
    requireCondition(glyphById.get(item.leftGlyphRef).perceptualHash64 === item.leftPerceptualHash64, 'left perceptual hash does not match glyph evidence');
    requireCondition(glyphById.get(item.rightGlyphRef).perceptualHash64 === item.rightPerceptualHash64, 'right perceptual hash does not match glyph evidence');
    requireCondition(item.distance === hammingDistance64(item.leftPerceptualHash64, item.rightPerceptualHash64), 'Hamming distance mismatch');
    requireCondition(item.distance <= MAX_HAMMING_DISTANCE, 'candidate exceeds threshold');
    requireCondition(item.reviewStatus === 'provisional' && item.learnerEligible === false, 'candidate must remain learner-excluded provisional');
    requireCondition(item.renderingEnvironmentRefs.length === 1 && item.renderingEnvironmentRefs[0] === RENDERING_ENVIRONMENT_ID, 'candidate rendering provenance mismatch');
    requireCondition(item.cautionJa === null, 'unreviewed candidate must not claim learner caution');
    const checksum = sha256Json({ ...item, checksumSha256: undefined });
    requireCondition(item.checksumSha256 === checksum, 'candidate checksum mismatch');
    const key: [number, number, number] = [item.distance, item.leftScalar, item.rightScalar];
    requireCondition(!prior || key[0] > prior[0] || (key[0] === prior[0] && (key[1] > prior[1] || (key[1] === prior[1] && key[2] > prior[2]))), 'candidate order mismatch');
    prior = key;
  }
  const expectedCandidateIds = new Set<string>();
  const orderedGlyphs = [...candidates.glyphs].sort((left: any, right: any) => left.scalar - right.scalar);
  for (let leftIndex = 0; leftIndex < orderedGlyphs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < orderedGlyphs.length; rightIndex += 1) {
      const left = orderedGlyphs[leftIndex];
      const right = orderedGlyphs[rightIndex];
      const pairKey = `${left.scalar}:${right.scalar}`;
      if (authoredPairs.has(pairKey)) continue;
      if (hammingDistance64(left.perceptualHash64, right.perceptualHash64) <= MAX_HAMMING_DISTANCE) {
        expectedCandidateIds.add(`visual-u${left.scalar.toString(16).padStart(4, '0')}-u${right.scalar.toString(16).padStart(4, '0')}`);
      }
    }
  }
  requireCondition(candidateIds.size === expectedCandidateIds.size && [...candidateIds].every((id) => expectedCandidateIds.has(id)), 'candidate set does not match glyph evidence, threshold, and exclusions');

  requireCondition(reviewPlan.candidateManifestPath === 'data/unicode/generated/visual-candidates.json', 'review plan candidate manifest path mismatch');
  requireCondition(reviewPlan.ordering?.join(',') === 'distance,leftScalar,rightScalar', 'review plan ordering mismatch');
  requireCondition(reviewPlan.maximumBatchSize === MAX_BATCH_SIZE, 'review plan maximum batch size mismatch');
  requireCondition(reviewPlan.aggregateIndexOwner === 'serialized-follow-up-only', 'review plan aggregate owner mismatch');
  requireCondition(reviewPlan.candidateManifestSha256 === sha256Json(candidates), 'review plan references stale candidate manifest');
  requireCondition(reviewPlan.totals?.candidates === candidates.candidates.length && reviewPlan.totals?.batches === Math.ceil(candidates.candidates.length / MAX_BATCH_SIZE), 'review plan totals mismatch');
  const flattened = reviewPlan.batches.flatMap((batch: any) => batch.candidateIds);
  requireCondition(reviewPlan.batches.every((batch: any) => batch.candidateIds.length > 0 && batch.candidateIds.length <= MAX_BATCH_SIZE && batch.candidateIds.length === batch.candidateChecksumsSha256.length), 'invalid review batch boundary');
  requireCondition(flattened.length === candidateIds.size && new Set(flattened).size === candidateIds.size && flattened.every((id: string) => candidateIds.has(id)), 'every candidate must appear in exactly one batch');
  const byId = new Map(candidates.candidates.map((item: any) => [item.id, item]));
  for (const batch of reviewPlan.batches) {
    batch.candidateIds.forEach((id: string, index: number) => requireCondition((byId.get(id) as any).checksumSha256 === batch.candidateChecksumsSha256[index], 'stale batch candidate checksum'));
  }
  requireCondition(JSON.stringify(reviewPlan.batches) === JSON.stringify(buildReviewBatches(candidates.candidates)), 'review plan batches or output ownership mismatch');
}
