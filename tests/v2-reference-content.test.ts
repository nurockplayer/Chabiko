import { describe, expect, it } from 'vitest';
import {
  buildSafeV2RetrievalPayload,
  loadV2Reference,
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
});
