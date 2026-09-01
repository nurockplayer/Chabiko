import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync('src/pages/dev/small-talk/index.astro', 'utf8');
const home = readFileSync('src/pages/index.astro', 'utf8');
const header = readFileSync('src/components/Header.astro', 'utf8');
const dashboard = readFileSync('src/domain/dashboardProgress.ts', 'utf8');
const learningPaths = readFileSync('data/learning-paths.json', 'utf8');
const client = readFileSync('src/client/smallTalkLab.ts', 'utf8');
const component = readFileSync('src/components/SmallTalkLab.astro', 'utf8');

describe('/dev/small-talk/ isolation contract', () => {
  it('is non-production, noindex, and not discoverable from production navigation', () => {
    expect(route).toContain('robots="noindex, nofollow"');
    expect(route).toContain('試作');
    expect(route).toContain('人による言語レビュー前');
    expect(route).not.toContain('<Header');
    expect(route).not.toContain('<TrackNav');
    for (const productionSurface of [home, header, dashboard, learningPaths]) {
      expect(productionSurface).not.toContain('/dev/small-talk/');
    }
  });

  it('keeps the adapter free of persistence, account, sync, and network seams', () => {
    expect(client).not.toMatch(/localStorage|sessionStorage|fetch\(|XMLHttpRequest|WebSocket/);
    expect(client).not.toMatch(/from ['"]\.\.\/(?:lib|client)\/(?:.*progress|.*account|.*auth|.*sync)/i);
    expect(client).toContain('createSmallTalkEncounterSession');
    expect(client).toContain('applySmallTalkEncounterAction');
  });

  it('invites an unrecorded private response and leaves learning semantics in the runtime output', () => {
    expect(component).toContain('声に出すか、頭の中で一度考えてみましょう');
    expect(component).toContain('録音も採点もしません');
    expect(client).not.toContain('聞き返しは、会話を戻すための選択です');
    expect(client).not.toContain('repairCompleted');
  });
});
