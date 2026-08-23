import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  classifyFile,
  classifyFiles,
  DOMAIN_TEST_RULES,
  domainTestGlobsFor,
  RISK_TO_TIER,
  type RiskClass,
  type Tier,
} from '../../scripts/validation/classify';

// Representative change surfaces → the intended minimum tier. This is the
// "deterministic risk classification" contract from Issue #339: each risk
// class must select its documented tier, cross-cutting/unknown must escalate,
// and low-risk changes must skip the expensive suites.
describe('risk classifier selects the intended minimum tier', () => {
  it.each([
    // [files, expected tier, expected risk class]
    [['docs/foo.md'], 't0', 'docs'],
    [['README.md'], 't0', 'docs'],
    [['.github/ISSUE_TEMPLATE/feature.yml'], 't0', 'docs'],
    [['data/learning-paths.json'], 't1', 'content'],
    [['data/roleplay/airport.json'], 't1', 'content'],
    [['src/domain/tonePractice.ts'], 't1', 'domain'],
    [['src/lib/progress.ts'], 't1', 'domain'],
    [['src/content/loadLessons.ts'], 't1', 'domain'],
    [['tests/lessons.test.ts'], 't1', 'tests'],
    [['src/client/basicVocabularySession.ts'], 't2', 'client'],
    [['src/components/LessonPractice.astro'], 't3', 'ui'],
    [['src/pages/index.astro'], 't3', 'ui'],
    [['src/types/vocabulary.ts'], 't3', 'contract'],
    [['src/data/basicVocabularySupabaseRepository.ts'], 't3', 'contract'],
    [['src/lib/supabaseBrowserClient.ts'], 't3', 'auth'],
    [['src/client/supabaseAuthCallback.ts'], 't3', 'auth'],
    [['package.json'], 't3', 'build-ci'],
    [['scripts/validate-content-schema.py'], 't3', 'build-ci'],
    [['.github/workflows/ci.yml'], 't3', 'build-ci'],
    [['data/unicode/generated/visual-candidates.json'], 't3', 'build-ci'],
    [['data/content-pilots/taiwan-travel-golden/lessons.json'], 't3', 'build-ci'],
    [['weird/unknown.xyz'], 't3', 'unknown'],
  ] as const)('%s → %s (%s)', (files, tier, riskClass) => {
    const classification = classifyFiles([...files]);
    expect(classification.tier).toBe(tier);
    expect(classification.riskClasses).toContain(riskClass);
  });
});

describe('shared learning-content graph coverage', () => {
  it('selects the graph contract suite for every graph input surface', () => {
    const expected = 'tests/learning-content-graph.test.ts';
    expect(domainTestGlobsFor('src/content/loadLearningContentGraph.ts')).toContain(expected);
    expect(domainTestGlobsFor('src/content/loadPhrasebook.ts')).toContain(expected);
    expect(domainTestGlobsFor('src/content/loadVocabulary.ts')).toContain(expected);
    expect(domainTestGlobsFor('src/content/loadRoleplayCards.ts')).toContain(expected);
    expect(domainTestGlobsFor('src/types/learningContent.ts')).toContain(expected);
    expect(domainTestGlobsFor('src/types/learningPath.ts')).toContain(expected);
  });

  it('selects the golden-set review-scope suite for its loader', () => {
    expect(domainTestGlobsFor('src/content/loadGoldenSetReviewScope.ts')).toContain(
      'tests/golden-set-review-scope.test.ts',
    );
  });
});

describe('tier selects the minimum tier as the max across changed files', () => {
  it('escalates to the highest tier among a mixed change set', () => {
    const classification = classifyFiles([
      'docs/foo.md',
      'src/domain/tonePractice.ts',
      'src/components/LessonPractice.astro',
    ]);
    expect(classification.tier).toBe('t3');
  });

  it('does not let a docs file lower a high-risk change', () => {
    const classification = classifyFiles(['package.json', 'docs/foo.md']);
    expect(classification.tier).toBe('t3');
  });
});

describe('unknown classification fails safe to the full gate', () => {
  it('marks unknown files untrustworthy and escalates to T3', () => {
    const classification = classifyFiles(['docs/foo.md', 'weird/unknown.bin']);
    expect(classification.tier).toBe('t3');
    expect(classification.trustworthy).toBe(false);
    expect(classification.runVisual).toBe(true);
    expect(classification.runA11y).toBe(true);
  });
});

