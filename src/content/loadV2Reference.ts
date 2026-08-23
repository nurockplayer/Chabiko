import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import referenceData from '../../data/v2-reference/reference.json' assert { type: 'json' };
import { loadLessonById } from './loadLessons';
import { parseWebpDimensions } from './webpDimensions';

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function isContainedPath(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot.length > 0 &&
    pathFromRoot !== '..' &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

export function validateV2ReferenceScene(
  scene: typeof referenceData.scene,
  publicRoot = resolve(process.cwd(), 'public'),
): void {
  if (!scene.assetPath.startsWith('/assets/v2-reference/')) {
    throw new Error('V2 reference scene must stay inside /assets/v2-reference/');
  }

  const assetRoot = resolve(publicRoot, 'assets/v2-reference');
  const assetPath = resolve(publicRoot, scene.assetPath.slice(1));
  if (!isContainedPath(assetRoot, assetPath)) {
    throw new Error('V2 reference scene must stay inside /assets/v2-reference/');
  }

  const canonicalAssetRoot = realpathSync(assetRoot);
  const canonicalAssetPath = realpathSync(assetPath);
  if (!isContainedPath(canonicalAssetRoot, canonicalAssetPath)) {
    throw new Error('V2 reference scene must stay inside /assets/v2-reference/');
  }

  const bytes = readFileSync(canonicalAssetPath);
  const dimensions = parseWebpDimensions(bytes);
  const size = statSync(canonicalAssetPath).size;

  if (sha256(bytes) !== scene.assetChecksumSha256) {
    throw new Error('V2 reference scene checksum does not match provenance metadata');
  }
  if (size !== scene.fileSizeBytes) {
    throw new Error('V2 reference scene file size does not match provenance metadata');
  }
  if (dimensions.width !== scene.width || dimensions.height !== scene.height) {
    throw new Error('V2 reference scene dimensions do not match provenance metadata');
  }
  if (
    sha256(scene.provenance.prompt) !==
    scene.provenance.promptDigestSha256
  ) {
    throw new Error('V2 reference scene prompt digest does not match provenance metadata');
  }
  if (
    scene.provenance.source !== 'openai-built-in-image-generation' ||
    scene.provenance.allowedUse !== 'chabiko-v2-reference-only' ||
    scene.provenance.publicWebDisplay !== true ||
    scene.provenance.attributionRequired !== false
  ) {
    throw new Error('V2 reference scene rights metadata is not eligible for this route');
  }
}

export function loadV2Reference() {
  if (referenceData.schemaVersion !== 1) {
    throw new Error('Unsupported V2 reference schema version');
  }

  const lesson = loadLessonById(referenceData.sourceLessonId);
  if (!lesson || lesson.reviewStatus !== 'reviewed') {
    throw new Error('V2 reference requires the reviewed source lesson');
  }

  const tokenIds = referenceData.retrieval.tokens.map((token) => token.id);
  const initialIds = referenceData.retrieval.initialOrder;
  const correctIds = referenceData.retrieval.correctOrder;
  const sortedIds = [...tokenIds].sort();
  if (
    new Set(tokenIds).size !== tokenIds.length ||
    JSON.stringify([...initialIds].sort()) !== JSON.stringify(sortedIds) ||
    JSON.stringify([...correctIds].sort()) !== JSON.stringify(sortedIds)
  ) {
    throw new Error('V2 reference retrieval token orders are inconsistent');
  }

  const tokenById = new Map(
    referenceData.retrieval.tokens.map((token) => [token.id, token]),
  );
  const configuredAnswer = correctIds
    .map((id) => tokenById.get(id)?.text ?? '')
    .join('');
  if (configuredAnswer !== lesson.coreSentence) {
    throw new Error('V2 reference answer must match the reviewed lesson core sentence');
  }

  const coreExample = lesson.examples?.find(
    (example) =>
      example.traditional === lesson.coreSentence &&
      typeof example.pinyin === 'string' &&
      example.pinyin.length > 0,
  );
  if (!coreExample) {
    throw new Error('V2 reference requires a reviewed core example with pinyin');
  }

  validateV2ReferenceScene(referenceData.scene);

  return {
    ...referenceData,
    lesson,
    coreExample,
  };
}

export function buildSafeV2RetrievalPayload() {
  const reference = loadV2Reference();
  const tokenById = new Map(
    reference.retrieval.tokens.map((token) => [token.id, token]),
  );

  return {
    promptJa: reference.retrieval.promptJa,
    tokens: reference.retrieval.initialOrder.map((id) => {
      const token = tokenById.get(id);
      if (!token) throw new Error(`Unknown V2 reference token '${id}'`);
      return { id: token.id, text: token.text };
    }),
  };
}
