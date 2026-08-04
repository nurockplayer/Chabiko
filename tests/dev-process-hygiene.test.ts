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
    expect(prTemplate).toMatch(/不得只寫裸 issue number/s);
  });
});

describe('AGENTS.md Coordinator worktree policy guards against agent resume in a shared worktree', () => {
  it('requires a Coordinator-precreated worktree with an absolute path', () => {
    expect(agentsMd).toContain('Issue 實作與 Coordinator Worktree 規範');
    expect(agentsMd).toMatch(/Coordinator.*預先建立.*worktree/s);
    expect(agentsMd).toMatch(/absolute worktree path/s);
  });

  it('forbids agents from creating, switching, renaming, or deleting worktrees', () => {
    expect(agentsMd).toMatch(/不得自行建立、切換、改名或刪除 worktree/s);
  });

  it('assigns worktree cleanup to the Coordinator after the PR and remote commits are safe', () => {
    expect(agentsMd).toMatch(/worktree 清理.*PR 建立.*遠端 commit 安全.*Coordinator/s);
  });
});

describe('AGENTS.md reviewer fallback policy prevents a paused isolation review from being reclaimed silently', () => {
  it('requires a fresh issue-reviewer instance on the same exact head (no resume)', () => {
    expect(agentsMd).toMatch(/全新的 issue-reviewer instance/s);
    expect(agentsMd).toMatch(/不得 resume 同一個/s);
  });

  it('allows a fresh read-only general-purpose fallback reviewer as last resort', () => {
    expect(agentsMd).toMatch(/read-only general-purpose reviewer/s);
  });

  it('requires the fallback reviewer to report exact reviewed head and blocking findings', () => {
    expect(agentsMd).toMatch(/exact reviewed head/s);
    expect(agentsMd).toMatch(/No blocking findings/s);
  });

  it('never lets controller validation replace the reviewer verdict', () => {
    expect(agentsMd).toMatch(/Controller.*驗證.*不得取代.*reviewer verdict/s);
  });
});
