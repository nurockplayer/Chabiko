import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sequenceSignature } from '../domain/v2ReferenceFlow';
import { loadLessonById } from './loadLessons';

const DEFAULT_METADATA_PATH = 'data/v2-reference/lesson-001.json';

interface V2ReferenceChunk {
  id: string;
  text: string;
}

interface V2ReferenceSceneProvenance {
  kind: 'ai-generated';
  generator: string;
  sourceArtifactId: string;
  generatedOn: string;
  transform: string;
  rightsStatus: string;
  allowedUse: 'isolated-v2-reference-only';
  reviewStatus: 'reference-only';
}

interface V2ReferenceMetadata {
  version: 1;
  lessonId: string;
  today: {
    titleJa: string;
    contextJa: string;
    primaryActionJa: string;
  };
  scene: {
    src: string;
    width: number;
    height: number;
    altJa: string;
    locationJa: string;
    provenance: V2ReferenceSceneProvenance;
  };
  audio: {
    kind: 'device-speech-synthesis';
    lang: 'zh-TW';
    labelJa: string;
    unavailableJa: string;
    reviewStatus: 'reference-only';
    productionReplacement: 'reviewed-static-zh-TW-audio-required';
  };
  retrieval: {
    promptJa: string;
    contextJa: string;
    hintJa: string;
    chunks: V2ReferenceChunk[];
    initialOrder: string[];
    answerOrder: string[];
  };
  result: {
    headingJa: string;
  };
}

export interface V2ReferenceContent extends V2ReferenceMetadata {
  reviewStatus: string;
  canDoJa: string;
  learnerOutcomeJa: string;
  phrase: string;
  pinyin: string;
  meaningJa: string;
  lessonChunks: Array<{
    chunk: string;
    meaning: string;
    notesJa?: string;
  }>;
  soundFocus: Array<{
    item: string;
    noteJa: string;
  }>;
}

export interface V2ReferenceBootstrap {
  version: 1;
  lessonId: string;
  today: V2ReferenceMetadata['today'] & {
    phrase: string;
    pinyin: string;
    meaningJa: string;
    scene: V2ReferenceMetadata['scene'];
  };
  learning: {
    phrase: string;
    pinyin: string;
    meaningJa: string;
    canDoJa: string;
    learnerOutcomeJa: string;
    lessonChunks: V2ReferenceContent['lessonChunks'];
    soundFocus: V2ReferenceContent['soundFocus'];
    scene: V2ReferenceMetadata['scene'];
    audio: V2ReferenceMetadata['audio'];
  };
  retrieval: {
    promptJa: string;
    contextJa: string;
    hintJa: string;
    chunks: V2ReferenceChunk[];
    answerSignature: string;
    answerSource: string;
  };
  result: V2ReferenceMetadata['result'] & {
    canDoJa: string;
    phrase: string;
    pinyin: string;
    meaningJa: string;
  };
}

