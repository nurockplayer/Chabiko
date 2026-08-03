import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import type { LearnerManifest, LearnerManifestRow } from '../src/types/learnerManifest';
import type { ProductionLearnerItem } from '../src/types/learnerCorpus';
import { computeDerivedLearnerId } from '../src/content/validateLearnerManifest';

// ─── WebP stub builders ─────────────────────────────────────────────────────

function vp8x(width: number, height: number): Uint8Array {
  const data = new Uint8Array(10);
  const w = width - 1;
  const h = height - 1;
  data[4] = w & 0xff;
  data[5] = (w >> 8) & 0xff;
  data[6] = (w >> 16) & 0xff;
  data[7] = h & 0xff;
  data[8] = (h >> 8) & 0xff;
  data[9] = (h >> 16) & 0xff;
  return concat(
    ascii('RIFF'), u32(4 + 8 + 4 + data.length), ascii('WEBP'),
    ascii('VP8X'), u32(data.length), data,
  );
}

function vp8l(width: number, height: number): Uint8Array {
  const bits = (width - 1) | ((height - 1) << 14);
  const data = new Uint8Array(5);
  data[0] = 0x2f;
  data[1] = bits & 0xff;
  data[2] = (bits >> 8) & 0xff;
  data[3] = (bits >> 16) & 0xff;
  data[4] = (bits >> 24) & 0xff;
  return concat(
    ascii('RIFF'), u32(4 + 8 + 4 + data.length), ascii('WEBP'),
    ascii('VP8L'), u32(data.length), data,
  );
}

function vp8(width: number, height: number): Uint8Array {
  // Real VP8 lossy keyframe chunk data: 3-byte frame tag, keyframe start code
  // 0x9d 0x01 0x2a, then width/height as separate little-endian 16-bit fields.
  const data = new Uint8Array(10);
  data[3] = 0x9d;
  data[4] = 0x01;
  data[5] = 0x2a;
  data[6] = width & 0xff;
  data[7] = (width >> 8) & 0xff;
  data[8] = height & 0xff;
  data[9] = (height >> 8) & 0xff;
  return concat(
    ascii('RIFF'), u32(4 + 8 + 4 + data.length), ascii('WEBP'),
    ascii('VP8 '), u32(data.length), data,
  );
}

function ascii(s: string): Uint8Array {
  return new Uint8Array(s.split('').map((c) => c.charCodeAt(0)));
}

