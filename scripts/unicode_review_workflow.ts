import { createHash, randomBytes } from 'node:crypto';
import {
  authorizeCalibration,
  buildBlindEvidenceArtifactsFromAuthority,
  calibrationReplayBindingsEqual,
  promoteConfirmedPositive,
  reconcileIndependentClassification,
  parsePassBResult,
  validateStrictClassificationSubmission,
  type CalibrationAuthorization,
  type CalibrationReplayBinding,
  type ExternalControlControllerSidecarEntry,
  type ExternalControlEvidenceInput,
  type ManifestControllerSidecarEntry,
  type ManifestEvidenceInput,
  type PromotionRecord,
  type ReviewEvidenceContext,
  type SealedCalibrationKey,
  type VisionClassificationSubmission,
  type VisionPassBSubmission,
  type VisualOutcome,
} from './unicode_review_v021.ts';
import {
  appendUnicodeReviewJournalEvent,
  initializeUnicodeReviewJournal,
  loadUnicodeReviewJournal,
  type UnicodeReviewJournalState,
} from './unicode_review_journal.ts';
import { resolveStrictExternalPath } from './unicode_review_external_io.ts';

const INITIAL_WAVE_LIMIT = 250;
const SCALED_WAVE_LIMIT = 500;

export interface UnicodeReviewWorkflowCalibration {
  readonly context: ReviewEvidenceContext;
  readonly key: SealedCalibrationKey;
  readonly submission: VisionClassificationSubmission;
}

export interface UnicodeReviewWorkflowState {
  readonly journal: UnicodeReviewJournalState;
  readonly activeWaveId: string | null;
  readonly finalizedCandidateIds: readonly string[];
  readonly provisionalCandidateIds: readonly string[];
  readonly cleanInitialWaveStreak: number;
  /** Reconstructed controller artifacts and exact next work subset for resume-safe CLI output. */
  readonly activeWave: UnicodeReviewWorkflowActiveWave | null;
  /** Every reconstructed wave, including terminal waves, for stored-artifact verification. */
  readonly waves: readonly UnicodeReviewWorkflowRecordedWave[];
  /** Every Reviewer B and Pass B subset output root chosen so far, for permanent path fencing. */
  readonly subsetRoots: readonly string[];
}

export interface UnicodeReviewWorkflowActiveWave {
  readonly waveId: string;
  readonly stage: 'reviewer-a-pending' | 'reviewer-b-preparation-pending' | 'reviewer-b-pending' | 'pass-b-preparation-pending' | 'pass-b-pending' | 'finalization-pending';
  readonly artifacts: UnicodeReviewWaveArtifacts;
  readonly reviewerBPairRefs: readonly string[] | null;
  /** Immutable Reviewer B refs exported when the subset was prepared. */
  readonly reviewerBPreparedPairRefs: readonly string[] | null;
  /** Immutable Pass B refs exported when the subset was prepared; retained while pending refs shrink. */
  readonly passBPreparedPairRefs: readonly string[] | null;
  readonly passBPairRefs: readonly string[] | null;
  /** Persisted subset output root for the pending Reviewer B subset, once chosen. */
  readonly reviewerBSubsetOutputPath: string | null;
  /** Persisted subset output root for the pending Pass B subset, once chosen. */
  readonly passBSubsetOutputPath: string | null;
}

export interface UnicodeReviewWorkflowRecordedWave {
  readonly waveId: string;
  readonly terminalState: 'pending' | 'invalidated' | 'finalized';
  readonly artifacts: UnicodeReviewWaveArtifacts;
  /** Reconstructed only from finalized, independently proven Pass B evidence. */
  readonly promotions: readonly PromotionRecord[];
  /** Immutable Reviewer B refs exported when the subset was prepared. */
  readonly reviewerBPreparedPairRefs: readonly string[] | null;
  /** Immutable Pass B refs exported when the subset was prepared. */
  readonly passBPreparedPairRefs: readonly string[] | null;
  /** Persisted Reviewer B subset output root for this wave, retained after finalization. */
  readonly reviewerBSubsetOutputPath: string | null;
  /** Persisted Pass B subset output root for this wave, retained after finalization. */
  readonly passBSubsetOutputPath: string | null;
}

/**
 * Controller-owned inputs for every recorded wave.  Requiring these on replay
 * makes a journal restart revalidate rendered-pixel bindings and receipts,
 * rather than trusting a hash-chained event log as semantic evidence.
 */
export type UnicodeReviewWorkflowManifestInputs = ReadonlyMap<string, readonly ManifestEvidenceInput[]>;

export interface UnicodeReviewWaveArtifacts {
  readonly waveId: string;
  readonly context: ReviewEvidenceContext;
  readonly reviewerBundle: ReviewEvidenceContext['bundle'];
  readonly controllerSidecar: ReviewEvidenceContext['sidecar'];
  readonly localPngs: ReviewEvidenceContext['localPngs'];
}

interface SentinelPlan {
  readonly pairRef: string;
  readonly controllerControlId: string;
  readonly leftGlyphRef: string;
  readonly rightGlyphRef: string;
  readonly evidenceChecksumSha256: string;
  readonly class: 'strong-positive' | 'strong-negative' | 'hard-probe';
  readonly expectedOutcome: VisualOutcome;
}

interface ManifestPlan {
  readonly pairRef: string;
  readonly candidateId: string;
  readonly candidateChecksumSha256: string;
  readonly evidenceChecksumSha256: string;
}

interface WavePlanEvent {
  readonly type: 'wave-planned';
  readonly waveId: string;
  readonly namespaceSalt: string;
  readonly manifest: readonly ManifestPlan[];
  readonly sentinels: readonly SentinelPlan[];
}

