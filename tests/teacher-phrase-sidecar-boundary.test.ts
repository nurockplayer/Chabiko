import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MANIFEST_PATH = join(REPO_ROOT, 'data/teacher-vocabulary-preview/learner-manifest.json');
const AUTHORING_PATH = 'data/teacher-vocabulary-preview/teacher-phrase-authoring.json';

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.astro'].includes(extname(entry.name)) ? [path] : [];
  });
}

describe('teacher phrase authoring sidecar boundary (#478)', () => {
  it('keeps the #464 learner manifest bytes, learner IDs/order, and examples unchanged', () => {
    const raw = readFileSync(MANIFEST_PATH);
    const manifest = JSON.parse(raw.toString('utf8')) as {
      rows: Array<{
        learnerId: string;
        sourceSheet: string;
        sourceRow: number;
        example?: string;
      }>;
    };
    const identity = manifest.rows.map((row) => row.learnerId);
    const examples = manifest.rows.map((row) => ({
      learnerId: row.learnerId,
      sourceSheet: row.sourceSheet,
      sourceRow: row.sourceRow,
      ...('example' in row ? { example: row.example } : {}),
    }));

    expect(sha256(raw)).toBe('1a334649c477658a3ace0c9c7ad0c3d75021188cbf9d64700f9131ac408553ce');
    expect(sha256(JSON.stringify(identity))).toBe('5215fece8d7020e7ca1baf5b86e91710213c2fd025e5359e0ac64935d4d016b8');
    expect(sha256(JSON.stringify(examples))).toBe('4ad83a2a440927ef078ed224d2308540d149dff2a95ef311cf1f238817912932');
    expect(manifest.rows.filter((row) => 'example' in row)).toHaveLength(532);
  });

  it('keeps draft authoring data outside learner runtime and Unicode authority', () => {
    const unicodeManifest = JSON.parse(
      readFileSync(join(REPO_ROOT, 'data/unicode/source-manifest.json'), 'utf8'),
    ) as { sources: Array<{ path: string }> };
    expect(unicodeManifest.sources.map((source) => source.path)).not.toContain(AUTHORING_PATH);

    const runtimeReferences = sourceFiles(join(REPO_ROOT, 'src')).filter((path) =>
      readFileSync(path, 'utf8').includes(AUTHORING_PATH),
    );
    expect(runtimeReferences.map((path) => relative(REPO_ROOT, path))).toEqual([]);
  });

  it('documents and self-tests the canonical authoring command', () => {
    const documentationPath = join(REPO_ROOT, 'scripts/build-teacher-phrase-sidecar.md');
    expect(existsSync(documentationPath)).toBe(true);
    const documentation = readFileSync(documentationPath, 'utf8');
    expect(documentation).toContain('build-teacher-phrase-sidecar.py --workbook');
    expect(documentation).toContain('authoring-only');

    const contentGate = readFileSync(join(REPO_ROOT, 'scripts/validate-content.sh'), 'utf8');
    expect(contentGate).toContain('build-teacher-phrase-sidecar.py --test');

    const expansionPlan = JSON.parse(
      readFileSync(join(REPO_ROOT, 'docs/content/teacher-core-v1-expansion-plan.json'), 'utf8'),
    ) as {
      inventory: { ignoredColumnsBySheet: Record<string, string[]> };
      teacherPhraseAuthoring: {
        authoringOnly: boolean;
        rawSourceWorkflow: string;
        sourceColumn: string;
      };
    };
    for (const ignoredColumns of Object.values(expansionPlan.inventory.ignoredColumnsBySheet)) {
      expect(ignoredColumns).not.toContain('造词/造句');
    }
    expect(expansionPlan.teacherPhraseAuthoring).toEqual({
      authoringOnly: true,
      rawSourceWorkflow: 'scripts/build-teacher-phrase-sidecar.md',
      sourceColumn: '造词/造句',
    });

    const expansionPlanDocumentation = readFileSync(
      join(REPO_ROOT, 'docs/content/teacher-core-v1-expansion-plan.md'),
      'utf8',
    );
    expect(expansionPlanDocumentation).toContain('scripts/build-teacher-phrase-sidecar.md');
    expect(expansionPlanDocumentation).toContain('raw logical value');
  });
});
