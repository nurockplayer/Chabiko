import { describe, expect, it } from 'vitest';
import { GET } from '../src/pages/v2-reference/data/lesson-001-answer.json';

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
});
