import { createHash } from 'node:crypto';
import type { LearnerManifest } from '../types/learnerManifest';
import type {
  TeacherPhraseProjectionPhrase,
} from '../types/teacherPhraseProjection';

const SHA256 = /^[0-9a-f]{64}$/;
const PHRASE_ID = /^teacher-phrase-v1-[0-9a-f]{64}$/;
const SOURCE_REVISION = /^teacher-phrase-source-v1-[0-9a-f]{64}$/;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`teacher phrase projection ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeLearnerManifestSemanticSha256(manifest: LearnerManifest): string {
  const semantic = {
    schemaVersion: manifest.schemaVersion,
    rows: manifest.rows.map((row) => ({
      learnerId: row.learnerId,
      sourceSheet: row.sourceSheet,
      sourceRow: row.sourceRow,
      ...(row.example === undefined ? {} : { example: row.example }),
    })),
  };
  return createHash('sha256').update(stableJson(semantic), 'utf8').digest('hex');
}

function requireText(value: unknown, label: string): asserts value is string {
  assert(typeof value === 'string' && value.trim().length > 0, `${label} must be non-empty text`);
}

/** Validate the learner-only projection and return a fresh phrase map.
 * Draft sidecar/review evidence is intentionally unavailable at this layer. */
export function validateTeacherPhraseProjection(
  value: unknown,
  manifest: LearnerManifest,
): ReadonlyMap<string, readonly TeacherPhraseProjectionPhrase[]> {
  assert(isObject(value), 'must be an object');
  assert(hasExactKeys(value, ['schemaVersion', 'contractId', 'base', 'records']), 'root keys are invalid');
  assert(value.schemaVersion === 1, 'schemaVersion must be 1');
  assert(value.contractId === 'teacher-phrase-promoted-v1', 'contractId is unsupported');

  const base = value.base;
  assert(isObject(base), 'base must be an object');
  assert(hasExactKeys(base, [
    'sidecarSchemaVersion',
    'sidecarContractId',
    'sidecarSha256',
    'learnerManifestSemanticSha256',
    'workbookSha256',
  ]), 'base keys are invalid');
  assert(base.sidecarSchemaVersion === 1, 'sidecar schemaVersion must be 1');
  assert(base.sidecarContractId === 'teacher-phrase-authoring-v1', 'sidecar contractId is unsupported');
  assert(
    base.learnerManifestSemanticSha256 === computeLearnerManifestSemanticSha256(manifest),
    'manifest semantic digest mismatch',
  );
  assert(base.workbookSha256 === manifest.source.workbookSha256, 'workbook digest mismatch');

  const records = value.records;
  assert(Array.isArray(records), 'records must be an array');
  assert(
    base.sidecarSha256 === null || (typeof base.sidecarSha256 === 'string' && SHA256.test(base.sidecarSha256)),
    'sidecar digest must be null or lowercase SHA-256',
  );
  assert(records.length === 0 || typeof base.sidecarSha256 === 'string', 'non-empty records require a sidecar digest');

  const manifestIndex = new Map(manifest.rows.map((row, index) => [row.learnerId, index]));
  const manifestById = new Map(manifest.rows.map((row) => [row.learnerId, row]));
  const byLearnerId = new Map<string, readonly TeacherPhraseProjectionPhrase[]>();
  const phraseIds = new Set<string>();
  let previousManifestIndex = -1;
  for (const [recordIndex, recordValue] of records.entries()) {
    const label = `record ${recordIndex}`;
    assert(isObject(recordValue), `${label} must be an object`);
    assert(hasExactKeys(recordValue, ['learnerId', 'source', 'reviewVersion', 'teacherPhrases']), `${label} keys are invalid`);
    requireText(recordValue.learnerId, `${label} learnerId`);
    const learnerId = recordValue.learnerId;
    const row = manifestById.get(learnerId);
    assert(row !== undefined, `${label} has unknown learner ID '${learnerId}'`);
    assert(!byLearnerId.has(learnerId), `${label} has duplicate learner ID '${learnerId}'`);
    const currentManifestIndex = manifestIndex.get(learnerId)!;
    assert(currentManifestIndex > previousManifestIndex, `${label} is not in learner manifest order`);
    previousManifestIndex = currentManifestIndex;

    const source = recordValue.source;
    assert(isObject(source), `${label} source must be an object`);
    assert(hasExactKeys(source, ['sheet', 'row', 'column', 'sourceRevision']), `${label} source keys are invalid`);
    assert(
      source.sheet === row.sourceSheet
        && source.row === row.sourceRow
        && source.column === '造词/造句',
      `${label} source coordinate mismatch`,
    );
    assert(typeof source.sourceRevision === 'string' && SOURCE_REVISION.test(source.sourceRevision), `${label} sourceRevision is malformed`);
    assert(typeof recordValue.reviewVersion === 'string' && SHA256.test(recordValue.reviewVersion), `${label} reviewVersion is malformed`);

    const phrases = recordValue.teacherPhrases;
    assert(Array.isArray(phrases) && phrases.length > 0, `${label} teacherPhrases must be non-empty`);
    const learnerPhrases: TeacherPhraseProjectionPhrase[] = [];
    for (const [phraseIndex, phraseValue] of phrases.entries()) {
      const phraseLabel = `${label} phrase ${phraseIndex}`;
      assert(isObject(phraseValue), `${phraseLabel} must be an object`);
      const expectedKeys = phraseValue.traditional === undefined
        ? ['phraseId', 'simplified', 'pinyin', 'japanese']
        : ['phraseId', 'simplified', 'traditional', 'pinyin', 'japanese'];
      assert(hasExactKeys(phraseValue, expectedKeys), `${phraseLabel} keys are invalid`);
      assert(typeof phraseValue.phraseId === 'string' && PHRASE_ID.test(phraseValue.phraseId), `${phraseLabel} phraseId is malformed`);
      assert(!phraseIds.has(phraseValue.phraseId), `${phraseLabel} has duplicate phraseId '${phraseValue.phraseId}'`);
      phraseIds.add(phraseValue.phraseId);
      requireText(phraseValue.simplified, `${phraseLabel} simplified`);
      requireText(phraseValue.pinyin, `${phraseLabel} pinyin`);
      requireText(phraseValue.japanese, `${phraseLabel} japanese`);
      if (phraseValue.traditional !== undefined) requireText(phraseValue.traditional, `${phraseLabel} traditional`);
      learnerPhrases.push({
        phraseId: phraseValue.phraseId,
        simplified: phraseValue.simplified,
        ...(phraseValue.traditional === undefined ? {} : { traditional: phraseValue.traditional }),
        pinyin: phraseValue.pinyin,
        japanese: phraseValue.japanese,
      });
    }
    byLearnerId.set(learnerId, learnerPhrases);
  }
  return byLearnerId;
}
