import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
    [['src/components/LessonPractice.astro'], 't2', 'ui'],
    [['src/pages/index.astro'], 't2', 'ui'],
    [['src/types/vocabulary.ts'], 't3', 'contract'],
    [['src/data/basicVocabularySupabaseRepository.ts'], 't3', 'contract'],
    [['src/lib/supabaseBrowserClient.ts'], 't3', 'auth'],
    [['src/client/supabaseAuthCallback.ts'], 't3', 'auth'],
    [['package.json'], 't3', 'build-ci'],
    [['scripts/validate-content-schema.py'], 't3', 'build-ci'],
    [['.github/workflows/ci.yml'], 't3', 'build-ci'],
    [['data/unicode/generated/visual-candidates.json'], 't3', 'build-ci'],
    [['weird/unknown.xyz'], 't3', 'unknown'],
  ] as const)('%s → %s (%s)', (files, tier, riskClass) => {
    const classification = classifyFiles([...files]);
    expect(classification.tier).toBe(tier);
    expect(classification.riskClasses).toContain(riskClass);
  });
});

describe('tier selects the minimum tier as the max across changed files', () => {
  it('escalates to the highest tier among a mixed change set', () => {
    const classification = classifyFiles([
      'docs/foo.md',
      'src/domain/tonePractice.ts',
      'src/components/LessonPractice.astro',
    ]);
    expect(classification.tier).toBe('t2');
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
    expect(classification.runFullVitest).toBe(false);
    expect(classification.runAffectedVitest).toBe(false);
    expect(classification.runBuild).toBe(false);
    expect(classification.runContent).toBe(false);
    expect(classification.runVisual).toBe(false);
    expect(classification.runA11y).toBe(false);
  });

  it('a pure domain change runs affected tests but not visual/a11y/build', () => {
    const classification = classifyFiles(['src/domain/tonePractice.ts']);
    expect(classification.runAffectedVitest).toBe(true);
    expect(classification.affectedTestGlobs).toContain('tests/tone-practice-*.test.ts');
    expect(classification.runFullVitest).toBe(false);
    expect(classification.runBuild).toBe(false);
    expect(classification.runVisual).toBe(false);
    expect(classification.runA11y).toBe(false);
  });

  it('a content change runs content validators but not full vitest', () => {
    const classification = classifyFiles(['data/learning-paths.json']);
    expect(classification.affectedContent).toBe(true);
    expect(classification.runContent).toBe(true);
    expect(classification.runFullVitest).toBe(false);
    expect(classification.runAffectedVitest).toBe(false);
  });
});

describe('T2 and T3 coverage', () => {
  it('a UI change runs full vitest + build, but not visual/a11y/content', () => {
    const classification = classifyFiles(['src/components/LessonPractice.astro']);
    expect(classification.runFullVitest).toBe(true);
    expect(classification.runBuild).toBe(true);
    expect(classification.runVisual).toBe(false);
    expect(classification.runA11y).toBe(false);
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
