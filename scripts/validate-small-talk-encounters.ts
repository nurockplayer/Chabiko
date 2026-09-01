#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import {
  loadSmallTalkEncounterDocument,
  validateSmallTalkEncounterDocument,
} from '../src/content/loadSmallTalkEncounters.ts';

function runSelfTest(): void {
  const valid = structuredClone(loadSmallTalkEncounterDocument()) as unknown as {
    families: Array<{
      encounters: Array<{
        beats: Array<{ strategies: Array<{ branch: { outcome: string } }> }>;
      }>;
    }>;
  };
  validateSmallTalkEncounterDocument(valid);
  valid.families[0].encounters[0].beats[0].strategies[0].branch.outcome = 'UNKNOWN';
  let rejected = false;
  try {
    validateSmallTalkEncounterDocument(valid);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('validator self-test expected an unknown outcome to fail closed');
  process.stdout.write('Small Talk Encounter validator self-test passed\n');
}

function runCheck(filePath: string): void {
  const input: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  validateSmallTalkEncounterDocument(input);
  process.stdout.write(`Small Talk Encounter contract valid: ${filePath}\n`);
}

function main(): void {
  const [command, filePath, ...rest] = process.argv.slice(2);
  if (rest.length > 0) throw new Error('too many arguments');
  if (command === '--self-test' && filePath === undefined) {
    runSelfTest();
    return;
  }
  if (command === '--check' && filePath !== undefined) {
    runCheck(filePath);
    return;
  }
  throw new Error(
    'Usage: node scripts/validate-small-talk-encounters.ts --self-test | --check <file>',
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Small Talk Encounter validation failed: ${message}\n`);
  process.exitCode = 1;
}
