import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dev-process hygiene tests.
 *
 * These assert the repository's own PR template and the AGENTS.md agent/worktree
 * policy. They deliberately read only repository files (never HOME / ~/.claude),
 * and they verify the template + policy text, NOT any real PR body. Mechanical
 * enforcement of actual PR bodies is a separate follow-up ticket.
 */
const repoRoot = process.cwd();

const agentsMd = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');
const prTemplate = readFileSync(join(repoRoot, '.github', 'pull_request_template.md'), 'utf-8');

describe('PR template requires an explicit issue close link', () => {
  it('has a standalone `Closes #<issue-number>` line (not a checkbox)', () => {
    expect(prTemplate).toMatch(/^\s*Closes #<issue-number>\s*$/m);
    expect(prTemplate).not.toMatch(/- \[.\] .*Closes #/m);
  });

  it('lists scope, changed files, validation, and non-goals', () => {
    expect(prTemplate).toContain('## Scope');
    expect(prTemplate).toContain('### Exact non-goals');
    expect(prTemplate).toContain('## Changed files');
    expect(prTemplate).toContain('## Validation Results');
  });

  it('forbids bare issue-number references', () => {
    // The instruction not to use a bare issue number must be present next to the Closes line.
    expect(prTemplate).toMatch(/do not use only a bare issue number/s);
  });
});

describe('AGENTS.md Coordinator worktree policy guards against agent resume in a shared worktree', () => {
  it('requires a Coordinator-precreated worktree with an absolute path', () => {
    expect(agentsMd).toContain('Issue Implementation and Coordinator Worktree Rules');
    expect(agentsMd).toMatch(/Coordinator creates an isolated worktree.*absolute worktree path/s);
  });

  it('forbids agents from creating, switching, renaming, or deleting worktrees', () => {
    expect(agentsMd).toMatch(/must not create, switch, rename, or delete worktrees itself/s);
  });

  it('assigns worktree cleanup to the Coordinator after the PR and remote commits are safe', () => {
    expect(agentsMd).toMatch(/Coordinator.*clean up a worktree.*only after the PR exists.*remote commit is safe/s);
  });
});

describe('AGENTS.md reviewer fallback policy prevents a paused isolation review from being reclaimed silently', () => {
  it('requires a fresh issue-reviewer instance on the same exact head (no resume)', () => {
    expect(agentsMd).toMatch(/fresh issue-reviewer instance/s);
    expect(agentsMd).toMatch(/Do not resume the same reviewer/s);
  });

  it('allows a fresh read-only general-purpose fallback reviewer as last resort', () => {
    expect(agentsMd).toMatch(/read-only general-purpose reviewer/s);
  });

  it('requires the fallback reviewer to report exact reviewed head and blocking findings', () => {
    expect(agentsMd).toMatch(/exact reviewed head/s);
    expect(agentsMd).toMatch(/No blocking findings/s);
  });

  it('never lets controller validation replace the reviewer verdict', () => {
    expect(agentsMd).toMatch(/Controller validation cannot substitute for a reviewer verdict/s);
  });
});

describe('AGENTS.md throughput-aware review and merge policy supports parallel sub-agent delivery', () => {
  it('defines a canonical review and merge policy section with parallel implementation then bounded sequential integration', () => {
    expect(agentsMd).toContain('## Review and Merge Policy (Concurrent Sub-Agent Throughput Aware)');
    expect(agentsMd).toMatch(/parallel isolated implementation\s*→ bounded review queue\s*→ independent exact-head review\s*→ sequential integration against latest main/s);
  });

  it('forbids the implementing agent from being the sole reviewer and requires an exact-head verdict', () => {
    expect(agentsMd).toContain('must not be the sole reviewer of its own work');
    expect(agentsMd).toContain('exact current head');
  });

  it('documents CodeRabbit as advisory by default, not a universal synchronous gate', () => {
    expect(agentsMd).toContain('CodeRabbit is advisory by default');
    expect(agentsMd).toContain('A successful CodeRabbit check is not reviewer approval');
    expect(agentsMd).toContain('Only unresolved blocking findings block merge');
  });

  it('defines deterministic low, medium, and high risk tiers', () => {
    expect(agentsMd).toContain('**Low risk:**');
    expect(agentsMd).toContain('**Medium risk:**');
    expect(agentsMd).toContain('**High risk:**');
    expect(agentsMd).toContain('an equivalent independent reviewer may replace it');
  });

  it('documents bounded review queue and sequential integration throughput limits', () => {
    expect(agentsMd).toContain('At most 4 implementation PRs may wait concurrently');
    expect(agentsMd).toContain('At most 2 PRs may be in final review concurrently');
    expect(agentsMd).toContain('Merge only one PR at a time, against the latest `main`');
    expect(agentsMd).toContain('Additional completed agent work remains in the implementation-ready queue');
  });

  it('treats a stale base SHA alone as non-blocking and only updates branch on concrete triggers', () => {
    // A stale base SHA is never by itself a blocker; the PR keeps its reviewed head.
    expect(agentsMd).toContain('A stale base SHA alone is not a blocker');
    expect(agentsMd).not.toContain('stale-head 的 PR 必須先從最新 `main` update 並重跑 required gates');
    // Update-branch is required only for the enumerated concrete triggers.
    expect(agentsMd).toContain('merge conflict');
    expect(agentsMd).toContain('changed-file overlap requiring reintegration');
    expect(agentsMd).toContain('dependency/API/schema/contract changed');
    expect(agentsMd).toContain('required validation fails on the temporary integration result');
    expect(agentsMd).toContain('branch protection explicitly requires an up-to-date branch');
    // Otherwise keep the reviewed head and validate via a temporary merge/integration tree.
    expect(agentsMd).toContain('temporary merge/integration tree');
    expect(agentsMd).toContain('Do not rerun the complete exact-head review');
  });

  it('binds the reviewer verdict to the actual reviewed candidate', () => {
    expect(agentsMd).toContain('A reviewer verdict is bound to the actual reviewed candidate');
    expect(agentsMd).toContain('Merge is not a review');
    expect(agentsMd).toContain('invalidates the prior exact-head verdict');
  });

  it('defines the merge gate with exact-head, blocking-thread, CI, scope, and dependency checks', () => {
    expect(agentsMd).toContain('required CI and repository validation gates are green on the exact head');
    expect(agentsMd).toContain('no unresolved non-outdated blocking review thread remains');
    expect(agentsMd).toContain('reviewed head SHA is unchanged');
    expect(agentsMd).toContain('scope matches the owning issue with no unrelated work bundled');
    expect(agentsMd).toContain('integration order and dependency constraints remain valid against latest `main`');
  });

  it('states that unfinished CodeRabbit is not an independent merge blocker by default', () => {
    expect(agentsMd).toContain('An unfinished CodeRabbit run is not an independent merge blocker');
    expect(agentsMd).toContain('selected as one of its required review signals');
  });
});

describe('PR template records the throughput-aware review and merge policy fields', () => {
  it('records a risk tier with rationale', () => {
    expect(prTemplate).toContain('## Review and Merge Policy Compliance');
    expect(prTemplate).toContain('### Risk tier');
    expect(prTemplate).toContain('Low risk');
    expect(prTemplate).toContain('Medium risk');
    expect(prTemplate).toContain('High risk');
    expect(prTemplate).toContain('{{low | medium | high}}');
  });

  it('records the reviewed and current exact head SHAs', () => {
    expect(prTemplate).toContain('Reviewed head SHA: {{reviewed head SHA}}');
    expect(prTemplate).toContain('Current head SHA: {{current head SHA}}');
    expect(prTemplate).toContain('Reviewed head SHA unchanged at merge');
  });

  it('records independent reviewer verdicts with per-tier counts and forbids sole implementer approval', () => {
    expect(prTemplate).toContain('Required independent reviewer count: low/medium = 1, high = 2 independent review signals.');
    expect(prTemplate).toContain('Independent reviewer 2 (required for high risk; CodeRabbit may count as one signal): No blocking findings.');
    expect(prTemplate).toContain('Implementing agent did NOT serve as the sole reviewer');
  });

  it('records required checks and unresolved non-outdated blocking threads', () => {
    expect(prTemplate).toContain('### Required checks');
    expect(prTemplate).toContain('No unresolved non-outdated blocking review thread remains');
    expect(prTemplate).toContain('## Unresolved Non-Outdated Threads at Merge');
  });

  it('records whether CodeRabbit actually ran and its status', () => {
    expect(prTemplate).toContain('### CodeRabbit status');
    expect(prTemplate).toContain('CodeRabbit status: {{ran-with-findings | ran-clean | pending | skipped | disabled | quota-limited | cancelled | no-op | not-configured}}');
    expect(prTemplate).toContain('A skipped/disabled/delayed/quota-limited/cancelled/no-op CodeRabbit run does NOT by itself block merge (advisory by default).');
  });
});
