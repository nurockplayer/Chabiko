import { describe, expect, it } from 'vitest';
import {
  buildSafeV2RetrievalPayload,
  loadV2Reference,
  validateV2ReferenceScene,
} from '../src/content/loadV2Reference';

describe('V2 reference content loader', () => {
  it('reuses the reviewed Taiwan lesson as the learning source', () => {
    const reference = loadV2Reference();

    expect(reference.sourceLessonId).toBe('lesson-001');
    expect(reference.lesson.id).toBe('lesson-001');
    expect(reference.lesson.reviewStatus).toBe('reviewed');
    expect(reference.lesson.coreSentence).toBe('我要這個');
    expect(reference.coreExample).toMatchObject({
      traditional: '我要這個',
      pinyin: 'wǒ yào zhège',
      japanese: 'これをください',
    });
  });

  it('projects an initial retrieval payload without the answer or pinyin', () => {
    const safe = buildSafeV2RetrievalPayload();
    const serialized = JSON.stringify(safe);

    expect(safe).toEqual({
      promptJa: '「これをください」を中国語の順に並べてください。',
      tokens: [
        { id: 'zhege', text: '這個' },
        { id: 'wo', text: '我' },
        { id: 'yao', text: '要' },
      ],
    });
    expect(serialized).not.toContain('我要這個');
    expect(serialized).not.toContain('wǒ yào zhège');
    expect(serialized).not.toContain('correctOrder');
    expect(serialized).not.toContain('repairChunks');
  });

  it('fails closed unless the committed scene asset matches its provenance metadata', () => {
    const reference = loadV2Reference();

    expect(reference.scene.assetPath).toBe(
      '/assets/v2-reference/taiwan-night-market-order.webp',
    );
    expect(reference.scene.provenance).toMatchObject({
      source: 'openai-built-in-image-generation',
      generationRevision: 1,
      referenceSetIds: [],
      allowedUse: 'chabiko-v2-reference-only',
      publicWebDisplay: true,
      attributionRequired: false,
    });
  });

  it('rejects scene paths that escape the isolated asset directory', () => {
    const scene = structuredClone(loadV2Reference().scene);

    expect(() =>
      validateV2ReferenceScene({
        ...scene,
        assetPath: '/assets/v2-reference/../../package.json',
      }),
    ).toThrow(/stay inside \/assets\/v2-reference\//);
  });

  it.each([
    {
      label: 'checksum',
      mutate: (scene: ReturnType<typeof loadV2Reference>['scene']) => ({
        ...scene,
        assetChecksumSha256: '0'.repeat(64),
      }),
      message: /checksum/,
    },
    {
      label: 'file size',
      mutate: (scene: ReturnType<typeof loadV2Reference>['scene']) => ({
        ...scene,
        fileSizeBytes: scene.fileSizeBytes + 1,
      }),
      message: /file size/,
    },
    {
      label: 'dimensions',
      mutate: (scene: ReturnType<typeof loadV2Reference>['scene']) => ({
        ...scene,
        width: scene.width + 1,
      }),
      message: /dimensions/,
    },
    {
      label: 'prompt digest',
      mutate: (scene: ReturnType<typeof loadV2Reference>['scene']) => ({
        ...scene,
        provenance: {
          ...scene.provenance,
          promptDigestSha256: '0'.repeat(64),
        },
      }),
      message: /prompt digest/,
    },
    {
      label: 'rights',
      mutate: (scene: ReturnType<typeof loadV2Reference>['scene']) => ({
        ...scene,
        provenance: {
          ...scene.provenance,
          allowedUse: 'unreviewed-use',
        },
      }),
      message: /rights metadata/,
    },
  ])('rejects scene $label drift', ({ mutate, message }) => {
    const scene = structuredClone(loadV2Reference().scene);

    expect(() => validateV2ReferenceScene(mutate(scene))).toThrow(message);
  });
});
