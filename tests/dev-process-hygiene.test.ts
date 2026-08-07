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

describe('AGENTS.md throughput-aware review and merge policy supports parallel sub-agent delivery', () => {
  it('defines a canonical review and merge policy section with parallel implementation then bounded sequential integration', () => {
    expect(agentsMd).toContain('## Review 與 Merge 政策（並行 sub-agent 吞吐量感知）');
    expect(agentsMd).toMatch(/parallel isolated implementation\s*→ bounded review queue\s*→ independent exact-head review\s*→ sequential integration against latest main/s);
  });

  it('forbids the implementing agent from being the sole reviewer and requires an exact-head verdict', () => {
    expect(agentsMd).toContain('implementing agent 不得作為自身 work 的唯一 reviewer');
    expect(agentsMd).toContain('exact current head');
  });

  it('documents CodeRabbit as advisory by default, not a universal synchronous gate', () => {
    expect(agentsMd).toContain('CodeRabbit 預設 advisory：pending、delayed、skipped、disabled、quota-limited、cancelled、no-op 的 CodeRabbit run 不得單獨 block merge');
    expect(agentsMd).toContain('CodeRabbit check 標記 successful 不計為 reviewer approval');
    expect(agentsMd).toContain('CodeRabbit findings 必須分類為 blocking、valid non-blocking、incorrect/irrelevant；只有 unresolved blocking findings 阻止 merge');
  });

  it('defines deterministic low, medium, and high risk tiers', () => {
    expect(agentsMd).toContain('低風險（Low risk）');
    expect(agentsMd).toContain('中風險（Medium risk）');
    expect(agentsMd).toContain('高風險（High risk）');
    expect(agentsMd).toContain('CodeRabbit 可算一個 signal，但可用同等獨立 reviewer 取代');
  });

  it('documents bounded review queue and sequential integration throughput limits', () => {
    expect(agentsMd).toContain('最多 4 個 implementation PR 可同時在 active review queue 等待');
    expect(agentsMd).toContain('最多 2 個 PR 可同時在 final review');
    expect(agentsMd).toContain('一次只 merge 一個 PR，且必須對最新 `main` 進行');
    expect(agentsMd).toContain('額外完成的 agent work 留在 implementation-ready queue');
  });

  it('treats a stale base SHA alone as non-blocking and only updates branch on concrete triggers', () => {
    // A stale base SHA is never by itself a blocker; the PR keeps its reviewed head.
    expect(agentsMd).toContain('stale base SHA alone 不是 blocker');
    expect(agentsMd).not.toContain('stale-head 的 PR 必須先從最新 `main` update 並重跑 required gates');
    // Update-branch is required only for the enumerated concrete triggers.
    expect(agentsMd).toContain('merge conflict');
    expect(agentsMd).toContain('changed-file overlap 造成需要重新整合');
    expect(agentsMd).toContain('dependency / API / schema / contract 已改變');
    expect(agentsMd).toContain('temporary integration result 的 required validation 失敗');
    expect(agentsMd).toContain('branch protection 明確要求 up-to-date branch');
    // Otherwise keep the reviewed head and validate via a temporary merge/integration tree.
    expect(agentsMd).toContain('temporary merge／integration tree');
    expect(agentsMd).toContain('不重跑整套 exact-head review');
  });

  it('binds the reviewer verdict to the actual reviewed candidate', () => {
    expect(agentsMd).toContain('reviewer verdict 綁定實際 reviewed candidate');
    expect(agentsMd).toContain('merge 本身不構成 review');
    expect(agentsMd).toContain('原 exact-head verdict 才失效');
  });

  it('defines the merge gate with exact-head, blocking-thread, CI, scope, and dependency checks', () => {
    expect(agentsMd).toContain('required CI 與 repository validation gates 在 exact head 上 green');
    expect(agentsMd).toContain('沒有 unresolved non-outdated blocking review thread');
    expect(agentsMd).toContain('reviewed head SHA 未改變');
    expect(agentsMd).toContain('scope 符合 owning issue 且沒有無關 work 混入');
    expect(agentsMd).toContain('integration order 與 dependency constraints 對最新 `main` 仍然有效');
  });

  it('states that unfinished CodeRabbit is not an independent merge blocker by default', () => {
    expect(agentsMd).toContain('CodeRabbit 未完成不構成 independent merge blocker');
    expect(agentsMd).toContain('CodeRabbit 被選為 required review signal 之一');
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
