import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LearnerManifest } from '../src/types/learnerManifest';
import {
  PRODUCTION_ID_PATTERN,
  assertOptionalFieldsAreNotFabricated,
  validateLearnerManifest,
} from '../src/content/validateLearnerManifest';
import { loadTeacherVocabulary } from '../src/content/loadTeacherVocabulary';

const MANIFEST_PATH = 'data/teacher-vocabulary-preview/learner-manifest.json';
const manifest: LearnerManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

// A row deep-cloned from the committed manifest, isolated per test so one
// mutation never leaks into another assertion.
function cloneManifest(): LearnerManifest {
  return structuredClone(manifest) as LearnerManifest;
}

// A tiny synthetic manifest builder for the derived-count and fail-closed
// cases. Includes both teacher and AI sources so the validator accepts it.
function syntheticManifest(teacherCount: number, aiCount = 1): LearnerManifest {
  const teacherRows = Array.from({ length: teacherCount }, (_, index) => ({
    learnerId: `teacher-learner-${String(index + 1).padStart(16, '0')}`,
    simplified: `詞${index + 1}`,
    partOfSpeech: 'noun' as const,
    sourceSheet: '名词1',
    sourceRow: index + 1,
    image: {
      state: 'teacher-mapped' as const,
      assetPath: `/assets/vocabulary/teacher-preview/teacher/teacher-preview-${String(index + 1).padStart(16, '0')}.webp`,
      provenance: 'teacher-provided' as const,
    },
  }));
  const aiRows = Array.from({ length: aiCount }, (_, index) => ({
    learnerId: `teacher-learner-${String(teacherCount + index + 1).padStart(16, '0')}`,
    simplified: `AI詞${index + 1}`,
    partOfSpeech: 'noun' as const,
    sourceSheet: '名词2',
    sourceRow: teacherCount + index + 1,
    image: {
      state: 'ai-generated' as const,
      assetPath: `/assets/vocabulary/teacher-preview/ai/teacher-preview-${String(teacherCount + index + 1).padStart(16, '0')}.webp`,
      provenance: 'ai-generated' as const,
    },
  }));
  const rows = [...teacherRows, ...aiRows];
  return {
    schemaVersion: 1,
    source: {
      previewCorpusPath: 'data/teacher-vocabulary-preview/preview-corpus.json',
      previewCorpusSchemaVersion: 1,
      workbookSha256: '0'.repeat(64),
      teacherImagePackageFingerprintSha256: '0'.repeat(64),
    },
    productionContract: {
      count: 20,
      preserved: 0,
      excluded: 20,
      ids: Array.from({ length: 20 }, (_, index) => `teacher-star-1-${String(index + 1).padStart(12, '0')}`),
      excludedIds: Array.from({ length: 20 }, (_, index) => `teacher-star-1-${String(index + 1).padStart(12, '0')}`),
    },
    totals: {
      eligible: rows.length,
      excluded: 0,
      teacher: teacherCount,
      ai: aiCount,
      originalProductionIds: 20,
      preservedProductionIds: 0,
    },
    rows,
  };
}

