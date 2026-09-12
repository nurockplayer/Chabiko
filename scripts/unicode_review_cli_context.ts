import { dirname, join } from 'node:path';
import {
  REVIEW_PROTOCOL_VERSION,
  loadCanonicalEvidenceAuthority,
  validateAuthoritativeBlindEvidenceArtifacts,
  validateBlindEvidenceArtifacts,
  validateReviewerBundle,
  type ControllerEvidenceInput,
  type ControllerSidecar,
  type EvidenceAuthority,
  type ReviewContractBinding,
  type ReviewEvidenceContext,
  type ReviewerBundle,
} from './unicode_review_v021.ts';
import { decodePinnedGlyphPng } from './unicode_review_pixels.ts';
import {
  readStrictExternalBytes,
  readStrictExternalJson,
  resolveStrictExternalPath,
  resolveUnicodeReviewRepositoryRoot,
} from './unicode_review_external_io.ts';

/** JSON-serializable controller descriptor. Every path is an external input. */
export interface ReviewEvidenceContextDescriptor {
  readonly inputPath: string;
  readonly reviewerBundlePath: string;
  readonly controllerSidecarPath: string;
  readonly contractPath: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function assertOpaqueId(value: unknown, label: string): asserts value is string {
  assert(typeof value === 'string' && value.length > 0 && value.length <= 256, `${label} is required`);
}

function inputString(value: Record<string, unknown>, key: string, label: string): string {
  const result = value[key];
  assert(typeof result === 'string' && result.length > 0, `${label} is required`);
  return result;
}

function authoritativeCandidate(authority: EvidenceAuthority, candidateId: string) {
  const candidate = authority.candidates.find((item) => item.candidateId === candidateId);
  assert(candidate, `candidate '${candidateId}' is absent from the authoritative #262 manifest and plan`);
  return candidate;
}

function authoritativeGlyph(authority: EvidenceAuthority, glyphRef: string) {
  const glyph = authority.glyphs.find((item) => item.glyphRef === glyphRef);
  assert(glyph, `glyph '${glyphRef}' is absent from the authoritative #262 rendering manifest`);
  return glyph;
}

function decodeExternalGlyph(path: string, expectedDerivativeSha256: string, label: string): Uint8Array {
  const externalPath = resolveStrictExternalPath(path, label);
  return decodePinnedGlyphPng(readStrictExternalBytes(externalPath), expectedDerivativeSha256);
}

/**
 * Converts controller-only references and original pinned glyph PNGs into the
 * raw inputs that must be revalidated before an existing bundle is trusted.
 */
export function parseControllerEvidenceInputs(value: unknown, authority: EvidenceAuthority): ControllerEvidenceInput[] {
  assertExactKeys(value, ['items'], 'bundle input');
  assert(Array.isArray(value.items) && value.items.length > 0, 'bundle input requires items');
  const manifestIds = new Set<string>();
  const controlIds = new Set<string>();
  return value.items.map((item, index) => {
    assert(isRecord(item), `bundle input item ${index} must be an object`);
    const purpose = item.purpose;
    if (purpose === 'manifest') {
      assertExactKeys(item, ['purpose', 'candidateId', 'leftGlyphPngPath', 'rightGlyphPngPath'], `bundle input item ${index}`);
      const candidateId = inputString(item, 'candidateId', 'candidate ID');
      assertOpaqueId(candidateId, 'candidate ID');
      assert(!manifestIds.has(candidateId), `bundle input contains duplicate manifest candidate '${candidateId}'`);
      manifestIds.add(candidateId);
      const candidate = authoritativeCandidate(authority, candidateId);
      return {
        purpose,
        candidateId,
        leftGrayscale: decodeExternalGlyph(inputString(item, 'leftGlyphPngPath', 'left glyph PNG path'), candidate.leftDerivativeSha256, 'left glyph PNG path'),
        rightGrayscale: decodeExternalGlyph(inputString(item, 'rightGlyphPngPath', 'right glyph PNG path'), candidate.rightDerivativeSha256, 'right glyph PNG path'),
      };
    }
    assert(purpose === 'external-control', `bundle input item ${index} has unsupported purpose`);
    assertExactKeys(item, ['purpose', 'controllerControlId', 'leftGlyphRef', 'rightGlyphRef', 'leftGlyphPngPath', 'rightGlyphPngPath'], `bundle input item ${index}`);
    const controllerControlId = inputString(item, 'controllerControlId', 'controller control ID');
    const leftGlyphRef = inputString(item, 'leftGlyphRef', 'left glyph reference');
    const rightGlyphRef = inputString(item, 'rightGlyphRef', 'right glyph reference');
    assertOpaqueId(controllerControlId, 'controller control ID');
    assertOpaqueId(leftGlyphRef, 'left glyph reference');
    assertOpaqueId(rightGlyphRef, 'right glyph reference');
    assert(!controlIds.has(controllerControlId), `bundle input contains duplicate external control '${controllerControlId}'`);
    controlIds.add(controllerControlId);
    const left = authoritativeGlyph(authority, leftGlyphRef);
    const right = authoritativeGlyph(authority, rightGlyphRef);
    return {
      purpose,
      controllerControlId,
      leftGlyphRef,
      rightGlyphRef,
      leftGrayscale: decodeExternalGlyph(inputString(item, 'leftGlyphPngPath', 'left glyph PNG path'), left.derivativeSha256, 'left glyph PNG path'),
      rightGrayscale: decodeExternalGlyph(inputString(item, 'rightGlyphPngPath', 'right glyph PNG path'), right.derivativeSha256, 'right glyph PNG path'),
    };
  });
}

function parseContextDescriptor(value: unknown): ReviewEvidenceContextDescriptor {
  assertExactKeys(value, ['inputPath', 'reviewerBundlePath', 'controllerSidecarPath', 'contractPath'], 'review evidence context descriptor');
  return {
    inputPath: inputString(value, 'inputPath', 'context input path'),
    reviewerBundlePath: inputString(value, 'reviewerBundlePath', 'context reviewer bundle path'),
    controllerSidecarPath: inputString(value, 'controllerSidecarPath', 'context controller sidecar path'),
    contractPath: inputString(value, 'contractPath', 'context contract path'),
  };
}

function parseReviewContract(value: unknown): ReviewContractBinding {
  assertExactKeys(value, ['rubricVersion', 'promptChecksumSha256', 'renderingEvidenceChecksumSha256', 'reviewerModelVersion', 'transportContractChecksumSha256', 'visionCapabilityEvidenceRef'], 'review contract');
  assert(value.rubricVersion === REVIEW_PROTOCOL_VERSION, 'review contract rubric version is stale');
  assertSha256(value.promptChecksumSha256, 'review contract prompt checksum');
  assertSha256(value.renderingEvidenceChecksumSha256, 'review contract rendering evidence checksum');
  assertOpaqueId(value.reviewerModelVersion, 'review contract reviewer model/version');
  assertSha256(value.transportContractChecksumSha256, 'review contract transport checksum');
  assertOpaqueId(value.visionCapabilityEvidenceRef, 'review contract vision capability evidence reference');
  return {
    rubricVersion: value.rubricVersion,
    promptChecksumSha256: value.promptChecksumSha256,
    renderingEvidenceChecksumSha256: value.renderingEvidenceChecksumSha256,
    reviewerModelVersion: value.reviewerModelVersion,
    transportContractChecksumSha256: value.transportContractChecksumSha256,
    visionCapabilityEvidenceRef: value.visionCapabilityEvidenceRef,
  };
}

/**
 * Loads a prior controller/reviewer artifact set without rebuilding it. The
 * returned context is trusted only after raw original inputs, stored JSON, and
 * stored reviewer PNGs all rebind to current canonical #262 authority.
 */
export function loadReviewEvidenceContext(descriptorValue: unknown): ReviewEvidenceContext {
  const descriptor = parseContextDescriptor(descriptorValue);
  const inputPath = resolveStrictExternalPath(descriptor.inputPath, 'context input');
  const reviewerBundlePath = resolveStrictExternalPath(descriptor.reviewerBundlePath, 'context reviewer bundle');
  const controllerSidecarPath = resolveStrictExternalPath(descriptor.controllerSidecarPath, 'context controller sidecar');
  const contractPath = resolveStrictExternalPath(descriptor.contractPath, 'context review contract');
  const authority = loadCanonicalEvidenceAuthority(resolveUnicodeReviewRepositoryRoot());
  const inputs = parseControllerEvidenceInputs(readStrictExternalJson(inputPath), authority);
  const rawBundle = readStrictExternalJson(reviewerBundlePath);
  const rawSidecar = readStrictExternalJson(controllerSidecarPath);
  const contract = parseReviewContract(readStrictExternalJson(contractPath));
  validateReviewerBundle(rawBundle);
  validateBlindEvidenceArtifacts(rawBundle, rawSidecar);
  const bundle = rawBundle as ReviewerBundle;
  const sidecar = rawSidecar as ControllerSidecar;
  const reviewerDirectory = dirname(reviewerBundlePath);
  const localPngs = new Map<string, Uint8Array>();
  for (const item of bundle.items) {
    const pixelPath = resolveStrictExternalPath(join(reviewerDirectory, item.pixelPath), `stored reviewer PNG '${item.pixelPath}'`);
    localPngs.set(item.pixelPath, readStrictExternalBytes(pixelPath));
  }
  validateAuthoritativeBlindEvidenceArtifacts(authority, bundle, sidecar, inputs, localPngs);
  assert(contract.renderingEvidenceChecksumSha256 === authority.renderingEvidenceChecksumSha256, 'review contract rendering evidence is stale');
  return { authority, bundle, sidecar, inputs, localPngs, contract };
}
