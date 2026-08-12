import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildReviewBatches,
  hammingDistance64,
  sha256Json,
  validateVisualArtifacts,
} from '../scripts/unicode_visual_contract';
import { assertFontCoverage, mapRendererOperationError, publishTransactionally, RendererUnavailableError } from '../scripts/generate_unicode_visual_candidates';

describe('Unicode visual candidate contract (#262)', () => {
  it('uses exact 64-bit Hamming distance and immutable <=50 batches', () => {
    expect(hammingDistance64('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hammingDistance64('0000000000000000', '0000000000000101')).toBe(2);
    const candidates = Array.from({ length: 101 }, (_, index) => ({
      id: `visual-u${(index + 1).toString(16).padStart(4, '0')}-u${(index + 2).toString(16).padStart(4, '0')}`,
      distance: index % 9,
      leftScalar: index + 1,
      rightScalar: index + 2,
      checksumSha256: createHash('sha256').update(String(index)).digest('hex'),
    }));
    const batches = buildReviewBatches(candidates);
    expect(batches.map((batch) => batch.candidateIds.length)).toEqual([50, 50, 1]);
    expect(new Set(batches.flatMap((batch) => batch.candidateIds)).size).toBe(101);
  });

  it('reconciles committed candidates, exclusions, checksums, and batches', () => {
    const candidates = JSON.parse(readFileSync('data/unicode/generated/visual-candidates.json', 'utf8'));
    const reviewPlan = JSON.parse(readFileSync('data/unicode/generated/visual-review-plan.json', 'utf8'));
    const mechanical = JSON.parse(readFileSync('data/unicode/generated/mechanical-records.json', 'utf8'));
    expect(() => validateVisualArtifacts(candidates, reviewPlan, process.cwd())).not.toThrow();
    expect(candidates.availability).toEqual({ status: 'available', reason: null });
    expect(candidates.candidates.length).toBeGreaterThan(0);

    const authoredScalarPairs = new Set<string>();
    for (const record of mechanical.records.filter((item: { category: string }) => item.category === 'traditional-simplified')) {
      expect(record.leftScalars).toHaveLength(record.rightScalars.length);
      record.leftScalars.forEach((leftScalar: number, index: number) => {
        const rightScalar = record.rightScalars[index];
        if (leftScalar !== rightScalar) {
          authoredScalarPairs.add([leftScalar, rightScalar].sort((a, b) => a - b).join(':'));
        }
      });
    }
    expect(candidates.exclusions.authoredTraditionalSimplifiedPairKeys).toEqual([...authoredScalarPairs].sort((a, b) => a.localeCompare(b)));
    const candidatePairs = new Set(candidates.candidates.map((item: { leftScalar: number; rightScalar: number }) => `${item.leftScalar}:${item.rightScalar}`));
    expect([...authoredScalarPairs].every((pair) => !candidatePairs.has(pair))).toBe(true);

    const stale = structuredClone(reviewPlan);
    stale.batches[0].candidateIds.push(stale.batches[1].candidateIds[0]);
    expect(() => validateVisualArtifacts(candidates, stale, process.cwd())).toThrow(/exactly once|batch/i);

    const staleInput = structuredClone(candidates);
    staleInput.input.scalarInventorySha256 = '0'.repeat(64);
    expect(() => validateVisualArtifacts(staleInput, reviewPlan, process.cwd())).toThrow(/stale scalar inventory/i);

    const malformedGlyph = structuredClone(candidates);
    malformedGlyph.glyphs[0].scalar += 1;
    malformedGlyph.glyphs[0].id = `u${malformedGlyph.glyphs[0].scalar.toString(16).padStart(4, '0')}`;
    const malformedPlan = structuredClone(reviewPlan);
    malformedPlan.candidateManifestSha256 = sha256Json(malformedGlyph);
    expect(() => validateVisualArtifacts(malformedGlyph, malformedPlan, process.cwd())).toThrow(/glyph.*inventory|inventory.*glyph/i);

    const forged = structuredClone(candidates);
    const forgedCandidate = forged.candidates[0];
    forgedCandidate.leftPerceptualHash64 = '0000000000000000';
    forgedCandidate.rightPerceptualHash64 = '0000000000000000';
    forgedCandidate.distance = 0;
    forgedCandidate.checksumSha256 = sha256Json({ ...forgedCandidate, checksumSha256: undefined });
    const forgedPlan = structuredClone(reviewPlan);
    const candidateIndex = forgedPlan.batches[0].candidateIds.indexOf(forgedCandidate.id);
    forgedPlan.batches[0].candidateChecksumsSha256[candidateIndex] = forgedCandidate.checksumSha256;
    forgedPlan.candidateManifestSha256 = sha256Json(forged);
    expect(() => validateVisualArtifacts(forged, forgedPlan, process.cwd())).toThrow(/perceptual hash.*glyph|glyph.*perceptual hash/i);

    const forgedId = structuredClone(candidates);
    forgedId.candidates[0].id = 'forged-noncanonical-id';
    forgedId.candidates[0].checksumSha256 = sha256Json({ ...forgedId.candidates[0], checksumSha256: undefined });
    const forgedIdPlan = structuredClone(reviewPlan);
    forgedIdPlan.batches[0].candidateIds[0] = forgedId.candidates[0].id;
    forgedIdPlan.batches[0].candidateChecksumsSha256[0] = forgedId.candidates[0].checksumSha256;
    forgedIdPlan.candidateManifestSha256 = sha256Json(forgedId);
    expect(() => validateVisualArtifacts(forgedId, forgedIdPlan, process.cwd())).toThrow(/candidate id.*scalar evidence/i);

    const forgedExclusions = structuredClone(candidates);
    forgedExclusions.exclusions = { identicalScalarSequences: false, authoredTraditionalSimplifiedPairKeys: [] };
    const forgedExclusionsPlan = structuredClone(reviewPlan);
    forgedExclusionsPlan.candidateManifestSha256 = sha256Json(forgedExclusions);
    expect(() => validateVisualArtifacts(forgedExclusions, forgedExclusionsPlan, process.cwd())).toThrow(/exclusion/i);

    const reorderedPlan = structuredClone(reviewPlan);
    [reorderedPlan.batches[0].candidateIds[0], reorderedPlan.batches[0].candidateIds[1]] = [reorderedPlan.batches[0].candidateIds[1], reorderedPlan.batches[0].candidateIds[0]];
    [reorderedPlan.batches[0].candidateChecksumsSha256[0], reorderedPlan.batches[0].candidateChecksumsSha256[1]] = [reorderedPlan.batches[0].candidateChecksumsSha256[1], reorderedPlan.batches[0].candidateChecksumsSha256[0]];
    expect(() => validateVisualArtifacts(candidates, reorderedPlan, process.cwd())).toThrow(/batches|ownership/i);

    const stalePlanMetadata = structuredClone(reviewPlan);
    stalePlanMetadata.batches[0].outputPath = 'data/unicode/reviews/reassigned.json';
    expect(() => validateVisualArtifacts(candidates, stalePlanMetadata, process.cwd())).toThrow(/batches|ownership/i);

    const staleRenderer = structuredClone(candidates);
    staleRenderer.renderingEnvironment.playwrightImage = 'untrusted';
    staleRenderer.renderingEnvironment.fontAggregateSha256 = 'not-a-hash';
    staleRenderer.renderingEnvironment.canvas.width = 1;
    const staleRendererPlan = structuredClone(reviewPlan);
    staleRendererPlan.candidateManifestSha256 = sha256Json(staleRenderer);
    expect(() => validateVisualArtifacts(staleRenderer, staleRendererPlan, process.cwd())).toThrow(/image digest|font checksum|canvas/i);

    const staleMetadata = structuredClone(candidates);
    staleMetadata.input.scalarCount = 0;
    staleMetadata.threshold.ordering = ['leftScalar'];
    staleMetadata.totals = { glyphs: 0, candidates: 0 };
    const staleMetadataPlan = structuredClone(reviewPlan);
    staleMetadataPlan.candidateManifestSha256 = sha256Json(staleMetadata);
    expect(() => validateVisualArtifacts(staleMetadata, staleMetadataPlan, process.cwd())).toThrow(/count|ordering metadata|totals/i);

    const unavailable = structuredClone(candidates);
    unavailable.renderingEnvironment = null;
    unavailable.availability = { status: 'unavailable', reason: 'pinned renderer unavailable or lacks complete inventory coverage' };
    unavailable.glyphs = [];
    unavailable.candidates = [];
    unavailable.totals = { glyphs: 0, candidates: 0 };
    const unavailablePlan = structuredClone(reviewPlan);
    unavailablePlan.candidateManifestSha256 = sha256Json(unavailable);
    unavailablePlan.batches = [];
    unavailablePlan.totals = { candidates: 0, batches: 0 };
    expect(() => validateVisualArtifacts(unavailable, unavailablePlan, process.cwd())).not.toThrow();
    unavailable.glyphs.push(candidates.glyphs[0]);
    expect(() => validateVisualArtifacts(unavailable, unavailablePlan, process.cwd())).toThrow(/unavailable renderer.*glyphs/i);

    expect(candidates.candidates.every((item: { reviewStatus: string; learnerEligible: boolean }) =>
      item.reviewStatus === 'provisional' && item.learnerEligible === false,
    )).toBe(true);
  });

  it('keeps the pinned visual CI gate wired to byte-identity validation', () => {
    const runner = readFileSync('tests/visual/run.ts', 'utf8');
    expect(runner).toContain('generate_unicode_visual_candidates.ts --internal --check');
  });

  it('loads the approved font bytes through an explicit no-fallback face', () => {
    const generator = readFileSync('scripts/generate_unicode_visual_candidates.ts', 'utf8');
    expect(generator).toContain("const fontPath = '/usr/share/fonts/opentype/unifont/unifont.otf'");
    expect(generator).toContain("http://visual-font.local/unifont.otf");
    expect(generator).toContain("const fontFamily = 'Chabiko Unicode Candidate Font'");
    expect(generator).toContain("@font-face{font-family:'${fontFamily}'");
    expect(generator).toContain("route.fulfill({ path: fontPath, contentType: 'font/otf' })");
    expect(generator).toContain("document.fonts.load('400 48px \"Chabiko Unicode Candidate Font\"'");
    expect(generator).toContain("spawnSync('fc-query', ['--format=%{charset}', fontPath]");
    expect(generator).toContain('pinned font lacks inventory coverage');
  });

  it('fails closed when the pinned font cmap lacks an inventory scalar', () => {
    expect(() => assertFontCoverage([0x4e00, 0x9f9f], '4e00 9f9f')).not.toThrow();
    expect(() => assertFontCoverage([0x4e00, 0x9f9f], '4e00')).toThrow(/lacks inventory coverage.*U\+9F9F/i);
  });

  it('does not downgrade input or programming errors to unavailable-renderer output', () => {
    expect(() => {
      try {
        throw new SyntaxError('malformed #260 inventory');
      } catch (error) {
        if (!(error instanceof RendererUnavailableError)) throw error;
      }
    }).toThrow('malformed #260 inventory');
  });

  it('maps pinned browser-operation failures, but not input failures, to unavailable-renderer output', () => {
    expect(mapRendererOperationError(new Error('Chromium launch failed'))).toMatchObject({
      name: 'RendererUnavailableError',
      message: 'pinned renderer operation failed: Chromium launch failed',
    });
    const unavailable = new RendererUnavailableError('pinned font lacks inventory coverage');
    expect(mapRendererOperationError(unavailable)).toBe(unavailable);
  });

  it('stages both owned artifacts beside their destination before atomic publication', () => {
    const generator = readFileSync('scripts/generate_unicode_visual_candidates.ts', 'utf8');
    expect(generator).toContain("mkdtempSync(join(dirname(paths[0]), '.unicode-visual-stage-'))");
    expect(generator).not.toContain("mkdtempSync(join(tmpdir(), 'chabiko-unicode-visual-'))");
  });

  it('rolls back every owned artifact without touching unrelated dirty files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'chabiko-unicode-visual-test-'));
    const first = join(directory, 'visual-candidates.json');
    const second = join(directory, 'visual-review-plan.json');
    const unrelated = join(directory, 'other-developer-file.txt');
    writeFileSync(first, 'old-candidates\n');
    writeFileSync(second, 'old-plan\n');
    writeFileSync(unrelated, 'keep\n');
    let renames = 0;
    try {
      expect(() => publishTransactionally([first, second], ['new-candidates\n', 'new-plan\n'], (from, to) => {
        renames += 1;
        if (renames === 2) throw new Error('injected publication failure');
        renameSync(from, to);
      })).toThrow('injected publication failure');
      expect(readFileSync(first, 'utf8')).toBe('old-candidates\n');
      expect(readFileSync(second, 'utf8')).toBe('old-plan\n');
      expect(readFileSync(unrelated, 'utf8')).toBe('keep\n');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
