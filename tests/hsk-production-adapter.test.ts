import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GET as getHskAnswers,
  getStaticPaths as getHskAnswerPaths,
} from '../src/pages/data/hsk/[level].json';
import {
  loadHskLearnerProjection,
  loadHskLevelEntries,
  loadHskLevelPools,
  loadHskPublication,
  loadHskVocabulary,
} from '../src/content/loadHskVocabulary';
import { buildHskLevelPools } from '../src/domain/hskLevelPool';
import type { HskVocabularyType } from '../src/types/vocabulary';

const repositoryRoot = process.cwd();
const tempRoots: string[] = [];

interface TestManifest {
  rows: Array<Record<string, unknown> & {
    recordId: string;
    primaryLevel: number;
    repositoryBatchFile?: string;
  }>;
  accounting: {
    sourceCandidates: number;
    eligible: number;
    blocked: number;
    eligibleLevelCounts: Record<string, number>;
    primaryLevelCounts: Record<string, number>;
  };
  source: { attribution: string; modificationNotice: string };
  publication: {
    batches: Array<{ file: string; sha256: string }>;
    repositoryPublishedBatchCount: number;
    repositoryPublishedRecordCount: number;
    sourceEligibleIsHumanReviewed: boolean;
    sourceEligibleIsRuntimeAvailable: boolean;
  };
}

interface TestBatch {
  vocabulary: Array<{
    id: string;
    reviewStatus: string;
    source: { note: string };
    hsk: { introducedAtLevel: number };
  }>;
}

function createSnapshot(): string {
  const root = mkdtempSync(join(tmpdir(), 'chabiko-hsk-adapter-'));
  tempRoots.push(root);
  mkdirSync(join(root, 'data/hsk-import/hearmandarin-hsk-2025-v1'), { recursive: true });
  mkdirSync(join(root, 'data/hsk-vocabulary'), { recursive: true });
  cpSync(
    resolve(repositoryRoot, 'data/hsk-import/hearmandarin-hsk-2025-v1/manifest.json'),
    join(root, 'data/hsk-import/hearmandarin-hsk-2025-v1/manifest.json'),
  );
  for (const name of ['hsk-vocabulary-batch-001.json', 'hsk-vocabulary-level-1-batch-002.json']) {
    cpSync(resolve(repositoryRoot, 'data/hsk-vocabulary', name), join(root, 'data/hsk-vocabulary', name));
  }
  return root;
}

function readManifest(root: string): TestManifest {
  return JSON.parse(readFileSync(join(root, 'data/hsk-import/hearmandarin-hsk-2025-v1/manifest.json'), 'utf8')) as TestManifest;
}

function findUnpublishedEligibleRow(manifest: TestManifest): TestManifest['rows'][number] {
  const row = manifest.rows.find((candidate) =>
    candidate.sourceEligible === true && candidate.repositoryPublication === 'planned-not-published',
  );
  if (!row) throw new Error('No planned eligible test row is available');
  return row;
}

function findBlockedRow(manifest: TestManifest): TestManifest['rows'][number] {
  const row = manifest.rows.find((candidate) => candidate.sourceEligible === false);
  if (!row) throw new Error('No blocked test row is available');
  return row;
}

