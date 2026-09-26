import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPinnedPair } from './unicode_review_pixels.ts';
import { validateVisualArtifacts } from './unicode_visual_contract.ts';

export const REVIEW_PROTOCOL_VERSION = 'unicode-visual-v0.2.1';
export const CALIBRATION_PACK_SIZE = 72;
export const INITIAL_WAVE_LIMIT = 250;
export const SCALED_WAVE_LIMIT = 500;

const OUTCOMES = ['confusable', 'not-confusable', 'borderline'] as const;
const CALIBRATION_CLASSES = ['strong-positive', 'strong-negative', 'hard-probe', 'relation-trap'] as const;
const REGIONS = ['upper', 'lower', 'left', 'right', 'center', 'whole'] as const;
const FEATURES = ['stroke', 'dot', 'hook', 'line', 'shape', 'enclosure'] as const;
const CONTRASTS = ['present', 'absent', 'longer', 'shorter', 'open', 'closed', 'curved', 'straight'] as const;

export type VisualOutcome = (typeof OUTCOMES)[number];
export type CalibrationClass = (typeof CALIBRATION_CLASSES)[number];
export type ObservableRegion = (typeof REGIONS)[number];
export type ObservableFeature = (typeof FEATURES)[number];
export type ObservableContrast = (typeof CONTRASTS)[number];

export interface ReviewContractBinding {
  readonly rubricVersion: typeof REVIEW_PROTOCOL_VERSION;
  readonly promptChecksumSha256: string;
  readonly renderingEvidenceChecksumSha256: string;
  readonly reviewerModelVersion: string;
  readonly transportContractChecksumSha256: string;
  readonly visionCapabilityEvidenceRef: string;
}

interface GrayscaleEvidenceInput {
  /** Exact 64x64 grayscale derivatives from the pinned #262 renderer. */
  readonly leftGrayscale: Uint8Array;
  readonly rightGrayscale: Uint8Array;
}

export interface ManifestEvidenceInput extends GrayscaleEvidenceInput {
  readonly purpose: 'manifest';
  readonly candidateId: string;
}

/**
 * A controller-selected calibration control or sentinel. Its visual role and
 * expected outcome remain in the external sealed key, never in this input or
 * in the reviewer bundle. It has no manifest candidate or batch ownership.
 */
export interface ExternalControlEvidenceInput extends GrayscaleEvidenceInput {
  readonly purpose: 'external-control';
  readonly controllerControlId: string;
  readonly leftGlyphRef: string;
  readonly rightGlyphRef: string;
}

export type ControllerEvidenceInput = ManifestEvidenceInput | ExternalControlEvidenceInput;

export interface AuthoritativeCandidateEvidence {
  readonly candidateId: string;
  readonly candidateChecksumSha256: string;
  readonly batchId: string;
  readonly leftDerivativeSha256: string;
  readonly rightDerivativeSha256: string;
  readonly leftText: string;
  readonly rightText: string;
}

export interface AuthoritativeGlyphEvidence {
  readonly glyphRef: string;
  readonly derivativeSha256: string;
}

/**
 * Controller-owned projection of the validated #262 manifest and review plan.
 * It deliberately excludes glyph text, scalar values, hashes used for candidate
 * selection, and all review metadata from the reviewer-facing bundle.
 */
export interface EvidenceAuthority {
  readonly candidateManifestChecksumSha256: string;
  readonly reviewPlanChecksumSha256: string;
  readonly renderingEvidenceChecksumSha256: string;
  readonly glyphs: readonly AuthoritativeGlyphEvidence[];
  readonly candidates: readonly AuthoritativeCandidateEvidence[];
}

export interface ReviewerBundleItem {
  readonly pairRef: string;
  readonly pixelPath: string;
}

export interface ReviewerBundle {
  readonly protocolVersion: typeof REVIEW_PROTOCOL_VERSION;
  readonly items: readonly ReviewerBundleItem[];
}

interface ControllerSidecarEntryBase {
  readonly pairRef: string;
  readonly purpose: ControllerEvidenceInput['purpose'];
  readonly evidenceChecksumSha256: string;
}

export interface ManifestControllerSidecarEntry extends ControllerSidecarEntryBase {
  readonly purpose: 'manifest';
  readonly candidateId: string;
  readonly candidateChecksumSha256: string;
  readonly batchId: string;
  readonly renderingEvidenceChecksumSha256: string;
}

export interface ExternalControlControllerSidecarEntry extends ControllerSidecarEntryBase {
  readonly purpose: 'external-control';
  readonly controllerControlId: string;
  readonly leftGlyphRef: string;
  readonly rightGlyphRef: string;
  readonly leftDerivativeSha256: string;
  readonly rightDerivativeSha256: string;
}

export type ControllerSidecarEntry = ManifestControllerSidecarEntry | ExternalControlControllerSidecarEntry;

export interface ControllerSidecar {
  readonly protocolVersion: typeof REVIEW_PROTOCOL_VERSION;
  readonly candidateManifestChecksumSha256: string;
  readonly reviewPlanChecksumSha256: string;
  readonly renderingEvidenceChecksumSha256: string;
  /** Controller-only random namespace secret; never include it in the bundle. */
  readonly pairRefNamespaceSalt: string;
  readonly reviewerBundleChecksumSha256: string;
  readonly entries: readonly ControllerSidecarEntry[];
}

export interface BlindEvidenceArtifacts {
  readonly reviewerBundle: ReviewerBundle;
  readonly controllerSidecar: ControllerSidecar;
  /** Write these only to an external/local ignored evidence directory. */
  readonly localPngs: ReadonlyMap<string, Uint8Array>;
}

export interface PassAResult {
  readonly pairRef: string;
  readonly visualOutcome: VisualOutcome;
}

export interface SealedCalibrationKeyItem {
  readonly pairRef: string;
  readonly class: CalibrationClass;
  readonly expectedOutcome: VisualOutcome;
}

/** This type is intentionally input-only: #477 never constructs a key. */
export interface SealedCalibrationKey {
  readonly protocolVersion: typeof REVIEW_PROTOCOL_VERSION;
  readonly reviewerBundleChecksumSha256: string;
  readonly contract: ReviewContractBinding;
  readonly items: readonly SealedCalibrationKeyItem[];
}

export interface CalibrationMetrics {
  /** False means validation failed before any calibration metric was observed. */
  readonly evaluated: boolean;
  readonly strongPositiveExact: number | null;
  readonly strongNegativeExact: number | null;
  readonly strongNegativeConfusable: number | null;
  readonly relationLeakageCount: number | null;
  readonly confusionMatrix: Readonly<Record<VisualOutcome, Readonly<Record<VisualOutcome, number>>>> | null;
  readonly rawAgreement: number | null;
}

export interface CalibrationEvaluation {
  readonly pass: boolean;
  readonly reasons: readonly string[];
  readonly metrics: CalibrationMetrics;
  readonly hardProbeProductionOutcomes: Readonly<Record<string, VisualOutcome>>;
  /** Only hard-manifest probe disagreements/uncertainty, bound to canonical candidates. */
  readonly hardProbeCandidateOverrides: readonly HardProbeCandidateOverride[];
  readonly calibrationResultChecksumSha256: string;
}

export interface HardProbeCandidateOverride {
  readonly pairRef: string;
  readonly candidateId: string;
  readonly candidateChecksumSha256: string;
  readonly evidenceChecksumSha256: string;
  readonly outcome: 'borderline';
}

export interface EvaluatorInputFingerprints {
  readonly authoritySha256: string;
  readonly reviewerBundleSha256: string;
  readonly controllerSidecarSha256: string;
  readonly controllerInputsSha256: string;
  readonly localPngsSha256: string;
  readonly sealedKeySha256: string;
  readonly resultsSha256: string;
  readonly receiptSha256: string;
}

/**
 * Serializable, controller-side replay record. It proves only that a fresh
 * evaluator invocation saw the same exact inputs; it is never an authority
 * token. Production authority remains the opaque WeakMap-backed capability.
 */
export interface CalibrationReplayBinding {
  readonly contract: Readonly<ReviewContractBinding>;
  readonly inputFingerprints: Readonly<EvaluatorInputFingerprints>;
  readonly calibrationResultChecksumSha256: string;
  readonly evaluationSha256: string;
  readonly hardProbeCandidateOverrides: readonly HardProbeCandidateOverride[];
}

