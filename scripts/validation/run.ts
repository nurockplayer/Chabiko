// Executable entrypoint for the validation ladder. Two subcommands:
//
//   node scripts/validation/run.ts classify [--files a,b] [--base origin/main]
//     — print the tier + CI gate flags (optionally as GitHub output).
//   node scripts/validation/run.ts run [--tier t1] [--base origin/main]
//     — classify the working tree against `--base`, then execute the tier's
//       commands, reporting per-command wall-clock durations.
//   node scripts/validation/run.ts affected [--base origin/main]
//     — run only the affected vitest subset / content validators (no static
//       checks), for the CI T1 affected step.
//
// Used by the `pnpm validate:*` scripts so Agents invoke a stable, reviewed
// command instead of improvising test selection. `--tier` forces a minimum
// tier (a local override); without it the classifier decides from the diff.

import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CLASS_LABEL,
  classifyFiles,
  TIER_ORDER,
  TIER_STATIC_SCRIPTS,
  type Classification,
  type Tier,
} from './classify.ts';

const repoRoot = process.cwd();

function gitChangedFiles(base: string): string[] {
  const changed = new Set<string>();

  // Committed changes since the merge-base with `base` (three-dot). In CI the
  // checkout is clean, so this alone yields the PR's change set.
  const committed = spawnSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMRD', `${base}...HEAD`],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (committed.status !== 0) {
    throw new Error(`git diff failed: ${committed.stderr?.trim() ?? committed.error?.message}`);
  }
  for (const line of splitLines(committed.stdout)) changed.add(line);

  // Uncommitted working-tree changes (staged + unstaged) and untracked files.
  // Agents run `pnpm validate` mid-cycle, before changes are committed, so the
  // diff alone would under-report.
  const unstaged = spawnSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMRD'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const staged = spawnSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMRD', '--cached'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const untracked = spawnSync(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  for (const lines of [unstaged.stdout, staged.stdout, untracked.stdout]) {
    for (const line of splitLines(lines)) changed.add(line);
  }

  return [...changed].sort();
}

function splitLines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Repo-relative paths of sources allowlisted in `data/unicode/source-manifest.json`
 * (`sources[].path`). Injected into classifyFiles so a change to any allowlisted
 * source escalates to T2 (full Vitest runs the #260 contract / stale-artifact
 * checks). Read with readFileSync + JSON.parse — NOT a JSON import attribute —
 * because the CI classify job runs this file under plain Node type-stripping,
 * where import attributes are unsupported. A missing manifest (e.g. the
 * throwaway temp-repo CLI self-tests) degrades to an empty set; a malformed
 * manifest is a hard error (fail closed) so a source change can never silently
 * skip the canonical gate.
 */
function readUnicodeSourcePaths(): Set<string> {
  const manifestPath = join(repoRoot, 'data/unicode/source-manifest.json');
  if (!existsSync(manifestPath)) return new Set();
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    sources?: Array<{ path?: unknown }>;
  };
  const paths = new Set<string>();
  for (const source of manifest.sources ?? []) {
    if (typeof source?.path === 'string' && source.path.length > 0) paths.add(source.path);
  }
  return paths;
}

interface ParsedArgs {
  subcommand: 'classify' | 'run' | 'affected';
  base: string;
  tier: Tier | null;
  files: string[] | null;
  emitGithubOutput: boolean;
  forceMain: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    subcommand: 'classify',
    base: 'origin/main',
    tier: null,
    files: null,
    emitGithubOutput: false,
    forceMain: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === 'classify' || arg === 'run' || arg === 'affected') args.subcommand = arg;
    else if (arg === '--base') args.base = argv[++i];
    else if (arg === '--tier') args.tier = argv[++i] as Tier;
    else if (arg === '--files') args.files = argv[++i].split(',');
    else if (arg === '--emit-github-output') args.emitGithubOutput = true;
    else if (arg === '--main') args.forceMain = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function buildPlan(
  classification: Classification,
  forcedTier: Tier | null,
  forceMain: boolean,
): Classification & { effectiveTier: Tier } {
  let effectiveTier = classification.tier;
  if (forceMain) effectiveTier = 't3';
  if (forcedTier && TIER_ORDER[forcedTier] > TIER_ORDER[effectiveTier]) {
    effectiveTier = forcedTier;
  }
  const runFullVitest = TIER_ORDER[effectiveTier] >= TIER_ORDER.t2;
  const runAffectedVitest =
    effectiveTier === 't1' &&
    (classification.affectedTestGlobs.length > 0 || classification.affectedTests.length > 0);
  const runBuild = TIER_ORDER[effectiveTier] >= TIER_ORDER.t2;
  const runContent = TIER_ORDER[effectiveTier] >= TIER_ORDER.t3 || classification.affectedContent;
  const runVisual = TIER_ORDER[effectiveTier] >= TIER_ORDER.t3;
  const runA11y = TIER_ORDER[effectiveTier] >= TIER_ORDER.t3;

  const classSummary =
    classification.riskClasses.map((c) => CLASS_LABEL[c]).join(', ') || 'none';
  const overrides: string[] = [];
  if (forceMain) overrides.push('main: full gate');
  else if (forcedTier && TIER_ORDER[forcedTier] > TIER_ORDER[classification.tier]) {
    overrides.push(`forced ${forcedTier}`);
  }
  const summaryParts = [`tier=${effectiveTier} (${classSummary})`];
  summaryParts.push(...overrides);
  if (classification.reasons.length) summaryParts.push(classification.reasons.join('; '));

  return {
    ...classification,
    tier: effectiveTier,
    effectiveTier,
    runFullVitest,
    runAffectedVitest,
    runBuild,
    runContent,
    runVisual,
    runA11y,
    summary: summaryParts.join('; '),
  };
}

