import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packagePath = 'data/hsk-import/hearmandarin-hsk-2025-v1';
const importer = resolve('scripts/import-hearmandarin-hsk-json.py');

describe('offline HSK rebuild CLI', () => {
  it('rebuilds every committed byte, rejects source/plan drift, and preserves caller files', () => {
    const root = mkdtempSync(join(tmpdir(), 'chabiko-hsk-offline-'));
    try {
      cpSync(resolve(packagePath), join(root, packagePath), { recursive: true });
      mkdirSync(join(root, 'scripts'));
      // The CLI resolves its repository relative to scripts/.
      cpSync(importer, join(root, 'scripts/import-hearmandarin-hsk-json.py'), { recursive: true });
      const script = join(root, 'scripts/import-hearmandarin-hsk-json.py');
      const output = join(root, 'output');
      execFileSync('python3', [script, '--from-manifest', '--output-dir', output], { timeout: 30_000 });
      expect(readFileSync(join(output, 'manifest.json'))).toEqual(readFileSync(resolve(packagePath, 'manifest.json')));
      const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
      for (const batch of manifest.publication.batches) {
        expect(readFileSync(join(output, batch.file))).toEqual(readFileSync(resolve('data/hsk-vocabulary', batch.file)));
      }
      const sentinel = join(output, 'caller.txt');
      writeFileSync(sentinel, 'keep');
      expect(spawnSync('python3', [script, '--from-manifest', '--output-dir', output], { timeout: 30_000 }).status).toBe(2);
      expect(readFileSync(sentinel, 'utf8')).toBe('keep');
      const path = join(root, packagePath, 'manifest.json');
      for (const field of ['simplified', 'pinyin', 'batchPlacement'] as const) {
        const changed = structuredClone(manifest);
        changed.rows[0][field] = 'drift';
        writeFileSync(path, JSON.stringify(changed));
        const result = spawnSync('python3', [script, '--from-manifest', '--output-dir', join(root, `bad-${field}`)], { timeout: 30_000 });
        expect(result.status).toBe(2);
        expect(result.stderr.toString()).toMatch(/drifted|digest/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