interface WaveRuntime {
  readonly plan: WavePlanEvent;
  readonly artifacts: UnicodeReviewWaveArtifacts;
  a: VisionClassificationSubmission | null;
  bRefs: readonly string[] | null;
  b: VisionClassificationSubmission | null;
  bCompleted: boolean;
  bSubsetOutputPath: string | null;
  passBRefs: readonly string[] | null;
  passBSubsetOutputPath: string | null;
  passB: readonly VisionPassBSubmission[];
  invalidated: boolean;
  finalized: boolean;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function exactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  assert(isRecord(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} has an unsupported schema`);
}

function parseSubsetOutputPath(value: unknown, label: string): string {
  assert(typeof value === 'string', `${label} must be an absolute path`);
  const canonical = resolveStrictExternalPath(value, label);
  assert(value === canonical, `${label} must use its canonical external path`);
  return canonical;
}

function replayCalibration(calibration: UnicodeReviewWorkflowCalibration): { authorization: CalibrationAuthorization; binding: CalibrationReplayBinding } {
  const issued = authorizeCalibration(calibration.context, calibration.key, calibration.submission);
  assert(issued.evaluation.pass && issued.authorization !== null && issued.replayBinding !== null, 'workflow requires a fresh calibration PASS from authorizeCalibration');
  return { authorization: issued.authorization, binding: issued.replayBinding };
}

function initializedPayload(binding: CalibrationReplayBinding): Record<string, unknown> {
  // Core replay equality fingerprints JSON in its issued field order.  The
  // journal canonically sorts object keys, so retain the issued serialization
  // as an opaque JSON string and parse it only for the core comparison.
  return { type: 'workflow-initialized', replayBindingJson: JSON.stringify(binding) };
}

function parseReplayBinding(value: unknown): CalibrationReplayBinding {
  assert(typeof value === 'string', 'workflow calibration replay binding is malformed');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('workflow calibration replay binding is malformed');
  }
  assert(isRecord(parsed), 'workflow calibration replay binding is malformed');
  return parsed as CalibrationReplayBinding;
}

function parsePlan(value: unknown): WavePlanEvent {
  exactKeys(value, ['type', 'waveId', 'namespaceSalt', 'manifest', 'sentinels'], 'wave plan event');
  assert(value.type === 'wave-planned' && typeof value.waveId === 'string' && value.waveId.length > 0, 'wave plan is invalid');
  assert(typeof value.namespaceSalt === 'string' && /^[0-9a-f]{64}$/.test(value.namespaceSalt), 'wave namespace salt is invalid');
  assert(Array.isArray(value.manifest) && value.manifest.length > 0 && value.manifest.length <= SCALED_WAVE_LIMIT, 'wave manifest is invalid');
  assert(Array.isArray(value.sentinels) && value.sentinels.length === 12, 'wave sentinels are invalid');
  return value as unknown as WavePlanEvent;
}

function sameRefs(actual: readonly string[], expected: readonly string[], label: string): void {
  assert(actual.length === expected.length && actual.every((ref, index) => ref === expected[index]), `${label} does not match the recorded workflow state`);
}

function expectedWaveBRefs(artifacts: UnicodeReviewWaveArtifacts, a: VisionClassificationSubmission): readonly string[] {
  const validated = validateStrictClassificationSubmission(artifacts.context, a, 'reviewer-a', artifacts.context.sidecar.entries);
  const outcomes = new Map(validated.results.map((result) => [result.pairRef, result.visualOutcome]));
  return artifacts.context.sidecar.entries
    .filter((entry) => entry.purpose === 'manifest' && outcomes.get(entry.pairRef) === 'confusable')
    .map((entry) => entry.pairRef);
}

function expectedPassBRefs(artifacts: UnicodeReviewWaveArtifacts, binding: CalibrationReplayBinding, a: VisionClassificationSubmission, b: VisionClassificationSubmission | null): readonly string[] {
  const provisional = new Set(binding.hardProbeCandidateOverrides.map((override) => `${override.candidateId}\n${override.candidateChecksumSha256}`));
  return reconcileIndependentClassification(artifacts.context, { a, b })
    .filter((entry) => entry.passBEligible && !provisional.has(`${entry.candidateId}\n${entry.candidateChecksumSha256}`))
    .map((entry) => entry.pairRef);
}

function sameManifestPlans(actual: readonly ManifestPlan[], expected: readonly ManifestPlan[]): void {
  assert(actual.length === expected.length && actual.every((entry, index) => (
    entry.pairRef === expected[index].pairRef
    && entry.candidateId === expected[index].candidateId
    && entry.candidateChecksumSha256 === expected[index].candidateChecksumSha256
    && entry.evidenceChecksumSha256 === expected[index].evidenceChecksumSha256
  )), 'wave manifest evidence differs from the persisted plan');
}

function sameSentinelPlans(actual: readonly SentinelPlan[], expected: readonly SentinelPlan[]): void {
  assert(actual.length === expected.length && actual.every((entry, index) => (
    entry.pairRef === expected[index].pairRef
    && entry.controllerControlId === expected[index].controllerControlId
    && entry.leftGlyphRef === expected[index].leftGlyphRef
    && entry.rightGlyphRef === expected[index].rightGlyphRef
    && entry.evidenceChecksumSha256 === expected[index].evidenceChecksumSha256
    && entry.class === expected[index].class
    && entry.expectedOutcome === expected[index].expectedOutcome
  )), 'wave sentinel evidence differs from the persisted plan');
}

function replayState(
  journal: UnicodeReviewJournalState,
  calibration: UnicodeReviewWorkflowCalibration,
  issued: ReturnType<typeof replayCalibration>,
  manifestInputsByWave: UnicodeReviewWorkflowManifestInputs,
): { readonly waves: readonly WaveRuntime[]; readonly finalized: Set<string>; readonly provisional: Set<string>; readonly streak: number } {
  assert(journal.events.length > 0, 'workflow journal is not initialized');
  const first = journal.events[0].payload;
  exactKeys(first, ['type', 'replayBindingJson'], 'workflow initialization event');
  assert(first.type === 'workflow-initialized' && calibrationReplayBindingsEqual(parseReplayBinding(first.replayBindingJson), issued.binding), 'workflow calibration replay binding is stale or changed');
  const waves: WaveRuntime[] = [];
  const finalized = new Set<string>();
  const provisional = new Set<string>();
  const waveIds = new Set<string>();
  let active: WaveRuntime | null = null;
  let streak = 0;
  for (const event of journal.events.slice(1)) {
    const payload = event.payload;
    assert(isRecord(payload) && typeof payload.type === 'string', 'workflow journal event is malformed');
    if (payload.type === 'wave-planned') {
      assert(active === null, 'workflow journal starts a new wave while another is pending');
      const plan = parsePlan(payload);
      assert(!waveIds.has(plan.waveId), 'workflow journal reuses a wave ID');
      assert(plan.manifest.length <= (streak >= 2 ? SCALED_WAVE_LIMIT : INITIAL_WAVE_LIMIT), 'workflow journal exceeds the current candidate limit');
      assert(plan.manifest.every((entry) => !finalized.has(entry.candidateId)), 'workflow journal reuses a finalized candidate');
      const manifestInputs = manifestInputsByWave.get(plan.waveId);
      assert(manifestInputs, `workflow replay requires controller manifest inputs for wave '${plan.waveId}'`);
      active = { plan, artifacts: buildWaveArtifacts(calibration, plan, manifestInputs), a: null, bRefs: null, b: null, bCompleted: false, bSubsetOutputPath: null, passBRefs: null, passBSubsetOutputPath: null, passB: [], invalidated: false, finalized: false };
      const provisionalKeys = new Set(issued.binding.hardProbeCandidateOverrides.map((override) => `${override.candidateId}\n${override.candidateChecksumSha256}`));
      for (const entry of plan.manifest) {
        if (provisionalKeys.has(`${entry.candidateId}\n${entry.candidateChecksumSha256}`)) provisional.add(entry.candidateId);
      }
      waveIds.add(plan.waveId);
      waves.push(active);
    } else if (payload.type === 'wave-a-ingested') {
      exactKeys(payload, ['type', 'waveId', 'submission'], 'wave A event');
      assert(active?.plan.waveId === payload.waveId && active.a === null, 'workflow journal has an invalid A transition');
      const validated = validateStrictClassificationSubmission(active.artifacts.context, payload.submission as VisionClassificationSubmission, 'reviewer-a', active.artifacts.context.sidecar.entries);
      assert(!active.plan.sentinels.some((sentinel) => sentinel.class === 'strong-negative' && validated.results.some((result) => result.pairRef === sentinel.pairRef && result.visualOutcome === 'confusable')), 'workflow replay found a strong-negative sentinel violation');
      active.a = payload.submission as VisionClassificationSubmission;
    } else if (payload.type === 'wave-invalidated') {
      exactKeys(payload, ['type', 'waveId', 'stage', 'reason', 'submission'], 'wave invalidation event');
      assert(active?.plan.waveId === payload.waveId, 'workflow journal has an invalid invalidation transition');
      assert(payload.reason === 'strong-negative-sentinel-confusable' || payload.reason === 'classification-schema-or-binding-failure', 'workflow invalidation reason is unsupported');
      if (payload.reason === 'strong-negative-sentinel-confusable') {
        assert(payload.stage === 'a' && active.a === null, 'strong-negative invalidation must occur during Reviewer A');
        const submission = payload.submission as VisionClassificationSubmission;
        const validated = validateStrictClassificationSubmission(active.artifacts.context, submission, 'reviewer-a', active.artifacts.context.sidecar.entries);
        assert(active.plan.sentinels.some((sentinel) => sentinel.class === 'strong-negative' && validated.results.some((result) => result.pairRef === sentinel.pairRef && result.visualOutcome === 'confusable')), 'workflow strong-negative invalidation lacks a strong-negative violation');
      } else {
        assert(payload.submission === null, 'schema invalidation must not persist an unvalidated submission');
        assert(
          (payload.stage === 'a' && active.a === null)
          || (payload.stage === 'b' && active.a !== null && active.bRefs !== null && !active.bCompleted)
          || (payload.stage === 'pass-b' && active.a !== null && active.bRefs !== null && active.bCompleted && active.passBRefs !== null),
          'workflow schema invalidation has an invalid stage',
        );
      }
      active.invalidated = true;
      active = null;
      streak = 0;
    } else if (payload.type === 'wave-b-planned') {
      exactKeys(payload, ['type', 'waveId', 'pairRefs', 'subsetOutputPath'], 'wave B plan event');
      assert(active?.plan.waveId === payload.waveId && active.a !== null && active.bRefs === null && Array.isArray(payload.pairRefs), 'workflow journal has an invalid B plan transition');
      sameRefs(payload.pairRefs as string[], expectedWaveBRefs(active.artifacts, active.a), 'Reviewer B subset');
      active.bRefs = payload.pairRefs as string[];
      active.bSubsetOutputPath = parseSubsetOutputPath(payload.subsetOutputPath, 'workflow Reviewer B subset output path');
    } else if (payload.type === 'wave-b-ingested') {
      exactKeys(payload, ['type', 'waveId', 'submission'], 'wave B event');
      assert(active?.plan.waveId === payload.waveId && active.bRefs !== null && !active.bCompleted, 'workflow journal has an invalid B transition');
      if (active.bRefs.length === 0) {
        assert(payload.submission === null, 'empty Reviewer B subset must record no submission');
      } else {
        const expected = active.artifacts.context.sidecar.entries.filter((entry) => active!.bRefs!.includes(entry.pairRef));
        validateStrictClassificationSubmission(active.artifacts.context, payload.submission as VisionClassificationSubmission, 'reviewer-b', expected);
        reconcileIndependentClassification(active.artifacts.context, { a: active.a!, b: payload.submission as VisionClassificationSubmission });
        active.b = payload.submission as VisionClassificationSubmission;
      }
      active.bCompleted = true;
    } else if (payload.type === 'wave-pass-b-planned') {
      exactKeys(payload, ['type', 'waveId', 'pairRefs', 'subsetOutputPath'], 'wave Pass B plan event');
      assert(active?.plan.waveId === payload.waveId && active.a !== null && active.bRefs !== null && active.bCompleted && active.passBRefs === null && Array.isArray(payload.pairRefs), 'workflow journal has an invalid Pass B plan transition');
      sameRefs(payload.pairRefs as string[], expectedPassBRefs(active.artifacts, issued.binding, active.a, active.b), 'Pass B subset');
      active.passBRefs = payload.pairRefs as string[];
      active.passBSubsetOutputPath = parseSubsetOutputPath(payload.subsetOutputPath, 'workflow Pass B subset output path');
    } else if (payload.type === 'wave-pass-b-ingested') {
      exactKeys(payload, ['type', 'waveId', 'submission'], 'wave Pass B event');
      assert(active?.plan.waveId === payload.waveId && active.a !== null && active.bRefs !== null && active.bCompleted && active.passBRefs !== null, 'workflow journal has an invalid Pass B transition');
      const promotion = promoteConfirmedPositive({ context: active.artifacts.context, calibrationAuthorization: issued.authorization, classification: { a: active.a, b: active.b }, passB: payload.submission as VisionPassBSubmission });
      assert(active.passBRefs.includes((payload.submission as { readonly result?: { readonly pairRef?: unknown } }).result?.pairRef as string), 'Pass B result is outside the confirmed manifest subset');
      const passBRef = parsePassBResult((payload.submission as VisionPassBSubmission).result).pairRef;
      assert(!active.passB.some((item) => parsePassBResult(item.result).pairRef === passBRef), 'workflow journal records duplicate Pass B evidence for a pair reference');
      void promotion;
      active.passB = [...active.passB, payload.submission as VisionPassBSubmission];
    } else if (payload.type === 'wave-finalized') {
      exactKeys(payload, ['type', 'waveId'], 'wave finalization event');
      assert(active?.plan.waveId === payload.waveId && active.a !== null && active.bRefs !== null && active.bCompleted && active.passBRefs !== null, 'workflow journal has an invalid finalization transition');
      assert(active.passB.length === active.passBRefs.length, 'workflow finalization is missing Pass B evidence');
      for (const passB of active.passB) void promoteConfirmedPositive({ context: active.artifacts.context, calibrationAuthorization: issued.authorization, classification: { a: active.a, b: active.b }, passB });
      const provisionalKeys = new Set(issued.binding.hardProbeCandidateOverrides.map((override) => `${override.candidateId}\n${override.candidateChecksumSha256}`));
      for (const entry of active.plan.manifest) {
        finalized.add(entry.candidateId);
        if (provisionalKeys.has(`${entry.candidateId}\n${entry.candidateChecksumSha256}`)) provisional.add(entry.candidateId);
      }
      active.finalized = true;
      const initialClean = active.plan.manifest.length <= INITIAL_WAVE_LIMIT;
      streak = initialClean ? streak + 1 : 0;
      active = null;
    } else {
      throw new Error(`workflow journal has an unknown event type '${payload.type}'`);
    }
  }
  return { waves, finalized, provisional, streak };
}

function stateFromJournal(journal: UnicodeReviewJournalState, calibration: UnicodeReviewWorkflowCalibration, manifestInputsByWave: UnicodeReviewWorkflowManifestInputs): { readonly issued: ReturnType<typeof replayCalibration>; readonly replay: ReturnType<typeof replayState>; readonly journal: UnicodeReviewJournalState } {
  const issued = replayCalibration(calibration);
  return { issued, replay: replayState(journal, calibration, issued, manifestInputsByWave), journal };
}

function loadState(path: string, calibration: UnicodeReviewWorkflowCalibration, manifestInputsByWave: UnicodeReviewWorkflowManifestInputs): { readonly issued: ReturnType<typeof replayCalibration>; readonly replay: ReturnType<typeof replayState>; readonly journal: UnicodeReviewJournalState } {
  return stateFromJournal(loadUnicodeReviewJournal(path), calibration, manifestInputsByWave);
}

function currentWave(replay: ReturnType<typeof replayState>): WaveRuntime {
  const wave = replay.waves.at(-1);
  assert(wave && !wave.invalidated && !wave.finalized, 'workflow has no pending wave');
  return wave;
}

function selectedControls(calibration: UnicodeReviewWorkflowCalibration, selectionSalt: string): Array<{ readonly input: ExternalControlEvidenceInput; readonly class: SentinelPlan['class']; readonly expectedOutcome: VisualOutcome }> {
  const externalEntriesByRef = new Map(calibration.context.sidecar.entries
    .filter((entry): entry is ExternalControlControllerSidecarEntry => entry.purpose === 'external-control')
    .map((entry) => [entry.pairRef, entry]));
  const manifestEntriesByRef = new Map(calibration.context.sidecar.entries
    .filter((entry): entry is ManifestControllerSidecarEntry => entry.purpose === 'manifest')
    .map((entry) => [entry.pairRef, entry]));
  const inputsByControlId = new Map(calibration.context.inputs
    .filter((input): input is ExternalControlEvidenceInput => input.purpose === 'external-control')
    .map((input) => [input.controllerControlId, input]));
  const inputsByCandidateId = new Map(calibration.context.inputs
    .filter((input): input is ManifestEvidenceInput => input.purpose === 'manifest')
    .map((input) => [input.candidateId, input]));
  const controls: Array<{ readonly input: ExternalControlEvidenceInput; readonly class: SentinelPlan['class']; readonly expectedOutcome: VisualOutcome; readonly pairRef: string }> = [];
  for (const item of calibration.key.items) {
    if (item.class === 'relation-trap') continue;
    let input: ExternalControlEvidenceInput | undefined;
    if (manifestEntriesByRef.has(item.pairRef)) {
      const entry = manifestEntriesByRef.get(item.pairRef);
      const manifestInput = entry ? inputsByCandidateId.get(entry.candidateId) : undefined;
      const candidate = entry ? calibration.context.authority.candidates.find((value) => value.candidateId === entry.candidateId) : undefined;
      assert(entry && manifestInput && candidate && candidate.candidateChecksumSha256 === entry.candidateChecksumSha256, 'sealed manifest control must bind to a current manifest candidate');
      const leftGlyphRefs = calibration.context.authority.glyphs.filter((glyph) => glyph.derivativeSha256 === candidate.leftDerivativeSha256).map((glyph) => glyph.glyphRef).sort();
      const rightGlyphRefs = calibration.context.authority.glyphs.filter((glyph) => glyph.derivativeSha256 === candidate.rightDerivativeSha256).map((glyph) => glyph.glyphRef).sort();
      assert(leftGlyphRefs.length > 0 && rightGlyphRefs.length > 0, 'manifest control lacks an authoritative glyph binding for sentinel injection');
      input = {
        purpose: 'external-control',
        controllerControlId: `hard-probe-${sha256(`${entry.candidateId}\n${entry.candidateChecksumSha256}`)}`,
        leftGlyphRef: leftGlyphRefs[0],
        rightGlyphRef: rightGlyphRefs[0],
        leftGrayscale: manifestInput.leftGrayscale,
        rightGrayscale: manifestInput.rightGrayscale,
      };
    } else {
      const entry = externalEntriesByRef.get(item.pairRef);
      input = entry ? inputsByControlId.get(entry.controllerControlId) : undefined;
      assert(entry && input, 'sealed sentinel source must be an external control');
    }
    assert(input, 'sealed sentinel input is unavailable');
    controls.push({ input, class: item.class, expectedOutcome: item.expectedOutcome, pairRef: item.pairRef });
  }
  const output: Array<{ readonly input: ExternalControlEvidenceInput; readonly class: SentinelPlan['class']; readonly expectedOutcome: VisualOutcome }> = [];
  for (const kind of ['strong-positive', 'strong-negative', 'hard-probe'] as const) {
    const selected = controls.filter((item) => item.class === kind)
      .sort((left, right) => sha256(`${selectionSalt}\n${left.pairRef}`).localeCompare(sha256(`${selectionSalt}\n${right.pairRef}`)))
      .slice(0, 4);
    assert(selected.length === 4, `sealed calibration key lacks four ${kind} controls`);
    output.push(...selected);
  }
  return output;
}

function buildWaveArtifacts(calibration: UnicodeReviewWorkflowCalibration, plan: WavePlanEvent, manifestInputs: readonly ManifestEvidenceInput[]): UnicodeReviewWaveArtifacts {
  const manifestIds = manifestInputs.map((input) => input.candidateId);
  assert(manifestIds.length === plan.manifest.length && plan.manifest.every((entry) => manifestIds.includes(entry.candidateId)), 'wave manifest inputs do not match the persisted plan');
  const controls = selectedControls(calibration, plan.namespaceSalt).map((item) => item.input);
  const artifacts = buildBlindEvidenceArtifactsFromAuthority(calibration.context.authority, [...manifestInputs, ...controls], plan.namespaceSalt);
  const context: ReviewEvidenceContext = { authority: calibration.context.authority, bundle: artifacts.reviewerBundle, sidecar: artifacts.controllerSidecar, inputs: [...manifestInputs, ...controls], localPngs: artifacts.localPngs, contract: calibration.context.contract };
  const manifest = context.sidecar.entries.filter((entry): entry is ManifestControllerSidecarEntry => entry.purpose === 'manifest');
  const sentinels = context.sidecar.entries.filter((entry): entry is ExternalControlControllerSidecarEntry => entry.purpose === 'external-control');
  sameManifestPlans(manifest.map((entry) => ({ pairRef: entry.pairRef, candidateId: entry.candidateId, candidateChecksumSha256: entry.candidateChecksumSha256, evidenceChecksumSha256: entry.evidenceChecksumSha256 })), plan.manifest);
  const selectedByControlId = new Map(selectedControls(calibration, plan.namespaceSalt).map((selected) => [selected.input.controllerControlId, selected]));
  sameSentinelPlans(sentinels.map((entry) => {
    const selected = selectedByControlId.get(entry.controllerControlId);
    assert(selected, 'wave artifact contains an unselected external control');
    return { pairRef: entry.pairRef, controllerControlId: entry.controllerControlId, leftGlyphRef: entry.leftGlyphRef, rightGlyphRef: entry.rightGlyphRef, evidenceChecksumSha256: entry.evidenceChecksumSha256, class: selected.class, expectedOutcome: selected.expectedOutcome };
  }), plan.sentinels);
  return { waveId: plan.waveId, context, reviewerBundle: context.bundle, controllerSidecar: context.sidecar, localPngs: context.localPngs };
}

function append(path: string, state: UnicodeReviewJournalState, payload: Record<string, unknown>): UnicodeReviewJournalState {
  return appendUnicodeReviewJournalEvent(path, state.tip, payload);
}

/**
 * Opens a newly-created journal or the exact empty journal left by a stopped
 * initializer.  A nonempty journal is already a workflow candidate and must
 * never be repurposed by init; a lock remains an explicit recover operation.
 */
function initializeOrResumeEmptyJournal(path: string): UnicodeReviewJournalState {
  try {
    return initializeUnicodeReviewJournal(path);
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) throw error;
    const existing = loadUnicodeReviewJournal(path);
    assert(existing.events.length === 0 && existing.tip.sequence === 0 && existing.tip.digest === null, 'workflow journal is already initialized or is not an exact empty journal');
    return existing;
  }
}

export function initializeUnicodeReviewWorkflow(path: string, calibration: UnicodeReviewWorkflowCalibration): UnicodeReviewWorkflowState {
  const issued = replayCalibration(calibration);
  const journal = initializeOrResumeEmptyJournal(path);
  const initialized = append(path, journal, initializedPayload(issued.binding));
  return { journal: initialized, activeWaveId: null, finalizedCandidateIds: [], provisionalCandidateIds: [], cleanInitialWaveStreak: 0, activeWave: null, waves: [], subsetRoots: [] };
}

function activeWaveSnapshot(wave: WaveRuntime | undefined, binding: CalibrationReplayBinding): UnicodeReviewWorkflowActiveWave | null {
  if (!wave || wave.invalidated || wave.finalized) return null;
  if (wave.a === null) return { waveId: wave.plan.waveId, stage: 'reviewer-a-pending', artifacts: wave.artifacts, reviewerBPairRefs: null, reviewerBPreparedPairRefs: null, passBPreparedPairRefs: null, passBPairRefs: null, reviewerBSubsetOutputPath: null, passBSubsetOutputPath: null };
  const reviewerBPairRefs = wave.bCompleted ? [] : wave.bRefs ?? expectedWaveBRefs(wave.artifacts, wave.a);
  if (wave.bRefs === null) return { waveId: wave.plan.waveId, stage: 'reviewer-b-preparation-pending', artifacts: wave.artifacts, reviewerBPairRefs, reviewerBPreparedPairRefs: null, passBPreparedPairRefs: null, passBPairRefs: null, reviewerBSubsetOutputPath: null, passBSubsetOutputPath: null };
  if (!wave.bCompleted) return { waveId: wave.plan.waveId, stage: 'reviewer-b-pending', artifacts: wave.artifacts, reviewerBPairRefs, reviewerBPreparedPairRefs: wave.bRefs, passBPreparedPairRefs: null, passBPairRefs: null, reviewerBSubsetOutputPath: wave.bSubsetOutputPath, passBSubsetOutputPath: null };
  const requiredPassBPairRefs = wave.passBRefs ?? expectedPassBRefs(wave.artifacts, binding, wave.a, wave.b);
  const completedPassBPairRefs = new Set(wave.passB.map((submission) => parsePassBResult(submission.result).pairRef));
  const passBPairRefs = requiredPassBPairRefs.filter((pairRef) => !completedPassBPairRefs.has(pairRef));
  if (wave.passBRefs === null) return { waveId: wave.plan.waveId, stage: 'pass-b-preparation-pending', artifacts: wave.artifacts, reviewerBPairRefs, reviewerBPreparedPairRefs: wave.bRefs, passBPreparedPairRefs: null, passBPairRefs, reviewerBSubsetOutputPath: wave.bSubsetOutputPath, passBSubsetOutputPath: null };
  if (wave.passBRefs.length === 0 || passBPairRefs.length > 0) return { waveId: wave.plan.waveId, stage: 'pass-b-pending', artifacts: wave.artifacts, reviewerBPairRefs, reviewerBPreparedPairRefs: wave.bRefs, passBPreparedPairRefs: wave.passBRefs, passBPairRefs, reviewerBSubsetOutputPath: wave.bSubsetOutputPath, passBSubsetOutputPath: wave.passBSubsetOutputPath };
  return { waveId: wave.plan.waveId, stage: 'finalization-pending', artifacts: wave.artifacts, reviewerBPairRefs, reviewerBPreparedPairRefs: wave.bRefs, passBPreparedPairRefs: wave.passBRefs, passBPairRefs, reviewerBSubsetOutputPath: wave.bSubsetOutputPath, passBSubsetOutputPath: wave.passBSubsetOutputPath };
}

function recordedWaveSnapshot(wave: WaveRuntime, authorization: CalibrationAuthorization): UnicodeReviewWorkflowRecordedWave {
  const promotions = wave.finalized
    ? wave.passB.map((passB) => promoteConfirmedPositive({ context: wave.artifacts.context, calibrationAuthorization: authorization, classification: { a: wave.a!, b: wave.b! }, passB }))
    : [];
  return {
    waveId: wave.plan.waveId,
    terminalState: wave.invalidated ? 'invalidated' : wave.finalized ? 'finalized' : 'pending',
    artifacts: wave.artifacts,
    promotions,
    reviewerBPreparedPairRefs: wave.bRefs,
    passBPreparedPairRefs: wave.passBRefs,
    reviewerBSubsetOutputPath: wave.bSubsetOutputPath,
    passBSubsetOutputPath: wave.passBSubsetOutputPath,
  };
}

function recordedSubsetRoots(waves: readonly WaveRuntime[]): readonly string[] {
  const roots = new Set<string>();
  for (const wave of waves) {
    if (wave.bSubsetOutputPath !== null) roots.add(wave.bSubsetOutputPath);
    if (wave.passBSubsetOutputPath !== null) roots.add(wave.passBSubsetOutputPath);
  }
  return [...roots].sort();
}

export function readUnicodeReviewWorkflow(path: string, calibration: UnicodeReviewWorkflowCalibration, manifestInputsByWave: UnicodeReviewWorkflowManifestInputs): UnicodeReviewWorkflowState {
  return readUnicodeReviewWorkflowFromJournal(loadUnicodeReviewJournal(path), calibration, manifestInputsByWave);
}

/** Replays a caller-supplied structurally validated journal without reopening its root. */
export function readUnicodeReviewWorkflowFromJournal(journal: UnicodeReviewJournalState, calibration: UnicodeReviewWorkflowCalibration, manifestInputsByWave: UnicodeReviewWorkflowManifestInputs): UnicodeReviewWorkflowState {
  const loaded = stateFromJournal(journal, calibration, manifestInputsByWave);
  const active = loaded.replay.waves.at(-1);
  const activeWave = activeWaveSnapshot(active, loaded.issued.binding);
  return { journal: loaded.journal, activeWaveId: activeWave?.waveId ?? null, finalizedCandidateIds: [...loaded.replay.finalized].sort(), provisionalCandidateIds: [...loaded.replay.provisional].sort(), cleanInitialWaveStreak: loaded.replay.streak, activeWave, waves: loaded.replay.waves.map((wave) => recordedWaveSnapshot(wave, loaded.issued.authorization)), subsetRoots: recordedSubsetRoots(loaded.replay.waves) };
}

export function planUnicodeReviewWave(path: string, calibration: UnicodeReviewWorkflowCalibration, waveId: string, manifestInputs: readonly ManifestEvidenceInput[], previousManifestInputsByWave: UnicodeReviewWorkflowManifestInputs = new Map()): UnicodeReviewWaveArtifacts {
  const loaded = loadState(path, calibration, previousManifestInputsByWave);
  assert(loaded.replay.waves.length === 0 || loaded.replay.waves.at(-1)?.invalidated || loaded.replay.waves.at(-1)?.finalized, 'next wave is forbidden while a wave is pending');
  assert(typeof waveId === 'string' && /^[a-z0-9-]{1,128}$/.test(waveId), 'wave ID is invalid');
  assert(!loaded.replay.waves.some((wave) => wave.plan.waveId === waveId), 'wave ID has already been used');
  const limit = loaded.replay.streak >= 2 ? SCALED_WAVE_LIMIT : INITIAL_WAVE_LIMIT;
  assert(manifestInputs.length > 0 && manifestInputs.length <= limit, `wave manifest size exceeds the current ${limit} candidate limit`);
  assert(manifestInputs.every((input) => !loaded.replay.finalized.has(input.candidateId)), 'wave reuses a finalized manifest candidate');
  const namespaceSalt = randomBytes(32).toString('hex');
  const controls = selectedControls(calibration, namespaceSalt);
  const artifacts = buildBlindEvidenceArtifactsFromAuthority(calibration.context.authority, [...manifestInputs, ...controls.map((item) => item.input)], namespaceSalt);
  const manifest = artifacts.controllerSidecar.entries.filter((entry): entry is ManifestControllerSidecarEntry => entry.purpose === 'manifest')
    .map((entry) => ({ pairRef: entry.pairRef, candidateId: entry.candidateId, candidateChecksumSha256: entry.candidateChecksumSha256, evidenceChecksumSha256: entry.evidenceChecksumSha256 }));
  const selectedByControlId = new Map(controls.map((control) => [control.input.controllerControlId, control]));
  const sentinels = artifacts.controllerSidecar.entries.filter((entry): entry is ExternalControlControllerSidecarEntry => entry.purpose === 'external-control')
    .map((entry) => {
      const selected = selectedByControlId.get(entry.controllerControlId);
      assert(selected, 'wave artifact contains an unselected external control');
      return { pairRef: entry.pairRef, controllerControlId: entry.controllerControlId, leftGlyphRef: entry.leftGlyphRef, rightGlyphRef: entry.rightGlyphRef, evidenceChecksumSha256: entry.evidenceChecksumSha256, class: selected.class, expectedOutcome: selected.expectedOutcome };
    });
  const plan: WavePlanEvent = { type: 'wave-planned', waveId, namespaceSalt, manifest, sentinels };
  append(path, loaded.journal, plan);
  const context: ReviewEvidenceContext = { authority: calibration.context.authority, bundle: artifacts.reviewerBundle, sidecar: artifacts.controllerSidecar, inputs: [...manifestInputs, ...controls.map((item) => item.input)], localPngs: artifacts.localPngs, contract: calibration.context.contract };
  return { waveId, context, reviewerBundle: context.bundle, controllerSidecar: context.sidecar, localPngs: context.localPngs };
}

export function ingestUnicodeReviewWaveA(path: string, calibration: UnicodeReviewWorkflowCalibration, manifestInputsByWave: UnicodeReviewWorkflowManifestInputs, submission: VisionClassificationSubmission): void {
  const loaded = loadState(path, calibration, manifestInputsByWave);
  const wave = currentWave(loaded.replay);
  assert(wave.a === null, 'Reviewer A has already been ingested');
  const artifacts = wave.artifacts;
  let strongNegativeConfusable = false;
  try {
    const validated = validateStrictClassificationSubmission(artifacts.context, submission, 'reviewer-a', artifacts.context.sidecar.entries);
    strongNegativeConfusable = wave.plan.sentinels.some((sentinel) => sentinel.class === 'strong-negative' && validated.results.find((result) => result.pairRef === sentinel.pairRef)?.visualOutcome === 'confusable');
  } catch (error) {
    append(path, loaded.journal, { type: 'wave-invalidated', waveId: wave.plan.waveId, stage: 'a', reason: 'classification-schema-or-binding-failure', submission: null });
    throw error;
  }
  if (strongNegativeConfusable) {
    append(path, loaded.journal, { type: 'wave-invalidated', waveId: wave.plan.waveId, stage: 'a', reason: 'strong-negative-sentinel-confusable', submission });
    return;
  }
  append(path, loaded.journal, { type: 'wave-a-ingested', waveId: wave.plan.waveId, submission });
}

export function prepareUnicodeReviewWaveB(path: string, calibration: UnicodeReviewWorkflowCalibration, manifestInputsByWave: UnicodeReviewWorkflowManifestInputs, subsetOutputPath: string): readonly string[] {
  const canonicalSubsetOutputPath = resolveStrictExternalPath(subsetOutputPath, 'Reviewer B subset output path');
  const loaded = loadState(path, calibration, manifestInputsByWave);
  const wave = currentWave(loaded.replay);
  assert(wave.a !== null && wave.bRefs === null, 'Reviewer B cannot be prepared at this workflow stage');
  const refs = expectedWaveBRefs(wave.artifacts, wave.a);
  append(path, loaded.journal, { type: 'wave-b-planned', waveId: wave.plan.waveId, pairRefs: refs, subsetOutputPath: canonicalSubsetOutputPath });
  return refs;
}

export function ingestUnicodeReviewWaveB(path: string, calibration: UnicodeReviewWorkflowCalibration, manifestInputsByWave: UnicodeReviewWorkflowManifestInputs, submission: VisionClassificationSubmission | null): void {
  const loaded = loadState(path, calibration, manifestInputsByWave);
  const wave = currentWave(loaded.replay);
  assert(wave.a !== null && wave.bRefs !== null && !wave.bCompleted, 'Reviewer B cannot be ingested at this workflow stage');
  if (wave.bRefs.length === 0) {
    assert(submission === null, 'Reviewer B must not receive an empty subset');
    append(path, loaded.journal, { type: 'wave-b-ingested', waveId: wave.plan.waveId, submission: null });
    return;
  }
  assert(submission !== null, 'Reviewer B submission is required for A-positive manifest entries');
  const artifacts = wave.artifacts;
  const expected = artifacts.context.sidecar.entries.filter((entry) => wave.bRefs!.includes(entry.pairRef));
  try {
    validateStrictClassificationSubmission(artifacts.context, submission, 'reviewer-b', expected);
    reconcileIndependentClassification(artifacts.context, { a: wave.a, b: submission });
  } catch (error) {
    append(path, loaded.journal, { type: 'wave-invalidated', waveId: wave.plan.waveId, stage: 'b', reason: 'classification-schema-or-binding-failure', submission: null });
    throw error;
  }
  append(path, loaded.journal, { type: 'wave-b-ingested', waveId: wave.plan.waveId, submission });
}

export function prepareUnicodeReviewWavePassB(path: string, calibration: UnicodeReviewWorkflowCalibration, manifestInputsByWave: UnicodeReviewWorkflowManifestInputs, subsetOutputPath: string): readonly string[] {
  const canonicalSubsetOutputPath = resolveStrictExternalPath(subsetOutputPath, 'Pass B subset output path');
  const loaded = loadState(path, calibration, manifestInputsByWave);
  const wave = currentWave(loaded.replay);
  assert(wave.a !== null && wave.bRefs !== null && wave.bCompleted && wave.passBRefs === null, 'Pass B cannot be prepared at this workflow stage');
  const refs = expectedPassBRefs(wave.artifacts, loaded.issued.binding, wave.a, wave.b);
  append(path, loaded.journal, { type: 'wave-pass-b-planned', waveId: wave.plan.waveId, pairRefs: refs, subsetOutputPath: canonicalSubsetOutputPath });
  return refs;
}

export function ingestUnicodeReviewWavePassB(path: string, calibration: UnicodeReviewWorkflowCalibration, manifestInputsByWave: UnicodeReviewWorkflowManifestInputs, submission: VisionPassBSubmission): void {
  const loaded = loadState(path, calibration, manifestInputsByWave);
  const wave = currentWave(loaded.replay);
  assert(wave.a !== null && wave.bRefs !== null && wave.bCompleted && wave.passBRefs !== null, 'Pass B cannot be ingested at this workflow stage');
  try {
    const promoted = promoteConfirmedPositive({ context: wave.artifacts.context, calibrationAuthorization: loaded.issued.authorization, classification: { a: wave.a, b: wave.b }, passB: submission });
    const pairRef = parsePassBResult(submission.result).pairRef;
    assert(wave.passBRefs.includes(pairRef), 'Pass B result is not in the confirmed manifest subset');
    assert(!wave.passB.some((item) => parsePassBResult(item.result).pairRef === pairRef), 'Pass B result is already recorded for this pair reference');
    void promoted;
  } catch (error) {
    append(path, loaded.journal, { type: 'wave-invalidated', waveId: wave.plan.waveId, stage: 'pass-b', reason: 'classification-schema-or-binding-failure', submission: null });
    throw error;
  }
  append(path, loaded.journal, { type: 'wave-pass-b-ingested', waveId: wave.plan.waveId, submission });
}

export function finalizeUnicodeReviewWave(path: string, calibration: UnicodeReviewWorkflowCalibration, manifestInputsByWave: UnicodeReviewWorkflowManifestInputs): readonly PromotionRecord[] {
  const loaded = loadState(path, calibration, manifestInputsByWave);
  const wave = currentWave(loaded.replay);
  assert(wave.a !== null && wave.bRefs !== null && wave.bCompleted && wave.passBRefs !== null, 'wave cannot be finalized at this workflow stage');
  assert(wave.passB.length === wave.passBRefs.length, 'every confirmed manifest candidate requires Pass B before finalization');
  const promotions = wave.passB.map((passB) => promoteConfirmedPositive({ context: wave.artifacts.context, calibrationAuthorization: loaded.issued.authorization, classification: { a: wave.a!, b: wave.b! }, passB }));
  append(path, loaded.journal, { type: 'wave-finalized', waveId: wave.plan.waveId });
  return promotions;
}
