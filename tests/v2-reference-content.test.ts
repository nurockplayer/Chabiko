import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildV2ReferenceAnswerPayload,
  buildV2ReferenceBootstrap,
  loadV2ReferenceContent,
} from '../src/content/v2Reference';

const ownedTempDirectories: string[] = [];

function writeMetadataFixture(mutator: (value: Record<string, unknown>) => void) {
  const source = JSON.parse(
    readFileSync(
      new URL('../data/v2-reference/lesson-001.json', import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;
  mutator(source);

  const directory = mkdtempSync(join(tmpdir(), 'chabiko-v2-reference-'));
  ownedTempDirectories.push(directory);
  const path = join(directory, 'lesson-001.json');
  writeFileSync(path, JSON.stringify(source), 'utf8');
  return path;
}

afterEach(() => {
  for (const directory of ownedTempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('V2 reference content', () => {
  it('reuses the reviewed Taiwan lesson instead of duplicating its core learning content', () => {
    const content = loadV2ReferenceContent();

    expect(content.lessonId).toBe('lesson-001');
    expect(content.reviewStatus).toBe('reviewed');
    expect(content.phrase).toBe('我要這個');
    expect(content.pinyin).toBe('wǒ yào zhège');
    expect(content.meaningJa).toBe('これをください');
    expect(content.canDoJa).toBe('台湾の夜市で簡単に食べ物を注文できる');
    expect(content.retrieval.answerOrder).toEqual([
      'v2-a91',
      'v2-b07',
      'v2-c42',
    ]);
    expect(
      content.retrieval.answerOrder
        .map((id) => content.retrieval.chunks.find((chunk) => chunk.id === id)?.text)
        .join(''),
    ).toBe(content.phrase);
  });

  it('builds a retrieval bootstrap with a digest but no canonical ordered answer', () => {
    const content = loadV2ReferenceContent();
    const bootstrap = buildV2ReferenceBootstrap(content);
    const retrievalJson = JSON.stringify(bootstrap.retrieval);

    expect(bootstrap.retrieval.answerSignature).toBe('2spt6r');
    expect(bootstrap.retrieval.chunks.map((chunk) => chunk.id)).toEqual([
      'v2-c42',
      'v2-a91',
      'v2-b07',
    ]);
    expect(retrievalJson).not.toContain('answerOrder');
    expect(retrievalJson).not.toContain(content.phrase);
    expect(retrievalJson).not.toContain(content.pinyin);
    // The Japanese intent is the retrieval prompt; the hidden answer is the
    // canonical ordered Chinese phrase and its pronunciation support.
    expect(retrievalJson).toContain(content.meaningJa);
  });

  it('keeps the full answer in the on-demand reveal payload', () => {
    const content = loadV2ReferenceContent();
    const payload = buildV2ReferenceAnswerPayload(content);

    expect(payload).toEqual({
      version: 1,
      lessonId: 'lesson-001',
      chunks: [
        { id: 'v2-a91', text: '我' },
        { id: 'v2-b07', text: '要' },
        { id: 'v2-c42', text: '這個' },
      ],
      phrase: '我要這個',
      pinyin: 'wǒ yào zhège',
      meaningJa: 'これをください',
    });
  });

  it('fails closed when retrieval chunks drift from the reviewed lesson phrase', () => {
    const fixture = writeMetadataFixture((value) => {
      const retrieval = value.retrieval as Record<string, unknown>;
      const chunks = retrieval.chunks as Array<Record<string, unknown>>;
      chunks[2].text = '那個';
    });

    expect(() => loadV2ReferenceContent(fixture)).toThrow(
      /retrieval answer must equal the reviewed lesson core sentence/,
    );
  });

  it('fails closed when initial and answer orders are not exact chunk permutations', () => {
    const fixture = writeMetadataFixture((value) => {
      const retrieval = value.retrieval as Record<string, unknown>;
      retrieval.initialOrder = ['v2-c42', 'v2-a91', 'v2-a91'];
    });

    expect(() => loadV2ReferenceContent(fixture)).toThrow(
      /initialOrder must contain every retrieval chunk exactly once/,
    );
  });

  it('fails closed when the initial chunk bank already uses the answer order', () => {
    const fixture = writeMetadataFixture((value) => {
      const retrieval = value.retrieval as Record<string, unknown>;
      retrieval.initialOrder = [...(retrieval.answerOrder as string[])];
    });

    expect(() => loadV2ReferenceContent(fixture)).toThrow(
      /initialOrder must differ from answerOrder to keep the answer hidden/,
    );
  });

  it('requires explicit generated-asset and device-audio provenance', () => {
    const fixture = writeMetadataFixture((value) => {
      const scene = value.scene as Record<string, unknown>;
      delete scene.provenance;
    });

    expect(() => loadV2ReferenceContent(fixture)).toThrow(
      /scene provenance is required/,
    );
  });
});