/**
 * Opaque, evaluator-issued capability. It has no serializable calibration
 * data: the immutable calibration snapshot stays in this module's WeakMap.
 */
export interface CalibrationAuthorization { readonly issuedAt: 'evaluator-only' }

interface CalibrationAuthorizationSnapshot {
  readonly binding: CalibrationReplayBinding;
}

const calibrationAuthorizations = new WeakMap<object, CalibrationAuthorizationSnapshot>();

export interface ClassificationReconciliation {
  readonly pairRef: string;
  readonly candidateId: string;
  readonly candidateChecksumSha256: string;
  readonly aOutcome: VisualOutcome;
  readonly bOutcome: VisualOutcome | null;
  readonly reconciledOutcome: VisualOutcome;
  readonly passBEligible: boolean;
  readonly aReceipt: VisionReceipt;
  readonly bReceipt: VisionReceipt | null;
}

export interface ObservableDifference {
  readonly region: ObservableRegion;
  readonly feature: ObservableFeature;
  readonly contrast: ObservableContrast;
}

export interface PassBResult {
  readonly pairRef: string;
  readonly observableDifference: ObservableDifference;
}

export interface PromotionInput {
  readonly context: ReviewEvidenceContext;
  /** Required opaque authorization from authorizeCalibration for this exact context. */
  readonly calibrationAuthorization: CalibrationAuthorization;
  readonly classification: IndependentClassificationInput;
  readonly passB: VisionPassBSubmission;
}

export interface PromotionRecord {
  readonly candidateId: string;
  readonly reviewStatus: 'reviewed';
  readonly learnerEligible: true;
  readonly cautionJa: string;
}

export type ReviewRole = 'reviewer-a' | 'reviewer-b' | 'pass-b';

export interface VisionReceiptItem {
  readonly pairRef: string;
  readonly evidenceChecksumSha256: string;
}

/** External transport attestation input; this module never generates it. */
export interface VisionReceipt {
  readonly protocolVersion: typeof REVIEW_PROTOCOL_VERSION;
  readonly role: ReviewRole;
  readonly reviewerSessionId: string;
  readonly reviewerIndependenceContextId: string;
  readonly reviewerModelVersion: string;
  /** Trusted transport evidence reference, not a claim that a checksum proves vision. */
  readonly visionCapabilityEvidenceRef: string;
  readonly rubricVersion: typeof REVIEW_PROTOCOL_VERSION;
  readonly promptChecksumSha256: string;
  readonly renderingEvidenceChecksumSha256: string;
  readonly transportProfileChecksumSha256: string;
  readonly reviewerBundleChecksumSha256: string;
  readonly items: readonly VisionReceiptItem[];
  readonly resultsChecksumSha256: string;
}

export interface VisionClassificationSubmission {
  readonly results: unknown;
  readonly receipt: unknown;
}

/** A parsed classification result whose receipt is bound to an exact sidecar subset. */
export interface ValidatedClassificationSubmission {
  readonly results: readonly PassAResult[];
  readonly receipt: VisionReceipt;
}

export interface IndependentClassificationInput {
  readonly a: VisionClassificationSubmission;
  readonly b: VisionClassificationSubmission | null;
}

export interface VisionPassBSubmission {
  readonly result: unknown;
  readonly receipt: unknown;
}

