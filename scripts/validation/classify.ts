// Deterministic change-risk classifier for Chabiko's bounded-cycle validation
// ladder (T0–T3). This module is pure — no filesystem/git I/O — so the tier
// mapping is fully unit-testable and reviewable, and the same code drives both
// the Agent-facing `pnpm validate:*` commands and the CI tier gate.
//
// Tier ladder (see AGENTS.md「驗證階梯（risk-based validation ladder）」):
//   T0 Smoke       — focused test/validator during implementation (no repo-wide command).
//   T1 Affected    — affected-domain tests/validators + lint + typecheck.
//   T2 Integration — full Vitest + lint + typecheck + build.
//   T3 Full Gate   — T2 + visual regression + accessibility + content/cross-cutting.
//
// A change is classified by taking the MAX tier across every changed file, so
// the cheapest surface wins only when every file agrees. Anything that cannot
// be classified into a known class is `unknown` and fails safe to T3.

export type Tier = 't0' | 't1' | 't2' | 't3';

export type RiskClass =
  | 'docs'
  | 'content'
  | 'tests'
  | 'domain'
  | 'client'
  | 'ui'
  | 'auth'
  | 'contract'
  | 'build-ci'
  | 'unknown';

export interface Classification {
  /** The minimum required tier for this change surface (max across files). */
  tier: Tier;
  /** False when any file fell into `unknown` or the classifier could not run. */
  trustworthy: boolean;
  /** Union of risk classes present in the change set. */
  riskClasses: RiskClass[];
  /** One-line reasons per escalation (for the concise summary). */
  reasons: string[];
  /** Affected-domain test globs (T1 `domain` only). Empty means none/unmapped. */
  affectedTestGlobs: string[];
  /** Whether a T1 change is content-shaped (run content validators, not vitest). */
  affectedContent: boolean;
  /** Whether a T1 change is a test-only change (run the changed test files). */
  affectedTests: string[];
  /** CI gate flags. */
  runFullVitest: boolean;
  runAffectedVitest: boolean;
  runBuild: boolean;
  runContent: boolean;
  runVisual: boolean;
  runA11y: boolean;
  /** Concise human summary (selected tier + why). */
  summary: string;
}

export const TIER_ORDER: Record<Tier, number> = { t0: 0, t1: 1, t2: 2, t3: 3 };

/**
 * Risk class → minimum tier. `unknown` and infra/contract classes are T3.
 * Learner-visible UI/component changes also escalate to T3: they can change
 * layout or keyboard focus order, so they must run visual regression and the
 * accessibility/keyboard checks in the full gate (test:visual / test:a11y).
 */
export const RISK_TO_TIER: Record<RiskClass, Tier> = {
  docs: 't0',
  content: 't1',
  tests: 't1',
  domain: 't1',
  client: 't2',
  ui: 't3',
  auth: 't3',
  contract: 't3',
  'build-ci': 't3',
  unknown: 't3',
};

/**
 * pnpm script names run by each tier, in order. T0 is empty: the smoke check is
 * the focused test/validator the agent already ran during implementation (plus
 * the CI lockfile check). T1's affected tests/validators are appended by the
 * caller from `affectedTestGlobs` / `affectedContent` / `affectedTests`.
 */
export const TIER_STATIC_SCRIPTS: Record<Tier, string[]> = {
  t0: [],
  t1: ['lint', 'typecheck'],
  t2: ['lint', 'typecheck', 'test', 'build'],
  t3: ['lint', 'typecheck', 'test', 'build', 'test:visual', 'test:a11y', 'validate:content'],
};

/** Normalize a repo-relative path for deterministic matching. */
function normalize(file: string): string {
  return file.replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Risk-class rules, evaluated in order (first match wins) per file.
// ---------------------------------------------------------------------------

type Rule = { class: RiskClass; match: (file: string) => boolean };

const CONFIG_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'astro.config.mjs',
  'tsconfig.json',
  'eslint.config.js',
  'vitest.config.ts',
  'pyproject.toml',
  'uv.lock',
  '.python-version',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
]);

function isBuildCi(file: string): boolean {
  const base = file.split('/').at(-1) ?? file;
  if (CONFIG_FILES.has(base)) return true;
  if (base.startsWith('playwright.') && base.endsWith('.config.ts')) return true;
  if (file.startsWith('.github/workflows/')) return true;
  if (file.startsWith('scripts/') || file.startsWith('src/scripts/')) return true;
  if (file.startsWith('supabase/')) return true;
  // Generated outputs and the Unicode data surface are correctness-enforced by
  // generators + byte-identity drift gates, so they escalate like generator
  // changes rather than authored content.
  if (file.includes('/generated/')) return true;
  if (file.startsWith('data/unicode/')) return true;
  return false;
}

function isContract(file: string): boolean {
  // Schema/type contracts and the repository/data-access layer have broad
  // runtime consumers (loaders, UI, validators), so they escalate to T3.
  return file.startsWith('src/types/') || file.startsWith('src/data/');
}