function writeManifest(root: string, manifest: TestManifest): void {
  writeFileSync(join(root, 'data/hsk-import/hearmandarin-hsk-2025-v1/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function updateBatch(root: string, name: string, mutate: (batch: TestBatch) => void): void {
  const path = join(root, 'data/hsk-vocabulary', name);
  const batch = JSON.parse(readFileSync(path, 'utf8')) as TestBatch;
  mutate(batch);
  const raw = `${JSON.stringify(batch, null, 2)}\n`;
  writeFileSync(path, raw);
  const manifest = readManifest(root);
  const declaration = manifest.publication.batches.find((candidate) => candidate.file === name);
  if (!declaration) throw new Error(`Missing test batch declaration '${name}'`);
  declaration.sha256 = createHash('sha256').update(raw).digest('hex');
  writeManifest(root, manifest);
}

function markReviewed(batch: TestBatch): void {
  for (const entry of batch.vocabulary) {
    entry.reviewStatus = 'reviewed';
    entry.source.note = entry.source.note.replace(
      'Japanese is independently AI-authored and provisional, not human reviewed.',
      'Japanese glosses are human reviewed.',
    );
  }
}

function openSnapshotForLearners(root: string): void {
  const manifest = readManifest(root);
  manifest.publication.sourceEligibleIsHumanReviewed = true;
  manifest.publication.sourceEligibleIsRuntimeAvailable = true;
  manifest.source.modificationNotice = 'Modified retained source fields; Japanese glosses are separately authored and carry per-record review status.';
  writeManifest(root, manifest);
  updateBatch(root, 'hsk-vocabulary-batch-001.json', markReviewed);
}

function reviewedNoticeTokens(root: string): string[] {
  const manifest = readManifest(root);
  const row = manifest.rows.find((candidate) => candidate.repositoryBatchFile === 'hsk-vocabulary-batch-001.json');
  if (!row) throw new Error('No published test row is available');
  return [
    'HearMandarin',
    'https://hearmandarin.com/datasets/',
    'https://creativecommons.org/licenses/by/4.0/',
    'https://hearmandarin.com/terms/',
    'https://hearmandarin.com/data-sources/',
    'Modified by retaining only',
    `Source ID ${row.sourceId};`,
    `global sequence ${row.globalSequence};`,
    `primary level ${row.primaryLevel};`,
    'Japanese glosses are human reviewed.',
  ];
}

async function expectUnavailableSnapshotAcrossConsumers(root: string): Promise<void> {
  const previousRoot = process.cwd();
  process.chdir(root);
  try {
    const bundle = loadHskVocabulary();
    expect(bundle.vocabulary).toEqual([]);
    expect(bundle.learnerVocabulary).toEqual([]);
    expect(bundle.diagnostic).toBeTruthy();

    const { pools, sourceNotice } = loadHskPublication();
    expect(pools).toHaveLength(4);
    expect(pools.every((pool) => pool.status === 'unavailable' && pool.fullRange.length === 0)).toBe(true);
    expect(sourceNotice).toBeNull();

    const projection = loadHskLearnerProjection();
    expect(projection.availability).toBe('unavailable');
    expect(projection.eligibleIds).toEqual([]);

    const paths = getHskAnswerPaths();
    expect(paths.map((path) => path.params.level)).toEqual(['1', '2', '3', '4']);
    for (const { params } of paths) {
      const response = await getHskAnswers({ params } as never);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ entries: [], notice: null });
    }
  } finally {
    process.chdir(previousRoot);
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('production HSK source adapter', () => {
  it('uses the declared source snapshot, retains drafts for authoring, and closes learner pools on false flags', () => {
    const bundle = loadHskVocabulary();
    expect(bundle.vocabulary).toHaveLength(70);
    expect(bundle.vocabulary.every((entry) => entry.reviewStatus === 'draft')).toBe(true);
    expect(bundle.learnerVocabulary).toEqual([]);
    expect(bundle.diagnostic).toContain('humanReviewed=false');
    expect(bundle.diagnostic).toContain('runtimeAvailable=false');
    expect(loadHskLevelPools().map((pool) => [pool.status, pool.counts.fullRange])).toEqual([
      ['unavailable', 0], ['unavailable', 0], ['unavailable', 0], ['unavailable', 0],
    ]);
  });

  it('allows only reviewed rows after both global flags open and reports partial counts', async () => {
    const root = createSnapshot();
    const manifest = readManifest(root);
    manifest.publication.sourceEligibleIsHumanReviewed = true;
    manifest.publication.sourceEligibleIsRuntimeAvailable = true;
    manifest.source.modificationNotice = 'Modified retained source fields; Japanese glosses are separately authored and carry per-record review status.';
    writeManifest(root, manifest);
    updateBatch(root, 'hsk-vocabulary-batch-001.json', markReviewed);

    const bundle = loadHskVocabularyFromRoot(root);
    expect(bundle.vocabulary).toHaveLength(70);
    expect(bundle.learnerVocabulary).toHaveLength(20);
    expect(bundle.learnerVocabulary[0]?.source.note).toContain('Japanese glosses are human reviewed.');
    expect(new Set(readManifest(root).rows.map((row) => row.repositoryPublication))).toEqual(
      new Set(['draft-published-to-repository', 'planned-not-published', 'blocked']),
    );
    const levelOne = loadHskLevelPools(root)[0];
    expect(levelOne?.status).toBe('partial');
    expect(levelOne?.counts).toEqual({ fullRange: 20, newWords: 20, expectedFullRange: 294, expectedNewWords: 294 });
    expect(levelOne?.missingEvidence).toContain('Level 1 full range: expected 294, admitted 20');
    expect(levelOne?.fullRange.map((entry) => entry.id)).toEqual(
      bundle.learnerVocabulary.map((entry) => entry.id),
    );

    const previousRoot = process.cwd();
    process.chdir(root);
    try {
      const response = await getHskAnswers({ params: { level: '1' } } as never);
      const payload = await response.json() as {
        entries: Array<Record<string, unknown>>;
        notice: { attribution: string };
      };
      expect(response.status).toBe(200);
      expect(payload.entries).toHaveLength(20);
      expect(payload.entries.every((entry) => !('traditional' in entry))).toBe(true);
      expect(payload.notice.attribution).toContain('HearMandarin');
    } finally {
      process.chdir(previousRoot);
    }
  });

  it('accepts the required reviewed notice tokens when they are scalar text', () => {
    const root = createSnapshot();
    openSnapshotForLearners(root);
    updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      const entry = batch.vocabulary[0] as unknown as Record<string, unknown>;
      (entry.source as Record<string, unknown>).note = reviewedNoticeTokens(root).join(' ');
    });

    const bundle = loadHskVocabularyFromRoot(root);
    expect(bundle.diagnostic).toBeNull();
    expect(bundle.learnerVocabulary).toHaveLength(20);
    expect(bundle.learnerVocabulary[0]?.source.note).toBe(reviewedNoticeTokens(root).join(' '));
  });

  it('reports available pools only when the admitted snapshot meets each expected denominator', async () => {
    const root = createSnapshot();
    const manifest = readManifest(root);
    manifest.rows = manifest.rows.filter((row) => row.repositoryBatchFile === 'hsk-vocabulary-batch-001.json');
    manifest.accounting.eligible = 20;
    manifest.accounting.blocked = 1;
    manifest.accounting.eligibleLevelCounts = { '1': 20, '2': 0, '3': 0, '4': 0 };
    manifest.accounting.primaryLevelCounts = { '1': 21, '2': 0, '3': 0, '4': 0 };
    manifest.accounting.sourceCandidates = 21;
    manifest.rows.push({
      recordId: 'synthetic-blocked-record',
      sourceId: 'synthetic-blocked-source',
      globalSequence: 2001,
      primaryLevel: 1,
      sourceLevelLabel: '1',
      sourceEligible: false,
      repositoryPublication: 'blocked',
      disposition: 'blocked',
    });
    manifest.publication.batches = manifest.publication.batches.slice(0, 1);
    manifest.publication.repositoryPublishedBatchCount = 1;
    manifest.publication.repositoryPublishedRecordCount = 20;
    manifest.publication.sourceEligibleIsHumanReviewed = true;
    manifest.publication.sourceEligibleIsRuntimeAvailable = true;
    manifest.source.modificationNotice = 'Modified retained source fields; Japanese glosses are separately authored and carry per-record review status.';
    writeManifest(root, manifest);
    updateBatch(root, 'hsk-vocabulary-batch-001.json', markReviewed);

    expect(loadHskVocabulary(undefined, root).diagnostic).toBeNull();
    expect(new Set(readManifest(root).rows.map((row) => row.repositoryPublication))).toEqual(
      new Set(['draft-published-to-repository', 'blocked']),
    );
    const pools = loadHskLevelPools(root);
    expect(pools.map((pool) => pool.status)).toEqual(['available', 'available', 'available', 'available']);
    expect(pools.map((pool) => pool.counts.fullRange)).toEqual([20, 20, 20, 20]);
    expect(pools.map((pool) => pool.counts.newWords)).toEqual([20, 0, 0, 0]);

    const previousRoot = process.cwd();
    process.chdir(root);
    try {
      const projectedEntries = loadHskLevelEntries(1);
      expect(projectedEntries).toHaveLength(20);
      expect(projectedEntries.every((entry) => !('traditional' in entry))).toBe(true);
      const response = await getHskAnswers({ params: { level: '1' } } as never);
      const payload = await response.json() as {
        entries: Array<Record<string, unknown>>;
        notice: { attribution: string; licenseUrl: string };
      };
      expect(response.status).toBe(200);
      expect(payload.entries).toHaveLength(20);
      expect(payload.entries.every((entry) => !('traditional' in entry))).toBe(true);
      expect(payload.entries[0]).toEqual(expect.objectContaining({ id: expect.any(String), simplified: expect.any(String), pinyin: expect.any(String), japanese: expect.any(String) }));
      expect(payload.notice.attribution).toContain('HearMandarin');
      expect(payload.notice.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
    } finally {
      process.chdir(previousRoot);
    }
  });

  it('fails closed if a reviewed row conflicts with a closed manifest gate', () => {
    const root = createSnapshot();
    updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      for (const entry of batch.vocabulary) entry.reviewStatus = 'reviewed';
    });
    expect(loadHskVocabularyFromRoot(root).learnerVocabulary).toEqual([]);
    expect(loadHskVocabularyFromRoot(root).diagnostic).toContain('human-review notice is stale');
    expect(loadHskLevelPools(root)[0]?.status).toBe('unavailable');
  });

  it('fails closed when manifest source accounting is stale', () => {
    const root = createSnapshot();
    const manifest = readManifest(root);
    manifest.accounting.eligible = 1968;
    writeManifest(root, manifest);
    expect(loadHskVocabularyFromRoot(root).vocabulary).toEqual([]);
    expect(loadHskVocabularyFromRoot(root).diagnostic).toContain('level accounting');
  });

  it.each([
    ['missing Japanese answer', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      delete (batch.vocabulary[0] as Record<string, unknown>).japanese;
    })],
    ['non-string Japanese answer', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      (batch.vocabulary[0] as Record<string, unknown>).japanese = 123;
    })],
    ['whitespace-only Japanese answer', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      (batch.vocabulary[0] as Record<string, unknown>).japanese = '  \t';
    })],
    ['whitespace-only Simplified answer', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      const manifest = readManifest(root);
      (manifest.rows[0] as Record<string, unknown>).simplified = '  ';
      writeManifest(root, manifest);
      (batch.vocabulary[0] as Record<string, unknown>).simplified = '  ';
    })],
    ['whitespace-only pinyin answer', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      const manifest = readManifest(root);
      (manifest.rows[0] as Record<string, unknown>).pinyin = '\t';
      writeManifest(root, manifest);
      (batch.vocabulary[0] as Record<string, unknown>).pinyin = '\t';
    })],
    ['matching whitespace-only record identity', (root: string) => {
      const manifest = readManifest(root);
      manifest.rows[0].recordId = '  ';
      writeManifest(root, manifest);
      updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
        batch.vocabulary[0].id = '  ';
      });
    }],
    ['matching empty record identity', (root: string) => {
      const manifest = readManifest(root);
      manifest.rows[0].recordId = '';
      writeManifest(root, manifest);
      updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
        batch.vocabulary[0].id = '';
      });
    }],
    ['whitespace-only source identity', (root: string) => {
      const manifest = readManifest(root);
      (manifest.rows[0] as Record<string, unknown>).sourceId = ' \t ';
      writeManifest(root, manifest);
    }],
    ['whitespace-only batch placement identity', (root: string) => {
      const manifest = readManifest(root);
      (manifest.publication.batches[0] as Record<string, unknown>).placement = '  ';
      writeManifest(root, manifest);
    }],
    ['generated Traditional with a value', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      const entry = batch.vocabulary[0] as unknown as Record<string, unknown>;
      entry.traditional = '未審核繁體';
      entry.traditionalStatus = 'generated';
    })],
    ['unavailable Traditional status with a value', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      const entry = batch.vocabulary[0] as unknown as Record<string, unknown>;
      entry.traditional = '未審核繁體';
      entry.traditionalStatus = 'unavailable';
    })],
    ['excluded publisher English gloss field', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      (batch.vocabulary[0] as unknown as Record<string, unknown>).english = 'unlicensed gloss';
    })],
    ['generated Simplified status', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      (batch.vocabulary[0] as unknown as Record<string, unknown>).simplifiedStatus = 'generated';
    })],
    ['otherwise valid token array in a reviewed note', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      const entry = batch.vocabulary[0] as unknown as Record<string, unknown>;
      const source = entry.source as Record<string, unknown>;
      source.note = reviewedNoticeTokens(root);
    })],
    ['contradictory full review sentence in a reviewed token array', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      const entry = batch.vocabulary[0] as unknown as Record<string, unknown>;
      const source = entry.source as Record<string, unknown>;
      source.note = [
        ...reviewedNoticeTokens(root),
        'Japanese is independently AI-authored and provisional, not human reviewed.',
      ];
    })],
    ['contradictory full review sentence in a reviewed scalar note', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      const entry = batch.vocabulary[0] as unknown as Record<string, unknown>;
      const source = entry.source as Record<string, unknown>;
      source.note = [...reviewedNoticeTokens(root), 'Japanese is independently AI-authored and provisional, not human reviewed.'].join(' ');
    })],
    ['array-valued manifest attribution', (root: string) => {
      const manifest = readManifest(root);
      (manifest.source as unknown as Record<string, unknown>).attribution = ['HearMandarin'];
      writeManifest(root, manifest);
    }],
    ['array-valued manifest modification notice', (root: string) => {
      const manifest = readManifest(root);
      (manifest.source as unknown as Record<string, unknown>).modificationNotice = [
        'Japanese glosses are separately authored',
      ];
      writeManifest(root, manifest);
    }],
    ['unpublished eligible row with whitespace Simplified coordinate', (root: string) => {
      const manifest = readManifest(root);
      const row = manifest.rows.find((candidate) =>
        candidate.repositoryPublication !== 'draft-published-to-repository' && candidate.sourceEligible === true,
      );
      if (!row) throw new Error('No unpublished eligible test row is available');
      row.simplified = ' \t ';
      writeManifest(root, manifest);
    }],
    ['unpublished eligible row with whitespace pinyin coordinate', (root: string) => {
      const manifest = readManifest(root);
      const row = manifest.rows.find((candidate) =>
        candidate.repositoryPublication !== 'draft-published-to-repository' && candidate.sourceEligible === true,
      );
      if (!row) throw new Error('No unpublished eligible test row is available');
      row.pinyin = ' \t ';
      writeManifest(root, manifest);
    }],
    ['matching whitespace manifest and batch source-level label', (root: string) => {
      const manifest = readManifest(root);
      const row = manifest.rows.find((candidate) =>
        candidate.repositoryBatchFile === 'hsk-vocabulary-batch-001.json',
      );
      if (!row) throw new Error('No declared test batch row is available');
      row.sourceLevelLabel = ' \t ';
      writeManifest(root, manifest);
      updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
        (batch.vocabulary[0].hsk as unknown as Record<string, unknown>).sourceLevelLabel = ' \t ';
      });
    }],
    ['missing unpublished eligible publication state', (root: string) => {
      const manifest = readManifest(root);
      delete findUnpublishedEligibleRow(manifest).repositoryPublication;
      writeManifest(root, manifest);
    }],
    ['array-valued unpublished eligible publication state', (root: string) => {
      const manifest = readManifest(root);
      findUnpublishedEligibleRow(manifest).repositoryPublication = ['planned-not-published'];
      writeManifest(root, manifest);
    }],
    ['null unpublished eligible publication state', (root: string) => {
      const manifest = readManifest(root);
      findUnpublishedEligibleRow(manifest).repositoryPublication = null;
      writeManifest(root, manifest);
    }],
    ['unknown unpublished eligible publication state', (root: string) => {
      const manifest = readManifest(root);
      findUnpublishedEligibleRow(manifest).repositoryPublication = 'published';
      writeManifest(root, manifest);
    }],
    ['blank unpublished eligible publication state', (root: string) => {
      const manifest = readManifest(root);
      findUnpublishedEligibleRow(manifest).repositoryPublication = ' \t ';
      writeManifest(root, manifest);
    }],
    ['eligible unpublished row claiming blocked state', (root: string) => {
      const manifest = readManifest(root);
      findUnpublishedEligibleRow(manifest).repositoryPublication = 'blocked';
      writeManifest(root, manifest);
    }],
    ['blocked row claiming planned state', (root: string) => {
      const manifest = readManifest(root);
      findBlockedRow(manifest).repositoryPublication = 'planned-not-published';
      writeManifest(root, manifest);
    }],
  ])('quarantines the complete snapshot across production consumers for %s', async (_label, corrupt) => {
    const root = createSnapshot();
    openSnapshotForLearners(root);
    corrupt(root);
    await expectUnavailableSnapshotAcrossConsumers(root);
  });

  it('validates opaque record IDs without normalizing their bytes', () => {
    const root = createSnapshot();
    const opaqueId = ' source-specific opaque ID ';
    const manifest = readManifest(root);
    manifest.rows[0].recordId = opaqueId;
    writeManifest(root, manifest);
    updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      batch.vocabulary[0].id = opaqueId;
    });

    const bundle = loadHskVocabulary(undefined, root);
    expect(bundle.vocabulary[0]?.id).toBe(opaqueId);
    expect(bundle.diagnostic).toContain('humanReviewed=false');
  });

  it('emits declared rows in global manifest order when batch declarations are reversed', () => {
    const root = createSnapshot();
    const manifest = readManifest(root);
    manifest.publication.batches.reverse();
    writeManifest(root, manifest);
    const entries = loadHskVocabularyFromRoot(root).vocabulary;
    expect(entries[0]?.id).toBe('hm-hsk3-w00001');
    expect(entries[19]?.id).toBe('hm-hsk3-w00021');
    expect(entries[20]?.id).toBe('hm-hsk3-w00022');
  });

  it.each([
    ['missing batch', (root: string) => rmSync(join(root, 'data/hsk-vocabulary/hsk-vocabulary-batch-001.json'))],
    ['incomplete rights notice', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      batch.vocabulary[0].source.note = 'Source: HearMandarin';
    })],
    ['stale manifest coordinate', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      batch.vocabulary[0].hsk.introducedAtLevel = 2;
    })],
    ['duplicate identity', (root: string) => updateBatch(root, 'hsk-vocabulary-batch-001.json', (batch) => {
      batch.vocabulary[1].id = batch.vocabulary[0].id;
    })],
    ['stale checksum', (root: string) => {
      const manifest = readManifest(root);
      manifest.publication.batches[0].sha256 = '0'.repeat(64);
      writeManifest(root, manifest);
    }],
  ])('returns no source or learner rows for %s evidence', (_label, mutate) => {
    const root = createSnapshot();
    mutate(root);
    const bundle = loadHskVocabularyFromRoot(root);
    expect(bundle.vocabulary).toEqual([]);
    expect(bundle.learnerVocabulary).toEqual([]);
    expect(bundle.diagnostic).toBeTruthy();
    expect(loadHskLevelPools(root).every((pool) => pool.status === 'unavailable')).toBe(true);
  });
});