export interface ReviewEvidenceContext {
  readonly authority: EvidenceAuthority;
  readonly bundle: ReviewerBundle;
  readonly sidecar: ControllerSidecar;
  readonly inputs: readonly ControllerEvidenceInput[];
  readonly localPngs: ReadonlyMap<string, Uint8Array>;
  readonly contract: ReviewContractBinding;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Json(value: unknown): string {
  return sha256(`${JSON.stringify(value)}\n`);
}

function controllerInputsFingerprint(inputs: readonly ControllerEvidenceInput[]): string {
  return sha256Json(inputs.map((input) => input.purpose === 'manifest'
    ? {
      purpose: input.purpose,
      candidateId: input.candidateId,
      leftGrayscaleSha256: sha256(input.leftGrayscale),
      rightGrayscaleSha256: sha256(input.rightGrayscale),
    }
    : {
      purpose: input.purpose,
      controllerControlId: input.controllerControlId,
      leftGlyphRef: input.leftGlyphRef,
      rightGlyphRef: input.rightGlyphRef,
      leftGrayscaleSha256: sha256(input.leftGrayscale),
      rightGrayscaleSha256: sha256(input.rightGrayscale),
    }));
}

function localPngsFingerprint(localPngs: ReadonlyMap<string, Uint8Array>): string {
  return sha256Json([...localPngs.entries()]
    .map(([path, bytes]) => ({ path, sha256: sha256(bytes) }))
    .sort((left, right) => left.path.localeCompare(right.path)));
}

function evaluatorInputFingerprints(
  context: ReviewEvidenceContext,
  key: SealedCalibrationKey,
  results: readonly PassAResult[],
  receipt: VisionReceipt,
): EvaluatorInputFingerprints {
  return {
    authoritySha256: sha256Json(context.authority),
    reviewerBundleSha256: sha256Json(context.bundle),
    controllerSidecarSha256: sha256Json(context.sidecar),
    controllerInputsSha256: controllerInputsFingerprint(context.inputs),
    localPngsSha256: localPngsFingerprint(context.localPngs),
    sealedKeySha256: sha256Json(key),
    resultsSha256: sha256Json(results),
    receiptSha256: sha256Json(receipt),
  };
}

function freezeHardProbeCandidateOverrides(overrides: readonly HardProbeCandidateOverride[]): readonly HardProbeCandidateOverride[] {
  return Object.freeze(overrides.map((override) => Object.freeze({ ...override })));
}

function freezeReplayBinding(binding: CalibrationReplayBinding): CalibrationReplayBinding {
  return Object.freeze({
    contract: Object.freeze({ ...binding.contract }),
    inputFingerprints: Object.freeze({ ...binding.inputFingerprints }),
    calibrationResultChecksumSha256: binding.calibrationResultChecksumSha256,
    evaluationSha256: binding.evaluationSha256,
    hardProbeCandidateOverrides: freezeHardProbeCandidateOverrides(binding.hardProbeCandidateOverrides),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertExactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  assert(isRecord(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} has unsupported or missing fields`);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), `${label} must be a lowercase SHA-256`);
}

function assertPairRef(value: unknown, label = 'pairRef'): asserts value is string {
  assert(typeof value === 'string' && /^pair-[0-9a-f]{24}$/.test(value), `${label} must be an opaque pair reference`);
}

function assertOutcome(value: unknown, label = 'visualOutcome'): asserts value is VisualOutcome {
  assert(typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value), `${label} is unsupported`);
}

function assertUnique(values: readonly string[], label: string): void {
  assert(new Set(values).size === values.length, `${label} contains duplicates`);
}

export function createPairRefNamespaceSalt(): string {
  return randomBytes(32).toString('hex');
}

/** Creates a controller-only seed for a blind 72-item calibration ordering. */
export function createCalibrationInterleaveSalt(): string {
  return randomBytes(32).toString('hex');
}

function assertOpaqueId(value: unknown, label: string): asserts value is string {
  assert(typeof value === 'string' && value.length > 0 && value.length <= 256, `${label} is required controller-side`);
}

function assertGrayscaleTile(value: unknown, label: string): asserts value is Uint8Array {
  assert(value instanceof Uint8Array && value.byteLength === 64 * 64, `${label} must be an exact 64x64 grayscale derivative`);
}

function calibrationInputFingerprint(input: ControllerEvidenceInput): string {
  return sha256Json(input.purpose === 'manifest'
    ? {
      purpose: input.purpose,
      candidateId: input.candidateId,
      leftGrayscaleSha256: sha256(input.leftGrayscale),
      rightGrayscaleSha256: sha256(input.rightGrayscale),
    }
    : {
      purpose: input.purpose,
      controllerControlId: input.controllerControlId,
      leftGlyphRef: input.leftGlyphRef,
      rightGlyphRef: input.rightGlyphRef,
      leftGrayscaleSha256: sha256(input.leftGrayscale),
      rightGrayscaleSha256: sha256(input.rightGrayscale),
    });
}

/**
 * Deterministically shuffles the controller-only 72-item pack before bundle
 * generation. It receives no sealed labels and never exposes its salt in a
 * reviewer bundle, so ordering cannot disclose calibration classes.
 */
export function interleaveCalibrationInputs(
  inputs: readonly ControllerEvidenceInput[],
  calibrationSalt: string,
): readonly ControllerEvidenceInput[] {
  assert(inputs.length === CALIBRATION_PACK_SIZE, 'calibration interleave requires exactly 72 inputs');
  assertSha256(calibrationSalt, 'calibration interleave salt');
  const seen = new Set<string>();
  const ranked = inputs.map((input, index) => {
    const fingerprint = calibrationInputFingerprint(input);
    assert(!seen.has(fingerprint), 'calibration interleave inputs must be unique');
    seen.add(fingerprint);
    return { input, index, rank: sha256(`${calibrationSalt}\n${index}\n${fingerprint}`) };
  });
  ranked.sort((left, right) => left.rank.localeCompare(right.rank) || left.index - right.index);
  return Object.freeze(ranked.map(({ input }) => input));
}

type PairRefBinding = Omit<ManifestControllerSidecarEntry, 'pairRef'> | Omit<ExternalControlControllerSidecarEntry, 'pairRef'>;

function pairRefBinding(entry: ControllerSidecarEntry): PairRefBinding {
  if (entry.purpose === 'manifest') {
    return {
      purpose: entry.purpose,
      candidateId: entry.candidateId,
      candidateChecksumSha256: entry.candidateChecksumSha256,
      batchId: entry.batchId,
      renderingEvidenceChecksumSha256: entry.renderingEvidenceChecksumSha256,
      evidenceChecksumSha256: entry.evidenceChecksumSha256,
    };
  }
  return {
    purpose: entry.purpose,
    controllerControlId: entry.controllerControlId,
    leftGlyphRef: entry.leftGlyphRef,
    rightGlyphRef: entry.rightGlyphRef,
    leftDerivativeSha256: entry.leftDerivativeSha256,
    rightDerivativeSha256: entry.rightDerivativeSha256,
    evidenceChecksumSha256: entry.evidenceChecksumSha256,
  };
}

function opaquePairRef(namespaceSalt: string, entry: ControllerSidecarEntry): string {
  assertSha256(namespaceSalt, 'pairRef namespace salt');
  return `pair-${sha256(`${REVIEW_PROTOCOL_VERSION}\n${namespaceSalt}\n${JSON.stringify(pairRefBinding(entry))}`).slice(0, 24)}`;
}

function findAuthorityCandidate(authority: EvidenceAuthority, candidateId: string): AuthoritativeCandidateEvidence {
  const candidate = authority.candidates.find((item) => item.candidateId === candidateId);
  assert(candidate, `candidate '${candidateId}' is absent from the authoritative #262 manifest and plan`);
  return candidate;
}

function findAuthorityGlyph(authority: EvidenceAuthority, glyphRef: string): AuthoritativeGlyphEvidence {
  const glyph = authority.glyphs.find((item) => item.glyphRef === glyphRef);
  assert(glyph, `glyph '${glyphRef}' is absent from the authoritative #262 rendering manifest`);
  return glyph;
}

function assertDerivative(tile: Uint8Array, expected: string, label: string): void {
  assertSha256(expected, `${label} derivative checksum`);
  assert(sha256(tile) === expected, `${label} grayscale derivative does not match the authoritative #262 renderer output`);
}

function assertEvidenceAuthority(authority: EvidenceAuthority): void {
  assertSha256(authority.candidateManifestChecksumSha256, 'candidate manifest checksum');
  assertSha256(authority.reviewPlanChecksumSha256, 'review plan checksum');
  assertSha256(authority.renderingEvidenceChecksumSha256, 'rendering evidence checksum');
  assert(authority.glyphs.length > 0, 'evidence authority requires pinned glyph derivatives');
  for (const glyph of authority.glyphs) {
    assertOpaqueId(glyph.glyphRef, 'glyph reference');
    assertSha256(glyph.derivativeSha256, 'glyph derivative checksum');
  }
  assertUnique(authority.glyphs.map((glyph) => glyph.glyphRef), 'authoritative glyph references');
  for (const candidate of authority.candidates) {
    assertOpaqueId(candidate.candidateId, 'candidate ID');
    assertOpaqueId(candidate.batchId, 'candidate batch ownership');
    assertSha256(candidate.candidateChecksumSha256, 'candidate checksum');
    assertSha256(candidate.leftDerivativeSha256, 'left derivative checksum');
    assertSha256(candidate.rightDerivativeSha256, 'right derivative checksum');
    assert(typeof candidate.leftText === 'string' && [...candidate.leftText].length === 1, 'left canonical glyph text is required');
    assert(typeof candidate.rightText === 'string' && [...candidate.rightText].length === 1, 'right canonical glyph text is required');
  }
  assertUnique(authority.candidates.map((candidate) => candidate.candidateId), 'authoritative candidate IDs');
}

/** Reads and validates the current #262 generated manifest, plan, and pinned renderer contract. */
export function loadCanonicalEvidenceAuthority(repoRoot = process.cwd()): EvidenceAuthority {
  const manifestPath = join(repoRoot, 'data/unicode/generated/visual-candidates.json');
  const planPath = join(repoRoot, 'data/unicode/generated/visual-review-plan.json');
  interface GeneratedGlyph { id: string; derivativeSha256: string }
  interface GeneratedCandidate { id: string; checksumSha256: string; leftGlyphRef: string; rightGlyphRef: string; leftScalar: number; rightScalar: number }
  interface GeneratedManifest {
    availability?: { status?: string };
    renderingEnvironment?: unknown;
    glyphs: GeneratedGlyph[];
    candidates: GeneratedCandidate[];
  }
  interface GeneratedBatch { id: string; candidateIds: string[]; candidateChecksumsSha256: string[] }
  interface GeneratedPlan { batches: GeneratedBatch[] }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as GeneratedManifest;
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as GeneratedPlan;
  validateVisualArtifacts(manifest, plan, repoRoot);
  assert(manifest.availability?.status === 'available' && manifest.renderingEnvironment, 'the #262 pinned rendering authority is unavailable');
  const glyphs = new Map(manifest.glyphs.map((glyph) => [glyph.id, glyph]));
  const batchByCandidateId = new Map<string, { batchId: string; checksum: string }>();
  for (const batch of plan.batches) {
    batch.candidateIds.forEach((candidateId: string, index: number) => batchByCandidateId.set(candidateId, { batchId: batch.id, checksum: batch.candidateChecksumsSha256[index] }));
  }
  const authority: EvidenceAuthority = {
    candidateManifestChecksumSha256: sha256Json(manifest),
    reviewPlanChecksumSha256: sha256Json(plan),
    renderingEvidenceChecksumSha256: sha256Json(manifest.renderingEnvironment),
    glyphs: manifest.glyphs.map((glyph) => ({ glyphRef: glyph.id, derivativeSha256: glyph.derivativeSha256 })),
    candidates: manifest.candidates.map((candidate) => {
      const batch = batchByCandidateId.get(candidate.id);
      assert(batch && batch.checksum === candidate.checksumSha256, `candidate '${candidate.id}' has no authoritative batch ownership`);
      const left = glyphs.get(candidate.leftGlyphRef);
      const right = glyphs.get(candidate.rightGlyphRef);
      assert(left && right, `candidate '${candidate.id}' references a missing authoritative glyph`);
      return {
        candidateId: candidate.id,
        candidateChecksumSha256: candidate.checksumSha256,
        batchId: batch.batchId,
        leftDerivativeSha256: left.derivativeSha256,
        rightDerivativeSha256: right.derivativeSha256,
        leftText: String.fromCodePoint(candidate.leftScalar),
        rightText: String.fromCodePoint(candidate.rightScalar),
      };
    }),
  };
  assertEvidenceAuthority(authority);
  return authority;
}

export function parsePassAResult(value: unknown): PassAResult {
  assertExactKeys(value, ['pairRef', 'visualOutcome'], 'Pass A result');
  assertPairRef(value.pairRef);
  assertOutcome(value.visualOutcome);
  return { pairRef: value.pairRef, visualOutcome: value.visualOutcome };
}

export function parsePassAResults(values: unknown): readonly PassAResult[] {
  assert(Array.isArray(values), 'Pass A results must be an array');
  const parsed = values.map(parsePassAResult);
  assertUnique(parsed.map((item) => item.pairRef), 'Pass A results');
  return parsed;
}

function bindEvidenceInput(authority: EvidenceAuthority, input: ControllerEvidenceInput, namespaceSalt: string): { entry: ControllerSidecarEntry; png: Uint8Array } {
  assertGrayscaleTile(input.leftGrayscale, 'left grayscale input');
  assertGrayscaleTile(input.rightGrayscale, 'right grayscale input');
  let entry: ControllerSidecarEntry;
  if (input.purpose === 'manifest') {
    const candidate = findAuthorityCandidate(authority, input.candidateId);
    assertDerivative(input.leftGrayscale, candidate.leftDerivativeSha256, 'left manifest glyph');
    assertDerivative(input.rightGrayscale, candidate.rightDerivativeSha256, 'right manifest glyph');
    const png = renderPinnedPair(input.leftGrayscale, input.rightGrayscale, candidate.leftDerivativeSha256, candidate.rightDerivativeSha256);
    entry = {
      pairRef: '',
      purpose: 'manifest',
      candidateId: candidate.candidateId,
      candidateChecksumSha256: candidate.candidateChecksumSha256,
      batchId: candidate.batchId,
      renderingEvidenceChecksumSha256: authority.renderingEvidenceChecksumSha256,
      evidenceChecksumSha256: sha256(png),
    };
    return { entry: { ...entry, pairRef: opaquePairRef(namespaceSalt, entry) }, png };
  }
  assertOpaqueId(input.controllerControlId, 'external control ID');
  const left = findAuthorityGlyph(authority, input.leftGlyphRef);
  const right = findAuthorityGlyph(authority, input.rightGlyphRef);
  assertDerivative(input.leftGrayscale, left.derivativeSha256, 'left external-control glyph');
  assertDerivative(input.rightGrayscale, right.derivativeSha256, 'right external-control glyph');
  const png = renderPinnedPair(input.leftGrayscale, input.rightGrayscale, left.derivativeSha256, right.derivativeSha256);
  entry = {
    pairRef: '',
    purpose: 'external-control',
    controllerControlId: input.controllerControlId,
    leftGlyphRef: left.glyphRef,
    rightGlyphRef: right.glyphRef,
    leftDerivativeSha256: left.derivativeSha256,
    rightDerivativeSha256: right.derivativeSha256,
    evidenceChecksumSha256: sha256(png),
  };
  return { entry: { ...entry, pairRef: opaquePairRef(namespaceSalt, entry) }, png };
}

/**
 * Production entrypoint. Authority is always loaded from the current validated
 * #262 artifacts; callers can supply only candidate/control references and
 * their actual grayscale derivatives.
 */
export function buildBlindEvidenceArtifacts(
  inputs: readonly ControllerEvidenceInput[],
  namespaceSalt = createPairRefNamespaceSalt(),
  repoRoot = process.cwd(),
): BlindEvidenceArtifacts {
  return buildBlindEvidenceArtifactsFromAuthority(loadCanonicalEvidenceAuthority(repoRoot), inputs, namespaceSalt);
}

/** Injectable authority variant for focused tests and controller-owned replay. */
export function buildBlindEvidenceArtifactsFromAuthority(
  authority: EvidenceAuthority,
  inputs: readonly ControllerEvidenceInput[],
  namespaceSalt = createPairRefNamespaceSalt(),
): BlindEvidenceArtifacts {
  assertEvidenceAuthority(authority);
  assert(inputs.length > 0, 'blind bundle requires at least one evidence item');
  assertSha256(namespaceSalt, 'pairRef namespace salt');

  const derived: Array<{ entry: ControllerSidecarEntry; png: Uint8Array }> = [];
  for (const input of inputs) {
    const { entry, png } = bindEvidenceInput(authority, input, namespaceSalt);
    derived.push({ entry, png });
  }
  derived.sort((left, right) => left.entry.pairRef.localeCompare(right.entry.pairRef));
  const localPngs = new Map<string, Uint8Array>();
  const entries = derived.map(({ entry }) => entry);
  const items = derived.map(({ entry, png }) => {
    const pixelPath = `pairs/${entry.pairRef}.png`;
    localPngs.set(pixelPath, png);
    return { pairRef: entry.pairRef, pixelPath };
  });
  assertUnique(entries.map((entry) => entry.pairRef), 'derived pair references');
  assertUnique(entries.filter((entry): entry is ManifestControllerSidecarEntry => entry.purpose === 'manifest').map((entry) => entry.candidateId), 'manifest candidate IDs');
  assertUnique(entries.filter((entry): entry is ExternalControlControllerSidecarEntry => entry.purpose === 'external-control').map((entry) => entry.controllerControlId), 'external control IDs');
  const reviewerBundle: ReviewerBundle = { protocolVersion: REVIEW_PROTOCOL_VERSION, items };
  const controllerSidecar: ControllerSidecar = {
    protocolVersion: REVIEW_PROTOCOL_VERSION,
    candidateManifestChecksumSha256: authority.candidateManifestChecksumSha256,
    reviewPlanChecksumSha256: authority.reviewPlanChecksumSha256,
    renderingEvidenceChecksumSha256: authority.renderingEvidenceChecksumSha256,
    pairRefNamespaceSalt: namespaceSalt,
    reviewerBundleChecksumSha256: sha256Json(reviewerBundle),
    entries,
  };
  validateBlindEvidenceArtifacts(reviewerBundle, controllerSidecar);
  validateAuthoritativeBlindEvidenceArtifacts(authority, reviewerBundle, controllerSidecar, inputs, localPngs);
  return { reviewerBundle, controllerSidecar, localPngs };
}

export function validateReviewerBundle(value: unknown): asserts value is ReviewerBundle {
  assertExactKeys(value, ['protocolVersion', 'items'], 'reviewer bundle');
  assert(value.protocolVersion === REVIEW_PROTOCOL_VERSION, 'reviewer bundle protocol mismatch');
  assert(Array.isArray(value.items) && value.items.length > 0, 'reviewer bundle requires items');
  const refs: string[] = [];
  for (const item of value.items) {
    assertExactKeys(item, ['pairRef', 'pixelPath'], 'reviewer bundle item');
    assertPairRef(item.pairRef);
    assert(item.pixelPath === `pairs/${item.pairRef}.png`, 'reviewer bundle pixel path must be opaque');
    refs.push(item.pairRef);
  }
  assertUnique(refs, 'reviewer bundle pair references');
}

export function validateBlindEvidenceArtifacts(bundle: unknown, sidecar: unknown): asserts sidecar is ControllerSidecar {
  validateReviewerBundle(bundle);
  assertExactKeys(sidecar, ['protocolVersion', 'candidateManifestChecksumSha256', 'reviewPlanChecksumSha256', 'renderingEvidenceChecksumSha256', 'pairRefNamespaceSalt', 'reviewerBundleChecksumSha256', 'entries'], 'controller sidecar');
  assert(sidecar.protocolVersion === REVIEW_PROTOCOL_VERSION, 'controller sidecar protocol mismatch');
  assertSha256(sidecar.candidateManifestChecksumSha256, 'sidecar candidate manifest checksum');
  assertSha256(sidecar.reviewPlanChecksumSha256, 'sidecar review plan checksum');
  assertSha256(sidecar.renderingEvidenceChecksumSha256, 'sidecar rendering evidence checksum');
  assertSha256(sidecar.pairRefNamespaceSalt, 'sidecar pairRef namespace salt');
  assertSha256(sidecar.reviewerBundleChecksumSha256, 'reviewer bundle checksum');
  assert(sidecar.reviewerBundleChecksumSha256 === sha256Json(bundle), 'controller sidecar references a different reviewer bundle');
  assert(Array.isArray(sidecar.entries) && sidecar.entries.length === bundle.items.length, 'controller sidecar entry count mismatch');
  const refs: string[] = [];
  const bundleRefs = bundle.items.map((item) => item.pairRef);
  assert(bundleRefs.every((ref, index) => index === 0 || bundleRefs[index - 1].localeCompare(ref) < 0), 'reviewer bundle items must be ordered by opaque pairRef');
  const manifestCandidates: string[] = [];
  const controls: string[] = [];
  for (const rawEntry of sidecar.entries) {
    assert(isRecord(rawEntry), 'controller sidecar entry must be an object');
    assert(rawEntry.purpose === 'manifest' || rawEntry.purpose === 'external-control', 'controller sidecar entry has an unsupported purpose');
    const entry = rawEntry as unknown as ControllerSidecarEntry;
    assertPairRef(entry.pairRef);
    assertSha256(entry.evidenceChecksumSha256, 'controller PNG evidence checksum');
    if (entry.purpose === 'manifest') {
      assertExactKeys(entry, ['pairRef', 'purpose', 'candidateId', 'candidateChecksumSha256', 'batchId', 'renderingEvidenceChecksumSha256', 'evidenceChecksumSha256'], 'manifest controller sidecar entry');
      assertOpaqueId(entry.candidateId, 'controller candidate ID');
      assertSha256(entry.candidateChecksumSha256, 'controller candidate checksum');
      assertOpaqueId(entry.batchId, 'controller batch ownership');
      assertSha256(entry.renderingEvidenceChecksumSha256, 'controller rendering evidence checksum');
      manifestCandidates.push(entry.candidateId);
    } else {
      assertExactKeys(entry, ['pairRef', 'purpose', 'controllerControlId', 'leftGlyphRef', 'rightGlyphRef', 'leftDerivativeSha256', 'rightDerivativeSha256', 'evidenceChecksumSha256'], 'external-control controller sidecar entry');
      assertOpaqueId(entry.controllerControlId, 'external control ID');
      assertOpaqueId(entry.leftGlyphRef, 'left external-control glyph reference');
      assertOpaqueId(entry.rightGlyphRef, 'right external-control glyph reference');
      assertSha256(entry.leftDerivativeSha256, 'left external-control derivative checksum');
      assertSha256(entry.rightDerivativeSha256, 'right external-control derivative checksum');
      controls.push(entry.controllerControlId);
    }
    assert(entry.pairRef === opaquePairRef(sidecar.pairRefNamespaceSalt, entry), 'controller pair reference binding mismatch');
    refs.push(entry.pairRef);
  }
  assertUnique(refs, 'controller sidecar pair references');
  assert(refs.every((ref, index) => index === 0 || refs[index - 1].localeCompare(ref) < 0), 'controller sidecar entries must be ordered by opaque pairRef');
  assertUnique(manifestCandidates, 'controller sidecar manifest candidates');
  assertUnique(controls, 'controller sidecar external controls');
  assert(refs.every((ref, index) => bundle.items[index]?.pairRef === ref), 'controller sidecar entries must correspond one-to-one with reviewer bundle items');
}

function requireManifestEntries(sidecar: ControllerSidecar, operation: string): readonly ManifestControllerSidecarEntry[] {
  const entries = sidecar.entries.filter((entry): entry is ManifestControllerSidecarEntry => entry.purpose === 'manifest');
  assert(entries.length > 0, `${operation} requires at least one manifest evidence entry`);
  return entries;
}

/**
 * Revalidates a controller read against the authoritative #262 projection and
 * the exact local grayscale derivatives before trusting sidecar or PNG bytes.
 */
export function validateAuthoritativeBlindEvidenceArtifacts(
  authority: EvidenceAuthority,
  bundle: ReviewerBundle,
  sidecar: ControllerSidecar,
  inputs: readonly ControllerEvidenceInput[],
  localPngs: ReadonlyMap<string, Uint8Array>,
): void {
  assertEvidenceAuthority(authority);
  validateBlindEvidenceArtifacts(bundle, sidecar);
  assert(sidecar.candidateManifestChecksumSha256 === authority.candidateManifestChecksumSha256, 'sidecar references a stale candidate manifest');
  assert(sidecar.reviewPlanChecksumSha256 === authority.reviewPlanChecksumSha256, 'sidecar references a stale review plan');
  assert(sidecar.renderingEvidenceChecksumSha256 === authority.renderingEvidenceChecksumSha256, 'sidecar references a stale rendering contract');
  assert(inputs.length === sidecar.entries.length, 'controller evidence input count does not match sidecar');
  const expectedByRef = new Map<string, { entry: ControllerSidecarEntry; png: Uint8Array }>();
  for (const input of inputs) {
    const expected = bindEvidenceInput(authority, input, sidecar.pairRefNamespaceSalt);
    assert(!expectedByRef.has(expected.entry.pairRef), 'controller evidence inputs derive duplicate pair references');
    expectedByRef.set(expected.entry.pairRef, expected);
  }
  assert(expectedByRef.size === sidecar.entries.length, 'controller evidence inputs do not cover every sidecar entry');
  assert(localPngs.size === expectedByRef.size, 'pinned PNG map does not cover the exact derived pair set');
  for (const actual of sidecar.entries) {
    const expected = expectedByRef.get(actual.pairRef);
    assert(expected, 'controller sidecar entry has no matching authoritative input');
    assert(JSON.stringify(actual) === JSON.stringify(expected.entry), 'sidecar entry does not bind the authoritative input');
    const pixelPath = `pairs/${actual.pairRef}.png`;
    const actualPng = localPngs.get(pixelPath);
    assert(actualPng instanceof Uint8Array, `pinned PNG '${pixelPath}' is unavailable`);
    assert(sha256(actualPng) === actual.evidenceChecksumSha256, 'pinned PNG checksum does not match sidecar evidence');
    assert(Buffer.from(actualPng).equals(Buffer.from(expected.png)), 'pinned PNG does not match the authoritative grayscale derivatives');
  }
  for (const pixelPath of localPngs.keys()) {
    assert(/^pairs\/pair-[0-9a-f]{24}\.png$/.test(pixelPath), 'pinned PNG map contains an unsupported path');
    assert(expectedByRef.has(pixelPath.slice('pairs/'.length, -'.png'.length)), 'pinned PNG map contains an unmatched pair');
  }
}

function emptyMatrix(): Record<VisualOutcome, Record<VisualOutcome, number>> {
  return {
    confusable: { confusable: 0, 'not-confusable': 0, borderline: 0 },
    'not-confusable': { confusable: 0, 'not-confusable': 0, borderline: 0 },
    borderline: { confusable: 0, 'not-confusable': 0, borderline: 0 },
  };
}

function validateSealedCalibrationKey(key: SealedCalibrationKey, bundle: ReviewerBundle, contract: ReviewContractBinding): void {
  assertExactKeys(key, ['protocolVersion', 'reviewerBundleChecksumSha256', 'contract', 'items'], 'sealed calibration key');
  assert(key.protocolVersion === REVIEW_PROTOCOL_VERSION, 'sealed key protocol mismatch');
  validateReviewContractBinding(key.contract, 'sealed calibration key contract');
  assert(key.reviewerBundleChecksumSha256 === sha256Json(bundle), 'sealed key belongs to a different reviewer bundle');
  assert(reviewContractEqual(key.contract, contract), 'sealed key contract is stale');
  assert(key.items.length === CALIBRATION_PACK_SIZE, 'sealed key must contain exactly 72 items');
  assertUnique(key.items.map((item) => item.pairRef), 'sealed calibration key pair references');
  const counts = new Map<CalibrationClass, number>(CALIBRATION_CLASSES.map((kind) => [kind, 0]));
  for (const item of key.items) {
    assertExactKeys(item, ['pairRef', 'class', 'expectedOutcome'], 'sealed calibration key item');
    assertPairRef(item.pairRef);
    assert((CALIBRATION_CLASSES as readonly string[]).includes(item.class), 'sealed key has an unsupported class');
    assertOutcome(item.expectedOutcome, 'sealed key expected outcome');
    if (item.class === 'strong-positive') assert(item.expectedOutcome === 'confusable', 'strong positive must expect confusable');
    if (item.class === 'strong-negative') assert(item.expectedOutcome === 'not-confusable', 'strong negative must expect not-confusable');
    assert(bundle.items.some((bundleItem) => bundleItem.pairRef === item.pairRef), 'sealed key references an unknown reviewer item');
    counts.set(item.class, (counts.get(item.class) ?? 0) + 1);
  }
  assert(counts.get('strong-positive') === 20, 'sealed key must contain 20 strong positives');
  assert(counts.get('strong-negative') === 20, 'sealed key must contain 20 strong negatives');
  assert(counts.get('hard-probe') === 24, 'sealed key must contain 24 hard probes');
  assert(counts.get('relation-trap') === 8, 'sealed key must contain 8 relation traps');
}

function validateReviewContractBinding(contract: unknown, label: string): asserts contract is ReviewContractBinding {
  assertExactKeys(contract, ['rubricVersion', 'promptChecksumSha256', 'renderingEvidenceChecksumSha256', 'reviewerModelVersion', 'transportContractChecksumSha256', 'visionCapabilityEvidenceRef'], label);
  assert(contract.rubricVersion === REVIEW_PROTOCOL_VERSION, `${label} rubric version is unsupported`);
  assertSha256(contract.promptChecksumSha256, `${label} prompt checksum`);
  assertSha256(contract.renderingEvidenceChecksumSha256, `${label} rendering checksum`);
  assertOpaqueId(contract.reviewerModelVersion, `${label} reviewer model/version`);
  assertSha256(contract.transportContractChecksumSha256, `${label} transport checksum`);
  assertOpaqueId(contract.visionCapabilityEvidenceRef, `${label} vision capability evidence reference`);
}

export function reviewContractEqual(left: ReviewContractBinding, right: ReviewContractBinding): boolean {
  return left.rubricVersion === right.rubricVersion
    && left.promptChecksumSha256 === right.promptChecksumSha256
    && left.renderingEvidenceChecksumSha256 === right.renderingEvidenceChecksumSha256
    && left.reviewerModelVersion === right.reviewerModelVersion
    && left.transportContractChecksumSha256 === right.transportContractChecksumSha256
    && left.visionCapabilityEvidenceRef === right.visionCapabilityEvidenceRef;
}

function withCalibrationEvaluationChecksum(value: Omit<CalibrationEvaluation, 'calibrationResultChecksumSha256'>): CalibrationEvaluation {
  const payload = {
    pass: value.pass,
    reasons: value.reasons,
    metrics: value.metrics,
    hardProbeProductionOutcomes: value.hardProbeProductionOutcomes,
    hardProbeCandidateOverrides: value.hardProbeCandidateOverrides,
  };
  return { ...payload, calibrationResultChecksumSha256: sha256Json(payload) };
}

function hardProbeCandidateOverrides(
  key: SealedCalibrationKey,
  evaluation: CalibrationEvaluation,
  sidecar: ControllerSidecar,
): readonly HardProbeCandidateOverride[] {
  const entries = new Map(sidecar.entries.map((entry) => [entry.pairRef, entry]));
  const overrides: HardProbeCandidateOverride[] = [];
  for (const item of key.items) {
    if (item.class !== 'hard-probe') continue;
    const entry = entries.get(item.pairRef);
    assert(entry?.purpose === 'manifest', `hard probe '${item.pairRef}' must bind to a canonical manifest candidate`);
    const outcome = evaluation.hardProbeProductionOutcomes[item.pairRef];
    assert(outcome, `hard probe '${item.pairRef}' is absent from calibration evaluation`);
    if (outcome !== 'borderline') continue;
    overrides.push({
      pairRef: entry.pairRef,
      candidateId: entry.candidateId,
      candidateChecksumSha256: entry.candidateChecksumSha256,
      evidenceChecksumSha256: entry.evidenceChecksumSha256,
      outcome: 'borderline',
    });
  }
  return freezeHardProbeCandidateOverrides(overrides);
}

function evaluateCalibration(
  bundle: ReviewerBundle,
  key: SealedCalibrationKey,
  rawResults: unknown,
  contract: ReviewContractBinding,
): CalibrationEvaluation {
  validateReviewerBundle(bundle);
  validateSealedCalibrationKey(key, bundle, contract);
  const results = parsePassAResults(rawResults);
  assert(results.length === CALIBRATION_PACK_SIZE, 'calibration results must contain exactly 72 items');
  assert(results.every((result) => key.items.some((item) => item.pairRef === result.pairRef)), 'calibration result references an unknown sealed-key item');
  const resultByRef = new Map(results.map((result) => [result.pairRef, result]));
  assert(key.items.every((item) => resultByRef.has(item.pairRef)), 'calibration results are incomplete');

  const matrix = emptyMatrix();
  let agreements = 0;
  let strongPositiveExact = 0;
  let strongNegativeExact = 0;
  let strongNegativeConfusable = 0;
  const hardProbeProductionOutcomes: Record<string, VisualOutcome> = {};
  for (const item of key.items) {
    const actual = resultByRef.get(item.pairRef)!;
    matrix[item.expectedOutcome][actual.visualOutcome] += 1;
    if (actual.visualOutcome === item.expectedOutcome) agreements += 1;
    if (item.class === 'strong-positive' && actual.visualOutcome === item.expectedOutcome) strongPositiveExact += 1;
    if (item.class === 'strong-negative') {
      if (actual.visualOutcome === item.expectedOutcome) strongNegativeExact += 1;
      if (actual.visualOutcome === 'confusable') strongNegativeConfusable += 1;
    }
    if (item.class === 'hard-probe') {
      // A sealed hard probe is fail-closed: any binary reviewer outcome that disagrees with the
      // sealed expectation stays canonical 'borderline', including a binary outcome when the
      // sealed expectation is itself 'borderline'.
      const binaryDisagreement = actual.visualOutcome !== item.expectedOutcome && actual.visualOutcome !== 'borderline';
      hardProbeProductionOutcomes[item.pairRef] = binaryDisagreement ? 'borderline' : actual.visualOutcome;
    }
  }
  // Strict Pass A parsing permits no prose or relation field, so leakage is structurally zero.
  const metrics: CalibrationMetrics = {
    evaluated: true,
    strongPositiveExact,
    strongNegativeExact,
    strongNegativeConfusable,
    relationLeakageCount: 0,
    confusionMatrix: matrix,
    rawAgreement: agreements / CALIBRATION_PACK_SIZE,
  };
  const pass = calibrationFreezePasses(metrics);
  const reasons = pass ? [] : ['calibration freeze gates failed'];
  return withCalibrationEvaluationChecksum({ pass, reasons, metrics, hardProbeProductionOutcomes, hardProbeCandidateOverrides: [] });
}

/** Evaluates external sealed evidence and issues a non-serializable authorization only on PASS. */
export function authorizeCalibration(
  context: ReviewEvidenceContext,
  key: SealedCalibrationKey,
  submission: VisionClassificationSubmission,
): { evaluation: CalibrationEvaluation; authorization: CalibrationAuthorization | null; replayBinding: CalibrationReplayBinding | null } {
  try {
    validateSealedCalibrationKey(key, context.bundle, context.contract);
    const { results, receipt } = validateStrictClassificationSubmission(context, submission, 'reviewer-a', context.sidecar.entries);
    assert(receipt.items.length === key.items.length, 'calibration receipt does not cover sealed key items');
    const baseEvaluation = evaluateCalibration(context.bundle, key, results, context.contract);
    const evaluation = withCalibrationEvaluationChecksum({
      ...baseEvaluation,
      hardProbeCandidateOverrides: hardProbeCandidateOverrides(key, baseEvaluation, context.sidecar),
    });
    if (!evaluation.pass) return { evaluation, authorization: null, replayBinding: null };
    const authorization = Object.freeze({ issuedAt: 'evaluator-only' as const });
    const replayBinding = freezeReplayBinding({
      contract: context.contract,
      inputFingerprints: evaluatorInputFingerprints(context, key, results, receipt),
      calibrationResultChecksumSha256: evaluation.calibrationResultChecksumSha256,
      evaluationSha256: sha256Json(evaluation),
      hardProbeCandidateOverrides: evaluation.hardProbeCandidateOverrides,
    });
    calibrationAuthorizations.set(authorization, Object.freeze({ binding: replayBinding }));
    return { evaluation, authorization, replayBinding };
  } catch (error) {
    const reasons = [(error as Error).message];
    const metrics: CalibrationMetrics = { evaluated: false, strongPositiveExact: null, strongNegativeExact: null, strongNegativeConfusable: null, relationLeakageCount: null, confusionMatrix: null, rawAgreement: null };
    return { evaluation: withCalibrationEvaluationChecksum({ pass: false, reasons, metrics, hardProbeProductionOutcomes: {}, hardProbeCandidateOverrides: [] }), authorization: null, replayBinding: null };
  }
}

export function calibrationFreezePasses(metrics: CalibrationMetrics): boolean {
  return metrics.evaluated
    && metrics.strongPositiveExact !== null
    && metrics.strongNegativeExact !== null
    && metrics.strongNegativeConfusable !== null
    && metrics.relationLeakageCount !== null
    && metrics.strongPositiveExact >= 19
    && metrics.strongNegativeExact >= 19
    && metrics.strongNegativeConfusable === 0
    && metrics.relationLeakageCount === 0;
}

function validateReceipt(
  rawReceipt: unknown,
  role: ReviewRole,
  context: ReviewEvidenceContext,
  results: unknown,
  expectedEntries: readonly ControllerSidecarEntry[],
): VisionReceipt {
  assertExactKeys(rawReceipt, ['protocolVersion', 'role', 'reviewerSessionId', 'reviewerIndependenceContextId', 'reviewerModelVersion', 'visionCapabilityEvidenceRef', 'rubricVersion', 'promptChecksumSha256', 'renderingEvidenceChecksumSha256', 'transportProfileChecksumSha256', 'reviewerBundleChecksumSha256', 'items', 'resultsChecksumSha256'], 'vision receipt');
  const receipt = rawReceipt as unknown as VisionReceipt;
  assert(receipt.protocolVersion === REVIEW_PROTOCOL_VERSION && receipt.role === role, 'vision receipt role or protocol mismatch');
  assertOpaqueId(receipt.reviewerSessionId, 'reviewer session ID');
  assertOpaqueId(receipt.reviewerIndependenceContextId, 'reviewer independence context ID');
  assert(typeof receipt.reviewerModelVersion === 'string' && receipt.reviewerModelVersion === context.contract.reviewerModelVersion, 'vision receipt reviewer model/version is stale');
  assertOpaqueId(receipt.visionCapabilityEvidenceRef, 'trusted external vision capability evidence reference');
  assert(receipt.visionCapabilityEvidenceRef === context.contract.visionCapabilityEvidenceRef, 'vision receipt capability evidence is not the trusted transport attestation');
  assert(receipt.rubricVersion === context.contract.rubricVersion, 'vision receipt rubric is stale');
  assertSha256(receipt.promptChecksumSha256, 'vision receipt prompt checksum');
  assert(receipt.promptChecksumSha256 === context.contract.promptChecksumSha256, 'vision receipt prompt is stale');
  assert(receipt.renderingEvidenceChecksumSha256 === context.contract.renderingEvidenceChecksumSha256, 'vision receipt rendering is stale');
  assert(receipt.transportProfileChecksumSha256 === context.contract.transportContractChecksumSha256, 'vision receipt transport profile is stale');
  assert(receipt.reviewerBundleChecksumSha256 === context.sidecar.reviewerBundleChecksumSha256, 'vision receipt belongs to a different bundle');
  assertSha256(receipt.resultsChecksumSha256, 'vision receipt results checksum');
  assert(receipt.resultsChecksumSha256 === sha256Json(results), 'vision receipt results checksum is stale or tampered');
  assert(Array.isArray(receipt.items), 'vision receipt items must be an array');
  const expectedByRef = new Map(expectedEntries.map((entry) => [entry.pairRef, entry]));
  assert(receipt.items.length === expectedEntries.length, 'vision receipt item subset is incomplete');
  const receiptRefs: string[] = [];
  for (const item of receipt.items) {
    assertExactKeys(item, ['pairRef', 'evidenceChecksumSha256'], 'vision receipt item');
    assertPairRef(item.pairRef);
    assertSha256(item.evidenceChecksumSha256, 'vision receipt item checksum');
    const expected = expectedByRef.get(item.pairRef);
    assert(expected && expected.evidenceChecksumSha256 === item.evidenceChecksumSha256, 'vision receipt item is stale, unknown, or bound to different pixels');
    receiptRefs.push(item.pairRef);
  }
  assertUnique(receiptRefs, 'vision receipt item references');
  assert(expectedEntries.every((entry) => receiptRefs.includes(entry.pairRef)), 'vision receipt does not cover the exact required pixel set');
  return receipt;
}

function validateReviewEvidenceContext(context: ReviewEvidenceContext): void {
  validateReviewContractBinding(context.contract, 'review context contract');
  validateAuthoritativeBlindEvidenceArtifacts(context.authority, context.bundle, context.sidecar, context.inputs, context.localPngs);
  assert(context.bundle.protocolVersion === REVIEW_PROTOCOL_VERSION, 'reviewer bundle protocol mismatch');
  assert(context.sidecar.reviewerBundleChecksumSha256 === sha256Json(context.bundle), 'review context bundle is stale');
  assert(context.contract.renderingEvidenceChecksumSha256 === context.authority.renderingEvidenceChecksumSha256, 'review context rendering authority is stale');
  assertSha256(context.contract.promptChecksumSha256, 'review context prompt checksum');
  assertSha256(context.contract.transportContractChecksumSha256, 'review context transport profile checksum');
}

/**
 * Validates a Reviewer A or B submission against an explicit controller-side
 * subset. The caller cannot synthesize a subset: every entry must exactly
 * match an entry in the fully revalidated context sidecar. This permits
 * calibration and waves to include external controls while promotion filters
 * its reconciled output to manifest entries.
 */
export function validateStrictClassificationSubmission(
  context: ReviewEvidenceContext,
  submission: VisionClassificationSubmission,
  role: 'reviewer-a' | 'reviewer-b',
  expectedEntries: readonly ControllerSidecarEntry[],
): ValidatedClassificationSubmission {
  validateReviewEvidenceContext(context);
  assertExactKeys(submission, ['results', 'receipt'], `${role} submission`);
  assert(expectedEntries.length > 0, `${role} expected subset is empty`);
  const contextEntriesByRef = new Map(context.sidecar.entries.map((entry) => [entry.pairRef, entry]));
  const expectedRefs: string[] = [];
  for (const entry of expectedEntries) {
    assertPairRef(entry.pairRef);
    const contextEntry = contextEntriesByRef.get(entry.pairRef);
    assert(contextEntry && JSON.stringify(contextEntry) === JSON.stringify(entry), `${role} expected subset contains a synthesized, stale, or unknown sidecar entry`);
    expectedRefs.push(entry.pairRef);
  }
  assertUnique(expectedRefs, `${role} expected subset pair references`);
  const results = parsePassAResults(submission.results);
  const resultRefs = results.map((result) => result.pairRef);
  assert(results.length === expectedEntries.length && expectedRefs.every((ref) => resultRefs.includes(ref)), `${role} results are incomplete or contain an unsupported subset`);
  return { results, receipt: validateReceipt(submission.receipt, role, context, results, expectedEntries) };
}

export function reconcileIndependentClassification(
  context: ReviewEvidenceContext,
  classification: IndependentClassificationInput,
): readonly ClassificationReconciliation[] {
  validateReviewEvidenceContext(context);
  const manifestEntries = requireManifestEntries(context.sidecar, 'reviewer classification');
  const a = validateStrictClassificationSubmission(context, classification.a, 'reviewer-a', context.sidecar.entries);
  const aByRef = new Map(a.results.map((result) => [result.pairRef, result]));
  const expectedBEntries = manifestEntries.filter((entry) => aByRef.get(entry.pairRef)!.visualOutcome === 'confusable');
  let bResults: readonly PassAResult[] = [];
  let bReceipt: VisionReceipt | null = null;
  if (expectedBEntries.length) {
    assert(classification.b, 'Reviewer B receipt and results are required for every Reviewer A positive');
    const b = validateStrictClassificationSubmission(context, classification.b, 'reviewer-b', expectedBEntries);
    assert(a.receipt.reviewerSessionId !== b.receipt.reviewerSessionId, 'Reviewer B must use a fresh session');
    assert(a.receipt.reviewerIndependenceContextId !== b.receipt.reviewerIndependenceContextId, 'Reviewer B must use an independent context');
    bResults = b.results;
    bReceipt = b.receipt;
  } else {
    assert(classification.b === null, 'Reviewer B must not receive non-positive or empty subsets');
  }
  const bByRef = new Map(bResults.map((result) => [result.pairRef, result]));
  return manifestEntries.map((entry) => {
    const aOutcome = aByRef.get(entry.pairRef)!.visualOutcome;
    const bOutcome = bByRef.get(entry.pairRef)?.visualOutcome ?? null;
    const passBEligible = aOutcome === 'confusable' && bOutcome === 'confusable';
    const reconciledOutcome: VisualOutcome = passBEligible
      ? 'confusable'
      : aOutcome === 'not-confusable'
        ? 'not-confusable'
        : 'borderline';
    return {
      pairRef: entry.pairRef,
      candidateId: entry.candidateId,
      candidateChecksumSha256: entry.candidateChecksumSha256,
      aOutcome,
      bOutcome,
      reconciledOutcome,
      passBEligible,
      aReceipt: a.receipt,
      bReceipt,
    };
  });
}

export function parsePassBResult(value: unknown): PassBResult {
  assertExactKeys(value, ['pairRef', 'observableDifference'], 'Pass B result');
  assertPairRef(value.pairRef);
  assertExactKeys(value.observableDifference, ['region', 'feature', 'contrast'], 'Pass B observable difference');
  assert(typeof value.observableDifference.region === 'string' && (REGIONS as readonly string[]).includes(value.observableDifference.region), 'Pass B region is unsupported');
  assert(typeof value.observableDifference.feature === 'string' && (FEATURES as readonly string[]).includes(value.observableDifference.feature), 'Pass B feature is unsupported');
  assert(typeof value.observableDifference.contrast === 'string' && (CONTRASTS as readonly string[]).includes(value.observableDifference.contrast), 'Pass B contrast is unsupported');
  return {
    pairRef: value.pairRef,
    observableDifference: {
      region: value.observableDifference.region as ObservableRegion,
      feature: value.observableDifference.feature as ObservableFeature,
      contrast: value.observableDifference.contrast as ObservableContrast,
    },
  };
}

const REGION_JA: Record<ObservableRegion, string> = { upper: '上側', lower: '下側', left: '左側', right: '右側', center: '中央', whole: '全体' };
const FEATURE_JA: Record<ObservableFeature, string> = { stroke: '線', dot: '点', hook: 'はね', line: '線の長さ', shape: '形', enclosure: '囲み' };
const CONTRAST_JA: Record<ObservableContrast, string> = { present: 'ある点', absent: 'ない点', longer: '長い点', shorter: '短い点', open: '開いている点', closed: '閉じている点', curved: '曲がっている点', straight: 'まっすぐな点' };

export function renderFixedCaution(leftText: string, rightText: string, difference: ObservableDifference): string {
  assert(leftText.length > 0 && rightText.length > 0, 'controller display text is required');
  return `「${leftText}」と「${rightText}」は、この固定レンダリング環境では字形が近く見えます。違いは${REGION_JA[difference.region]}の${FEATURE_JA[difference.feature]}が${CONTRAST_JA[difference.contrast]}です。意味・読み・字種上の関係は、この比較からは判断しません。`;
}

export function promoteConfirmedPositive(input: PromotionInput): PromotionRecord {
  const calibrationBinding = getCalibrationAuthorizationBinding(input.calibrationAuthorization);
  assert(calibrationBinding && calibrationIsCompatible(input.calibrationAuthorization, input.context.contract), 'promotion requires an evaluator-issued calibration authorization for the current exact contract');
  assertExactKeys(input.passB, ['result', 'receipt'], 'Pass B submission');
  const reconciled = reconcileIndependentClassification(input.context, input.classification);
  const passB = parsePassBResult(input.passB.result);
  const record = reconciled.find((item) => item.pairRef === passB.pairRef);
  assert(record && record.passBEligible && record.reconciledOutcome === 'confusable', 'only independently confirmed positives may enter Pass B');
  const sidecar = input.context.sidecar.entries.find((entry) => entry.pairRef === passB.pairRef);
  assert(sidecar?.purpose === 'manifest', 'Pass B result does not bind to a manifest candidate');
  const candidate = findAuthorityCandidate(input.context.authority, sidecar.candidateId);
  assert(candidate.candidateChecksumSha256 === sidecar.candidateChecksumSha256, 'promotion candidate checksum is stale');
  assert(!calibrationBinding.hardProbeCandidateOverrides.some((override) => (
    override.candidateId === candidate.candidateId
    && override.candidateChecksumSha256 === candidate.candidateChecksumSha256
    && override.outcome === 'borderline'
  )), 'a calibrated hard-probe borderline override keeps this candidate learner-excluded');
  validateReceipt(input.passB.receipt, 'pass-b', input.context, passB, [sidecar]);
  const aReceipt = record.aReceipt;
  const bReceipt = record.bReceipt;
  assert(bReceipt, 'Reviewer B receipt is required before promotion');
  void aReceipt;
  void bReceipt;
  return {
    candidateId: candidate.candidateId,
    reviewStatus: 'reviewed',
    learnerEligible: true,
    cautionJa: renderFixedCaution(candidate.leftText, candidate.rightText, passB.observableDifference),
  };
}

/**
 * Checks an evaluator-issued capability against the current contract. A JSON
 * clone or caller-created lookalike has no WeakMap snapshot and is rejected.
 */
export function calibrationIsCompatible(authorization: unknown, contract: ReviewContractBinding): boolean {
  if (typeof authorization !== 'object' || authorization === null) return false;
  const snapshot = calibrationAuthorizations.get(authorization);
  if (!snapshot) return false;
  return reviewContractEqual(snapshot.binding.contract, contract);
}

/** Returns the immutable, serializable replay binding for a genuine issued token only. */
export function getCalibrationAuthorizationBinding(authorization: unknown): CalibrationReplayBinding | null {
  if (typeof authorization !== 'object' || authorization === null) return null;
  return calibrationAuthorizations.get(authorization)?.binding ?? null;
}

/**
 * Revalidates all controller-owned evidence before comparing its fingerprints
 * with an issued authorization. Callers must still replay authorizeCalibration
 * to compare sealed key, results, receipt, and evaluation fingerprints.
 */
export function calibrationAuthorizationMatchesContext(authorization: unknown, context: ReviewEvidenceContext): boolean {
  const binding = getCalibrationAuthorizationBinding(authorization);
  if (!binding) return false;
  try {
    validateReviewEvidenceContext(context);
    return reviewContractEqual(binding.contract, context.contract)
      && binding.inputFingerprints.authoritySha256 === sha256Json(context.authority)
      && binding.inputFingerprints.reviewerBundleSha256 === sha256Json(context.bundle)
      && binding.inputFingerprints.controllerSidecarSha256 === sha256Json(context.sidecar)
      && binding.inputFingerprints.controllerInputsSha256 === controllerInputsFingerprint(context.inputs)
      && binding.inputFingerprints.localPngsSha256 === localPngsFingerprint(context.localPngs);
  } catch {
    return false;
  }
}

/** Compares two replayable calibration records without treating either as authority. */
export function calibrationReplayBindingsEqual(left: CalibrationReplayBinding | null, right: CalibrationReplayBinding | null): boolean {
  return left !== null && right !== null && sha256Json(left) === sha256Json(right);
}

export function recalibrationReasons(previous: ReviewContractBinding, next: ReviewContractBinding): readonly string[] {
  const reasons: string[] = [];
  if (previous.rubricVersion !== next.rubricVersion) reasons.push('rubric version changed');
  if (previous.promptChecksumSha256 !== next.promptChecksumSha256) reasons.push('prompt changed');
  if (previous.renderingEvidenceChecksumSha256 !== next.renderingEvidenceChecksumSha256) reasons.push('rendering evidence changed');
  if (previous.reviewerModelVersion !== next.reviewerModelVersion) reasons.push('reviewer model/version changed');
  if (previous.transportContractChecksumSha256 !== next.transportContractChecksumSha256) reasons.push('transport contract changed');
  if (previous.visionCapabilityEvidenceRef !== next.visionCapabilityEvidenceRef) reasons.push('vision capability evidence changed');
  return reasons;
}