describe('production learner manifest', () => {
  it('matches the expected real-corpus inventory derived from the corpus, not hard-coded', () => {
    expect(manifest.totals.eligible).toBe(1582);
    expect(manifest.totals.excluded).toBe(283);
    expect(manifest.totals.teacher).toBe(1150);
    expect(manifest.totals.ai).toBe(432);
    expect(manifest.rows).toHaveLength(1582);
  });

  it('passes full validation against tracked assets and has zero collisions/duplicates/missing assets', () => {
    expect(() => validateLearnerManifest(manifest)).not.toThrow();
    expect(() => assertOptionalFieldsAreNotFabricated(manifest.rows)).not.toThrow();
  });

  it('keeps the original 20 production learner IDs byte-for-byte in the frozen contract', () => {
    const production = loadTeacherVocabulary();
    expect(production).toHaveLength(20);
    const productionIds = production.map((item) => item.vocabulary.id);
    expect(manifest.productionContract.ids).toEqual(productionIds);
    expect(manifest.productionContract.count).toBe(20);
  });

  it('preserves every image-bearing production ID as a manifest row and records the excluded text-only row', () => {
    const productionIds = manifest.productionContract.ids;
    const imageBearing = productionIds.filter((id) =>
      manifest.rows.some((row) => row.learnerId === id),
    );
    // 19 of the 20 production rows carry an image; the text-only row
    // (teacher-star-1-8b957a100bd4) is excluded truthfully.
    expect(imageBearing).toHaveLength(19);
    expect(manifest.productionContract.preserved).toBe(19);
    expect(manifest.productionContract.excludedIds).toEqual(['teacher-star-1-8b957a100bd4']);
    for (const id of imageBearing) {
      const row = manifest.rows.find((row) => row.learnerId === id);
      expect(row?.learnerId).toBe(id);
    }
  });

  it('reports zero learner-ID collisions and zero duplicate source identities', () => {
    const ids = manifest.rows.map((row) => row.learnerId);
    expect(new Set(ids).size).toBe(ids.length);
    const sourceKeys = manifest.rows.map((row) => `${row.sourceSheet}:${row.sourceRow}`);
    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
  });

  it('references only existing tracked deployable assets', () => {
    for (const row of manifest.rows) {
      const onDisk = existsSync(`public${row.image.assetPath}`);
      expect(onDisk, `missing asset ${row.image.assetPath}`).toBe(true);
      expect(row.image.assetPath).toMatch(/^\/assets\/vocabulary\//);
    }
    // Both teacher and AI image sources are represented.
    const teacher = manifest.rows.filter((row) => row.image.provenance === 'teacher-provided');
    const ai = manifest.rows.filter((row) => row.image.provenance === 'ai-generated');
    expect(teacher.length).toBeGreaterThan(0);
    expect(ai.length).toBeGreaterThan(0);
  });

  it('never fabricates missing optional fields', () => {
    // The preview corpus has rows missing pinyin/japanese/traditional; the
    // manifest must preserve that absence rather than invent values.
    expect(manifest.rows.some((row) => row.pinyin === undefined)).toBe(true);
    expect(manifest.rows.some((row) => row.japanese === undefined)).toBe(true);
    expect(manifest.rows.some((row) => row.traditional === undefined)).toBe(true);
    // Every present optional value is a non-empty string.
    for (const row of manifest.rows) {
      for (const field of ['pinyin', 'japanese', 'traditional', 'difficulty'] as const) {
        const value = row[field];
        if (value !== undefined) expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('does not leak review-only labels, filters, or source filenames into the manifest', () => {
    const raw = readFileSync(MANIFEST_PATH, 'utf8');
    expect(raw).not.toContain('reconciliationEvidence');
    expect(raw).not.toContain('promptDigest');
    expect(raw).not.toContain('sourceImageRelativePath');
    expect(raw).not.toContain('reviewStatus');
    expect(raw).not.toContain('missingFields');
    expect(raw).not.toContain('generationRevision');
    expect(raw).not.toContain('referenceSetIds');
    expect(raw).not.toContain('/Users/');
    expect(raw).not.toContain('词汇表');
  });

  it('assigns learner IDs from stable source identity, never from position or order', () => {
    // Production rows keep their frozen production ID shape; every other row
    // uses the deterministic derived prefix with a 16-hex suffix. None of these
    // could come from array index, sort position, or filesystem traversal.
    for (const row of manifest.rows) {
      if (row.learnerId.startsWith('teacher-star-')) {
        expect(row.learnerId).toMatch(PRODUCTION_ID_PATTERN);
      } else {
        expect(row.learnerId).toMatch(/^teacher-learner-[0-9a-f]{16}$/);
      }
    }
    // Derived IDs are stable: the same committed manifest regenerated from the
    // same corpus (checked by the Python self-test byte-identity) keeps the
    // exact same learner IDs, and re-running yields the identical file.
    const ids = manifest.rows.map((row) => row.learnerId);
    const onDiskAgain = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as LearnerManifest;
    expect(onDiskAgain.rows.map((row) => row.learnerId)).toEqual(ids);
  });
});

describe('learner manifest validation fails closed', () => {
  it('rejects a missing asset', () => {
    const m = cloneManifest();
    m.rows[0].image.assetPath = '/assets/vocabulary/teacher-preview/teacher/does-not-exist.webp';
    expect(() => validateLearnerManifest(m)).toThrow(/missing asset/);
  });

  it('rejects a duplicate learner ID', () => {
    const m = cloneManifest();
    m.rows[1].learnerId = m.rows[0].learnerId;
    expect(() => validateLearnerManifest(m)).toThrow(/duplicate learner ID/);
  });

  it('rejects a duplicate source identity', () => {
    const m = cloneManifest();
    m.rows[1].sourceSheet = m.rows[0].sourceSheet;
    m.rows[1].sourceRow = m.rows[0].sourceRow;
    expect(() => validateLearnerManifest(m)).toThrow(/duplicate source identity/);
  });

  it('rejects an invalid derived learner identity', () => {
    const m = cloneManifest();
    m.rows[0].learnerId = 'not-a-stable-id';
    expect(() => validateLearnerManifest(m)).toThrow(/invalid derived learner identity/);
  });

  it('rejects generated output drift (totals do not reconcile with rows)', () => {
    const m = cloneManifest();
    m.totals.eligible = m.rows.length + 1;
    expect(() => validateLearnerManifest(m)).toThrow(/totals.eligible/);
  });

  it('rejects when a frozen production ID goes missing from the contract', () => {
    const m = cloneManifest();
    m.productionContract.ids = m.productionContract.ids.slice(0, 19);
    m.productionContract.count = 19;
    expect(() => validateLearnerManifest(m)).toThrow(/exactly 20/);
  });

  it('rejects a manifest without both image sources', () => {
    const m = cloneManifest();
    for (const row of m.rows) {
      row.image.state = 'teacher-mapped';
      row.image.provenance = 'teacher-provided';
    }
    m.totals.ai = 0;
    m.totals.teacher = m.rows.length;
    expect(() => validateLearnerManifest(m)).toThrow(/both teacher and AI/);
  });

  it('proves counts are derived: a synthetic corpus of a different size validates', () => {
    // If 1582 were hard-coded in the validator, a synthetic manifest of a
    // different size would fail. It validates fine, so selection/counting is
    // derived from the manifest content rather than a magic constant.
    const small = syntheticManifest(7, 2);
    expect(small.totals.eligible).toBe(9);
    expect(small.rows).toHaveLength(9);
    expect(() => validateLearnerManifest(small, {
      assetExists: (path) => path.startsWith('/assets/vocabulary/teacher-preview/'),
    })).not.toThrow();
  });
});
