import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadHskPublication } from '../src/content/loadHskVocabulary';
import { ensureRouteBuild, routeBuildDirectory } from './helpers/route-build';

// Read-only suite: reuse the shared route build instead of a separate astro build.
const output = routeBuildDirectory();
beforeAll(() => { ensureRouteBuild(); }, 180_000);

describe('rendered HSK quiz routes', () => {
  for (const pool of loadHskPublication().pools) {
    it(`renders level ${pool.level} without embedding answers and links both modes`, () => {
      const window = new Window();
      const doc = window.document;
      const html = readFileSync(join(output, `vocabulary/hsk/${pool.level}/quiz/index.html`), 'utf8');
      doc.body.innerHTML = html;
      expect(doc.querySelector('h1')?.textContent).toBe(`HSK ${pool.level} 単語テスト`);
      expect(doc.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('テスト');
      expect(doc.querySelector('[data-quiz-start]')?.hasAttribute('disabled')).toBe(true);
      expect(doc.querySelectorAll('[name="length"]')).toHaveLength(2);
      expect(doc.querySelectorAll('[name="direction"]')).toHaveLength(2);
      expect(doc.querySelector('[data-quiz-card]')?.textContent).toBe('');
      expect(doc.querySelector('[data-pronunciation-text]')).toBeNull();
      const payload = JSON.parse(doc.querySelector('[data-hsk-quiz]')!.getAttribute('data-hsk-quiz')!);
      expect(payload).toEqual({ level: pool.level, ids: pool.fullRange.map((e) => e.id), answerSource: `/data/hsk/${pool.level}.json` });
      for (const field of ['simplified', 'pinyin', 'japanese', 'correctIndex']) expect(html).not.toContain(`&quot;${field}&quot;`);
      for (const entry of pool.fullRange.slice(0, 10)) expect(doc.querySelector('[data-hsk-quiz]')?.textContent).not.toContain(entry.pinyin);
      expect(doc.body.textContent).toContain('日本語訳はAIによる下書き');
      expect(doc.body.textContent).toContain('HearMandarin');
      expect(doc.querySelector('a[href="https://creativecommons.org/licenses/by/4.0/"]')?.textContent).toBe('CC BY 4.0');
      expect(doc.querySelectorAll('[data-hsk-quiz-best]')).toHaveLength(4);
      const levelHtml = readFileSync(join(output, `vocabulary/hsk/${pool.level}/index.html`), 'utf8');
      doc.body.innerHTML = levelHtml;
      expect(doc.querySelector(`a[href="/vocabulary/hsk/${pool.level}/quiz/"]`)?.textContent?.trim()).toBe('テスト');
      expect(doc.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('学ぶ');
      expect(doc.querySelectorAll('[data-hsk-quiz-best]')).toHaveLength(4);
      window.close();
    });
  }
});
