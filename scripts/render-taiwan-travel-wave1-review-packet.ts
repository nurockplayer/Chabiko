import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  loadTaiwanTravelWave1ReviewPacket,
  renderTaiwanTravelWave1ReviewPacket,
  TAIWAN_TRAVEL_WAVE1_PACKET_PATH,
} from '../src/content/loadTaiwanTravelWave1ReviewScope';

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

async function main(): Promise<void> {
  const root = resolve(optionValue('--root') ?? process.cwd());
  const outputPath = resolve(
    optionValue('--output') ?? resolve(root, TAIWAN_TRAVEL_WAVE1_PACKET_PATH),
  );
  const packet = await loadTaiwanTravelWave1ReviewPacket(root);
  const rendered = renderTaiwanTravelWave1ReviewPacket(packet);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, rendered, 'utf8');
  process.stdout.write(`Wrote ${outputPath}\n`);
}

await main();
