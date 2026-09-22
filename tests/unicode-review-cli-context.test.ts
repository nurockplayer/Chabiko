import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd());
const temporaryRoots: string[] = [];

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Json(value: unknown): string {
  return sha256(`${JSON.stringify(value)}\n`);
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}

function uint32(value: number): Uint8Array {
  return Uint8Array.from([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(type, (character) => character.charCodeAt(0));
  const out = new Uint8Array(12 + data.byteLength);
  out.set(uint32(data.byteLength), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.byteLength + data.byteLength);
  crcInput.set(typeBytes);
  crcInput.set(data, typeBytes.byteLength);
  out.set(uint32(crc32(crcInput)), 8 + data.byteLength);
  return out;
}

function pinnedGlyphPng(tile: Uint8Array): Uint8Array {
  const raw = new Uint8Array(64 * 65);
  for (let row = 0; row < 64; row += 1) raw.set(tile.subarray(row * 64, (row + 1) * 64), row * 65 + 1);
  const ihdr = Uint8Array.from([...uint32(64), ...uint32(64), 8, 0, 0, 0, 0]);
  const chunks = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw))),
    pngChunk('IEND', new Uint8Array()),
  ];
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const png = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return png;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createFixture(): {
  readonly root: string;
  readonly repository: string;
  readonly external: string;
  readonly script: string;
  readonly input: string;
  readonly candidateId: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'chabiko-unicode-cli-'));
  temporaryRoots.push(root);
  const repository = join(root, 'fixture-repository');
  const external = join(root, 'external');
  mkdirSync(join(repository, 'scripts'), { recursive: true });
  mkdirSync(join(repository, '.git'));
  mkdirSync(external);
  mkdirSync(join(external, 'caller-cwd'));
  writeJson(join(repository, 'package.json'), { type: 'module' });
  for (const file of [
    'run_unicode_review_v021.ts',
    'unicode_review_cli_context.ts',
    'unicode_review_external_io.ts',
    'unicode_review_pixels.ts',
    'unicode_review_v021.ts',
    'unicode_visual_contract.ts',
  ]) {
    copyFileSync(join(sourceRoot, 'scripts', file), join(repository, 'scripts', file));
  }

  const left = new Uint8Array(64 * 64).fill(255);
  const right = Uint8Array.from(left);
  right[0] = 0;
  const leftGlyph = { id: 'u4e00', scalar: 0x4e00, perceptualHash64: '0000000000000000', derivativeSha256: sha256(left) };
  const rightGlyph = { id: 'u4e01', scalar: 0x4e01, perceptualHash64: '0000000000000001', derivativeSha256: sha256(right) };
  const inventory = { scalars: [{ scalar: leftGlyph.scalar }, { scalar: rightGlyph.scalar }] };
  const inventoryPath = join(repository, 'data/unicode/generated/scalar-inventory.json');
  writeJson(inventoryPath, inventory);
  writeJson(join(repository, 'data/unicode/generated/mechanical-records.json'), { records: [] });
  const candidate = {
    id: 'visual-u4e00-u4e01',
    leftScalar: leftGlyph.scalar,
    rightScalar: rightGlyph.scalar,
    leftGlyphRef: leftGlyph.id,
    rightGlyphRef: rightGlyph.id,
    leftPerceptualHash64: leftGlyph.perceptualHash64,
    rightPerceptualHash64: rightGlyph.perceptualHash64,
    distance: 1,
    renderingEnvironmentRefs: ['playwright-chromium-unifont-v1'],
    reviewStatus: 'provisional',
    learnerEligible: false,
    cautionJa: null,
    checksumSha256: '',
  };
  candidate.checksumSha256 = sha256Json({ ...candidate, checksumSha256: undefined });
  const candidates = {
    schemaVersion: 1,
    input: {
      scalarInventoryPath: 'data/unicode/generated/scalar-inventory.json',
      scalarInventorySha256: sha256(readFileSync(inventoryPath)),
      scalarCount: inventory.scalars.length,
    },
    renderingEnvironment: {
      id: 'playwright-chromium-unifont-v1',
      reference: 'docs/content/unicode-rendering-inventory.md#pinned-reference-renderer',
      playwrightImage: 'mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48',
      browser: 'chromium-149.0.7827.55',
      fontInput: 'Ubuntu fonts-unifont 1:15.1.01-1build1 / Unifont Regular',
      fontAggregateSha256: 'a'.repeat(64),
      canvas: { width: 64, height: 64, fontSizePx: 48, weight: 400, grayscale: 'integer-rec601', background: 'white', foreground: 'black' },
    },
    threshold: { algorithm: 'dhash-64', maximumHammingDistance: 8, ordering: ['distance', 'leftScalar', 'rightScalar'] },
    availability: { status: 'available', reason: null },
    exclusions: { identicalScalarSequences: true, authoredTraditionalSimplifiedPairKeys: [] },
    glyphs: [leftGlyph, rightGlyph],
    candidates: [candidate],
    totals: { glyphs: 2, candidates: 1 },
  };
  const candidatePath = join(repository, 'data/unicode/generated/visual-candidates.json');
  writeJson(candidatePath, candidates);
  writeJson(join(repository, 'data/unicode/generated/visual-review-plan.json'), {
    schemaVersion: 1,
    candidateManifestPath: 'data/unicode/generated/visual-candidates.json',
    candidateManifestSha256: sha256Json(candidates),
    ordering: ['distance', 'leftScalar', 'rightScalar'],
    maximumBatchSize: 50,
    aggregateIndexOwner: 'serialized-follow-up-only',
    batches: [{
      id: 'unicode-visual-review-0001',
      candidateIds: [candidate.id],
      candidateChecksumsSha256: [candidate.checksumSha256],
      outputPath: 'data/unicode/reviews/unicode-visual-review-0001.json',
    }],
    totals: { candidates: 1, batches: 1 },
  });
  const leftPng = join(external, 'left.png');
  const rightPng = join(external, 'right.png');
  writeFileSync(leftPng, pinnedGlyphPng(left));
  writeFileSync(rightPng, pinnedGlyphPng(right));
  const input = join(external, 'bundle-input.json');
  writeJson(input, {
    items: [{
      purpose: 'manifest',
      candidateId: candidate.id,
      leftGlyphPngPath: leftPng,
      rightGlyphPngPath: rightPng,
    }],
  });
  return { root, repository, external, script: join(repository, 'scripts/run_unicode_review_v021.ts'), input, candidateId: candidate.id };
}

