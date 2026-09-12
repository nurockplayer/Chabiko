import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildBlindEvidenceArtifacts,
  buildBlindEvidenceArtifactsFromAuthority,
  authorizeCalibration,
  calibrationAuthorizationMatchesContext,
  calibrationFreezePasses,
  calibrationIsCompatible,
  calibrationReplayBindingsEqual,
  createCalibrationInterleaveSalt,
  createPairRefNamespaceSalt,
  getCalibrationAuthorizationBinding,
  interleaveCalibrationInputs,
  loadCanonicalEvidenceAuthority,
  parsePassAResult,
  parsePassBResult,
  promoteConfirmedPositive,
  recalibrationReasons,
  reconcileIndependentClassification,
  renderFixedCaution,
  validateStrictClassificationSubmission,
  type CalibrationMetrics,
  type ControllerEvidenceInput,
  type EvidenceAuthority,
  type ExternalControlEvidenceInput,
  type ManifestEvidenceInput,
  type ReviewContractBinding,
  validateAuthoritativeBlindEvidenceArtifacts,
  validateBlindEvidenceArtifacts,
} from '../scripts/unicode_review_v021';

const checksum = (character: string) => character.repeat(64);
const contract: ReviewContractBinding = {
  rubricVersion: 'unicode-visual-v0.2.1',
  promptChecksumSha256: checksum('f'),
  renderingEvidenceChecksumSha256: checksum('a'),
  reviewerModelVersion: 'vision-model-1',
  transportContractChecksumSha256: checksum('b'),
  visionCapabilityEvidenceRef: 'external-attestation:trusted-vision-transport',
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function tile(byte: number): Uint8Array {
  const value = new Uint8Array(64 * 64);
  value.fill(byte);
  return value;
}

function input(id: string, byte = 1): ManifestEvidenceInput {
  return {
    purpose: 'manifest',
    candidateId: id,
    leftGrayscale: tile(byte),
    rightGrayscale: tile(byte + 1),
  };
}

function authority(inputs: readonly ControllerEvidenceInput[]): EvidenceAuthority {
  const glyphs = new Map<string, string>();
  const candidates = inputs.filter((item): item is ManifestEvidenceInput => item.purpose === 'manifest').map((item, index) => {
    const leftDerivativeSha256 = sha256(item.leftGrayscale);
    const rightDerivativeSha256 = sha256(item.rightGrayscale);
    glyphs.set(`fixture-left-${index}`, leftDerivativeSha256);
    glyphs.set(`fixture-right-${index}`, rightDerivativeSha256);
    return {
      candidateId: item.candidateId,
      candidateChecksumSha256: sha256(new Uint8Array([index & 0xff, index >>> 8])),
      batchId: 'unicode-visual-review-0001',
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
    candidateManifestChecksumSha256: checksum('a'),
    reviewPlanChecksumSha256: checksum('b'),
    renderingEvidenceChecksumSha256: contract.renderingEvidenceChecksumSha256,
    glyphs: [...glyphs].map(([glyphRef, derivativeSha256]) => ({ glyphRef, derivativeSha256 })),
    candidates,
  };
}

function artifacts(inputs: readonly ControllerEvidenceInput[]) {
  const fixtureAuthority = authority(inputs);
  const evidence = buildBlindEvidenceArtifactsFromAuthority(fixtureAuthority, inputs, checksum('d'));
  return { ...evidence, context: { authority: fixtureAuthority, bundle: evidence.reviewerBundle, sidecar: evidence.controllerSidecar, inputs, localPngs: evidence.localPngs, contract } };
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(`${JSON.stringify(value)}\n`).digest('hex');
}

function submission(role: 'reviewer-a' | 'reviewer-b' | 'pass-b', context: ReturnType<typeof artifacts>['context'], results: unknown, refs: readonly string[], session = `${role}-session`, independence = `${role}-context`) {
  const entries = context.sidecar.entries.filter((entry) => refs.includes(entry.pairRef));
  return {
    results,
    receipt: {
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
    },
  };
}

function calibrationFixture(hardProbeDisagreement = false) {
  const controls: ControllerEvidenceInput[] = Array.from({ length: 72 }, (_, index) => index >= 40 && index < 64
    ? input(`fixture-hard-manifest-${index}`, index * 2)
    : {
      purpose: 'external-control',
      controllerControlId: `fixture-control-${index}`,
      leftGlyphRef: `fixture-left-${index}`,
      rightGlyphRef: `fixture-right-${index}`,
      leftGrayscale: tile(index * 2),
      rightGrayscale: tile(index * 2 + 1),
    });
  const evidence = artifacts(controls);
  const issuedContract = { ...contract };
  const context = { ...evidence.context, contract: issuedContract };
  const controlsByRef = context.sidecar.entries.filter((entry) => entry.purpose === 'external-control');
  let controlIndex = 0;
  const items = evidence.reviewerBundle.items.map((item) => {
    const entry = context.sidecar.entries.find((sidecarEntry) => sidecarEntry.pairRef === item.pairRef)!;
    if (entry.purpose === 'manifest') return { pairRef: item.pairRef, class: 'hard-probe' as const, expectedOutcome: 'confusable' as const };
    const current = controlIndex;
    controlIndex += 1;
    return current < 20
      ? { pairRef: item.pairRef, class: 'strong-positive' as const, expectedOutcome: 'confusable' as const }
      : current < 40
        ? { pairRef: item.pairRef, class: 'strong-negative' as const, expectedOutcome: 'not-confusable' as const }
        : { pairRef: item.pairRef, class: 'relation-trap' as const, expectedOutcome: 'borderline' as const };
  });
  expect(controlsByRef).toHaveLength(48);
  const results = items.map(({ pairRef, expectedOutcome }, index) => ({
    pairRef,
    visualOutcome: hardProbeDisagreement && items[index].class === 'hard-probe' && !items.slice(0, index).some((item) => item.class === 'hard-probe') ? 'not-confusable' as const : expectedOutcome,
  }));
  const key = {
    protocolVersion: 'unicode-visual-v0.2.1' as const,
    reviewerBundleChecksumSha256: hashJson(evidence.reviewerBundle),
    contract: issuedContract,
    items,
  };
  const issued = authorizeCalibration(context, key, submission('reviewer-a', context, results, items.map((item) => item.pairRef)));
  expect(issued.authorization).not.toBeNull();
  return { ...issued, context, evidence, key, results, issuedContract, originalContract: { ...contract } };
}

describe('#477 Unicode visual-review v0.2.1 deterministic harness', () => {
  it('keeps metadata exclusively in the controller sidecar and reviewer bundle opaque', () => {
    const evidence = artifacts([input('visual-u4e00-u4e01')]);
    const bundle = JSON.stringify(evidence.reviewerBundle);
    expect(bundle).toContain('pair-');
    expect(bundle).not.toContain('visual-u4e00-u4e01');
    expect(bundle).not.toContain('candidateChecksumSha256');
    expect(bundle).not.toContain('renderingEvidenceChecksumSha256');
    expect(bundle).not.toContain('pngBytes');
    expect(evidence.controllerSidecar.entries[0]).toMatchObject({ candidateId: 'visual-u4e00-u4e01', purpose: 'manifest' });
    expect([...evidence.localPngs.values()][0].byteLength).toBeGreaterThan(0);
  });

  it('rejects Pass A prose, metadata, malformed outcomes, unknown refs, and duplicates', () => {
    const evidence = artifacts([input('visual-u4e00-u4e01')]);
    const ref = evidence.reviewerBundle.items[0].pairRef;
    expect(() => parsePassAResult({ pairRef: ref, visualOutcome: 'confusable', prose: 'looks alike' })).toThrow(/unsupported|missing/i);
    expect(() => parsePassAResult({ pairRef: ref, visualOutcome: 'unsupported-evidence' })).toThrow(/unsupported/i);
    const invalid = submission('reviewer-a', evidence.context, [{ pairRef: ref, visualOutcome: 'not-confusable' }, { pairRef: ref, visualOutcome: 'not-confusable' }], [ref]);
    expect(() => reconcileIndependentClassification(evidence.context, { a: invalid, b: null })).toThrow(/duplicates/i);
  });

  it('requires a complete independent B only for A positives and maps disagreement fail-closed', () => {
    const evidence = artifacts([input('visual-u4e00-u4e01'), input('visual-u4e02-u4e03', 2)]);
    const [first, second] = evidence.reviewerBundle.items.map((item) => item.pairRef);
    const aResults = [
      { pairRef: first, visualOutcome: 'confusable' },
      { pairRef: second, visualOutcome: 'not-confusable' },
    ];
    const a = submission('reviewer-a', evidence.context, aResults, [first, second]);
    expect(() => reconcileIndependentClassification(evidence.context, { a, b: null })).toThrow(/Reviewer B/i);
    const b = submission('reviewer-b', evidence.context, [{ pairRef: first, visualOutcome: 'borderline' }], [first], 'b-session', 'b-context');
    const reconciled = reconcileIndependentClassification(evidence.context, { a, b });
    expect(reconciled.map((item) => [item.reconciledOutcome, item.passBEligible])).toEqual([
      ['borderline', false],
      ['not-confusable', false],
    ]);
  });

  it('allows learner promotion only after A+B positive, exact sidecar binding, bounded Pass B, and three receipts', () => {
    const calibration = calibrationFixture();
    const target = calibration.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!;
    const ref = target.pairRef;
    const aResults = calibration.context.sidecar.entries.map((entry) => ({ pairRef: entry.pairRef, visualOutcome: entry.pairRef === ref ? 'confusable' as const : 'not-confusable' as const }));
    const a = submission('reviewer-a', calibration.context, aResults, calibration.context.sidecar.entries.map((entry) => entry.pairRef));
    const b = submission('reviewer-b', calibration.context, [{ pairRef: ref, visualOutcome: 'confusable' }], [ref], 'b-session', 'b-context');
    const passBResult = { pairRef: ref, observableDifference: { region: 'upper', feature: 'dot', contrast: 'present' } };
    const passBReceipt = submission('pass-b', calibration.context, passBResult, [ref], 'pass-b-session', 'pass-b-context').receipt;
    const promoted = promoteConfirmedPositive({
      context: calibration.context,
      calibrationAuthorization: calibration.authorization!,
      classification: { a, b },
      passB: { result: passBResult, receipt: passBReceipt },
    });
    expect(promoted).toMatchObject({ reviewStatus: 'reviewed', learnerEligible: true });
    expect(promoted.cautionJa).toContain('意味・読み・字種上の関係は、この比較からは判断しません。');
    expect(() => promoteConfirmedPositive({
      context: calibration.context,
      calibrationAuthorization: { issuedAt: 'evaluator-only' },
      classification: { a, b },
      passB: { result: passBResult, receipt: passBReceipt },
    })).toThrow(/evaluator-issued/i);
    expect(() => promoteConfirmedPositive({
      context: calibration.context,
      calibrationAuthorization: undefined as unknown as { readonly issuedAt: 'evaluator-only' },
      classification: { a, b },
      passB: { result: passBResult, receipt: passBReceipt },
    })).toThrow(/evaluator-issued/i);
    expect(() => parsePassBResult({ pairRef: ref, observableDifference: { region: 'upper', feature: 'dot', contrast: 'present' }, prose: 'same character' })).toThrow(/unsupported|missing/i);
  });

  it('keeps a hard-probe borderline candidate learner-excluded even with positive production receipts', () => {
    const calibration = calibrationFixture(true);
    const target = calibration.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!;
    const ref = target.pairRef;
    expect(calibration.replayBinding?.hardProbeCandidateOverrides).toContainEqual(expect.objectContaining({
      candidateId: target.candidateId,
      candidateChecksumSha256: target.candidateChecksumSha256,
      outcome: 'borderline',
    }));
    const aResults = calibration.context.sidecar.entries.map((entry) => ({ pairRef: entry.pairRef, visualOutcome: entry.pairRef === ref ? 'confusable' as const : 'not-confusable' as const }));
    const a = submission('reviewer-a', calibration.context, aResults, calibration.context.sidecar.entries.map((entry) => entry.pairRef));
    const b = submission('reviewer-b', calibration.context, [{ pairRef: ref, visualOutcome: 'confusable' }], [ref], 'b-session', 'b-context');
    const passBResult = { pairRef: ref, observableDifference: { region: 'upper', feature: 'dot', contrast: 'present' } };
    const passBReceipt = submission('pass-b', calibration.context, passBResult, [ref], 'pass-b-session', 'pass-b-context').receipt;
    expect(() => promoteConfirmedPositive({
      context: calibration.context,
      calibrationAuthorization: calibration.authorization!,
      classification: { a, b },
      passB: { result: passBResult, receipt: passBReceipt },
    })).toThrow(/hard-probe borderline/i);
  });

  it('uses a fixed Japanese caution template rather than reviewer-authored prose', () => {
    expect(renderFixedCaution('未', '末', { region: 'upper', feature: 'dot', contrast: 'present' }))
      .toBe('「未」と「末」は、この固定レンダリング環境では字形が近く見えます。違いは上側の点がある点です。意味・読み・字種上の関係は、この比較からは判断しません。');
  });

  it('rejects stale, incomplete, reused, and non-positive receipt bindings', () => {
    const evidence = artifacts([input('visual-u4e00-u4e01')]);
    const ref = evidence.reviewerBundle.items[0].pairRef;
    const a = submission('reviewer-a', evidence.context, [{ pairRef: ref, visualOutcome: 'confusable' }], [ref]);
    const stale = { ...a, receipt: { ...a.receipt, resultsChecksumSha256: checksum('0') } };
    expect(() => reconcileIndependentClassification(evidence.context, { a: stale, b: null })).toThrow(/checksum/i);
    const incomplete = { ...a, receipt: { ...a.receipt, items: [] } };
    expect(() => reconcileIndependentClassification(evidence.context, { a: incomplete, b: null })).toThrow(/subset/i);
    const reused = submission('reviewer-b', evidence.context, [{ pairRef: ref, visualOutcome: 'confusable' }], [ref], 'reviewer-a-session', 'reviewer-a-context');
    expect(() => reconcileIndependentClassification(evidence.context, { a, b: reused })).toThrow(/fresh session|independent context/i);
    const negativeA = submission('reviewer-a', evidence.context, [{ pairRef: ref, visualOutcome: 'not-confusable' }], [ref]);
    const forbiddenB = submission('reviewer-b', evidence.context, [{ pairRef: ref, visualOutcome: 'confusable' }], [ref], 'b-session', 'b-context');
    expect(() => reconcileIndependentClassification(evidence.context, { a: negativeA, b: forbiddenB })).toThrow(/must not receive/i);
  });

  it('keeps calibration PASS mechanical without constructing a subjective 72-item key', () => {
    const metrics: CalibrationMetrics = {
      evaluated: true,
      strongPositiveExact: 19,
      strongNegativeExact: 19,
      strongNegativeConfusable: 0,
      relationLeakageCount: 0,
      confusionMatrix: {
        confusable: { confusable: 19, 'not-confusable': 1, borderline: 0 },
        'not-confusable': { confusable: 0, 'not-confusable': 19, borderline: 1 },
        borderline: { confusable: 0, 'not-confusable': 0, borderline: 32 },
      },
      rawAgreement: 70 / 72,
    };
    expect(calibrationFreezePasses(metrics)).toBe(true);
    expect(calibrationFreezePasses({ ...metrics, strongPositiveExact: 18 })).toBe(false);
    expect(calibrationFreezePasses({ ...metrics, strongNegativeExact: 18 })).toBe(false);
    expect(calibrationFreezePasses({ ...metrics, strongNegativeConfusable: 1 })).toBe(false);
    expect(calibrationFreezePasses({ ...metrics, relationLeakageCount: 1 })).toBe(false);
    expect(calibrationFreezePasses({ ...metrics, evaluated: false, strongPositiveExact: null, strongNegativeExact: null, strongNegativeConfusable: null, relationLeakageCount: null, confusionMatrix: null, rawAgreement: null })).toBe(false);
  });

  it('rejects every malformed sealed key shape and reports validation failure without fabricating leakage metrics', () => {
    const fixture = calibrationFixture();
    const refs = fixture.key.items.map((item) => item.pairRef);
    const malformedItem = {
      ...fixture.key,
      items: fixture.key.items.map((item, index) => index === 0 ? { ...item, unexpected: true } : item),
    };
    const malformedItemResult = authorizeCalibration(fixture.context, malformedItem as typeof fixture.key, submission('reviewer-a', fixture.context, fixture.results, refs));
    expect(malformedItemResult.authorization).toBeNull();
    expect(malformedItemResult.evaluation.metrics).toMatchObject({ evaluated: false, relationLeakageCount: null, rawAgreement: null, confusionMatrix: null });

    const malformedContract = {
      ...fixture.key,
      contract: { ...fixture.key.contract, unexpected: true },
    };
    expect(authorizeCalibration(fixture.context, malformedContract as typeof fixture.key, submission('reviewer-a', fixture.context, fixture.results, refs)).authorization).toBeNull();

    const pairRefs = fixture.key.items.map((item) => item.pairRef);
    const hardIndex = fixture.key.items.findIndex((item) => item.class === 'hard-probe');
    const controlIndex = fixture.key.items.findIndex((item) => item.class === 'strong-positive');
    [pairRefs[controlIndex], pairRefs[hardIndex]] = [pairRefs[hardIndex], pairRefs[controlIndex]];
    const controlBackedHardProbe = { ...fixture.key, items: fixture.key.items.map((item, index) => ({ ...item, pairRef: pairRefs[index] })) };
    const outcome = authorizeCalibration(fixture.context, controlBackedHardProbe as typeof fixture.key, submission('reviewer-a', fixture.context, fixture.results.map((result, index) => ({ ...result, pairRef: pairRefs[index] })), pairRefs));
    expect(outcome.authorization).toBeNull();
    expect(outcome.evaluation.reasons.join(' ')).toMatch(/hard probe.*manifest/i);
  });

  it('interleaves exactly 72 controller inputs from a secret salt without exposing calibration classes', () => {
    const fixture = calibrationFixture();
    const salt = createCalibrationInterleaveSalt();
    const first = interleaveCalibrationInputs(fixture.context.inputs, salt);
    const second = interleaveCalibrationInputs(fixture.context.inputs, salt);
    expect(first).toEqual(second);
    expect(first).not.toEqual(fixture.context.inputs);
    expect(new Set(first).size).toBe(72);
    expect(() => interleaveCalibrationInputs(fixture.context.inputs.slice(0, 71), salt)).toThrow(/exactly 72/i);
    expect(() => interleaveCalibrationInputs(fixture.context.inputs, 'not-a-salt')).toThrow(/salt/i);
  });

  it('binds evaluator authorization to an immutable snapshot and rejects caller-created PASS lookalikes', () => {
    const { authorization, evaluation, replayBinding, context, issuedContract, originalContract } = calibrationFixture();
    expect(authorization).not.toBeNull();
    const token = authorization!;
    expect(Object.isFrozen(token)).toBe(true);
    expect(calibrationIsCompatible(token, issuedContract)).toBe(true);
    expect(calibrationAuthorizationMatchesContext(token, context)).toBe(true);
    expect(getCalibrationAuthorizationBinding(token)).toEqual(replayBinding);
    expect(calibrationReplayBindingsEqual(replayBinding, JSON.parse(JSON.stringify(replayBinding)))).toBe(true);
    expect(evaluation.calibrationResultChecksumSha256).toBe(hashJson({
      pass: evaluation.pass,
      reasons: evaluation.reasons,
      metrics: evaluation.metrics,
      hardProbeProductionOutcomes: evaluation.hardProbeProductionOutcomes,
      hardProbeCandidateOverrides: evaluation.hardProbeCandidateOverrides,
    }));

    issuedContract.reviewerModelVersion = 'mutated-reviewer-model';
    (evaluation as unknown as { pass: boolean; calibrationResultChecksumSha256: string }).pass = true;
    (evaluation as unknown as { pass: boolean; calibrationResultChecksumSha256: string }).calibrationResultChecksumSha256 = checksum('0');
    expect(calibrationIsCompatible(token, issuedContract)).toBe(false);
    expect(calibrationAuthorizationMatchesContext(token, context)).toBe(false);
    expect(calibrationIsCompatible(token, originalContract)).toBe(true);

    const jsonClone = JSON.parse(JSON.stringify(token));
    const callerOverride = new Map<object, ReviewContractBinding>([[jsonClone, originalContract]]);
    expect(calibrationIsCompatible(jsonClone, callerOverride.get(jsonClone)!)).toBe(false);
    expect(calibrationIsCompatible({ issuedAt: 'evaluator-only' }, originalContract)).toBe(false);
  });

  it('validates an explicit mixed manifest/control receipt subset without permitting a synthetic sidecar entry', () => {
    const control: ExternalControlEvidenceInput = {
      purpose: 'external-control', controllerControlId: 'wave-sentinel-01', leftGlyphRef: 'wave-left', rightGlyphRef: 'wave-right', leftGrayscale: tile(11), rightGrayscale: tile(12),
    };
    const evidence = artifacts([input('visual-u4e00-u4e01'), control]);
    const refs = evidence.controllerSidecar.entries.map((entry) => entry.pairRef);
    const results = refs.map((pairRef) => ({ pairRef, visualOutcome: 'not-confusable' }));
    const validated = validateStrictClassificationSubmission(
      evidence.context,
      submission('reviewer-a', evidence.context, results, refs),
      'reviewer-a',
      evidence.controllerSidecar.entries,
    );
    expect(validated.results).toEqual(results);
    const manifestRef = evidence.context.sidecar.entries.find((entry) => entry.purpose === 'manifest')!.pairRef;
    const a = submission('reviewer-a', evidence.context, refs.map((pairRef) => ({ pairRef, visualOutcome: 'confusable' })), refs);
    const b = submission('reviewer-b', evidence.context, [{ pairRef: manifestRef, visualOutcome: 'confusable' }], [manifestRef], 'b-session', 'b-context');
    expect(reconcileIndependentClassification(evidence.context, { a, b })).toMatchObject([{ pairRef: manifestRef, passBEligible: true }]);
    const forgedEntry = { ...evidence.controllerSidecar.entries[1], evidenceChecksumSha256: checksum('0') };
    expect(() => validateStrictClassificationSubmission(
      evidence.context,
      submission('reviewer-a', evidence.context, results, refs),
      'reviewer-a',
      [evidence.controllerSidecar.entries[0], forgedEntry],
    )).toThrow(/synthesized|stale|unknown/i);
  });

  it('requires recalibration for every material reviewer, rendering, rubric, or transport change', () => {
    expect(recalibrationReasons(contract, { ...contract, reviewerModelVersion: 'vision-model-2' })).toEqual(['reviewer model/version changed']);
    expect(recalibrationReasons(contract, { ...contract, renderingEvidenceChecksumSha256: checksum('9'), transportContractChecksumSha256: checksum('8') }))
      .toEqual(['rendering evidence changed', 'transport contract changed']);
  });

  it('derives manifest binding and pixels from authority, rejecting forged candidate and grayscale input', () => {
    const evidence = input('visual-u4e00-u4e01');
    const fixtureAuthority = authority([evidence]);
    expect(() => buildBlindEvidenceArtifactsFromAuthority(fixtureAuthority, [{ ...evidence, candidateId: 'forged-candidate' }], checksum('d'))).toThrow(/authoritative/i);
    expect(() => buildBlindEvidenceArtifactsFromAuthority(fixtureAuthority, [{ ...evidence, leftGrayscale: tile(99) }], checksum('d'))).toThrow(/derivative/i);
    const generated = buildBlindEvidenceArtifactsFromAuthority(fixtureAuthority, [evidence], checksum('d'));
    const tamperedPngs = new Map(generated.localPngs);
    const pixelPath = generated.reviewerBundle.items[0].pixelPath;
    tamperedPngs.set(pixelPath, new Uint8Array([1, 2, 3]));
    expect(() => validateAuthoritativeBlindEvidenceArtifacts(fixtureAuthority, generated.reviewerBundle, generated.controllerSidecar, [evidence], tamperedPngs)).toThrow(/checksum/i);
  });

  it('orders every opaque artifact by pairRef while validating unordered authority inputs one-to-one', () => {
    const control: ExternalControlEvidenceInput = {
      purpose: 'external-control', controllerControlId: 'ordering-control', leftGlyphRef: 'ordering-left', rightGlyphRef: 'ordering-right', leftGrayscale: tile(11), rightGrayscale: tile(12),
    };
    const unordered: ControllerEvidenceInput[] = [input('visual-u4e02-u4e03', 2), control, input('visual-u4e00-u4e01')];
    const fixtureAuthority = authority(unordered);
    const first = buildBlindEvidenceArtifactsFromAuthority(fixtureAuthority, unordered, checksum('d'));
    const reversed = buildBlindEvidenceArtifactsFromAuthority(fixtureAuthority, [...unordered].reverse(), checksum('d'));
    const refs = first.reviewerBundle.items.map((item) => item.pairRef);
    expect(refs).toEqual([...refs].sort());
    expect(first.controllerSidecar.entries.map((entry) => entry.pairRef)).toEqual(refs);
    expect(reversed.reviewerBundle).toEqual(first.reviewerBundle);
    expect(reversed.controllerSidecar).toEqual(first.controllerSidecar);
    expect(() => validateAuthoritativeBlindEvidenceArtifacts(fixtureAuthority, first.reviewerBundle, first.controllerSidecar, [...unordered].reverse(), first.localPngs)).not.toThrow();

    const reorderedBundle = { ...first.reviewerBundle, items: [...first.reviewerBundle.items].reverse() };
    const rehashedSidecar = { ...first.controllerSidecar, reviewerBundleChecksumSha256: hashJson(reorderedBundle) };
    expect(() => validateBlindEvidenceArtifacts(reorderedBundle, rehashedSidecar)).toThrow(/ordered/i);
    expect(() => validateBlindEvidenceArtifacts(first.reviewerBundle, { ...first.controllerSidecar, entries: [...first.controllerSidecar.entries].reverse() })).toThrow(/ordered/i);
    expect(() => buildBlindEvidenceArtifactsFromAuthority(fixtureAuthority, [...unordered, unordered[0]], checksum('d'))).toThrow(/duplicate/i);
    const unmatchedPngs = new Map(first.localPngs);
    unmatchedPngs.set('pairs/pair-000000000000000000000000.png', new Uint8Array([0]));
    expect(() => validateAuthoritativeBlindEvidenceArtifacts(fixtureAuthority, first.reviewerBundle, first.controllerSidecar, unordered, unmatchedPngs)).toThrow(/exact derived pair set|unmatched/i);
  });

  it('loads the current #262 manifest and plan before accepting an evidence input', () => {
    const canonical = loadCanonicalEvidenceAuthority();
    expect(canonical.candidates.length).toBeGreaterThan(0);
    const candidate = canonical.candidates[0];
    expect(() => buildBlindEvidenceArtifacts([{
      purpose: 'manifest',
      candidateId: candidate.candidateId,
      leftGrayscale: tile(0),
      rightGrayscale: tile(0),
    }], checksum('d'))).toThrow(/derivative/i);
  });

  it('uses a fresh controller-only namespace salt so reviewer refs cannot form a public candidate dictionary', () => {
    const evidence = input('visual-u4e00-u4e01');
    const fixtureAuthority = authority([evidence]);
    const first = buildBlindEvidenceArtifactsFromAuthority(fixtureAuthority, [evidence], checksum('d'));
    const second = buildBlindEvidenceArtifactsFromAuthority(fixtureAuthority, [evidence], checksum('e'));
    expect(first.reviewerBundle.items[0].pairRef).not.toBe(second.reviewerBundle.items[0].pairRef);
    expect(createPairRefNamespaceSalt()).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(first.reviewerBundle)).not.toContain(evidence.candidateId);
    expect(JSON.stringify(first.reviewerBundle)).not.toContain(first.controllerSidecar.pairRefNamespaceSalt);
  });

  it('keeps external controls out of manifest ownership while binding their actual canonical glyph derivatives', () => {
    const control: ExternalControlEvidenceInput = {
      purpose: 'external-control',
      controllerControlId: 'calibration-control-01',
      leftGlyphRef: 'u4e00',
      rightGlyphRef: 'u4e01',
      leftGrayscale: tile(11),
      rightGrayscale: tile(12),
    };
    const generated = buildBlindEvidenceArtifactsFromAuthority(authority([control]), [control], checksum('d'));
    const entry = generated.controllerSidecar.entries[0];
    expect(entry).toMatchObject({ purpose: 'external-control', controllerControlId: 'calibration-control-01' });
    expect(JSON.stringify(entry)).not.toContain('batchId');
    expect(JSON.stringify(generated.reviewerBundle)).not.toContain('calibration-control-01');
    expect(JSON.stringify(generated.reviewerBundle)).not.toMatch(/strong-positive|strong-negative|hard-probe|expectedOutcome/);
  });
});
