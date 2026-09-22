import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  REVIEW_PROTOCOL_VERSION,
  authorizeCalibration,
  type ManifestEvidenceInput,
  type PromotionRecord,
  type VisionClassificationSubmission,
  type VisionPassBSubmission,
} from './unicode_review_v021.ts';
import { loadReviewEvidenceContext, parseControllerEvidenceInputs } from './unicode_review_cli_context.ts';
import {
  readStrictExternalBytes,
  readStrictExternalJson,
  resolveStrictExternalPath,
  writeExclusiveExternalJson,
  writeExclusiveExternalOutputs,
} from './unicode_review_external_io.ts';
import { recoverStoppedUnicodeReviewJournalWriter } from './unicode_review_journal.ts';
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
  readUnicodeReviewWorkflowFromJournal,
  type UnicodeReviewWaveArtifacts,
  type UnicodeReviewWorkflowCalibration,
  type UnicodeReviewWorkflowState,
} from './unicode_review_workflow.ts';

type Command = 'init' | 'plan' | 'resume' | 'ingest-a' | 'prepare-b' | 'ingest-b' | 'prepare-pass-b' | 'ingest-pass-b' | 'finalize' | 'recover';

interface WaveDescriptor {
  readonly waveId: string;
  readonly inputPath: string;
  readonly reviewerOutputPath: string;
  readonly controllerOutputPath: string;
}

interface WorkflowDescriptor {
  readonly calibrationContextPath: string;
  readonly sealedKeyPath: string;
  readonly calibrationSubmissionPath: string;
  readonly journalPath: string;
  readonly waves: readonly WaveDescriptor[];
}

interface CalibrationArtifactPaths {
  readonly inputPath: string;
  readonly reviewerBundlePath: string;
  readonly controllerSidecarPath: string;
  readonly contractPath: string;
}