export interface V2ReferenceAnswerPayload {
  version: 1;
  lessonId: string;
  chunks: V2ReferenceChunk[];
  phrase: string;
  pinyin: string;
  meaningJa: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertNonEmptyStrings(
  value: Record<string, unknown>,
  fields: readonly string[],
  label: string,
): void {
  for (const field of fields) {
    if (!isNonEmptyString(value[field])) {
      throw new Error(`${label}.${field} must be a non-empty string`);
    }
  }
}

function parseMetadata(raw: string, path: string): V2ReferenceMetadata {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid V2 reference metadata JSON at ${path}`);
  }
  if (!isRecord(value) || value.version !== 1 || !isNonEmptyString(value.lessonId)) {
    throw new Error('V2 reference metadata must use version 1 and a lessonId');
  }

  const today = value.today;
  const scene = value.scene;
  const audio = value.audio;
  const retrieval = value.retrieval;
  const result = value.result;
  if (!isRecord(today)) throw new Error('today metadata is required');
  if (!isRecord(scene)) throw new Error('scene metadata is required');
  if (!isRecord(audio)) throw new Error('audio metadata is required');
  if (!isRecord(retrieval)) throw new Error('retrieval metadata is required');
  if (!isRecord(result)) throw new Error('result metadata is required');

  assertNonEmptyStrings(today, ['titleJa', 'contextJa', 'primaryActionJa'], 'today');
  assertNonEmptyStrings(scene, ['src', 'altJa', 'locationJa'], 'scene');
  assertNonEmptyStrings(
    audio,
    ['kind', 'lang', 'labelJa', 'unavailableJa', 'reviewStatus', 'productionReplacement'],
    'audio',
  );
  assertNonEmptyStrings(retrieval, ['promptJa', 'contextJa', 'hintJa'], 'retrieval');
  assertNonEmptyStrings(result, ['headingJa'], 'result');

  if (
    typeof scene.width !== 'number' ||
    !Number.isInteger(scene.width) ||
    scene.width <= 0 ||
    typeof scene.height !== 'number' ||
    !Number.isInteger(scene.height) ||
    scene.height <= 0
  ) {
    throw new Error('scene width and height must be positive integers');
  }
  if (!(scene.src as string).startsWith('/assets/v2-reference/')) {
    throw new Error('scene asset must stay inside /assets/v2-reference/');
  }
  if (!existsSync(resolve(process.cwd(), `public${scene.src as string}`))) {
    throw new Error(`scene asset does not exist: ${scene.src as string}`);
  }

  const provenance = scene.provenance;
  if (!isRecord(provenance)) throw new Error('scene provenance is required');
  assertNonEmptyStrings(
    provenance,
    [
      'kind',
      'generator',
      'sourceArtifactId',
      'generatedOn',
      'transform',
      'rightsStatus',
      'allowedUse',
      'reviewStatus',
    ],
    'scene.provenance',
  );
  if (
    provenance.kind !== 'ai-generated' ||
    provenance.allowedUse !== 'isolated-v2-reference-only' ||
    provenance.reviewStatus !== 'reference-only'
  ) {
    throw new Error('scene provenance must remain generated and reference-only');
  }
  if (
    audio.kind !== 'device-speech-synthesis' ||
    audio.lang !== 'zh-TW' ||
    audio.reviewStatus !== 'reference-only' ||
    audio.productionReplacement !== 'reviewed-static-zh-TW-audio-required'
  ) {
    throw new Error('audio provenance must require reviewed static zh-TW replacement');
  }

  if (!Array.isArray(retrieval.chunks) || retrieval.chunks.length < 2) {
    throw new Error('retrieval.chunks must contain at least two chunks');
  }
  const chunks: V2ReferenceChunk[] = retrieval.chunks.map((chunk, index) => {
    if (!isRecord(chunk) || !isNonEmptyString(chunk.id) || !isNonEmptyString(chunk.text)) {
      throw new Error(`retrieval.chunks[${index}] must contain id and text`);
    }
    return { id: chunk.id, text: chunk.text };
  });
  const chunkIds = chunks.map((chunk) => chunk.id);
  if (new Set(chunkIds).size !== chunkIds.length) {
    throw new Error('retrieval chunk ids must be unique');
  }

  const validateOrder = (order: unknown, label: string): string[] => {
    if (
      !Array.isArray(order) ||
      order.some((id) => !isNonEmptyString(id)) ||
      order.length !== chunkIds.length ||
      new Set(order).size !== chunkIds.length ||
      order.some((id) => !chunkIds.includes(id as string))
    ) {
      throw new Error(`${label} must contain every retrieval chunk exactly once`);
    }
    return order as string[];
  };

  return {
    version: 1,
    lessonId: value.lessonId,
    today: today as V2ReferenceMetadata['today'],
    scene: {
      ...(scene as unknown as V2ReferenceMetadata['scene']),
      provenance: provenance as unknown as V2ReferenceSceneProvenance,
    },
    audio: audio as unknown as V2ReferenceMetadata['audio'],
    retrieval: {
      promptJa: retrieval.promptJa as string,
      contextJa: retrieval.contextJa as string,
      hintJa: retrieval.hintJa as string,
      chunks,
      initialOrder: validateOrder(retrieval.initialOrder, 'initialOrder'),
      answerOrder: validateOrder(retrieval.answerOrder, 'answerOrder'),
    },
    result: result as V2ReferenceMetadata['result'],
  };
}

export function loadV2ReferenceContent(
  metadataPath = resolve(process.cwd(), DEFAULT_METADATA_PATH),
): V2ReferenceContent {
  const metadata = parseMetadata(readFileSync(metadataPath, 'utf8'), metadataPath);
  const lesson = loadLessonById(metadata.lessonId);
  if (!lesson || lesson.reviewStatus !== 'reviewed') {
    throw new Error('V2 reference requires a reviewed, renderable source lesson');
  }

  const coreExample = lesson.examples?.find(
    (example) => example.traditional === lesson.coreSentence,
  );
  if (!coreExample || !isNonEmptyString(coreExample.pinyin) || !isNonEmptyString(coreExample.japanese)) {
    throw new Error('V2 reference source lesson requires a reviewed core example');
  }

  const chunkById = new Map(metadata.retrieval.chunks.map((chunk) => [chunk.id, chunk]));
  const reconstructedAnswer = metadata.retrieval.answerOrder
    .map((chunkId) => chunkById.get(chunkId)?.text ?? '')
    .join('');
  if (reconstructedAnswer !== lesson.coreSentence) {
    throw new Error('retrieval answer must equal the reviewed lesson core sentence');
  }
  if (
    metadata.retrieval.hintJa.includes(lesson.coreSentence) ||
    metadata.retrieval.hintJa.includes(coreExample.pinyin) ||
    metadata.retrieval.hintJa.includes(coreExample.japanese)
  ) {
    throw new Error('retrieval hint must not contain the complete answer');
  }

  return {
    ...metadata,
    reviewStatus: lesson.reviewStatus,
    canDoJa: lesson.canDoJa,
    learnerOutcomeJa: lesson.learnerOutcomeJa,
    phrase: lesson.coreSentence,
    pinyin: coreExample.pinyin,
    meaningJa: coreExample.japanese,
    lessonChunks: lesson.chunks.map(({ chunk, meaning, notesJa }) => ({
      chunk,
      meaning,
      ...(isNonEmptyString(notesJa) ? { notesJa } : {}),
    })),
    soundFocus: lesson.soundFocus.map(({ item, noteJa }) => ({ item, noteJa })),
  };
}

export function buildV2ReferenceBootstrap(
  content: V2ReferenceContent,
): V2ReferenceBootstrap {
  const chunkById = new Map(content.retrieval.chunks.map((chunk) => [chunk.id, chunk]));
  return {
    version: 1,
    lessonId: content.lessonId,
    today: {
      ...content.today,
      phrase: content.phrase,
      pinyin: content.pinyin,
      meaningJa: content.meaningJa,
      scene: content.scene,
    },
    learning: {
      phrase: content.phrase,
      pinyin: content.pinyin,
      meaningJa: content.meaningJa,
      canDoJa: content.canDoJa,
      learnerOutcomeJa: content.learnerOutcomeJa,
      lessonChunks: content.lessonChunks,
      soundFocus: content.soundFocus,
      scene: content.scene,
      audio: content.audio,
    },
    retrieval: {
      promptJa: content.retrieval.promptJa,
      contextJa: content.retrieval.contextJa,
      hintJa: content.retrieval.hintJa,
      chunks: content.retrieval.initialOrder.map((chunkId) => chunkById.get(chunkId)!),
      answerSignature: sequenceSignature(content.retrieval.answerOrder),
      answerSource: `/v2-reference/data/${content.lessonId}-answer.json`,
    },
    result: {
      ...content.result,
      canDoJa: content.canDoJa,
      phrase: content.phrase,
      pinyin: content.pinyin,
      meaningJa: content.meaningJa,
    },
  };
}

export function buildV2ReferenceAnswerPayload(
  content: V2ReferenceContent,
): V2ReferenceAnswerPayload {
  const chunkById = new Map(content.retrieval.chunks.map((chunk) => [chunk.id, chunk]));
  return {
    version: 1,
    lessonId: content.lessonId,
    chunks: content.retrieval.answerOrder.map((chunkId) => chunkById.get(chunkId)!),
    phrase: content.phrase,
    pinyin: content.pinyin,
    meaningJa: content.meaningJa,
  };
}