function isAuth(file: string): boolean {
  // Auth / account / Supabase client surfaces are high-risk (merge policy:
  // authentication/authorization) and must run the full gate.
  return (
    file.includes('/auth/') ||
    file.includes('supabase') ||
    file.includes('basicvocabularyaccount')
  );
}

function isDocs(file: string): boolean {
  const base = file.split('/').at(-1) ?? file;
  if (file.startsWith('docs/')) return true;
  if (base === 'license' || base === 'readme.md' || base === 'readme') return true;
  if (base.endsWith('.md')) return true;
  if (file.startsWith('.github/') && !file.startsWith('.github/workflows/')) return true;
  if (['.gitignore', '.dockerignore', '.env.example', '.mcp.json'].includes(base)) return true;
  return false;
}

function isContent(file: string): boolean {
  // Structured content/data and static public assets. Generated/Unicode data is
  // handled earlier by the build-ci rule (see isBuildCi).
  return file.startsWith('data/') || file.startsWith('public/');
}

function isUi(file: string): boolean {
  // Learner-visible UI/component surfaces: changing them can affect layout or
  // keyboard focus order, so they map to T3 and run visual + a11y checks
  // (see RISK_TO_TIER). Any `.astro` file under src/ is treated as learner-visible.
  return (
    file.startsWith('src/components/') ||
    file.startsWith('src/pages/') ||
    file.startsWith('src/layouts/') ||
    (file.startsWith('src/') && file.endsWith('.astro'))
  );
}

function isClient(file: string): boolean {
  return file.startsWith('src/client/');
}

function isDomain(file: string): boolean {
  return (
    file.startsWith('src/domain/') ||
    file.startsWith('src/lib/') ||
    file.startsWith('src/content/')
  );
}

const RULES: Rule[] = [
  { class: 'tests', match: (f) => f.startsWith('tests/') },
  { class: 'build-ci', match: isBuildCi },
  { class: 'contract', match: isContract },
  { class: 'auth', match: isAuth },
  { class: 'docs', match: isDocs },
  { class: 'content', match: isContent },
  { class: 'ui', match: isUi },
  { class: 'client', match: isClient },
  { class: 'domain', match: isDomain },
  { class: 'unknown', match: () => true },
];