interface LoadedWorkflow {
  readonly workflowDescriptorPath: string;
  readonly descriptor: WorkflowDescriptor;
  readonly calibrationArtifactPaths: CalibrationArtifactPaths;
  readonly calibration: UnicodeReviewWorkflowCalibration;
  readonly inputsByWave: ReadonlyMap<string, readonly ManifestEvidenceInput[]>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  assert(isRecord(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} has unsupported or missing fields`);
}

function valueString(value: Record<string, unknown>, key: string, label: string): string {
  const candidate = value[key];
  assert(typeof candidate === 'string' && candidate.length > 0, `${label} is required`);
  return candidate;
}

function waveId(value: string, label: string): string {
  assert(/^[a-z0-9-]{1,128}$/.test(value), `${label} is invalid`);
  return value;
}

function externalPath(value: string, label: string): string {
  return resolveStrictExternalPath(value, label);
}

function parseDescriptor(value: unknown): WorkflowDescriptor {
  exactKeys(value, ['calibrationContextPath', 'sealedKeyPath', 'calibrationSubmissionPath', 'journalPath', 'waves'], 'workflow descriptor');
  const descriptor: WorkflowDescriptor = {
    calibrationContextPath: externalPath(valueString(value, 'calibrationContextPath', 'calibration context path'), 'workflow calibration context'),
    sealedKeyPath: externalPath(valueString(value, 'sealedKeyPath', 'sealed calibration key path'), 'workflow sealed calibration key'),
    calibrationSubmissionPath: externalPath(valueString(value, 'calibrationSubmissionPath', 'calibration submission path'), 'workflow calibration submission'),
    journalPath: externalPath(valueString(value, 'journalPath', 'workflow journal path'), 'workflow journal'),
    waves: (() => {
      assert(Array.isArray(value.waves), 'workflow waves must be an array');
      const ids = new Set<string>();
      return value.waves.map((entry, index) => {
        exactKeys(entry, ['waveId', 'inputPath', 'reviewerOutputPath', 'controllerOutputPath'], `workflow wave ${index}`);
        const id = waveId(valueString(entry, 'waveId', `workflow wave ${index} ID`), `workflow wave ${index} ID`);
        assert(!ids.has(id), `workflow descriptor duplicates wave ID '${id}'`);
        ids.add(id);
        const reviewerOutputPath = externalPath(valueString(entry, 'reviewerOutputPath', `workflow wave ${id} reviewer output`), `workflow wave ${id} reviewer output`);
        const controllerOutputPath = externalPath(valueString(entry, 'controllerOutputPath', `workflow wave ${id} controller output`), `workflow wave ${id} controller output`);
        assert(!sameOrNested(reviewerOutputPath, controllerOutputPath) && !sameOrNested(controllerOutputPath, reviewerOutputPath), `workflow wave ${id} output directories must be distinct and non-nested`);
        return {
          waveId: id,
          inputPath: externalPath(valueString(entry, 'inputPath', `workflow wave ${id} input`), `workflow wave ${id} input`),
          reviewerOutputPath,
          controllerOutputPath,
        };
      });
    })(),
  };
  return descriptor;
}

function parseCalibrationArtifactPaths(value: unknown): CalibrationArtifactPaths {
  exactKeys(value, ['inputPath', 'reviewerBundlePath', 'controllerSidecarPath', 'contractPath'], 'workflow calibration context');
  return {
    inputPath: externalPath(valueString(value, 'inputPath', 'calibration input path'), 'workflow calibration input'),
    reviewerBundlePath: externalPath(valueString(value, 'reviewerBundlePath', 'calibration reviewer bundle path'), 'workflow calibration reviewer bundle'),
    controllerSidecarPath: externalPath(valueString(value, 'controllerSidecarPath', 'calibration controller sidecar path'), 'workflow calibration controller sidecar'),
    contractPath: externalPath(valueString(value, 'contractPath', 'calibration contract path'), 'workflow calibration contract'),
  };
}

function sameOrNested(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..' && !isAbsolute(pathFromParent));
}

function pathsOverlap(left: string, right: string): boolean {
  return sameOrNested(left, right) || sameOrNested(right, left);
}

interface NamedPath {
  readonly label: string;
  readonly path: string;
}

function assertDisjoint(left: NamedPath, right: NamedPath): void {
  assert(!pathsOverlap(left.path, right.path), `${left.label} must be disjoint from ${right.label}`);
}

function staticOutputRoots(loaded: LoadedWorkflow): readonly NamedPath[] {
  return [
    { label: 'workflow journal', path: loaded.descriptor.journalPath },
    ...loaded.descriptor.waves.flatMap((wave) => [
      { label: `workflow wave '${wave.waveId}' reviewer output`, path: wave.reviewerOutputPath },
      { label: `workflow wave '${wave.waveId}' controller output`, path: wave.controllerOutputPath },
    ]),
  ];
}

function reviewerRoots(loaded: LoadedWorkflow): readonly NamedPath[] {
  return [
    { label: 'calibration reviewer directory', path: dirname(loaded.calibrationArtifactPaths.reviewerBundlePath) },
    ...loaded.descriptor.waves.map((wave) => ({ label: `workflow wave '${wave.waveId}' reviewer output`, path: wave.reviewerOutputPath })),
  ];
}

function immutableContainerRoots(loaded: LoadedWorkflow): readonly NamedPath[] {
  return [
    ...staticOutputRoots(loaded),
    { label: 'calibration reviewer directory', path: dirname(loaded.calibrationArtifactPaths.reviewerBundlePath) },
    { label: 'calibration controller directory', path: dirname(loaded.calibrationArtifactPaths.controllerSidecarPath) },
  ];
}

function controllerSourcePaths(loaded: LoadedWorkflow): readonly NamedPath[] {
  return [
    { label: 'workflow descriptor', path: loaded.workflowDescriptorPath },
    { label: 'workflow calibration context', path: loaded.descriptor.calibrationContextPath },
    { label: 'workflow sealed calibration key', path: loaded.descriptor.sealedKeyPath },
    { label: 'workflow calibration submission', path: loaded.descriptor.calibrationSubmissionPath },
    { label: 'calibration input', path: loaded.calibrationArtifactPaths.inputPath },
    { label: 'calibration controller sidecar', path: loaded.calibrationArtifactPaths.controllerSidecarPath },
    { label: 'calibration contract', path: loaded.calibrationArtifactPaths.contractPath },
    ...loaded.descriptor.waves.map((wave) => ({ label: `workflow wave '${wave.waveId}' input`, path: wave.inputPath })),
  ];
}

/** Fences every long-lived destination before any journal or artifact mutation. */
function assertStaticPathIsolation(loaded: LoadedWorkflow): void {
  const outputs = staticOutputRoots(loaded);
  const reviewers = reviewerRoots(loaded);
  const controllerSources = controllerSourcePaths(loaded);
  for (let index = 0; index < outputs.length; index += 1) {
    for (let other = index + 1; other < outputs.length; other += 1) assertDisjoint(outputs[index], outputs[other]);
  }
  const calibrationReviewer = reviewers[0];
  for (const output of outputs) assertDisjoint(calibrationReviewer, output);
  const calibrationController = { label: 'calibration controller directory', path: dirname(loaded.calibrationArtifactPaths.controllerSidecarPath) };
  for (const output of outputs) assertDisjoint(calibrationController, output);
  for (const reviewer of reviewers) assertDisjoint(calibrationController, reviewer);
  for (const reviewer of reviewers) {
    for (const source of controllerSources) {
      assert(!sameOrNested(reviewer.path, source.path), `${reviewer.label} must not contain ${source.label}`);
    }
  }
  for (const output of outputs) {
    for (const source of controllerSources) {
      assert(!sameOrNested(output.path, source.path), `${output.label} must not contain ${source.label}`);
    }
  }
}

/** Fences one controller status file and an optional new reviewer subset. */
function assertCommandPathIsolation(loaded: LoadedWorkflow, statusOutput: string, subsetOutput: string | null): void {
  const status = { label: 'workflow status output', path: statusOutput };
  const immutableRoots = immutableContainerRoots(loaded);
  for (const root of immutableRoots) assertDisjoint(status, root);
  if (subsetOutput === null) return;
  const subset = { label: 'reviewer subset output', path: subsetOutput };
  assertDisjoint(subset, status);
  for (const root of immutableRoots) assertDisjoint(subset, root);
  for (const source of controllerSourcePaths(loaded)) {
    assert(!sameOrNested(subset.path, source.path), `${subset.label} must not contain ${source.label}`);
  }
}

/**
 * Fences a controller status file and any newly chosen subset against every
 * subset root recorded so far.  A later command must never write under an old
 * Reviewer B or Pass B export, even after that wave is finalized.
 */
function assertRecordedSubsetIsolation(
  loaded: LoadedWorkflow,
  statusOutput: string,
  subsetOutput: string | null,
  submissionPath: string | null,
  subsetRoots: readonly string[],
): void {
  const status = { label: 'workflow status output', path: statusOutput };
  for (const root of subsetRoots) assertDisjoint(status, { label: `recorded reviewer subset output '${root}'`, path: root });
  const permanentRoles: readonly NamedPath[] = [
    ...staticOutputRoots(loaded),
    { label: 'calibration reviewer directory', path: dirname(loaded.calibrationArtifactPaths.reviewerBundlePath) },
    { label: 'calibration controller directory', path: dirname(loaded.calibrationArtifactPaths.controllerSidecarPath) },
    ...controllerSourcePaths(loaded),
    ...(submissionPath === null ? [] : [{ label: 'workflow reviewer submission', path: submissionPath }]),
  ];
  for (const root of subsetRoots) {
    const recorded = { label: `recorded reviewer subset output '${root}'`, path: root };
    for (const role of permanentRoles) assertDisjoint(role, recorded);
  }
  if (subsetOutput === null) return;
  const subset = { label: 'reviewer subset output', path: subsetOutput };
  for (const root of subsetRoots) assertDisjoint(subset, { label: `recorded reviewer subset output '${root}'`, path: root });
}

function parseWaveInputs(descriptor: WorkflowDescriptor, authority: UnicodeReviewWorkflowCalibration['context']['authority']): ReadonlyMap<string, readonly ManifestEvidenceInput[]> {
  return new Map(descriptor.waves.map((wave) => {
    const parsed = parseControllerEvidenceInputs(readStrictExternalJson(wave.inputPath), authority);
    assert(parsed.every((input): input is ManifestEvidenceInput => input.purpose === 'manifest'), `workflow wave '${wave.waveId}' input must contain manifest items only`);
    return [wave.waveId, parsed] as const;
  }));
}

function loadWorkflow(descriptorPath: string): LoadedWorkflow {
  const workflowDescriptorPath = externalPath(descriptorPath, 'workflow descriptor');
  const descriptor = parseDescriptor(readStrictExternalJson(workflowDescriptorPath));
  const calibrationContext = readStrictExternalJson(descriptor.calibrationContextPath);
  const calibrationArtifactPaths = parseCalibrationArtifactPaths(calibrationContext);
  const context = loadReviewEvidenceContext(calibrationContext);
  const key = readStrictExternalJson(descriptor.sealedKeyPath) as UnicodeReviewWorkflowCalibration['key'];
  const submission = readStrictExternalJson(descriptor.calibrationSubmissionPath) as UnicodeReviewWorkflowCalibration['submission'];
  const issued = authorizeCalibration(context, key, submission);
  assert(issued.evaluation.pass && issued.authorization !== null && issued.replayBinding !== null, 'workflow requires a fresh calibration PASS from authorizeCalibration');
  const calibration = { context, key, submission };
  return { workflowDescriptorPath, descriptor, calibrationArtifactPaths, calibration, inputsByWave: parseWaveInputs(descriptor, context.authority) };
}

function findWave(descriptor: WorkflowDescriptor, id: string): WaveDescriptor {
  const wave = descriptor.waves.find((entry) => entry.waveId === id);
  assert(wave, `workflow descriptor has no wave '${id}'`);
  return wave;
}

function recursiveFiles(root: string): readonly string[] {
  const visit = (directory: string, prefix: string): string[] => readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    const stat = lstatSync(path);
    assert(!stat.isSymbolicLink(), `stored workflow output contains a symbolic link: ${path}`);
    const relativePath = prefix === '' ? name : `${prefix}/${name}`;
    if (stat.isDirectory()) {
      const files = visit(path, relativePath);
      assert(files.length > 0, `stored workflow output contains an unexpected empty directory: ${path}`);
      return files;
    }
    assert(stat.isFile(), `stored workflow output contains an unsupported file type: ${path}`);
    return [relativePath];
  });
  return visit(root, '');
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function encodedJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function assertExactFile(path: string, expected: Uint8Array, label: string): void {
  const actual = readStrictExternalBytes(path);
  assert(equalBytes(actual, expected), `${label} differs from replayed workflow artifacts`);
}

function assertPublishedWaveArtifacts(wave: WaveDescriptor, artifacts: UnicodeReviewWaveArtifacts): void {
  assert(existsSync(wave.reviewerOutputPath) && lstatSync(wave.reviewerOutputPath).isDirectory(), `workflow wave '${wave.waveId}' reviewer output is missing`);
  assert(existsSync(wave.controllerOutputPath) && lstatSync(wave.controllerOutputPath).isDirectory(), `workflow wave '${wave.waveId}' controller output is missing`);
  const expectedReviewerFiles = ['reviewer-bundle.json', ...artifacts.localPngs.keys()].sort();
  assert(JSON.stringify(recursiveFiles(wave.reviewerOutputPath)) === JSON.stringify(expectedReviewerFiles), `workflow wave '${wave.waveId}' reviewer output has an unexpected file set`);
  assert(JSON.stringify(recursiveFiles(wave.controllerOutputPath)) === JSON.stringify(['controller-sidecar.json']), `workflow wave '${wave.waveId}' controller output has an unexpected file set`);
  assertExactFile(join(wave.reviewerOutputPath, 'reviewer-bundle.json'), encodedJson(artifacts.reviewerBundle), `workflow wave '${wave.waveId}' reviewer bundle`);
  assertExactFile(join(wave.controllerOutputPath, 'controller-sidecar.json'), encodedJson(artifacts.controllerSidecar), `workflow wave '${wave.waveId}' controller sidecar`);
  for (const [relativePath, bytes] of artifacts.localPngs) assertExactFile(join(wave.reviewerOutputPath, relativePath), bytes, `workflow wave '${wave.waveId}' reviewer PNG '${relativePath}'`);
}

function outputsExist(wave: WaveDescriptor): { readonly reviewer: boolean; readonly controller: boolean } {
  return { reviewer: existsSync(wave.reviewerOutputPath), controller: existsSync(wave.controllerOutputPath) };
}

function publishWaveArtifacts(wave: WaveDescriptor, artifacts: UnicodeReviewWaveArtifacts): void {
  const existing = outputsExist(wave);
  assert(!existing.reviewer && !existing.controller, `workflow wave '${wave.waveId}' artifact outputs already exist or are partial; resume only publishes when both are absent`);
  writeExclusiveExternalOutputs({
    reviewer: {
      directory: wave.reviewerOutputPath,
      files: [
        { relativePath: 'reviewer-bundle.json', contents: `${JSON.stringify(artifacts.reviewerBundle, null, 2)}\n` },
        ...[...artifacts.localPngs].map(([relativePath, bytes]) => ({ relativePath, contents: bytes })),
      ],
    },
    controller: { directory: wave.controllerOutputPath, files: [{ relativePath: 'controller-sidecar.json', contents: `${JSON.stringify(artifacts.controllerSidecar, null, 2)}\n` }] },
  });
}

function verifyStoredWaves(loaded: LoadedWorkflow, state: UnicodeReviewWorkflowState, allowUnpublishedActiveWave: boolean): void {
  for (const recorded of state.waves) {
    const descriptor = findWave(loaded.descriptor, recorded.waveId);
    const existing = outputsExist(descriptor);
    const mayPublish = allowUnpublishedActiveWave && state.activeWave?.waveId === recorded.waveId && !existing.reviewer && !existing.controller;
    if (mayPublish) continue;
    assert(existing.reviewer === existing.controller, `workflow wave '${recorded.waveId}' artifact outputs are partial; preserve them and stop`);
    assert(existing.reviewer, `workflow wave '${recorded.waveId}' artifact outputs are missing; use resume only for the current pending wave`);
    assertPublishedWaveArtifacts(descriptor, recorded.artifacts);
  }
}

function status(action: Command, state: UnicodeReviewWorkflowState, promotions: readonly PromotionRecord[] = state.waves.flatMap((wave) => wave.promotions)): Record<string, unknown> {
  return {
    action,
    activeWaveId: state.activeWaveId,
    activeStage: state.activeWave?.stage ?? null,
    finalizedCandidateIds: state.finalizedCandidateIds,
    provisionalCandidateIds: state.provisionalCandidateIds,
    cleanInitialWaveStreak: state.cleanInitialWaveStreak,
    recordedWaves: state.waves.map((wave) => ({
      waveId: wave.waveId,
      terminalState: wave.terminalState,
      reviewerBundleChecksumSha256: wave.artifacts.controllerSidecar.reviewerBundleChecksumSha256,
      reviewerBSubsetOutputPath: wave.reviewerBSubsetOutputPath,
      passBSubsetOutputPath: wave.passBSubsetOutputPath,
    })),
    recordedSubsetRoots: state.subsetRoots,
    promotions,
  };
}

function parseArgs(args: readonly string[], allowed: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  const known = new Set(allowed);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    assert(flag.startsWith('--') && known.has(flag), `unknown argument ${flag}`);
    assert(!values.has(flag), `duplicate argument ${flag}`);
    const value = args[index + 1];
    assert(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), `missing ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  return values;
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  assert(value, `missing ${name}`);
  return value;
}

function writeStatus(output: string, action: Command, state: UnicodeReviewWorkflowState, promotions?: readonly PromotionRecord[]): void {
  writeExclusiveExternalJson(externalPath(output, 'workflow output'), promotions === undefined ? status(action, state) : status(action, state, promotions));
}

function preflightFreshExternalFile(path: string, label: string): string {
  const resolved = externalPath(path, label);
  assert(!existsSync(resolved), `${label} must not already exist`);
  assert(lstatSync(dirname(resolved)).isDirectory(), `${label} parent must be a directory`);
  return resolved;
}

function preflightFreshExternalDirectory(path: string, label: string): string {
  return preflightFreshExternalFile(path, label);
}

function preflightWaveArtifactOutputs(wave: WaveDescriptor): void {
  preflightFreshExternalDirectory(wave.reviewerOutputPath, `workflow wave '${wave.waveId}' reviewer output`);
  preflightFreshExternalDirectory(wave.controllerOutputPath, `workflow wave '${wave.waveId}' controller output`);
}

function subsetFiles(source: WaveDescriptor, artifacts: UnicodeReviewWaveArtifacts, refs: readonly string[]): ReadonlyMap<string, Uint8Array> {
  const selected = artifacts.reviewerBundle.items.filter((item) => refs.includes(item.pairRef));
  assert(selected.length === refs.length, 'reviewer subset references are not present in the stored reviewer bundle');
  const manifest = { protocolVersion: REVIEW_PROTOCOL_VERSION, items: selected };
  const files = new Map<string, Uint8Array>();
  files.set('reviewer-subset.json', encodedJson(manifest));
  for (const item of selected) {
    const bytes = artifacts.localPngs.get(item.pixelPath);
    assert(bytes, `reviewer subset '${item.pixelPath}' is absent from replayed workflow artifacts`);
    files.set(item.pixelPath, bytes);
  }
  return files;
}

function writeSubset(directory: string, files: ReadonlyMap<string, Uint8Array>): void {
  for (const [relativePath, contents] of files) {
    const destination = join(directory, relativePath);
    const parent = dirname(destination);
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
    const descriptor = openSync(destination, 'wx');
    try {
      writeFileSync(descriptor, contents);
    } finally {
      closeSync(descriptor);
    }
  }
}

function exportSubset(output: string, source: WaveDescriptor, artifacts: UnicodeReviewWaveArtifacts, refs: readonly string[]): void {
  const directory = preflightFreshExternalDirectory(output, 'reviewer subset output');
  const files = subsetFiles(source, artifacts, refs);
  mkdirSync(directory);
  writeSubset(directory, files);
}

/**
 * Verifies an already-exported recorded subset in place.  A partial directory,
 * an unexpected file, or drifted bytes fail closed without deleting anything,
 * so a resume can never overwrite or clean up a user's files.
 */
function assertExistingSubset(output: string, source: WaveDescriptor, artifacts: UnicodeReviewWaveArtifacts, refs: readonly string[]): void {
  const directory = externalPath(output, 'recorded reviewer subset output');
  const stats = lstatSync(directory);
  assert(stats.isDirectory() && !stats.isSymbolicLink(), 'recorded reviewer subset output must be a directory');
  const files = subsetFiles(source, artifacts, refs);
  const expectedFiles = [...files.keys()].sort();
  assert(JSON.stringify(recursiveFiles(directory)) === JSON.stringify(expectedFiles), 'recorded reviewer subset output is partial or has an unexpected file set');
  for (const [relativePath, contents] of files) assertExactFile(join(directory, relativePath), contents, `recorded reviewer subset '${relativePath}'`);
}

/**
 * Revalidates every persisted Reviewer B and Pass B export before a command
 * can append another workflow event.  Only resume may reconstruct its own
 * current missing export; all other missing or changed evidence is retained
 * for investigation.
 */
function verifyStoredSubsets(loaded: LoadedWorkflow, state: UnicodeReviewWorkflowState, allowAbsentCurrentResumable: boolean): void {
  const absentCurrentResumable = (waveId: string, stage: 'reviewer-b' | 'pass-b', root: string): boolean => {
    const active = state.activeWave;
    if (!allowAbsentCurrentResumable || active?.waveId !== waveId) return false;
    return stage === 'reviewer-b'
      ? active.stage === 'reviewer-b-pending' && active.reviewerBSubsetOutputPath === root
      : active.stage === 'pass-b-pending' && active.passBSubsetOutputPath === root;
  };
  for (const recorded of state.waves) {
    const descriptor = findWave(loaded.descriptor, recorded.waveId);
    const subsets: readonly { readonly stage: 'reviewer-b' | 'pass-b'; readonly root: string | null; readonly refs: readonly string[] | null }[] = [
      { stage: 'reviewer-b', root: recorded.reviewerBSubsetOutputPath, refs: recorded.reviewerBPreparedPairRefs },
      { stage: 'pass-b', root: recorded.passBSubsetOutputPath, refs: recorded.passBPreparedPairRefs },
    ];
    for (const subset of subsets) {
      assert((subset.root === null) === (subset.refs === null), `workflow wave '${recorded.waveId}' ${subset.stage} subset registration is incomplete`);
      if (subset.root === null || subset.refs === null) continue;
      if (!existsSync(subset.root)) {
        assert(absentCurrentResumable(recorded.waveId, subset.stage, subset.root), `workflow wave '${recorded.waveId}' ${subset.stage} subset output is missing; only resume may recreate the current pending subset`);
        continue;
      }
      assertExistingSubset(subset.root, descriptor, recorded.artifacts, subset.refs);
    }
  }
}

function run(command: Command, args: readonly string[]): void {
  const needsSubmission = command === 'ingest-a' || command === 'ingest-b' || command === 'ingest-pass-b';
  const needsWave = command === 'plan';
  const needsSubset = command === 'prepare-b' || command === 'prepare-pass-b';
  const values = parseArgs(args, ['--descriptor', '--output', ...(needsSubmission ? ['--submission'] : []), ...(needsWave ? ['--wave-id'] : []), ...(needsSubset || command === 'resume' ? ['--reviewer-output'] : [])]);
  const descriptorPath = required(values, '--descriptor');
  const output = preflightFreshExternalFile(required(values, '--output'), 'workflow output');
  const requestedSubsetOutput = values.has('--reviewer-output') ? externalPath(required(values, '--reviewer-output'), 'reviewer subset output') : null;
  const submissionPath = needsSubmission ? externalPath(required(values, '--submission'), 'workflow reviewer submission') : null;
  const loaded = loadWorkflow(descriptorPath);
  assertStaticPathIsolation(loaded);
  assertCommandPathIsolation(loaded, output, requestedSubsetOutput);
  if (command === 'recover') {
    let validatedState: UnicodeReviewWorkflowState | null = null;
    const recovered = recoverStoppedUnicodeReviewJournalWriter(loaded.descriptor.journalPath, {
      beforeCleanup: (journal) => {
        if (journal.events.length === 0) return;
        const state = readUnicodeReviewWorkflowFromJournal(journal, loaded.calibration, loaded.inputsByWave);
        // A plan event can commit before its paired external artifacts are
        // published.  Recovery only releases the stopped writer here; resume
        // remains responsible for publishing that one fully absent active pair.
        verifyStoredWaves(loaded, state, true);
        verifyStoredSubsets(loaded, state, true);
        assertRecordedSubsetIsolation(loaded, output, requestedSubsetOutput, null, state.subsetRoots);
        validatedState = state;
      },
    });
    const state = recovered.events.length === 0
      ? initializeUnicodeReviewWorkflow(loaded.descriptor.journalPath, loaded.calibration)
      : validatedState;
    assert(state !== null, 'recovery did not validate the stopped workflow journal');
    if (recovered.events.length === 0) {
      verifyStoredWaves(loaded, state, false);
      verifyStoredSubsets(loaded, state, false);
      assertRecordedSubsetIsolation(loaded, output, requestedSubsetOutput, null, state.subsetRoots);
    }
    writeStatus(output, command, state);
    return;
  }
  if (command === 'init') {
    const state = initializeUnicodeReviewWorkflow(loaded.descriptor.journalPath, loaded.calibration);
    writeStatus(output, command, state);
    return;
  }
  const before = readUnicodeReviewWorkflow(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave);
  const newSubsetOutput = command === 'prepare-b' || command === 'prepare-pass-b' ? requestedSubsetOutput : null;
  assertRecordedSubsetIsolation(loaded, output, newSubsetOutput, submissionPath, before.subsetRoots);
  verifyStoredWaves(loaded, before, command === 'resume');
  verifyStoredSubsets(loaded, before, command === 'resume');
  if (command === 'plan') {
    assert(before.activeWave === null, 'cannot plan while a wave is pending');
    const id = waveId(required(values, '--wave-id'), 'wave ID');
    assert(!before.waves.some((wave) => wave.waveId === id), `workflow wave '${id}' is already recorded`);
    const wave = findWave(loaded.descriptor, id);
    preflightWaveArtifactOutputs(wave);
    const artifacts = planUnicodeReviewWave(loaded.descriptor.journalPath, loaded.calibration, id, loaded.inputsByWave.get(id) ?? [], loaded.inputsByWave);
    publishWaveArtifacts(wave, artifacts);
    const state = readUnicodeReviewWorkflow(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave);
    verifyStoredWaves(loaded, state, false);
    verifyStoredSubsets(loaded, state, false);
    writeStatus(output, command, state);
    return;
  }
  if (command === 'resume') {
    if (before.activeWave !== null) {
      const wave = findWave(loaded.descriptor, before.activeWave.waveId);
      const existing = outputsExist(wave);
      if (!existing.reviewer && !existing.controller) publishWaveArtifacts(wave, before.activeWave.artifacts);
      const subsetStage = before.activeWave.stage === 'reviewer-b-pending' ? 'reviewer-b'
        : before.activeWave.stage === 'pass-b-pending' ? 'pass-b' : null;
      if (subsetStage !== null) {
        const recordedSubsetOutput = subsetStage === 'reviewer-b' ? before.activeWave.reviewerBSubsetOutputPath : before.activeWave.passBSubsetOutputPath;
        assert(recordedSubsetOutput, `resume requires a recorded ${before.activeWave.stage} subset output path`);
        if (values.has('--reviewer-output')) {
          assert(requestedSubsetOutput === recordedSubsetOutput, 'resume --reviewer-output must match the recorded reviewer subset output path');
        }
        const exportedRefs = subsetStage === 'pass-b'
          ? before.activeWave.passBPreparedPairRefs
          : before.activeWave.reviewerBPreparedPairRefs;
        assert(exportedRefs !== null, `resume requires recorded ${subsetStage} subset refs`);
        if (existsSync(recordedSubsetOutput)) {
          assertExistingSubset(recordedSubsetOutput, wave, before.activeWave.artifacts, exportedRefs);
        } else {
          exportSubset(recordedSubsetOutput, wave, before.activeWave.artifacts, exportedRefs);
        }
      } else {
        assert(!values.has('--reviewer-output'), '--reviewer-output is only valid while Reviewer B or Pass B refs are pending');
      }
    }
    const state = readUnicodeReviewWorkflow(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave);
    verifyStoredWaves(loaded, state, false);
    verifyStoredSubsets(loaded, state, false);
    writeStatus(output, command, state);
    return;
  }
  if (command === 'ingest-a') {
    ingestUnicodeReviewWaveA(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave, readStrictExternalJson(submissionPath as string) as VisionClassificationSubmission);
    const state = readUnicodeReviewWorkflow(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave);
    verifyStoredWaves(loaded, state, false);
    verifyStoredSubsets(loaded, state, false);
    writeStatus(output, command, state);
    if (before.activeWave !== null && state.waves.find((wave) => wave.waveId === before.activeWave!.waveId)?.terminalState === 'invalidated') process.exitCode = 1;
    return;
  } else if (command === 'prepare-b') {
    assert(requestedSubsetOutput, 'prepare-b requires --reviewer-output');
    preflightFreshExternalDirectory(requestedSubsetOutput, 'reviewer subset output');
    const refs = prepareUnicodeReviewWaveB(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave, requestedSubsetOutput);
    assert(before.activeWave !== null, 'Reviewer B preparation has no active wave');
    exportSubset(requestedSubsetOutput, findWave(loaded.descriptor, before.activeWave.waveId), before.activeWave.artifacts, refs);
  } else if (command === 'ingest-b') {
    const submission = readStrictExternalJson(submissionPath as string);
    ingestUnicodeReviewWaveB(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave, submission as VisionClassificationSubmission | null);
  } else if (command === 'prepare-pass-b') {
    assert(requestedSubsetOutput, 'prepare-pass-b requires --reviewer-output');
    preflightFreshExternalDirectory(requestedSubsetOutput, 'reviewer subset output');
    const refs = prepareUnicodeReviewWavePassB(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave, requestedSubsetOutput);
    assert(before.activeWave !== null, 'Pass B preparation has no active wave');
    exportSubset(requestedSubsetOutput, findWave(loaded.descriptor, before.activeWave.waveId), before.activeWave.artifacts, refs);
  } else if (command === 'ingest-pass-b') {
    ingestUnicodeReviewWavePassB(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave, readStrictExternalJson(submissionPath as string) as VisionPassBSubmission);
  } else if (command === 'finalize') {
    const promotions = finalizeUnicodeReviewWave(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave);
    const state = readUnicodeReviewWorkflow(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave);
    verifyStoredWaves(loaded, state, false);
    verifyStoredSubsets(loaded, state, false);
    writeStatus(output, command, state, promotions);
    return;
  } else {
    throw new Error(`unsupported workflow command ${command}`);
  }
  const state = readUnicodeReviewWorkflow(loaded.descriptor.journalPath, loaded.calibration, loaded.inputsByWave);
  verifyStoredWaves(loaded, state, false);
  verifyStoredSubsets(loaded, state, false);
  writeStatus(output, command, state);
}

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  const supported: readonly Command[] = ['init', 'plan', 'resume', 'ingest-a', 'prepare-b', 'ingest-b', 'prepare-pass-b', 'ingest-pass-b', 'finalize', 'recover'];
  assert(supported.includes(command as Command), `Usage: node scripts/run_unicode_review_workflow_v021.ts <${supported.join('|')}> --descriptor EXTERNAL_DESCRIPTOR --output FRESH_EXTERNAL_JSON (${REVIEW_PROTOCOL_VERSION})`);
  run(command as Command, args);
}

const entryPoint = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : undefined;
if (entryPoint === import.meta.url) main();