describe('low-risk changes skip irrelevant expensive suites', () => {
  it('a docs-only change runs no expensive suites', () => {
    const classification = classifyFiles(['docs/foo.md']);
    expect(classification.tier).toBe('t0');
    expect(classification.runFullVitest).toBe(false);
    expect(classification.runAffectedVitest).toBe(false);
    expect(classification.runBuild).toBe(false);
    expect(classification.runContent).toBe(false);
    expect(classification.runVisual).toBe(false);
    expect(classification.runA11y).toBe(false);
  });

  it('a pure domain change runs affected tests but not visual/a11y/build', () => {
    const classification = classifyFiles(['src/domain/tonePractice.ts']);
    expect(classification.tier).toBe('t1');
    expect(classification.runAffectedVitest).toBe(true);
    expect(classification.affectedTestGlobs).toContain('tests/tone-practice-*.test.ts');
    expect(classification.runFullVitest).toBe(false);
    expect(classification.runBuild).toBe(false);
    expect(classification.runVisual).toBe(false);
    expect(classification.runA11y).toBe(false);
  });

  it('a content change runs content validators but not full vitest', () => {
    const classification = classifyFiles(['data/learning-paths.json']);
    expect(classification.tier).toBe('t1');
    expect(classification.affectedContent).toBe(true);
    expect(classification.runContent).toBe(true);
    expect(classification.runFullVitest).toBe(false);
    expect(classification.runAffectedVitest).toBe(false);
    expect(classification.runVisual).toBe(false);
    expect(classification.runA11y).toBe(false);
  });

  it('golden pilot source changes run the full gate for packet drift protection', () => {
    const classification = classifyFiles([
      'data/content-pilots/taiwan-travel-golden/lessons.json',
    ]);
    expect(classification.tier).toBe('t3');
    expect(classification.runFullVitest).toBe(true);
    expect(classification.runBuild).toBe(true);
    expect(classification.runContent).toBe(true);
    expect(classification.runVisual).toBe(true);
    expect(classification.runA11y).toBe(true);
  });

  it('a tests-only change runs the changed tests but not visual/a11y/build', () => {
    const classification = classifyFiles(['tests/lessons.test.ts']);
    expect(classification.tier).toBe('t1');
    expect(classification.runAffectedVitest).toBe(true);
    expect(classification.affectedTests).toContain('tests/lessons.test.ts');
    expect(classification.runFullVitest).toBe(false);
    expect(classification.runBuild).toBe(false);
    expect(classification.runVisual).toBe(false);
    expect(classification.runA11y).toBe(false);
  });
});

describe('T2 and T3 coverage', () => {
  it('a UI change runs the full gate including visual + a11y', () => {
    const classification = classifyFiles(['src/components/LessonPractice.astro']);
    expect(classification.tier).toBe('t3');
    expect(classification.runFullVitest).toBe(true);
    expect(classification.runBuild).toBe(true);
    expect(classification.runContent).toBe(true);
    expect(classification.runVisual).toBe(true);
    expect(classification.runA11y).toBe(true);
  });

  it('a build/CI change runs the full gate including visual + a11y + content', () => {
    const classification = classifyFiles(['.github/workflows/ci.yml']);
    expect(classification.runFullVitest).toBe(true);
    expect(classification.runBuild).toBe(true);
    expect(classification.runContent).toBe(true);
    expect(classification.runVisual).toBe(true);
    expect(classification.runA11y).toBe(true);
  });
});

describe('#347: learner-visible UI changes escalate to the full gate', () => {
  it('a #342-like basic-vocabulary UI change set runs visual + a11y at T3', () => {
    const classification = classifyFiles([
      'src/components/vocabulary/BasicVocabularyDetail.astro',
      'src/components/vocabulary/BasicVocabularySession.astro',
      'src/pages/vocabulary/basic/words/[learnerId]/index.astro',
    ]);
    expect(classification.tier).toBe('t3');
    expect(classification.runFullVitest).toBe(true);
    expect(classification.runBuild).toBe(true);
    expect(classification.runVisual).toBe(true);
    expect(classification.runA11y).toBe(true);
  });

  it('a focus-order-affecting UI change triggers the a11y/keyboard check', () => {
    const classification = classifyFiles([
      'src/components/vocabulary/BasicVocabularySession.astro',
    ]);
    expect(classification.tier).toBe('t3');
    expect(classification.runVisual).toBe(true);
    expect(classification.runA11y).toBe(true);
  });
});