export function classifyFile(file: string): RiskClass {
  const normalized = normalize(file);
  for (const rule of RULES) {
    if (rule.match(normalized)) return rule.class;
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Affected-domain test selection for the T1 `domain` class. Each entry maps a
// source basename to the vitest globs that cover it. Order is significant:
// first match wins, so the most specific feature wins over a generic token
// (e.g. `basicVocabularyProgress` matches `basicvocabulary`, not `progress`).
// A source file that matches no entry returns `[]`, and the classifier then
// escalates that change from T1 to T2 (full Vitest) — never a silent skip.
// `tests/validation/classifier.test.ts` asserts every file under
// src/{domain,lib,content} is covered, so the map cannot drift.
// ---------------------------------------------------------------------------

interface DomainRule {
  match: (basename: string) => boolean;
  testGlobs: string[];
}

export const DOMAIN_TEST_RULES: DomainRule[] = [
  {
    match: (b) => b.includes('basicvocabulary'),
    testGlobs: ['tests/basic-vocabulary-*.test.ts'],
  },
  {
    match: (b) => b === 'learnersessionpayload.ts',
    testGlobs: ['tests/basic-vocabulary-*.test.ts'],
  },
  {
    match: (b) => b.includes('vocabularyprogress') || b.includes('vocabularysession'),
    testGlobs: ['tests/vocabulary-progress.test.ts', 'tests/vocabulary-session.test.ts'],
  },
  {
    match: (b) => b.includes('vocabularyquiz'),
    testGlobs: ['tests/vocabulary-quiz-*.test.ts'],
  },
  {
    match: (b) => b.includes('pathsprogress') || b.includes('pathsreadiness'),
    testGlobs: ['tests/paths-progress.test.ts', 'tests/paths-readiness-lifecycle.test.ts'],
  },
  {
    match: (b) => b.includes('scriptselection') || b.includes('scriptpreference'),
    testGlobs: ['tests/script-selection.test.ts', 'tests/script-preference-*.test.ts'],
  },
  {
    match: (b) => b.includes('tonepractice'),
    testGlobs: ['tests/tone-practice-*.test.ts'],
  },
  {
    match: (b) => b.includes('wordorderpractice'),
    testGlobs: ['tests/word-order-practice-*.test.ts'],
  },
  {
    match: (b) => b.includes('travelquest'),
    testGlobs: ['tests/travel-quest-readiness.test.ts'],
  },
  {
    match: (b) => b.includes('practice'),
    testGlobs: [
      'tests/practice*.test.ts',
      'tests/practice-content-validation.test.ts',
      'tests/lesson-practice-ui.test.ts',
    ],
  },
  {
    match: (b) => b.includes('progress'),
    testGlobs: ['tests/progress*.test.ts', 'tests/home-progress-lifecycle.test.ts'],
  },
  {
    match: (b) => b.includes('loadlessons'),
    testGlobs: [
      'tests/lessons.test.ts',
      'tests/lesson-script-preference.test.ts',
      'tests/lesson-practice-ui.test.ts',
    ],
  },
  {
    match: (b) => b.includes('loadlearningpaths'),
    testGlobs: ['tests/learning-paths-*.test.ts'],
  },
  {
    match: (b) => b.includes('loadkanjibridge'),
    testGlobs: ['tests/kanji-bridge-*.test.ts'],
  },
  {
    match: (b) => b.includes('loadphrasebook'),
    testGlobs: ['tests/phrasebook-*.test.ts'],
  },
  {
    match: (b) => b.includes('hsk') || b.includes('flashcard'),
    testGlobs: ['tests/flashcard-session-lifecycle.test.ts', 'tests/hsk-flashcard.test.ts'],
  },
  {
    match: (b) =>
      b.includes('teacher') ||
      b.includes('learnermanifest') ||
      b.includes('learnercorpus') ||
      b.includes('webpdimensions'),
    testGlobs: ['tests/teacher-*.test.ts', 'tests/build/teacher-preview-build.test.ts'],
  },
  {
    match: (b) => b.includes('unicode'),
    testGlobs: ['tests/unicode*.test.ts'],
  },
  {
    match: (b) => b.includes('theme'),
    testGlobs: ['tests/theme-preference.test.ts'],
  },
  {
    match: (b) => b.includes('timeout'),
    testGlobs: ['tests/timeout-manager.test.ts'],
  },
];

/** Affected test globs for a single source file, or `[]` if unmapped. */
export function domainTestGlobsFor(file: string): string[] {
  const base = normalize(file).split('/').at(-1) ?? file;
  for (const rule of DOMAIN_TEST_RULES) {
    if (rule.match(base)) return rule.testGlobs;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Top-level classification.
// ---------------------------------------------------------------------------

export const CLASS_LABEL: Record<RiskClass, string> = {
  docs: 'docs/static',
  content: 'content/data',
  tests: 'tests',
  domain: 'pure TS/domain',
  client: 'client state/storage/session',
  ui: 'UI/component',
  auth: 'auth/account',
  contract: 'schema/repository contract',
  'build-ci': 'schema/generator/build/CI',
  unknown: 'unknown',
};

export function classifyFiles(files: string[]): Classification {
  const riskClasses = new Set<RiskClass>();
  const reasons: string[] = [];
  let trustworthy = true;

  for (const file of files) {
    const riskClass = classifyFile(file);
    riskClasses.add(riskClass);
    if (riskClass === 'unknown') {
      trustworthy = false;
      reasons.push(`${file}: unclassified → fail safe to T3`);
    }
  }

  let tier: Tier = 't0';
  for (const riskClass of riskClasses) {
    const candidate = RISK_TO_TIER[riskClass];
    if (TIER_ORDER[candidate] > TIER_ORDER[tier]) tier = candidate;
  }

  // Affected selection for T1 `domain` files. Any unmapped domain source
  // escalates the whole change to T2 so no test is silently skipped.
  const domainFiles = files.filter((f) => classifyFile(f) === 'domain');
  const affectedTestGlobs = new Set<string>();
  let unmappedDomain = false;
  for (const file of domainFiles) {
    const globs = domainTestGlobsFor(file);
    if (globs.length === 0) {
      unmappedDomain = true;
    } else {
      for (const glob of globs) affectedTestGlobs.add(glob);
    }
  }
  if (unmappedDomain) {
    if (TIER_ORDER[tier] < TIER_ORDER.t2) tier = 't2';
    reasons.push('unmapped domain source → escalate to T2 (full Vitest)');
  }

  const affectedContent = riskClasses.has('content') && !riskClasses.has('build-ci');
  const affectedTests = files.filter((f) => classifyFile(f) === 'tests');

  const runFullVitest = TIER_ORDER[tier] >= TIER_ORDER.t2;
  const runAffectedVitest =
    tier === 't1' && (affectedTestGlobs.size > 0 || affectedTests.length > 0);
  const runBuild = TIER_ORDER[tier] >= TIER_ORDER.t2;
  const runContent = TIER_ORDER[tier] >= TIER_ORDER.t3 || affectedContent;
  const runVisual = TIER_ORDER[tier] >= TIER_ORDER.t3;
  const runA11y = TIER_ORDER[tier] >= TIER_ORDER.t3;

  if (files.length === 0) {
    reasons.push('no changed files');
  }

  const classes = [...riskClasses].sort();
  const classSummary = classes.map((c) => CLASS_LABEL[c]).join(', ') || 'none';
  const summary = `tier=${tier} (${classSummary})` +
    (reasons.length ? `; ${reasons.join('; ')}` : '');

  return {
    tier,
    trustworthy,
    riskClasses: classes,
    reasons,
    affectedTestGlobs: [...affectedTestGlobs].sort(),
    affectedContent,
    affectedTests,
    runFullVitest,
    runAffectedVitest,
    runBuild,
    runContent,
    runVisual,
    runA11y,
    summary,
  };
}
