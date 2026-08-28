import { mkdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, extname, resolve } from 'node:path';

// This command runs under the repository's Node 24 type-stripping contract.
// Application modules use bundler-style extensionless imports and JSON imports;
// keep that compatibility local to this short-lived command process instead of
// requiring an undeclared TypeScript runner or changing the production graph.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      const resolved = nextResolve(specifier, context);
      return resolved.format === 'json'
        ? {
            ...resolved,
            importAttributes: { ...context.importAttributes, type: 'json' },
          }
        : resolved;
    } catch (error) {
      if (
        !(error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND') ||
        !specifier.startsWith('.') ||
        extname(specifier)
      ) {
        throw error;
      }
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const {
  loadTaiwanTravelWave1ReviewPacket,
  renderTaiwanTravelWave1ReviewPacket,
  TAIWAN_TRAVEL_WAVE1_PACKET_PATH,
} = await import('../src/content/loadTaiwanTravelWave1ReviewScope.ts');

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
