import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Unicode mechanical extraction contract (#260)', () => {
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
