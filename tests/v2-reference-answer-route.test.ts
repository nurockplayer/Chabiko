import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GET } from '../src/pages/v2-reference/data/lesson-001-answer.json';

const ANSWER_PATH = '/v2-reference/data/lesson-001-answer.json';

function readPagesHeaderBlocks() {
  const source = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const blocks = new Map<string, Map<string, string>>();
  let currentPath: string | undefined;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    if (!/^\s/.test(rawLine)) {
      currentPath = line;
      blocks.set(currentPath, new Map());
      continue;
    }

    const separator = line.indexOf(':');
    if (!currentPath || separator === -1) continue;
    blocks
      .get(currentPath)
      ?.set(line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim());
  }

  return blocks;
}

describe('V2 reference on-demand answer route', () => {
  it('returns the reviewed answer with a no-store JSON contract', async () => {
    const response = await GET({} as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
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

  it('ships a path-scoped Cloudflare Pages no-store policy for the built answer', () => {
    const answerHeaders = readPagesHeaderBlocks().get(ANSWER_PATH);

    expect(answerHeaders?.get('cache-control')).toBe('private, no-store');
  });
});