describe('#359: manifest-allowlisted Unicode sources escalate to full Vitest', () => {
  // Future-proofing: derive the protected set from the real active manifest so
  // a source newly added to data/unicode/source-manifest.json is covered
  // without another hardcoded path list here (or in the classifier).
  const manifestPath = fileURLToPath(
    new URL('../../data/unicode/source-manifest.json', import.meta.url),
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    sources: Array<{ path: string }>;
  };
  const unicodeSourcePaths = new Set(manifest.sources.map((source) => source.path));

  it('derives a non-empty protected set from the real manifest', () => {
    expect(unicodeSourcePaths.size).toBeGreaterThan(0);
    expect(unicodeSourcePaths).toContain('data/roleplay/transport.json');
    expect(unicodeSourcePaths).toContain('data/examples/valid/phrasebook.json');
    // learning-paths.json is itself an allowlisted manifest source, so it is
    // protected too (not a valid negative-case example).
    expect(unicodeSourcePaths).toContain('data/learning-paths.json');
  });

  it('a roleplay path present in the manifest does NOT classify as t1 (repro #354/#358)', () => {
    const classification = classifyFiles(['data/roleplay/transport.json'], { unicodeSourcePaths });
    expect(classification.tier).not.toBe('t1');
    expect(classification.tier).toBe('t2');
    expect(classification.runFullVitest).toBe(true);
    expect(classification.runBuild).toBe(true);
  });

  it('another allowlisted source (phrasebook) triggers the same escalation', () => {
    const classification = classifyFiles(['data/examples/valid/phrasebook.json'], {
      unicodeSourcePaths,
    });
    expect(classification.tier).toBe('t2');
    expect(classification.runFullVitest).toBe(true);
  });

  it('a manifest-path change itself stays escalated (build-ci → t3)', () => {
    const classification = classifyFiles(['data/unicode/source-manifest.json'], {
      unicodeSourcePaths,
    });
    expect(classification.tier).toBe('t3');
    expect(classification.runFullVitest).toBe(true);
    expect(classification.runBuild).toBe(true);
  });

  it('keeps the pure module manifest-agnostic without an injected set', () => {
    // The module contract is "pure — no filesystem/git I/O". Escalation must
    // come from the caller injecting the manifest-derived set; a bare call keeps
    // the base tier so existing callers/tests stay unaffected.
    const classification = classifyFiles(['data/roleplay/transport.json']);
    expect(classification.tier).toBe('t1');
  });

  it('does not escalate a non-allowlisted data path solely because it is JSON/data', () => {
    const classification = classifyFiles(['data/foo.json'], { unicodeSourcePaths });
    expect(classification.tier).toBe('t1');
    expect(classification.runFullVitest).toBe(false);
  });
});

