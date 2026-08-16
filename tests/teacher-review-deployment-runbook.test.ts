// @vitest-environment node
/**
 * Documented local Pages command self-test (Issue #390).
 *
 * The runbook documents the local Pages Functions command. Per the repository
 * rule that documented workflow commands must be asserted by a self-test, this
 * test extracts that exact command from the markdown and asserts it is valid
 * shell syntax and wires every required production variable/binding.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RUNBOOK = fileURLToPath(
  new URL('../docs/engineering/teacher-review-deployment-runbook.md', import.meta.url),
);

function extractLocalPagesCommand(markdown: string): string {
  const fence = '```sh';
  let start = markdown.indexOf(fence);
  while (start !== -1) {
    const blockStart = start + fence.length;
    const blockEnd = markdown.indexOf('```', blockStart);
    if (blockEnd === -1) throw new Error('Unclosed sh fenced block in runbook.');
    const block = markdown.slice(blockStart, blockEnd).trim();
    if (block.includes('wrangler pages dev')) return block;
    start = markdown.indexOf(fence, blockEnd);
  }
  throw new Error('Runbook documents no local Pages command (wrangler pages dev).');
}

describe('teacher-review deployment runbook local Pages command (Issue #390)', () => {
  const markdown = readFileSync(RUNBOOK, 'utf8');
  const command = extractLocalPagesCommand(markdown);

  it('documents a local Pages command with the D1 binding', () => {
    expect(command).toContain('wrangler pages dev');
    expect(command).toContain('--d1');
    expect(command).toContain('TEACHER_REVIEW_DB');
  });

  it('is valid shell syntax', () => {
    expect(() =>
      execFileSync('sh', ['-n'], {
        input: `${command}\n`,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    ).not.toThrow();
  });

  it('references every required production variable', () => {
    expect(command).toContain('TEACHER_REVIEW_ACCESS_TEAM_DOMAIN');
    expect(command).toContain('TEACHER_REVIEW_ACCESS_AUD');
    expect(command).toContain('TEACHER_REVIEW_ELIGIBLE_REVIEWER_EMAILS');
  });

  it('quotes every env-var placeholder so the example is copy-paste-correct', () => {
    const envLines = command
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\w+=/.test(line));
    expect(envLines.length).toBeGreaterThan(0);
    for (const line of envLines) {
      const rhs = line.replace(/^\w+=/, '');
      const literal = rhs.replace(/\\$/, '').trim();
      // An unquoted `<...>` would be parsed as shell redirection, not a value.
      expect(literal.startsWith("'")).toBe(true);
      expect(literal.endsWith("'")).toBe(true);
    }
  });
});
