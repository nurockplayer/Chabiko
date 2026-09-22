import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  REVIEW_PROTOCOL_VERSION,
  authorizeCalibration,
  buildBlindEvidenceArtifacts,
  loadCanonicalEvidenceAuthority,
  type CalibrationEvaluation,
  type CalibrationReplayBinding,
  type SealedCalibrationKey,
  type VisionClassificationSubmission,
} from './unicode_review_v021.ts';
import { loadReviewEvidenceContext, parseControllerEvidenceInputs, pathsOverlap, resolveReviewEvidenceContextPaths } from './unicode_review_cli_context.ts';
import {
  readStrictExternalJson,
  resolveUnicodeReviewRepositoryRoot,
  resolveStrictExternalPath,
  writeExclusiveExternalJson,
  writeExclusiveExternalOutputs,
} from './unicode_review_external_io.ts';
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), `${label} must be a lowercase SHA-256`);
}

function parseBundleArguments(args: readonly string[]): { input: string; reviewerOutput: string; controllerOutput: string; namespaceSalt?: string } {
  const allowed = new Set(['--input', '--reviewer-output', '--controller-output', '--namespace-salt']);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    assert(flag.startsWith('--') && allowed.has(flag), `unknown argument ${flag}`);
    assert(!values.has(flag), `duplicate argument ${flag}`);
    const value = args[index + 1];
    assert(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), `missing ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  const input = values.get('--input');
  const reviewerOutput = values.get('--reviewer-output');
  const controllerOutput = values.get('--controller-output');
  assert(input, 'missing --input');
  assert(reviewerOutput, 'missing --reviewer-output');
  assert(controllerOutput, 'missing --controller-output');
  const namespaceSalt = values.get('--namespace-salt');
  if (namespaceSalt !== undefined) assertSha256(namespaceSalt, 'namespace salt');
  return { input, reviewerOutput, controllerOutput, namespaceSalt };
}

function isSameOrNested(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..' && !isAbsolute(pathFromParent));
}

function runBundle(args: readonly string[]): void {
  const options = parseBundleArguments(args);
  const repositoryRoot = resolveUnicodeReviewRepositoryRoot();
  const inputPath = resolveStrictExternalPath(options.input, 'bundle input');
  const reviewerOutput = resolveStrictExternalPath(options.reviewerOutput, 'reviewer output directory');
  const controllerOutput = resolveStrictExternalPath(options.controllerOutput, 'controller output directory');
  assert(
    !isSameOrNested(reviewerOutput, controllerOutput) && !isSameOrNested(controllerOutput, reviewerOutput),
    'reviewer and controller output directories must be distinct and non-nested',
  );
  assert(
    !isSameOrNested(reviewerOutput, inputPath) && !isSameOrNested(controllerOutput, inputPath),
    'bundle input must not be nested in an output directory',
  );
  const authority = loadCanonicalEvidenceAuthority(repositoryRoot);
  const input = readStrictExternalJson(inputPath);
  const inputs = parseControllerEvidenceInputs(input, authority);
  const artifacts = buildBlindEvidenceArtifacts(inputs, options.namespaceSalt, repositoryRoot);
  writeExclusiveExternalOutputs({
    reviewer: {
      directory: reviewerOutput,
      files: [
        { relativePath: 'reviewer-bundle.json', contents: `${JSON.stringify(artifacts.reviewerBundle, null, 2)}\n` },
        ...[...artifacts.localPngs].map(([relativePath, bytes]) => ({ relativePath, contents: bytes })),
      ],
    },
    controller: {
      directory: controllerOutput,
      files: [{ relativePath: 'controller-sidecar.json', contents: `${JSON.stringify(artifacts.controllerSidecar, null, 2)}\n` }],
    },
  });
  process.stdout.write(`Created ${artifacts.reviewerBundle.items.length} opaque reviewer items under external outputs.\n`);
}

interface UnavailableCalibrationEvaluation {
  readonly pass: false;
  readonly reasons: readonly string[];
  readonly metrics: {
    readonly evaluated: false;
    readonly strongPositiveExact: null;
    readonly strongNegativeExact: null;
    readonly strongNegativeConfusable: null;
    readonly relationLeakageCount: null;
    readonly confusionMatrix: null;
    readonly rawAgreement: null;
  };
  readonly hardProbeProductionOutcomes: Readonly<Record<string, never>>;
  readonly hardProbeCandidateOverrides: readonly never[];
  /** The evaluator did not run, so no verifiable result checksum exists. */
  readonly calibrationResultChecksumSha256: null;
}

interface CalibrationCommandOutput {
  readonly evaluation: CalibrationEvaluation | UnavailableCalibrationEvaluation;
  /** Replay evidence only; this is never an authorization capability. */
  readonly replayBinding: CalibrationReplayBinding | null;
}

function parseCalibrationArguments(args: readonly string[]): { context: string; sealedKey: string; submission: string; output: string } {
  const allowed = new Set(['--context', '--sealed-key', '--submission', '--output']);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    assert(flag.startsWith('--') && allowed.has(flag), `unknown argument ${flag}`);
    assert(!values.has(flag), `duplicate argument ${flag}`);
    const value = args[index + 1];
    assert(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), `missing ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  const context = values.get('--context');
  const sealedKey = values.get('--sealed-key');
  const submission = values.get('--submission');
  const output = values.get('--output');
  assert(context, 'missing --context');
  assert(sealedKey, 'missing --sealed-key');
  assert(submission, 'missing --submission');
  assert(output, 'missing --output');
  return { context, sealedKey, submission, output };
}