describe('#347: the documented classify CLI gates visual/a11y from real git state', () => {
  // P1 self-test: CI runs `node scripts/validation/run.ts classify --base
  // origin/main --emit-github-output` and gates the visual/a11y jobs on the
  // emitted `run_visual`/`run_a11y`. Calling the pure `classifyFiles` function
  // alone cannot catch a broken buildPlan/GITHUB_OUTPUT/CLI-wiring, so we spawn
  // the real CLI against throwaway temp git repos and assert the emitted output.
  // Each scenario runs the full `gitChangedFiles` collection path (per AGENTS.md
  // Issue #193: a documented workflow command must be asserted by a self-test).

  const scriptPath = fileURLToPath(new URL('../../scripts/validation/run.ts', import.meta.url));
  const tempRepos: string[] = [];

  function git(cwd: string, args: string[]): {
    status: number | null;
    stdout: string;
    stderr: string;
  } {
    return spawnSync('git', args, { cwd, encoding: 'utf8' });
  }

  function createTempRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'chabiko-classifier-'));
    tempRepos.push(dir);
    expect(git(dir, ['init', '-b', 'main']).status).toBe(0);
    expect(git(dir, ['config', 'user.email', 'classifier-test@example.com']).status).toBe(0);
    expect(git(dir, ['config', 'user.name', 'Classifier Test']).status).toBe(0);
    return dir;
  }

  function writeFile(cwd: string, path: string, content: string): void {
    const filePath = join(cwd, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, { flag: 'wx' });
  }

  function commitFile(cwd: string, path: string, content: string, message: string): void {
    writeFile(cwd, path, content);
    expect(git(cwd, ['add', path]).status).toBe(0);
    expect(git(cwd, ['commit', '-m', message]).status).toBe(0);
  }

  function runClassify(cwd: string): {
    status: number;
    stdout: string;
    stderr: string;
    outputPath: string;
  } {
    const outputPath = join(
      tmpdir(),
      `chabiko-classifier-out-${process.pid}-${Math.random().toString(36).slice(2)}.txt`,
    );
    const result = spawnSync(
      process.execPath,
      [scriptPath, 'classify', '--base', 'HEAD', '--emit-github-output'],
      { cwd, env: { ...process.env, GITHUB_OUTPUT: outputPath }, encoding: 'utf8' },
    );
    return {
      status: result.status ?? -1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      outputPath,
    };
  }

  afterAll(() => {
    for (const dir of tempRepos) rmSync(dir, { recursive: true, force: true });
  });

  it('a learner-visible UI add escalates to t3 and emits run_visual=true / run_a11y=true', () => {
    const repo = createTempRepo();
    commitFile(repo, 'docs/base.md', '# base\n', 'base');
    writeFile(repo, 'src/components/vocabulary/BasicVocabularySession.astro', '<div>session</div>\n');

    const { status, stdout, outputPath } = runClassify(repo);
    try {
      expect(status).toBe(0);
      expect(stdout).toContain('tier=t3');
      expect(stdout).toContain('run_visual=true');
      expect(stdout).toContain('run_a11y=true');
      const emitted = readFileSync(outputPath, 'utf8');
      expect(emitted).toContain('run_visual=true');
      expect(emitted).toContain('run_a11y=true');
    } finally {
      rmSync(outputPath, { force: true });
    }
  });

  it('a docs-only add keeps visual/a11y off', () => {
    const repo = createTempRepo();
    commitFile(repo, 'docs/base.md', '# base\n', 'base');
    writeFile(repo, 'docs/foo.md', '# docs\n');

    const { status, stdout, outputPath } = runClassify(repo);
    try {
      expect(status).toBe(0);
      expect(stdout).toContain('tier=t0');
      expect(stdout).toContain('run_visual=false');
      expect(stdout).toContain('run_a11y=false');
      const emitted = readFileSync(outputPath, 'utf8');
      expect(emitted).toContain('run_visual=false');
      expect(emitted).toContain('run_a11y=false');
    } finally {
      rmSync(outputPath, { force: true });
    }
  });

  it('a delete-only learner-visible UI change still triggers visual + a11y (gitChangedFiles D path)', () => {
    const repo = createTempRepo();
    commitFile(repo, 'docs/base.md', '# base\n', 'base');
    const uiPath = 'src/components/vocabulary/BasicVocabularySession.astro';
    commitFile(repo, uiPath, '<div>session</div>\n', 'add ui');
    // Delete from the working tree (still committed at HEAD): the file is only
    // visible to gitChangedFiles as a D (deleted) entry — never as untracked —
    // so this exercises the --diff-filter=ACMRD path, not the pure classifier.
    rmSync(join(repo, uiPath));

    const { status, stdout, outputPath } = runClassify(repo);
    try {
      expect(status).toBe(0);
      expect(stdout).toContain('tier=t3');
      expect(stdout).toContain('run_visual=true');
      expect(stdout).toContain('run_a11y=true');
      const emitted = readFileSync(outputPath, 'utf8');
      expect(emitted).toContain('run_visual=true');
      expect(emitted).toContain('run_a11y=true');
    } finally {
      rmSync(outputPath, { force: true });
    }
  });

  it('#359: a manifest-allowlisted source change escalates to t2 (run_full_vitest=true)', () => {
    const repo = createTempRepo();
    commitFile(repo, 'docs/base.md', '# base\n', 'base');
    // The temp repo creates its own manifest so run.ts reads it from cwd.
    commitFile(
      repo,
      'data/unicode/source-manifest.json',
      `${JSON.stringify(
        { sources: [{ id: 'transport-v1', path: 'data/roleplay/transport.json' }] },
        null,
        2,
      )}\n`,
      'add manifest',
    );
    writeFile(repo, 'data/roleplay/transport.json', '{}\n');

    const { status, stdout, outputPath } = runClassify(repo);
    try {
      expect(status).toBe(0);
      expect(stdout).toContain('tier=t2');
      expect(stdout).toContain('run_full_vitest=true');
      const emitted = readFileSync(outputPath, 'utf8');
      expect(emitted).toContain('run_full_vitest=true');
    } finally {
      rmSync(outputPath, { force: true });
    }
  });

  it('#359: a data change with no manifest in the temp repo stays t1 (missing manifest is graceful)', () => {
    const repo = createTempRepo();
    commitFile(repo, 'docs/base.md', '# base\n', 'base');
    writeFile(repo, 'data/roleplay/transport.json', '{}\n');

    const { status, stdout, outputPath } = runClassify(repo);
    try {
      expect(status).toBe(0);
      expect(stdout).toContain('tier=t1');
      expect(stdout).toContain('run_full_vitest=false');
    } finally {
      rmSync(outputPath, { force: true });
    }
  });
});