function runBundle(script: string, args: readonly string[], cwd: string) {
  const result = spawnSync(process.execPath, [script, 'bundle', ...args], { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
});

function createLoadedContextFixture() {
  const fixture = createFixture();
  const reviewerOutput = join(fixture.external, 'reviewer');
  const controllerOutput = join(fixture.external, 'controller');
  const bundle = runBundle(fixture.script, [
    '--input', fixture.input,
    '--reviewer-output', reviewerOutput,
    '--controller-output', controllerOutput,
    '--namespace-salt', 'a'.repeat(64),
  ], join(fixture.external, 'caller-cwd'));
  expect(bundle.status, bundle.output).toBe(0);
  const sidecar = JSON.parse(readFileSync(join(controllerOutput, 'controller-sidecar.json'), 'utf8'));
  const contract = join(fixture.external, 'review-contract.json');
  writeJson(contract, {
    rubricVersion: 'unicode-visual-v0.2.1',
    promptChecksumSha256: 'b'.repeat(64),
    renderingEvidenceChecksumSha256: sidecar.renderingEvidenceChecksumSha256,
    reviewerModelVersion: 'trusted-vision-model-1',
    transportContractChecksumSha256: 'c'.repeat(64),
    visionCapabilityEvidenceRef: 'external-attestation:trusted-vision-transport',
  });
  const descriptor = join(fixture.external, 'review-context.json');
  writeJson(descriptor, {
    inputPath: fixture.input,
    reviewerBundlePath: join(reviewerOutput, 'reviewer-bundle.json'),
    controllerSidecarPath: join(controllerOutput, 'controller-sidecar.json'),
    contractPath: contract,
  });
  return { ...fixture, reviewerOutput, controllerOutput, contract, descriptor };
}

function runLoader(fixture: ReturnType<typeof createLoadedContextFixture>) {
  const runner = join(fixture.external, 'load-context.mjs');
  writeFileSync(runner, `import { readFileSync } from 'node:fs';\nimport { pathToFileURL } from 'node:url';\nconst { loadReviewEvidenceContext } = await import(pathToFileURL(process.argv[2]).href);\nconst context = loadReviewEvidenceContext(JSON.parse(readFileSync(process.argv[3], 'utf8')));\nprocess.stdout.write(JSON.stringify({ items: context.bundle.items.length, inputs: context.inputs.length, pngs: context.localPngs.size, candidate: context.sidecar.entries[0].candidateId, capability: context.contract.visionCapabilityEvidenceRef }));\n`);
  const result = spawnSync(process.execPath, [runner, join(fixture.repository, 'scripts/unicode_review_cli_context.ts'), fixture.descriptor], { cwd: join(fixture.external, 'caller-cwd'), encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
});

describe('#477 Unicode review evidence-context loader', () => {
  it('reconstructs a ready ReviewEvidenceContext from external stored artifacts without rebuilding them', () => {
    const fixture = createLoadedContextFixture();
    const result = runLoader(fixture);
    expect(result.status, result.output).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      items: 1,
      inputs: 1,
      pngs: 1,
      candidate: fixture.candidateId,
      capability: 'external-attestation:trusted-vision-transport',
    });
  });

  it('rejects stale stored pixels, a stale sidecar, a stale contract, and an absent stored PNG', () => {
    const stalePixels = createLoadedContextFixture();
    const bundle = JSON.parse(readFileSync(join(stalePixels.reviewerOutput, 'reviewer-bundle.json'), 'utf8'));
    writeFileSync(join(stalePixels.reviewerOutput, bundle.items[0].pixelPath), Uint8Array.from([1, 2, 3]));
    expect(runLoader(stalePixels).status).not.toBe(0);

    const staleBundle = createLoadedContextFixture();
    const bundlePath = join(staleBundle.reviewerOutput, 'reviewer-bundle.json');
    const changedBundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    changedBundle.items[0].pairRef = 'pair-000000000000000000000000';
    changedBundle.items[0].pixelPath = 'pairs/pair-000000000000000000000000.png';
    writeJson(bundlePath, changedBundle);
    expect(runLoader(staleBundle).status).not.toBe(0);

    const staleSidecar = createLoadedContextFixture();
    const sidecarPath = join(staleSidecar.controllerOutput, 'controller-sidecar.json');
    const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
    sidecar.entries[0].candidateChecksumSha256 = '0'.repeat(64);
    writeJson(sidecarPath, sidecar);
    expect(runLoader(staleSidecar).status).not.toBe(0);

    const staleContract = createLoadedContextFixture();
    const contract = JSON.parse(readFileSync(staleContract.contract, 'utf8'));
    contract.renderingEvidenceChecksumSha256 = '0'.repeat(64);
    writeJson(staleContract.contract, contract);
    expect(runLoader(staleContract).status).not.toBe(0);

    const missingPng = createLoadedContextFixture();
    const missingBundle = JSON.parse(readFileSync(join(missingPng.reviewerOutput, 'reviewer-bundle.json'), 'utf8'));
    rmSync(join(missingPng.reviewerOutput, missingBundle.items[0].pixelPath));
    const missing = runLoader(missingPng);
    expect(missing.status).not.toBe(0);
    expect(missing.output).toMatch(/external regular file|unavailable/i);
  });

  it('rejects extra reviewer-tree files, nested extras, unexpected directories, and symbolic links', () => {
    const rootExtra = createLoadedContextFixture();
    writeJson(join(rootExtra.reviewerOutput, 'candidate-map.json'), { candidateId: rootExtra.candidateId });
    const rootResult = runLoader(rootExtra);
    expect(rootResult.status).not.toBe(0);
    expect(rootResult.output).toMatch(/reviewer tree must contain exactly the reviewer bundle and its listed pixels/i);
    expect(rootResult.output).toContain('candidate-map.json');

    const nestedExtra = createLoadedContextFixture();
    writeFileSync(join(nestedExtra.reviewerOutput, 'pairs', 'extra.png'), Uint8Array.from([1, 2, 3]));
    const nestedResult = runLoader(nestedExtra);
    expect(nestedResult.status).not.toBe(0);
    expect(nestedResult.output).toContain('pairs/extra.png');

    const unexpectedDirectory = createLoadedContextFixture();
    mkdirSync(join(unexpectedDirectory.reviewerOutput, 'notes'), { recursive: true });
    writeJson(join(unexpectedDirectory.reviewerOutput, 'notes', 'candidate-id.json'), { candidateId: unexpectedDirectory.candidateId });
    const directoryResult = runLoader(unexpectedDirectory);
    expect(directoryResult.status).not.toBe(0);
    expect(directoryResult.output).toContain('notes');

    const symlinked = createLoadedContextFixture();
    symlinkSync(join(symlinked.external, 'review-context.json'), join(symlinked.reviewerOutput, 'descriptor-link.json'));
    const symlinkResult = runLoader(symlinked);
    expect(symlinkResult.status).not.toBe(0);
    expect(symlinkResult.output).toMatch(/reviewer tree must not contain a symbolic link/i);
  });

  it('rejects controller context roles that overlap the blind reviewer tree', () => {
    const overlaps = [
      { role: 'inputPath', expected: 'context input must be disjoint from the reviewer bundle tree' },
      { role: 'controllerSidecarPath', expected: 'context controller sidecar must be disjoint from the reviewer bundle tree' },
      { role: 'contractPath', expected: 'context review contract must be disjoint from the reviewer bundle tree' },
    ] as const;
    for (const overlap of overlaps) {
      const fixture = createLoadedContextFixture();
      const descriptor = JSON.parse(readFileSync(fixture.descriptor, 'utf8'));
      writeJson(fixture.descriptor, { ...descriptor, [overlap.role]: join(fixture.reviewerOutput, `moved-${overlap.role}.json`) });
      const result = runLoader(fixture);
      expect(result.status, result.output).not.toBe(0);
      expect(result.output).toContain(overlap.expected);
    }
  });
});