function unavailableCalibrationEvaluation(error: unknown): UnavailableCalibrationEvaluation {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    pass: false,
    reasons: [reason],
    metrics: {
      evaluated: false,
      strongPositiveExact: null,
      strongNegativeExact: null,
      strongNegativeConfusable: null,
      relationLeakageCount: null,
      confusionMatrix: null,
      rawAgreement: null,
    },
    hardProbeProductionOutcomes: {},
    hardProbeCandidateOverrides: [],
    calibrationResultChecksumSha256: null,
  };
}

/** Raised when the calibration output itself would enter a controller-only or blind path. */
class ForbiddenCalibrationOutputError extends Error {}

function assertCalibrationOutputIsolation(
  outputPath: string,
  roles: readonly { readonly label: string; readonly path: string }[],
): void {
  for (const role of roles) {
    if (pathsOverlap(outputPath, role.path)) {
      throw new ForbiddenCalibrationOutputError(`calibration output must be disjoint from the ${role.label}`);
    }
  }
}

function assertControllerRolesOutsideReviewerTree(
  reviewerDirectory: string,
  roles: readonly { readonly label: string; readonly path: string }[],
): void {
  for (const role of roles) {
    assert(!pathsOverlap(reviewerDirectory, role.path), `${role.label} must be disjoint from the reviewer bundle tree`);
  }
}

interface CalibrationPathPreflight {
  readonly descriptor: unknown;
  readonly sealedKeyPath: string;
  readonly submissionPath: string;
}

/**
 * Proves every role path and the publication destination are disjoint before
 * calibration can publish either a PASS or a machine FAIL record.  A resolver
 * failure is deliberately not an evaluable calibration failure: its paths have
 * not been proven safe for output publication.
 */
function preflightCalibrationPublication(options: { readonly context: string; readonly sealedKey: string; readonly submission: string }, outputPath: string): CalibrationPathPreflight {
  const descriptor = readStrictExternalJson(resolveStrictExternalPath(options.context, 'calibration context'));
  const paths = resolveReviewEvidenceContextPaths(descriptor);
  const sealedKeyPath = resolveStrictExternalPath(options.sealedKey, 'sealed calibration key');
  const submissionPath = resolveStrictExternalPath(options.submission, 'calibration submission');
  assertCalibrationOutputIsolation(outputPath, [
    { label: 'calibration context input', path: paths.inputPath },
    { label: 'reviewer bundle path', path: paths.reviewerBundlePath },
    { label: 'reviewer bundle tree', path: paths.reviewerDirectory },
    { label: 'controller artifact directory', path: dirname(paths.controllerSidecarPath) },
    { label: 'context review contract', path: paths.contractPath },
    { label: 'sealed calibration key', path: sealedKeyPath },
    { label: 'calibration submission', path: submissionPath },
  ]);
  assertControllerRolesOutsideReviewerTree(paths.reviewerDirectory, [
    { label: 'context input', path: paths.inputPath },
    { label: 'context controller sidecar', path: paths.controllerSidecarPath },
    { label: 'context review contract', path: paths.contractPath },
    { label: 'sealed calibration key', path: sealedKeyPath },
    { label: 'calibration submission', path: submissionPath },
  ]);
  return { descriptor, sealedKeyPath, submissionPath };
}

function runCalibration(args: readonly string[]): void {
  const options = parseCalibrationArguments(args);
  const outputPath = resolveStrictExternalPath(options.output, 'calibration output');
  const preflight = preflightCalibrationPublication(options, outputPath);
  let output: CalibrationCommandOutput;
  try {
    const context = loadReviewEvidenceContext(preflight.descriptor);
    const key = readStrictExternalJson(preflight.sealedKeyPath) as SealedCalibrationKey;
    const submission = readStrictExternalJson(preflight.submissionPath) as VisionClassificationSubmission;
    const authorized = authorizeCalibration(context, key, submission);
    output = { evaluation: authorized.evaluation, replayBinding: authorized.replayBinding };
  } catch (error) {
    if (error instanceof ForbiddenCalibrationOutputError) throw error;
    output = { evaluation: unavailableCalibrationEvaluation(error), replayBinding: null };
  }
  writeExclusiveExternalJson(outputPath, output);
  process.stdout.write(`Calibration ${output.evaluation.pass ? 'PASS' : 'FAIL'}; no production wave was started.\n`);
  if (!output.evaluation.pass) process.exitCode = 1;
}

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'bundle') return runBundle(args);
  if (command === 'calibrate') return runCalibration(args);
  throw new Error(`Usage: node scripts/run_unicode_review_v021.ts <bundle|calibrate> ... (${REVIEW_PROTOCOL_VERSION})`);
}

const entryPoint = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : undefined;
if (entryPoint === import.meta.url) main();