function u32(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ─── Synthetic manifest builder ─────────────────────────────────────────────

const MANIFEST_PATH = '../data/teacher-vocabulary-preview/learner-manifest.json';
const ILLUSTRATION_PATH = '../data/illustrations/teacher-core-v1/teacher-vocabulary-batch-01.json';

const realManifest: LearnerManifest = JSON.parse(
  fs.readFileSync('data/teacher-vocabulary-preview/learner-manifest.json', 'utf8'),
);

function cloneManifest(): LearnerManifest {
  return structuredClone(realManifest) as LearnerManifest;
}

type LearnerManifestRowBase = Omit<LearnerManifestRow, 'learnerId'>;

/** A tiny manifest with only derived (non-production) rows, so it needs no
 * batch-01 alt mapping. teacher > 0 and ai > 0 keep the #201 validator happy. */
function syntheticManifest(teacherCount: number, aiCount = 1): LearnerManifest {
  const teacherRows: LearnerManifestRow[] = Array.from({ length: teacherCount }, (_, index) => {
    const row: LearnerManifestRowBase = {
      simplified: `詞${index + 1}`,
      partOfSpeech: 'noun' as const,
      sourceSheet: '名词1',
      sourceRow: index + 1,
      image: {
        state: 'teacher-mapped' as const,
        assetPath: `/assets/vocabulary/teacher-preview/teacher/teacher-preview-${String(index + 1).padStart(16, '0')}.webp`,
        provenance: 'teacher-provided' as const,
      },
    };
    return { ...row, learnerId: computeDerivedLearnerId(row) };
  });
  const aiRows: LearnerManifestRow[] = Array.from({ length: aiCount }, (_, index) => {
    const row: LearnerManifestRowBase = {
      simplified: `AI詞${index + 1}`,
      partOfSpeech: 'noun' as const,
      sourceSheet: '名词2',
      sourceRow: teacherCount + index + 1,
      image: {
        state: 'ai-generated' as const,
        assetPath: `/assets/vocabulary/teacher-preview/ai/teacher-preview-${String(teacherCount + index + 1).padStart(16, '0')}.webp`,
        provenance: 'ai-generated' as const,
      },
    };
    return { ...row, learnerId: computeDerivedLearnerId(row) };
  });
  const rows = [...teacherRows, ...aiRows];
  const ids = Array.from({ length: 20 }, (_, index) => `teacher-star-1-${String(index + 1).padStart(12, '0')}`);
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
      ids,
      excludedIds: ids,
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

async function importCorpusLoader(manifestOverride?: LearnerManifest) {
  vi.resetModules();
  if (manifestOverride) {
    vi.doMock(MANIFEST_PATH, () => ({ default: structuredClone(manifestOverride) }));
  }
  const mod = await import('../src/content/loadProductionLearnerCorpus');
  return mod;
}

afterEach(() => {
  vi.doUnmock(MANIFEST_PATH);
  vi.doUnmock(ILLUSTRATION_PATH);
  vi.resetModules();
});

const alwaysTracked = () => true;

// ─── Real-corpus tests ──────────────────────────────────────────────────────

describe('loadProductionLearnerCorpus — real manifest', () => {
  it('returns the exact eligible manifest count, derived not hard-coded', async () => {
    const { loadProductionLearnerCorpus } = await importCorpusLoader();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    expect(corpus).toHaveLength(realManifest.totals.eligible);
    expect(corpus).toHaveLength(realManifest.rows.length);
    expect(corpus.length).not.toBe(20);
  });

  it('returns items in manifest order', async () => {
    const { loadProductionLearnerCorpus } = await importCorpusLoader();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    expect(corpus.map((item) => item.learnerId)).toEqual(realManifest.rows.map((row) => row.learnerId));
  });

  it('preserves the original 19 image-bearing production IDs with truthful values', async () => {
    const { loadProductionLearnerCorpus } = await importCorpusLoader();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    const productionIds = realManifest.productionContract.ids.filter(
      (id) => !realManifest.productionContract.excludedIds.includes(id),
    );
    const items = corpus.filter((item) => item.learnerId.startsWith('teacher-star-'));
    expect(items.map((item) => item.learnerId).sort()).toEqual([...productionIds].sort());
    // The text-only production row is excluded from the corpus.
    expect(corpus.some((item) => item.learnerId === 'teacher-star-1-8b957a100bd4')).toBe(false);
    // Values agree with the frozen production contract for every preserved ID.
    for (const id of productionIds) {
      const row = realManifest.rows.find((r) => r.learnerId === id);
      const item = corpus.find((i) => i.learnerId === id);
      expect(item).toBeDefined();
      expect(item!.simplified).toBe(row!.simplified);
      if (row!.pinyin !== undefined) expect(item!.pinyin).toBe(row!.pinyin);
      if (row!.japanese !== undefined) expect(item!.japanese).toBe(row!.japanese);
      if (row!.traditional !== undefined) expect(item!.traditional).toBe(row!.traditional);
    }
  });

  it('loads every row with a deployed illustration resolved from the asset', async () => {
    const { loadProductionLearnerCorpus } = await importCorpusLoader();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    for (const item of corpus) {
      expect(item.illustration.assetPath).toBe(
        realManifest.rows.find((r) => r.learnerId === item.learnerId)!.image.assetPath,
      );
      expect(item.illustration.width).toBeGreaterThan(0);
      expect(item.illustration.height).toBeGreaterThan(0);
    }
  });

  it('renders missing optional fields truthfully as absent', async () => {
    const { loadProductionLearnerCorpus } = await importCorpusLoader();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    expect(corpus.some((item) => item.pinyin === undefined)).toBe(true);
    expect(corpus.some((item) => item.japanese === undefined)).toBe(true);
    expect(corpus.some((item) => item.traditional === undefined)).toBe(true);
    // Present optional values stay present.
    expect(corpus.some((item) => item.pinyin !== undefined)).toBe(true);
    expect(corpus.some((item) => item.japanese !== undefined)).toBe(true);
    expect(corpus.some((item) => item.traditional !== undefined)).toBe(true);
  });

  it('uses authored Japanese alt for the production 19 and the frozen decorative fallback elsewhere', async () => {
    const { loadProductionLearnerCorpus, DECORATIVE_ALT_JA } = await importCorpusLoader();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    for (const item of corpus) {
      if (item.learnerId.startsWith('teacher-star-')) {
        expect(item.illustration.altJa.length).toBeGreaterThan(0);
      } else {
        expect(item.illustration.altJa).toBe(DECORATIVE_ALT_JA);
      }
    }
  });

  it('deeply freezes the collection, items, and nested illustration', async () => {
    const { loadProductionLearnerCorpus } = await importCorpusLoader();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    expect(Object.isFrozen(corpus)).toBe(true);
    for (const item of corpus) {
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.illustration)).toBe(true);
    }
    expect(() => { (corpus as ProductionLearnerItem[]).push({} as ProductionLearnerItem); }).toThrow();
    expect(() => { (corpus[0] as unknown as Record<string, unknown>).simplified = 'x'; }).toThrow();
    expect(() => { (corpus[0].illustration as unknown as Record<string, unknown>).altJa = 'x'; }).toThrow();
  });

  it('produces independent references per call and is deterministic', async () => {
    const { loadProductionLearnerCorpus } = await importCorpusLoader();
    const a = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    const b = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a[0].illustration).not.toBe(b[0].illustration);
  });

  it('does not leak preview-only fields or review metadata into the API', async () => {
    const { loadProductionLearnerCorpus } = await importCorpusLoader();
    const corpus = loadProductionLearnerCorpus({ assetTracked: alwaysTracked });
    const forbidden = [
      'sourceSheet', 'sourceRow', 'reviewStatus', 'reconciliationEvidence',
      'sourceImageRelativePath', 'missingFields', 'promptDigest',
      'generationRevision', 'referenceSetIds', 'curriculum', 'source', 'rights',
    ];
    for (const item of corpus) {
      for (const key of forbidden) {
        expect(Object.keys(item)).not.toContain(key);
        expect(Object.keys(item.illustration)).not.toContain(key);
      }
    }
  });
});