describe('affected-domain test selection never silently skips a domain source', () => {
  const domainRoots = ['src/domain', 'src/lib', 'src/content'] as const;

  function listTsFiles(dir: string): string[] {
    const entries = readdirSync(dir);
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        files.push(...listTsFiles(full));
      } else if (entry.endsWith('.ts')) {
        files.push(full);
      }
    }
    return files;
  }

  const allDomainFiles = domainRoots.flatMap((root) => listTsFiles(root));

  it('every domain-classified source file maps to at least one affected test glob', () => {
    const domainFiles = allDomainFiles.filter((file) => classifyFile(file) === 'domain');
    expect(domainFiles.length).toBeGreaterThan(0);
    for (const file of domainFiles) {
      const globs = domainTestGlobsFor(file);
      expect(globs, `${file} has no affected-test mapping`).not.toHaveLength(0);
    }
  });

  it('an unmapped domain source escalates the change to T2 (full Vitest)', () => {
    // `src/domain/neverBefore.ts` is classified `domain` (path-based) but matches
    // no DOMAIN_TEST_RULES entry — the classifier must not leave it at T1.
    expect(classifyFile('src/domain/neverBefore.ts')).toBe('domain');
    expect(domainTestGlobsFor('src/domain/neverBefore.ts')).toHaveLength(0);
    const classification = classifyFiles(['src/domain/neverBefore.ts']);
    expect(classification.tier).toBe('t2');
    expect(classification.runFullVitest).toBe(true);
  });

  it('the domain map is ordered so the most specific feature wins over a generic token', () => {
    // basicVocabularyProgress must map to basic-vocabulary, not the generic
    // `progress` rule that follows it.
    expect(domainTestGlobsFor('src/domain/basicVocabularyProgress.ts')).toEqual([
      'tests/basic-vocabulary-*.test.ts',
    ]);
  });
});

describe('tier ordering and risk-class table are complete', () => {
  const TIERS: Tier[] = ['t0', 't1', 't2', 't3'];
  const CLASSES: RiskClass[] = [
    'docs',
    'content',
    'tests',
    'domain',
    'client',
    'ui',
    'auth',
    'contract',
    'build-ci',
    'unknown',
  ];

  it('maps every risk class to a defined tier', () => {
    for (const riskClass of CLASSES) {
      expect(TIERS).toContain(RISK_TO_TIER[riskClass]);
    }
  });

  it('defines a non-empty, ordered affected-test rule table', () => {
    expect(DOMAIN_TEST_RULES.length).toBeGreaterThan(0);
    // Rules must carry at least one test glob each.
    for (const rule of DOMAIN_TEST_RULES) {
      expect(rule.testGlobs.length).toBeGreaterThan(0);
    }
  });
});