function run(command: string, args: string[]): number {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const status = result.status ?? (result.error ? 1 : 0);
  const ok = status === 0;
  process.stderr.write(`  [${ok ? 'ok' : 'FAIL'}] ${command} ${args.join(' ')} (${seconds}s)\n`);
  return status;
}

/**
 * Resolve affected-domain test globs to concrete files and run them. Vitest's
 * positional filter is a regex, not a shell glob, so we resolve the globs here
 * (via node's glob) and pass exact paths. If a mapped glob resolves to no files
 * (a renamed/deleted test), we fail safe by running the full suite instead of
 * silently skipping the affected tests.
 */
function runAffectedVitest(plan: Classification): number {
  const files = new Set<string>();
  for (const glob of plan.affectedTestGlobs) {
    for (const file of globSync(glob)) files.add(file);
  }
  // A deleted test path (tracked with D) can land in `affectedTests` but no
  // longer exists on disk; passing it to vitest fails with "No test files
  // found". Drop nonexistent files here so the fail-safe below handles them.
  for (const file of plan.affectedTests) {
    if (existsSync(file)) files.add(file);
  }

  if (files.size === 0) {
    return run('pnpm', ['exec', 'vitest', 'run']);
  }
  return run('pnpm', ['exec', 'vitest', 'run', ...[...files].sort()]);
}

/** Run the T1 affected selection: affected vitest (if any) + content validators. */
function runAffected(plan: Classification): number {
  let exitCode = 0;
  if (plan.affectedTestGlobs.length > 0 || plan.affectedTests.length > 0) {
    if (runAffectedVitest(plan) !== 0) exitCode = 1;
  }
  if (plan.affectedContent) {
    if (run('pnpm', ['validate:content']) !== 0) exitCode = 1;
  }
  return exitCode;
}

function executeCommands(
  plan: Classification & { effectiveTier: Tier },
): number {
  const scripts = TIER_STATIC_SCRIPTS[plan.effectiveTier];
  let exitCode = 0;

  for (const script of scripts) {
    if (run('pnpm', [script]) !== 0) exitCode = 1;
  }

  // T1 affected selection (only meaningful below T2, which already runs the
  // full Vitest suite).
  if (plan.effectiveTier === 't1') {
    if (runAffected(plan) !== 0) exitCode = 1;
  }

  return exitCode;
}

function emitGithubOutput(plan: Classification & { effectiveTier: Tier }): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  const lines = [
    `tier=${plan.effectiveTier}`,
    `trustworthy=${plan.trustworthy}`,
    `run_full_vitest=${plan.runFullVitest}`,
    `run_affected_vitest=${plan.runAffectedVitest}`,
    `run_build=${plan.runBuild}`,
    `run_content=${plan.runContent}`,
    `run_visual=${plan.runVisual}`,
    `run_a11y=${plan.runA11y}`,
    `summary=${plan.summary}`,
  ];
  if (outputPath) writeFileSync(outputPath, `${lines.join('\n')}\n`, { flag: 'a' });
  for (const line of lines) process.stdout.write(`${line}\n`);
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const files = args.files ?? gitChangedFiles(args.base);
  const classification = classifyFiles(files, {
    unicodeSourcePaths: readUnicodeSourcePaths(),
  });
  const plan = buildPlan(classification, args.tier, args.forceMain);

  process.stderr.write(`${plan.summary}\n`);

  if (args.subcommand === 'classify') {
    if (args.emitGithubOutput) emitGithubOutput(plan);
    else process.stdout.write(`tier=${plan.effectiveTier}\n`);
    return 0;
  }

  if (args.subcommand === 'affected') {
    return runAffected(plan);
  }

  return executeCommands(plan);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entryPoint === import.meta.url) {
  process.exitCode = main();
}