describe('parseWebpDimensions', () => {
  it('parses VP8X extended canvas dimensions', async () => {
    const { parseWebpDimensions } = await import('../src/content/webpDimensions');
    expect(parseWebpDimensions(vp8x(512, 512))).toEqual({ width: 512, height: 512 });
    expect(parseWebpDimensions(vp8x(501, 500))).toEqual({ width: 501, height: 500 });
  });

  it('parses VP8L lossless dimensions', async () => {
    const { parseWebpDimensions } = await import('../src/content/webpDimensions');
    expect(parseWebpDimensions(vp8l(512, 512))).toEqual({ width: 512, height: 512 });
    expect(parseWebpDimensions(vp8l(501, 501))).toEqual({ width: 501, height: 501 });
  });

  it('parses a standards-valid VP8 lossy keyframe', async () => {
    const { parseWebpDimensions } = await import('../src/content/webpDimensions');
    expect(parseWebpDimensions(vp8(500, 500))).toEqual({ width: 500, height: 500 });
    expect(parseWebpDimensions(vp8(501, 500))).toEqual({ width: 501, height: 500 });
  });

  it('fails closed on a VP8 keyframe with an invalid start code', async () => {
    const { parseWebpDimensions } = await import('../src/content/webpDimensions');
    const bytes = vp8(500, 500);
    bytes[23] = 0x00;
    expect(() => parseWebpDimensions(bytes)).toThrow(/start code/i);
  });

  it('fails closed on VP8 zero dimensions', async () => {
    const { parseWebpDimensions } = await import('../src/content/webpDimensions');
    expect(() => parseWebpDimensions(vp8(0, 500))).toThrow(/zero dimensions/i);
    expect(() => parseWebpDimensions(vp8(500, 0))).toThrow(/zero dimensions/i);
  });

  it('fails closed on non-WebP payloads', async () => {
    const { parseWebpDimensions } = await import('../src/content/webpDimensions');
    expect(() => parseWebpDimensions(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => parseWebpDimensions(vp8x(500, 500).slice(0, 20))).toThrow();
  });
});

// ─── Derived-count and fail-closed tests ────────────────────────────────────

describe('loadProductionLearnerCorpus — derived count', () => {
  it('scales with synthetic corpus size instead of hard-coding 20 or 1582', async () => {
    const small = syntheticManifest(5, 2);
    const { loadProductionLearnerCorpus } = await importCorpusLoader(small);
    const corpus = loadProductionLearnerCorpus({
      assetTracked: alwaysTracked,
      readAssetBytes: () => vp8x(500, 500),
    });
    expect(corpus).toHaveLength(7);
    expect(corpus).toHaveLength(small.totals.eligible);
    expect(corpus.map((item) => item.learnerId)).toEqual(small.rows.map((row) => row.learnerId));
    expect(corpus.every((item) => item.illustration.altJa === '')).toBe(true);
  });
});

describe('loadProductionLearnerCorpus — fail closed', () => {
  async function assertThrows(
    manifestOverride: LearnerManifest,
    pattern: RegExp,
    readAssetBytes: (path: string) => Uint8Array = () => vp8x(500, 500),
  ): Promise<void> {
    const { loadProductionLearnerCorpus } = await importCorpusLoader(manifestOverride);
    expect(() => loadProductionLearnerCorpus({ assetTracked: alwaysTracked, readAssetBytes })).toThrow(pattern);
  }

  it('rejects a malformed row (empty simplified)', async () => {
    const m = cloneManifest();
    const row = m.rows[0];
    row.simplified = '   ';
    row.learnerId = computeDerivedLearnerId(row);
    await assertThrows(m, /empty simplified/);
  });

  it('rejects a malformed row (invalid partOfSpeech)', async () => {
    const m = cloneManifest();
    m.rows[0].partOfSpeech = 'unknown' as never;
    await assertThrows(m, /invalid partOfSpeech/);
  });

  it('rejects a duplicate learner ID', async () => {
    const m = cloneManifest();
    m.rows[1].learnerId = m.rows[0].learnerId;
    await assertThrows(m, /duplicate learner ID/);
  });

  it('rejects a duplicate source identity', async () => {
    const m = cloneManifest();
    m.rows[1].sourceSheet = m.rows[0].sourceSheet;
    m.rows[1].sourceRow = m.rows[0].sourceRow;
    await assertThrows(m, /duplicate source identity/);
  });

  it('rejects a missing asset (read fails for its path)', async () => {
    const m = cloneManifest();
    const badPath = m.rows[0].image.assetPath;
    await assertThrows(m, /no such file|ENOENT/i, (path) => {
      if (path === badPath) throw new Error(`no such file ${path}`);
      return vp8x(500, 500);
    });
  });

  it('rejects invalid dimensions (non-WebP asset bytes)', async () => {
    const m = cloneManifest();
    await assertThrows(m, /RIFF|WEBP|chunk|truncated/i, () => new Uint8Array([0, 0, 0, 0]));
  });

  it('rejects contradictory optional-field metadata (fabricated value)', async () => {
    const m = cloneManifest();
    m.rows[0].pinyin = '   ';
    await assertThrows(m, /empty optional field/);
  });

  it('rejects a production row without an authored Japanese alt text', async () => {
    // Replace one image-bearing production row's ID with the text-only
    // production ID (teacher-star-1-8b957a100bd4), which has no batch-01
    // illustration alt. There are still 19 preserved rows; the replaced ID
    // (teacher-star-1-37e0eb213f0f) becomes the single excluded member.
    const m = cloneManifest();
    const firstProdIndex = m.rows.findIndex((row) => row.learnerId.startsWith('teacher-star-'));
    m.rows[firstProdIndex].learnerId = 'teacher-star-1-8b957a100bd4';
    m.productionContract.preserved = 19;
    m.productionContract.excluded = 1;
    m.productionContract.excludedIds = ['teacher-star-1-37e0eb213f0f'];
    await assertThrows(m, /no authored Japanese alt text/);
  });
});
