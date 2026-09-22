import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  authorizeCalibration,
  buildBlindEvidenceArtifactsFromAuthority,
  type ControllerEvidenceInput,
  type EvidenceAuthority,
  type ExternalControlEvidenceInput,
  type ManifestEvidenceInput,
  type ReviewContractBinding,
  type ReviewEvidenceContext,
  type SealedCalibrationKey,
} from '../scripts/unicode_review_v021';
import { appendUnicodeReviewJournalEvent, initializeUnicodeReviewJournal, loadUnicodeReviewJournal } from '../scripts/unicode_review_journal';
import {
  finalizeUnicodeReviewWave,
  ingestUnicodeReviewWaveA,
  ingestUnicodeReviewWaveB,
  ingestUnicodeReviewWavePassB,
  initializeUnicodeReviewWorkflow,
  planUnicodeReviewWave,
  prepareUnicodeReviewWaveB,
  prepareUnicodeReviewWavePassB,
  readUnicodeReviewWorkflow,
  type UnicodeReviewWaveArtifacts,
  type UnicodeReviewWorkflowCalibration,
  type UnicodeReviewWorkflowManifestInputs,
} from '../scripts/unicode_review_workflow';

const roots: string[] = [];
const checksum = (character: string) => character.repeat(64);
const contract: ReviewContractBinding = {
  rubricVersion: 'unicode-visual-v0.2.1',
  promptChecksumSha256: checksum('f'),
  renderingEvidenceChecksumSha256: checksum('a'),
  reviewerModelVersion: 'workflow-vision-model-1',
  transportContractChecksumSha256: checksum('b'),
  visionCapabilityEvidenceRef: 'external-attestation:workflow-test',
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashJson(value: unknown): string {
  return sha256(`${JSON.stringify(value)}\n`);
}

function tile(byte: number): Uint8Array {
  const pixels = new Uint8Array(64 * 64);
  pixels.fill(byte);
  return pixels;
}

function manifest(candidateId: string, byte: number): ManifestEvidenceInput {
  return { purpose: 'manifest', candidateId, leftGrayscale: tile(byte), rightGrayscale: tile(byte + 1) };
}

function control(controllerControlId: string, byte: number): ExternalControlEvidenceInput {
  return {
    purpose: 'external-control',
    controllerControlId,
    leftGlyphRef: `${controllerControlId}-left`,
    rightGlyphRef: `${controllerControlId}-right`,
    leftGrayscale: tile(byte),
    rightGrayscale: tile(byte + 1),
  };
}

function authority(inputs: readonly ControllerEvidenceInput[]): EvidenceAuthority {
  const glyphs = new Map<string, string>();
  const candidates = inputs.filter((item): item is ManifestEvidenceInput => item.purpose === 'manifest').map((item, index) => {
    const leftDerivativeSha256 = sha256(item.leftGrayscale);
    const rightDerivativeSha256 = sha256(item.rightGrayscale);
    glyphs.set(`candidate-${item.candidateId}-left`, leftDerivativeSha256);
    glyphs.set(`candidate-${item.candidateId}-right`, rightDerivativeSha256);
    return {
      candidateId: item.candidateId,
      candidateChecksumSha256: sha256(new Uint8Array([index & 0xff, index >>> 8])),
      batchId: 'unicode-visual-review-workflow-test',
      leftDerivativeSha256,
      rightDerivativeSha256,
      leftText: '未',
      rightText: '末',
    };
  });
  for (const item of inputs) {
    if (item.purpose === 'external-control') {
      glyphs.set(item.leftGlyphRef, sha256(item.leftGrayscale));
      glyphs.set(item.rightGlyphRef, sha256(item.rightGrayscale));
    }
  }
  return {
    candidateManifestChecksumSha256: checksum('c'),
    reviewPlanChecksumSha256: checksum('d'),
    renderingEvidenceChecksumSha256: contract.renderingEvidenceChecksumSha256,
    glyphs: [...glyphs].map(([glyphRef, derivativeSha256]) => ({ glyphRef, derivativeSha256 })),
    candidates,
  };
}

function receipt(
  role: 'reviewer-a' | 'reviewer-b' | 'pass-b',
  context: ReviewEvidenceContext,
  results: unknown,
  refs: readonly string[],
  session = `${role}-session`,
  independence = `${role}-context`,
) {
  const entries = context.sidecar.entries.filter((entry) => refs.includes(entry.pairRef));
  return {
    protocolVersion: 'unicode-visual-v0.2.1',
    role,
    reviewerSessionId: session,
    reviewerIndependenceContextId: independence,
    reviewerModelVersion: contract.reviewerModelVersion,
    visionCapabilityEvidenceRef: contract.visionCapabilityEvidenceRef,
    rubricVersion: contract.rubricVersion,
    promptChecksumSha256: contract.promptChecksumSha256,
    renderingEvidenceChecksumSha256: contract.renderingEvidenceChecksumSha256,
    transportProfileChecksumSha256: contract.transportContractChecksumSha256,
    reviewerBundleChecksumSha256: context.sidecar.reviewerBundleChecksumSha256,
    items: entries.map((entry) => ({ pairRef: entry.pairRef, evidenceChecksumSha256: entry.evidenceChecksumSha256 })).reverse(),
    resultsChecksumSha256: hashJson(results),
  };
}

function workflowFixture(hardProbeDisagreement = false, manifestStrongControls = false, hardProbeExpectedOutcome: 'confusable' | 'borderline' = 'confusable') {
  const strongControl = manifestStrongControls ? manifest : control;
  const calibrationInputs: ControllerEvidenceInput[] = [
    ...Array.from({ length: 20 }, (_, index) => strongControl(`positive-${index}`, index * 2)),
    ...Array.from({ length: 20 }, (_, index) => strongControl(`negative-${index}`, 80 + index * 2)),
    ...Array.from({ length: 24 }, (_, index) => manifest(`hard-probe-${index}`, 160 + index * 2)),
    ...Array.from({ length: 8 }, (_, index) => control(`trap-${index}`, 220 + index * 2)),
  ];
  const productionInputs = [
    manifest('wave-candidate-1', 20),
    manifest('wave-candidate-2', 24),
    ...Array.from({ length: 251 }, (_, index) => manifest(`scaled-candidate-${index}`, 40 + index * 2)),
  ];
  const evidenceAuthority = authority([...calibrationInputs, ...productionInputs]);
  const artifacts = buildBlindEvidenceArtifactsFromAuthority(evidenceAuthority, calibrationInputs, checksum('e'));
  const context: ReviewEvidenceContext = {
    authority: evidenceAuthority,
    bundle: artifacts.reviewerBundle,
    sidecar: artifacts.controllerSidecar,
    inputs: calibrationInputs,
    localPngs: artifacts.localPngs,
    contract,
  };
  const items = context.sidecar.entries.map((entry) => {
    const id = entry.purpose === 'manifest' ? entry.candidateId : entry.controllerControlId;
    if (id.startsWith('positive-')) return { pairRef: entry.pairRef, class: 'strong-positive' as const, expectedOutcome: 'confusable' as const };
    if (id.startsWith('negative-')) return { pairRef: entry.pairRef, class: 'strong-negative' as const, expectedOutcome: 'not-confusable' as const };
    if (entry.purpose === 'manifest') return { pairRef: entry.pairRef, class: 'hard-probe' as const, expectedOutcome: hardProbeExpectedOutcome };
    return { pairRef: entry.pairRef, class: 'relation-trap' as const, expectedOutcome: 'borderline' as const };
  });
  const key: SealedCalibrationKey = {
    protocolVersion: 'unicode-visual-v0.2.1',
    reviewerBundleChecksumSha256: hashJson(artifacts.reviewerBundle),
    contract,
    items,
  };
  const calibrationResults = items.map((item) => ({
    pairRef: item.pairRef,
    visualOutcome: hardProbeDisagreement && item.class === 'hard-probe' && item.pairRef === items.find((candidate) => candidate.class === 'hard-probe')!.pairRef
      ? 'not-confusable' as const
      : item.expectedOutcome,
  }));
  const calibrationSubmission = {
    results: calibrationResults,
    receipt: receipt('reviewer-a', context, calibrationResults, items.map((item) => item.pairRef), 'calibration-session', 'calibration-context'),
  };
  const issued = authorizeCalibration(context, key, calibrationSubmission);
  expect(issued.authorization).not.toBeNull();
  const perturbedHardProbe = key.items.find((item) => item.class === 'hard-probe')!;
  return {
    calibration: { context, key, submission: calibrationSubmission } satisfies UnicodeReviewWorkflowCalibration,
    calibrationInputs,
    productionInputs,
    hardProbeOverrideCandidateId: issued.replayBinding?.hardProbeCandidateOverrides.find((override) => override.pairRef === perturbedHardProbe.pairRef)?.candidateId ?? null,
  };
}

function journalPath(): string {
  const root = mkdtempSync(join(tmpdir(), 'chabiko-unicode-workflow-'));
  roots.push(root);
  return join(root, 'journal');
}

function waveInputs(waveId: string, inputs: readonly ManifestEvidenceInput[]): UnicodeReviewWorkflowManifestInputs {
  return new Map([[waveId, inputs]]);
}

function planDetails(path: string) {
  const event = loadUnicodeReviewJournal(path).events.at(-1)!;
  return event.payload as { readonly type: 'wave-planned'; readonly sentinels: readonly { readonly pairRef: string; readonly class: string; readonly expectedOutcome: 'confusable' | 'not-confusable' | 'borderline' }[] };
}

function fullA(artifacts: UnicodeReviewWaveArtifacts, details: ReturnType<typeof planDetails>, manifestRef: string, strongNegativeViolation = false) {
  const expectedByRef = new Map(details.sentinels.map((sentinel) => [sentinel.pairRef, sentinel.expectedOutcome]));
  const violation = details.sentinels.find((sentinel) => sentinel.class === 'strong-negative')!.pairRef;
  const results = artifacts.context.sidecar.entries.map((entry) => ({
    pairRef: entry.pairRef,
    visualOutcome: entry.pairRef === manifestRef
      ? 'confusable' as const
      : entry.pairRef === violation && strongNegativeViolation
        ? 'confusable' as const
        : expectedByRef.get(entry.pairRef)!,
  }));
  return { results, receipt: receipt('reviewer-a', artifacts.context, results, artifacts.context.sidecar.entries.map((entry) => entry.pairRef), 'wave-a-session', 'wave-a-context') };
}

function completeCleanWave(path: string, calibration: UnicodeReviewWorkflowCalibration, waveId: string, input: ManifestEvidenceInput, prior: UnicodeReviewWorkflowManifestInputs) {
  const artifacts = planUnicodeReviewWave(path, calibration, waveId, [input], prior);
  const details = planDetails(path);
  const manifestRef = artifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
  const inputs = new Map(prior);
  inputs.set(waveId, [input]);
  ingestUnicodeReviewWaveA(path, calibration, inputs, fullA(artifacts, details, manifestRef));
  expect(prepareUnicodeReviewWaveB(path, calibration, inputs, `${path}-b-subset`)).toEqual([manifestRef]);
  const bResults = [{ pairRef: manifestRef, visualOutcome: 'confusable' as const }];
  ingestUnicodeReviewWaveB(path, calibration, inputs, { results: bResults, receipt: receipt('reviewer-b', artifacts.context, bResults, [manifestRef], 'wave-b-session', 'wave-b-context') });
  expect(prepareUnicodeReviewWavePassB(path, calibration, inputs, `${path}-pass-b-subset`)).toEqual([manifestRef]);
  const result = { pairRef: manifestRef, observableDifference: { region: 'upper' as const, feature: 'dot' as const, contrast: 'present' as const } };
  ingestUnicodeReviewWavePassB(path, calibration, inputs, { result, receipt: receipt('pass-b', artifacts.context, result, [manifestRef], 'pass-b-session', 'pass-b-context') });
  const promotions = finalizeUnicodeReviewWave(path, calibration, inputs);
  expect(promotions).toHaveLength(1);
  return promotions;
}

function moveToPassB(path: string, calibration: UnicodeReviewWorkflowCalibration, waveId: string, input: ManifestEvidenceInput) {
  const artifacts = planUnicodeReviewWave(path, calibration, waveId, [input]);
  const details = planDetails(path);
  const manifestRef = artifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
  const inputs = waveInputs(waveId, [input]);
  ingestUnicodeReviewWaveA(path, calibration, inputs, fullA(artifacts, details, manifestRef));
  prepareUnicodeReviewWaveB(path, calibration, inputs, `${path}-b-subset`);
  const bResults = [{ pairRef: manifestRef, visualOutcome: 'confusable' as const }];
  ingestUnicodeReviewWaveB(path, calibration, inputs, { results: bResults, receipt: receipt('reviewer-b', artifacts.context, bResults, [manifestRef], 'wave-b-session', 'wave-b-context') });
  expect(prepareUnicodeReviewWavePassB(path, calibration, inputs, `${path}-pass-b-subset`)).toEqual([manifestRef]);
  return { artifacts, manifestRef, inputs };
}

describe('#477 resumable Unicode review workflow', () => {
  it('resumes only the exact empty journal left before workflow initialization', () => {
    const { calibration } = workflowFixture();
    const resumedPath = journalPath();
    expect(initializeUnicodeReviewJournal(resumedPath).events).toEqual([]);
    expect(initializeUnicodeReviewWorkflow(resumedPath, calibration).journal.events).toHaveLength(1);

    const nonemptyPath = journalPath();
    initializeUnicodeReviewWorkflow(nonemptyPath, calibration);
    expect(() => initializeUnicodeReviewWorkflow(nonemptyPath, calibration)).toThrow(/already initialized|exact empty journal/i);

    const foreignPath = journalPath();
    mkdirSync(foreignPath);
    expect(() => initializeUnicodeReviewWorkflow(foreignPath, calibration)).toThrow(/required layout|journal protocol marker|unknown|empty journal/i);
  });

  it('accepts calibrated manifest strong controls as 4/4/4 external sentinels without manifest ownership', () => {
    const { calibration, calibrationInputs, productionInputs } = workflowFixture(false, true);
    const path = journalPath();
    initializeUnicodeReviewWorkflow(path, calibration);
    const artifacts = planUnicodeReviewWave(path, calibration, 'manifest-controls', [productionInputs[0]]);
    const details = planDetails(path);
    for (const kind of ['strong-positive', 'strong-negative', 'hard-probe']) {
      expect(details.sentinels.filter((sentinel) => sentinel.class === kind)).toHaveLength(4);
    }
    expect(artifacts.controllerSidecar.entries.filter((entry) => entry.purpose === 'manifest').map((entry) => entry.candidateId)).toEqual([productionInputs[0].candidateId]);
    const sentinels = artifacts.context.inputs.filter((input) => input.purpose === 'external-control');
    expect(sentinels).toHaveLength(12);
    for (const input of sentinels) {
      const source = calibrationInputs.find((candidate) => candidate.purpose === 'manifest'
        && Buffer.from(candidate.leftGrayscale).equals(Buffer.from(input.leftGrayscale))
        && Buffer.from(candidate.rightGrayscale).equals(Buffer.from(input.rightGrayscale)));
      expect(source).toBeDefined();
      expect(calibration.context.authority.glyphs.find((glyph) => glyph.glyphRef === input.leftGlyphRef)?.derivativeSha256).toBe(sha256(input.leftGrayscale));
      expect(calibration.context.authority.glyphs.find((glyph) => glyph.glyphRef === input.rightGlyphRef)?.derivativeSha256).toBe(sha256(input.rightGrayscale));
      const entry = artifacts.controllerSidecar.entries.find((candidate) => candidate.purpose === 'external-control' && candidate.controllerControlId === input.controllerControlId)!;
      const sentinel = details.sentinels.find((candidate) => candidate.pairRef === entry.pairRef)!;
      const sourceId = (source as ManifestEvidenceInput).candidateId;
      expect(sentinel.class).toBe(sourceId.startsWith('positive-') ? 'strong-positive' : sourceId.startsWith('negative-') ? 'strong-negative' : 'hard-probe');
      expect(sentinel.expectedOutcome).toBe(sourceId.startsWith('negative-') ? 'not-confusable' : 'confusable');
    }
    const replayed = readUnicodeReviewWorkflow(path, calibration, waveInputs('manifest-controls', [productionInputs[0]]));
    expect(replayed.activeWave?.artifacts.controllerSidecar).toEqual(artifacts.controllerSidecar);
  });

  it('replays each wave through exact evidence, A/B, Pass B, and finalized candidate checks', () => {
    const { calibration, productionInputs } = workflowFixture();
    const path = journalPath();
    initializeUnicodeReviewWorkflow(path, calibration);
    const finalized = completeCleanWave(path, calibration, 'wave-1', productionInputs[0], new Map());
    const allInputs = waveInputs('wave-1', [productionInputs[0]]);
    const before = loadUnicodeReviewJournal(path).tip;
    const recovered = readUnicodeReviewWorkflow(path, calibration, allInputs);
    expect(recovered).toMatchObject({ activeWaveId: null, finalizedCandidateIds: ['wave-candidate-1'], cleanInitialWaveStreak: 1 });
    expect(JSON.stringify(recovered.waves[0].promotions)).toBe(JSON.stringify(finalized));
    expect(loadUnicodeReviewJournal(path).tip).toEqual(before);
  });

  it('invalidates a strong-negative sentinel and permits a new initial-size wave without advancing the scaling streak', () => {
    const { calibration, productionInputs } = workflowFixture();
    const path = journalPath();
    initializeUnicodeReviewWorkflow(path, calibration);
    const artifacts = planUnicodeReviewWave(path, calibration, 'invalid-wave', [productionInputs[0]]);
    const prepared = readUnicodeReviewWorkflow(path, calibration, waveInputs('invalid-wave', [productionInputs[0]]));
    expect(prepared.activeWave).toMatchObject({ waveId: 'invalid-wave', stage: 'reviewer-a-pending', reviewerBPairRefs: null, passBPairRefs: null });
    expect(prepared.waves).toEqual([expect.objectContaining({ waveId: 'invalid-wave', terminalState: 'pending', artifacts: expect.objectContaining({ reviewerBundle: artifacts.reviewerBundle }) })]);
    const details = planDetails(path);
    const manifestRef = artifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    ingestUnicodeReviewWaveA(path, calibration, waveInputs('invalid-wave', [productionInputs[0]]), fullA(artifacts, details, manifestRef, true));
    const recorded = waveInputs('invalid-wave', [productionInputs[0]]);
    expect(readUnicodeReviewWorkflow(path, calibration, recorded)).toMatchObject({ activeWaveId: null, cleanInitialWaveStreak: 0 });
    expect(() => planUnicodeReviewWave(path, calibration, 'too-large-after-invalidation', productionInputs.slice(2), recorded)).toThrow(/250 candidate limit/);
    expect(planUnicodeReviewWave(path, calibration, 'retry-wave', [productionInputs[0]], recorded).waveId).toBe('retry-wave');
  });

  it('allows 500-scale planning only after two clean initial waves and requires inputs for semantic replay', () => {
    const { calibration, productionInputs } = workflowFixture();
    const path = journalPath();
    initializeUnicodeReviewWorkflow(path, calibration);
    completeCleanWave(path, calibration, 'wave-1', productionInputs[0], new Map());
    const first = waveInputs('wave-1', [productionInputs[0]]);
    completeCleanWave(path, calibration, 'wave-2', productionInputs[1], first);
    const historical: UnicodeReviewWorkflowManifestInputs = new Map([
      ['wave-1', [productionInputs[0]]],
      ['wave-2', [productionInputs[1]]],
    ]);
    expect(readUnicodeReviewWorkflow(path, calibration, historical).cleanInitialWaveStreak).toBe(2);
    expect(planUnicodeReviewWave(path, calibration, 'scaled-wave', productionInputs.slice(2), historical).context.sidecar.entries.filter((entry) => entry.purpose === 'manifest')).toHaveLength(251);
    expect(() => readUnicodeReviewWorkflow(path, calibration, new Map())).toThrow(/requires controller manifest inputs/i);
  });

  it('rejects a hash-valid journal event whose Reviewer B subset was not derived from exact A-positive manifest entries', () => {
    const { calibration, productionInputs } = workflowFixture();
    const path = journalPath();
    initializeUnicodeReviewWorkflow(path, calibration);
    const artifacts = planUnicodeReviewWave(path, calibration, 'tampered-wave', [productionInputs[0]]);
    const details = planDetails(path);
    const manifestRef = artifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const inputs = waveInputs('tampered-wave', [productionInputs[0]]);
    ingestUnicodeReviewWaveA(path, calibration, inputs, fullA(artifacts, details, manifestRef));
    const journal = loadUnicodeReviewJournal(path);
    appendUnicodeReviewJournalEvent(path, journal.tip, { type: 'wave-b-planned', waveId: 'tampered-wave', pairRefs: [], subsetOutputPath: `${path}-tampered-subset` });
    expect(() => readUnicodeReviewWorkflow(path, calibration, inputs)).toThrow(/Reviewer B subset/i);
  });

  it('rejects a reused terminal wave ID before mutation and still permits a fresh ID', () => {
    const { calibration, productionInputs } = workflowFixture();
    const path = journalPath();
    initializeUnicodeReviewWorkflow(path, calibration);
    completeCleanWave(path, calibration, 'terminal-wave', productionInputs[0], new Map());
    const historical = waveInputs('terminal-wave', [productionInputs[0]]);
    const before = loadUnicodeReviewJournal(path).tip;
    expect(() => planUnicodeReviewWave(path, calibration, 'terminal-wave', [productionInputs[1]], historical)).toThrow(/already been used/i);
    expect(loadUnicodeReviewJournal(path).tip).toEqual(before);
    expect(planUnicodeReviewWave(path, calibration, 'fresh-wave', [productionInputs[1]], historical).waveId).toBe('fresh-wave');
  });

  it('invalidates a live same-context Reviewer B submission and rejects its hash-valid forged equivalent on replay', () => {
    const { calibration, productionInputs } = workflowFixture();
    const livePath = journalPath();
    initializeUnicodeReviewWorkflow(livePath, calibration);
    const liveArtifacts = planUnicodeReviewWave(livePath, calibration, 'same-context-live', [productionInputs[0]]);
    const liveDetails = planDetails(livePath);
    const liveRef = liveArtifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const liveInputs = waveInputs('same-context-live', [productionInputs[0]]);
    ingestUnicodeReviewWaveA(livePath, calibration, liveInputs, fullA(liveArtifacts, liveDetails, liveRef));
    prepareUnicodeReviewWaveB(livePath, calibration, liveInputs, `${livePath}-b-subset`);
    const liveResults = [{ pairRef: liveRef, visualOutcome: 'confusable' as const }];
    const reusedContext = { results: liveResults, receipt: receipt('reviewer-b', liveArtifacts.context, liveResults, [liveRef], 'wave-a-session', 'wave-a-context') };
    expect(() => ingestUnicodeReviewWaveB(livePath, calibration, liveInputs, reusedContext)).toThrow(/fresh session|independent context/i);
    expect(readUnicodeReviewWorkflow(livePath, calibration, liveInputs).activeWaveId).toBeNull();
    expect(loadUnicodeReviewJournal(livePath).events.at(-1)!.payload).toMatchObject({ type: 'wave-invalidated', stage: 'b' });

    const forgedPath = journalPath();
    initializeUnicodeReviewWorkflow(forgedPath, calibration);
    const forgedArtifacts = planUnicodeReviewWave(forgedPath, calibration, 'same-context-forged', [productionInputs[1]]);
    const forgedDetails = planDetails(forgedPath);
    const forgedRef = forgedArtifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const forgedInputs = waveInputs('same-context-forged', [productionInputs[1]]);
    ingestUnicodeReviewWaveA(forgedPath, calibration, forgedInputs, fullA(forgedArtifacts, forgedDetails, forgedRef));
    prepareUnicodeReviewWaveB(forgedPath, calibration, forgedInputs, `${forgedPath}-b-subset`);
    const forgedResults = [{ pairRef: forgedRef, visualOutcome: 'confusable' as const }];
    const forgedJournal = loadUnicodeReviewJournal(forgedPath);
    appendUnicodeReviewJournalEvent(forgedPath, forgedJournal.tip, { type: 'wave-b-ingested', waveId: 'same-context-forged', submission: { results: forgedResults, receipt: receipt('reviewer-b', forgedArtifacts.context, forgedResults, [forgedRef], 'wave-a-session', 'wave-a-context') } });
    expect(() => readUnicodeReviewWorkflow(forgedPath, calibration, forgedInputs)).toThrow(/fresh session|independent context/i);
  });

  it('replays a hash-valid Reviewer A event through the strong-negative sentinel gate', () => {
    const { calibration, productionInputs } = workflowFixture();
    const path = journalPath();
    initializeUnicodeReviewWorkflow(path, calibration);
    const artifacts = planUnicodeReviewWave(path, calibration, 'forged-negative-wave', [productionInputs[0]]);
    const details = planDetails(path);
    const manifestRef = artifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const submission = fullA(artifacts, details, manifestRef, true);
    const journal = loadUnicodeReviewJournal(path);
    appendUnicodeReviewJournalEvent(path, journal.tip, { type: 'wave-a-ingested', waveId: 'forged-negative-wave', submission });
    expect(() => readUnicodeReviewWorkflow(path, calibration, waveInputs('forged-negative-wave', [productionInputs[0]]))).toThrow(/strong-negative sentinel/i);
  });

  it('records schema failures from B and Pass B as terminal invalidations that replay from the affected stage', () => {
    const { calibration, productionInputs } = workflowFixture();
    const bPath = journalPath();
    initializeUnicodeReviewWorkflow(bPath, calibration);
    const bArtifacts = planUnicodeReviewWave(bPath, calibration, 'b-failure-wave', [productionInputs[0]]);
    const bDetails = planDetails(bPath);
    const bRef = bArtifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const bInputs = waveInputs('b-failure-wave', [productionInputs[0]]);
    ingestUnicodeReviewWaveA(bPath, calibration, bInputs, fullA(bArtifacts, bDetails, bRef));
    prepareUnicodeReviewWaveB(bPath, calibration, bInputs, `${bPath}-b-subset`);
    expect(() => ingestUnicodeReviewWaveB(bPath, calibration, bInputs, { results: [], receipt: null })).toThrow(/incomplete|subset/i);
    expect(readUnicodeReviewWorkflow(bPath, calibration, bInputs).activeWaveId).toBeNull();
    expect(loadUnicodeReviewJournal(bPath).events.at(-1)!.payload).toMatchObject({ type: 'wave-invalidated', stage: 'b' });

    const passBPath = journalPath();
    initializeUnicodeReviewWorkflow(passBPath, calibration);
    const { artifacts, manifestRef, inputs } = moveToPassB(passBPath, calibration, 'pass-b-failure-wave', productionInputs[1]);
    const invalidResult = { pairRef: manifestRef, observableDifference: { region: 'upper', feature: 'dot', contrast: 'present' }, prose: 'uncontrolled' };
    expect(() => ingestUnicodeReviewWavePassB(passBPath, calibration, inputs, { result: invalidResult, receipt: receipt('pass-b', artifacts.context, invalidResult, [manifestRef], 'bad-pass-b-session', 'bad-pass-b-context') })).toThrow(/unsupported|missing/i);
    expect(readUnicodeReviewWorkflow(passBPath, calibration, inputs).activeWaveId).toBeNull();
    expect(loadUnicodeReviewJournal(passBPath).events.at(-1)!.payload).toMatchObject({ type: 'wave-invalidated', stage: 'pass-b' });
  });

  it('rejects duplicate Pass B pair references even when the observable description differs', () => {
    const { calibration, productionInputs } = workflowFixture();
    const path = journalPath();
    initializeUnicodeReviewWorkflow(path, calibration);
    const { artifacts, manifestRef, inputs } = moveToPassB(path, calibration, 'duplicate-pass-b-wave', productionInputs[0]);
    expect(readUnicodeReviewWorkflow(path, calibration, inputs).activeWave).toMatchObject({ stage: 'pass-b-pending', reviewerBPairRefs: [], passBPairRefs: [manifestRef] });
    const first = { pairRef: manifestRef, observableDifference: { region: 'upper' as const, feature: 'dot' as const, contrast: 'present' as const } };
    ingestUnicodeReviewWavePassB(path, calibration, inputs, { result: first, receipt: receipt('pass-b', artifacts.context, first, [manifestRef], 'first-pass-b-session', 'first-pass-b-context') });
    expect(readUnicodeReviewWorkflow(path, calibration, inputs).activeWave).toMatchObject({ stage: 'finalization-pending', reviewerBPairRefs: [], passBPairRefs: [] });
    const duplicate = { pairRef: manifestRef, observableDifference: { region: 'lower' as const, feature: 'stroke' as const, contrast: 'longer' as const } };
    const journal = loadUnicodeReviewJournal(path);
    appendUnicodeReviewJournalEvent(path, journal.tip, { type: 'wave-pass-b-ingested', waveId: 'duplicate-pass-b-wave', submission: { result: duplicate, receipt: receipt('pass-b', artifacts.context, duplicate, [manifestRef], 'second-pass-b-session', 'second-pass-b-context') } });
    expect(() => readUnicodeReviewWorkflow(path, calibration, inputs)).toThrow(/duplicate Pass B evidence/i);
  });

  it('enforces wave ID and current size constraints during semantic replay of hash-valid plans', () => {
    const { calibration, productionInputs } = workflowFixture();
    const duplicatePath = journalPath();
    initializeUnicodeReviewWorkflow(duplicatePath, calibration);
    completeCleanWave(duplicatePath, calibration, 'wave-1', productionInputs[0], new Map());
    const duplicateInputs = waveInputs('wave-1', [productionInputs[0]]);
    const firstPlan = loadUnicodeReviewJournal(duplicatePath).events.find((event) => (event.payload as { readonly type?: unknown }).type === 'wave-planned')!.payload;
    const duplicateJournal = loadUnicodeReviewJournal(duplicatePath);
    appendUnicodeReviewJournalEvent(duplicatePath, duplicateJournal.tip, firstPlan as Record<string, unknown>);
    expect(() => readUnicodeReviewWorkflow(duplicatePath, calibration, duplicateInputs)).toThrow(/reuses a wave ID/i);

    const oversizedPath = journalPath();
    initializeUnicodeReviewWorkflow(oversizedPath, calibration);
    const oversized = Array.from({ length: 251 }, (_, index) => ({ pairRef: `pair-${String(index).padStart(24, '0')}`, candidateId: `forged-${index}`, candidateChecksumSha256: checksum('a'), evidenceChecksumSha256: checksum('b') }));
    const initial = loadUnicodeReviewJournal(oversizedPath);
    appendUnicodeReviewJournalEvent(oversizedPath, initial.tip, { type: 'wave-planned', waveId: 'forged-oversized-wave', namespaceSalt: checksum('c'), manifest: oversized, sentinels: Array.from({ length: 12 }, () => ({})) });
    expect(() => readUnicodeReviewWorkflow(oversizedPath, calibration, new Map())).toThrow(/current candidate limit/i);
  });

  it.each([
    ['binary sealed expectation', 'confusable' as const],
    ['borderline sealed expectation', 'borderline' as const],
  ])('keeps calibrated hard-probe overrides provisional and out of Pass B requirements for a %s', (_label, hardProbeExpectedOutcome) => {
    const { calibration, calibrationInputs, hardProbeOverrideCandidateId } = workflowFixture(true, false, hardProbeExpectedOutcome);
    expect(hardProbeOverrideCandidateId).not.toBeNull();
    const hardProbe = calibrationInputs.find((input): input is ManifestEvidenceInput => input.purpose === 'manifest' && input.candidateId === hardProbeOverrideCandidateId)!;
    const path = journalPath();
    initializeUnicodeReviewWorkflow(path, calibration);
    const artifacts = planUnicodeReviewWave(path, calibration, 'provisional-hard-probe-wave', [hardProbe]);
    const details = planDetails(path);
    const manifestRef = artifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const inputs = waveInputs('provisional-hard-probe-wave', [hardProbe]);
    ingestUnicodeReviewWaveA(path, calibration, inputs, fullA(artifacts, details, manifestRef));
    prepareUnicodeReviewWaveB(path, calibration, inputs, `${path}-b-subset`);
    const bResults = [{ pairRef: manifestRef, visualOutcome: 'confusable' as const }];
    ingestUnicodeReviewWaveB(path, calibration, inputs, { results: bResults, receipt: receipt('reviewer-b', artifacts.context, bResults, [manifestRef], 'hard-probe-b-session', 'hard-probe-b-context') });
    expect(prepareUnicodeReviewWavePassB(path, calibration, inputs, `${path}-pass-b-subset`)).toEqual([]);
    expect(finalizeUnicodeReviewWave(path, calibration, inputs)).toEqual([]);
    expect(readUnicodeReviewWorkflow(path, calibration, inputs).provisionalCandidateIds).toEqual([hardProbe.candidateId]);
  });

  it('persists chosen Reviewer B and Pass B subset roots and retains them after finalization', () => {
    const { calibration, productionInputs } = workflowFixture();
    const path = journalPath();
    initializeUnicodeReviewWorkflow(path, calibration);
    const artifacts = planUnicodeReviewWave(path, calibration, 'subset-paths', [productionInputs[0]]);
    const details = planDetails(path);
    const manifestRef = artifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const inputs = waveInputs('subset-paths', [productionInputs[0]]);
    ingestUnicodeReviewWaveA(path, calibration, inputs, fullA(artifacts, details, manifestRef));
    const subsetParent = join(dirname(path), 'canonical-subsets');
    const subsetAlias = join(dirname(path), 'subset-alias');
    mkdirSync(subsetParent);
    symlinkSync(subsetParent, subsetAlias, 'dir');
    const reviewerBSubset = join(subsetAlias, 'b-subset');
    const passBSubset = join(subsetAlias, 'pass-b-subset');
    const canonicalReviewerBSubset = join(realpathSync(subsetParent), 'b-subset');
    const canonicalPassBSubset = join(realpathSync(subsetParent), 'pass-b-subset');

    expect(prepareUnicodeReviewWaveB(path, calibration, inputs, reviewerBSubset)).toEqual([manifestRef]);
    const preparedB = readUnicodeReviewWorkflow(path, calibration, inputs);
    expect(preparedB.activeWave).toMatchObject({ stage: 'reviewer-b-pending', reviewerBPreparedPairRefs: [manifestRef], reviewerBSubsetOutputPath: canonicalReviewerBSubset, passBSubsetOutputPath: null });
    expect(preparedB.subsetRoots).toEqual([canonicalReviewerBSubset]);
    expect((loadUnicodeReviewJournal(path).events.at(-1)!.payload as { readonly subsetOutputPath: string }).subsetOutputPath).toBe(canonicalReviewerBSubset);

    const bResults = [{ pairRef: manifestRef, visualOutcome: 'confusable' as const }];
    ingestUnicodeReviewWaveB(path, calibration, inputs, { results: bResults, receipt: receipt('reviewer-b', artifacts.context, bResults, [manifestRef], 'subset-b-session', 'subset-b-context') });
    expect(prepareUnicodeReviewWavePassB(path, calibration, inputs, passBSubset)).toEqual([manifestRef]);
    const preparedPassB = readUnicodeReviewWorkflow(path, calibration, inputs);
    expect(preparedPassB.activeWave).toMatchObject({ stage: 'pass-b-pending', reviewerBPreparedPairRefs: [manifestRef], passBPreparedPairRefs: [manifestRef], reviewerBSubsetOutputPath: canonicalReviewerBSubset, passBSubsetOutputPath: canonicalPassBSubset });
    expect(preparedPassB.subsetRoots).toEqual([canonicalReviewerBSubset, canonicalPassBSubset].sort());
    expect((loadUnicodeReviewJournal(path).events.at(-1)!.payload as { readonly subsetOutputPath: string }).subsetOutputPath).toBe(canonicalPassBSubset);

    const result = { pairRef: manifestRef, observableDifference: { region: 'upper' as const, feature: 'dot' as const, contrast: 'present' as const } };
    ingestUnicodeReviewWavePassB(path, calibration, inputs, { result, receipt: receipt('pass-b', artifacts.context, result, [manifestRef], 'subset-pass-b-session', 'subset-pass-b-context') });
    finalizeUnicodeReviewWave(path, calibration, inputs);
    const finalized = readUnicodeReviewWorkflow(path, calibration, inputs);
    expect(finalized.subsetRoots).toEqual([canonicalReviewerBSubset, canonicalPassBSubset].sort());
    expect(finalized.waves[0]).toMatchObject({ terminalState: 'finalized', reviewerBPreparedPairRefs: [manifestRef], passBPreparedPairRefs: [manifestRef], reviewerBSubsetOutputPath: canonicalReviewerBSubset, passBSubsetOutputPath: canonicalPassBSubset });
  });

  it('retains immutable prepared Pass B refs while completed results are removed from pending work', () => {
    const { calibration, productionInputs } = workflowFixture();
    const path = journalPath();
    const waveId = 'partial-pass-b';
    const inputs = waveInputs(waveId, productionInputs.slice(0, 2));
    initializeUnicodeReviewWorkflow(path, calibration);
    const artifacts = planUnicodeReviewWave(path, calibration, waveId, productionInputs.slice(0, 2));
    const details = planDetails(path);
    const manifestRefs = artifacts.context.sidecar.entries.filter((entry) => entry.purpose === 'manifest').map((entry) => entry.pairRef);
    const expectedByRef = new Map(details.sentinels.map((sentinel) => [sentinel.pairRef, sentinel.expectedOutcome]));
    const aResults = artifacts.context.sidecar.entries.map((entry) => ({ pairRef: entry.pairRef, visualOutcome: entry.purpose === 'manifest' ? 'confusable' as const : expectedByRef.get(entry.pairRef)! }));
    ingestUnicodeReviewWaveA(path, calibration, inputs, { results: aResults, receipt: receipt('reviewer-a', artifacts.context, aResults, aResults.map((result) => result.pairRef), 'partial-a-session', 'partial-a-context') });
    prepareUnicodeReviewWaveB(path, calibration, inputs, `${path}-b-subset`);
    const bResults = manifestRefs.map((pairRef) => ({ pairRef, visualOutcome: 'confusable' as const }));
    ingestUnicodeReviewWaveB(path, calibration, inputs, { results: bResults, receipt: receipt('reviewer-b', artifacts.context, bResults, manifestRefs, 'partial-b-session', 'partial-b-context') });
    expect(prepareUnicodeReviewWavePassB(path, calibration, inputs, `${path}-pass-b-subset`)).toEqual(manifestRefs);

    const first = { pairRef: manifestRefs[0], observableDifference: { region: 'upper' as const, feature: 'dot' as const, contrast: 'present' as const } };
    ingestUnicodeReviewWavePassB(path, calibration, inputs, { result: first, receipt: receipt('pass-b', artifacts.context, first, [first.pairRef], 'partial-pass-b-session', 'partial-pass-b-context') });
    expect(readUnicodeReviewWorkflow(path, calibration, inputs).activeWave).toMatchObject({
      stage: 'pass-b-pending',
      passBPreparedPairRefs: manifestRefs,
      passBPairRefs: [manifestRefs[1]],
    });
  });

  it('rejects Reviewer B and Pass B subset transitions without an absolute recorded path', () => {
    const { calibration, productionInputs } = workflowFixture();
    const legacyPath = journalPath();
    initializeUnicodeReviewWorkflow(legacyPath, calibration);
    const legacyArtifacts = planUnicodeReviewWave(legacyPath, calibration, 'legacy-subset', [productionInputs[0]]);
    const legacyDetails = planDetails(legacyPath);
    const legacyRef = legacyArtifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const legacyInputs = waveInputs('legacy-subset', [productionInputs[0]]);
    ingestUnicodeReviewWaveA(legacyPath, calibration, legacyInputs, fullA(legacyArtifacts, legacyDetails, legacyRef));
    appendUnicodeReviewJournalEvent(legacyPath, loadUnicodeReviewJournal(legacyPath).tip, { type: 'wave-b-planned', waveId: 'legacy-subset', pairRefs: [legacyRef] });
    expect(() => readUnicodeReviewWorkflow(legacyPath, calibration, legacyInputs)).toThrow(/unsupported schema/i);

    const forgedPath = journalPath();
    initializeUnicodeReviewWorkflow(forgedPath, calibration);
    const forgedArtifacts = planUnicodeReviewWave(forgedPath, calibration, 'forged-subset', [productionInputs[0]]);
    const forgedDetails = planDetails(forgedPath);
    const forgedRef = forgedArtifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const forgedInputs = waveInputs('forged-subset', [productionInputs[0]]);
    ingestUnicodeReviewWaveA(forgedPath, calibration, forgedInputs, fullA(forgedArtifacts, forgedDetails, forgedRef));
    appendUnicodeReviewJournalEvent(forgedPath, loadUnicodeReviewJournal(forgedPath).tip, { type: 'wave-b-planned', waveId: 'forged-subset', pairRefs: [forgedRef], subsetOutputPath: 'relative/subset' });
    expect(() => readUnicodeReviewWorkflow(forgedPath, calibration, forgedInputs)).toThrow(/absolute path/i);

    const passBPath = journalPath();
    initializeUnicodeReviewWorkflow(passBPath, calibration);
    const passBArtifacts = planUnicodeReviewWave(passBPath, calibration, 'missing-pass-b-subset', [productionInputs[0]]);
    const passBDetails = planDetails(passBPath);
    const passBRef = passBArtifacts.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const passBInputs = waveInputs('missing-pass-b-subset', [productionInputs[0]]);
    ingestUnicodeReviewWaveA(passBPath, calibration, passBInputs, fullA(passBArtifacts, passBDetails, passBRef));
    prepareUnicodeReviewWaveB(passBPath, calibration, passBInputs, `${passBPath}-b-subset`);
    const bResults = [{ pairRef: passBRef, visualOutcome: 'confusable' as const }];
    ingestUnicodeReviewWaveB(passBPath, calibration, passBInputs, { results: bResults, receipt: receipt('reviewer-b', passBArtifacts.context, bResults, [passBRef], 'missing-pass-b-session', 'missing-pass-b-context') });
    appendUnicodeReviewJournalEvent(passBPath, loadUnicodeReviewJournal(passBPath).tip, { type: 'wave-pass-b-planned', waveId: 'missing-pass-b-subset', pairRefs: [passBRef] });
    expect(() => readUnicodeReviewWorkflow(passBPath, calibration, passBInputs)).toThrow(/unsupported schema/i);
  });
});