describe('pure HSK level pools', () => {
  it('preserves input order and derives cumulative and new-word counts immutably', () => {
    const source = loadHskVocabulary().vocabulary.slice(0, 4);
    const levels = [1, 2, 2, 4] as const;
    const entries = source.map((entry, index) => ({
      ...entry,
      id: `synthetic-${index}`,
      hsk: { ...entry.hsk, introducedAtLevel: levels[index] ?? 1 },
    })) as HskVocabularyType[];
    const pools = buildHskLevelPools(entries, { 1: 2, 2: 2, 3: 1, 4: 3 });
    expect(pools.map((pool) => pool.fullRange.map((entry) => entry.id))).toEqual([
      ['synthetic-0'],
      ['synthetic-0', 'synthetic-1', 'synthetic-2'],
      ['synthetic-0', 'synthetic-1', 'synthetic-2'],
      ['synthetic-0', 'synthetic-1', 'synthetic-2', 'synthetic-3'],
    ]);
    expect(pools.map((pool) => pool.newWords.map((entry) => entry.id))).toEqual([
      ['synthetic-0'], ['synthetic-1', 'synthetic-2'], [], ['synthetic-3'],
    ]);
    expect(pools[0]?.counts).toEqual({ fullRange: 1, newWords: 1, expectedFullRange: 2, expectedNewWords: 2 });
    expect(Object.isFrozen(pools) && Object.isFrozen(pools[0]) && Object.isFrozen(pools[0]?.fullRange)).toBe(true);
    expect(Object.isFrozen(pools[0]?.fullRange[0])).toBe(true);
  });
});

function loadHskVocabularyFromRoot(root: string) {
  // The adapter accepts a root for hermetic production-layout fixtures via the pool API.
  // Requiring the public loader to expose this test seam avoids changing process cwd.
  return loadHskVocabularyAtRoot(root);
}

function loadHskVocabularyAtRoot(root: string) {
  return loadHskVocabulary(undefined, root);
}
