import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Unicode mechanical extraction contract (#260)', () => {
  it('provides the Python 3.14 and uv runtime to the pnpm test CI job', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    const appJob = workflow.slice(workflow.indexOf('  app:'), workflow.indexOf('  visual:'));

    expect(appJob).toContain('uses: actions/setup-python@v5');
    expect(appJob).toContain('python-version-file: .python-version');
    expect(appJob).toContain('uses: astral-sh/setup-uv@v5');
    expect(appJob.indexOf('uses: actions/setup-python@v5')).toBeLessThan(appJob.indexOf('run: pnpm test'));
    expect(appJob.indexOf('uses: astral-sh/setup-uv@v5')).toBeLessThan(appJob.indexOf('run: pnpm test'));
  });

  it('passes the focused executable contract suite', () => {
    const output = execFileSync(
      'uv',
      ['run', '--locked', 'python', 'tests/python/test_unicode_contract.py'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    // unittest writes its success summary to stderr; a zero exit status is the
    // executable contract, while stdout remains clean for machine callers.
    expect(output).toBe('');
  });

  it('keeps committed generated data byte-identical to the canonical workflow', () => {
    const output = execFileSync(
      'uv',
      ['run', '--locked', 'python', 'scripts/extract_unicode_data.py', '--check'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(output).toContain('Unicode generated data is current');

    const validation = execFileSync(
      'uv',
      ['run', '--locked', 'python', 'scripts/validate_unicode_data.py'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(validation).toContain('Unicode dataset is valid');
  });
});
