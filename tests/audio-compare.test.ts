// @vitest-environment node
import { realpathSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import {
  VOICES, assertBudget, assertOutputOutsideRepo, repositoryCheckouts, azureSsml, billableCharacters,
  blindCode, buildHtml, credentials, estimate, loadItems, parseArgs, runComparison, synthesize,
} from '../scripts/audio/compare-voices';
import type { Clip, Credentials, Options } from '../scripts/audio/compare-voices';

const directories: string[] = [];
const temporary = () => { const dir = mkdtempSync(join(tmpdir(), 'chabiko-comparison-')); directories.push(dir); return dir; };
afterEach(() => { directories.forEach(dir => rmSync(dir, { recursive: true, force: true })); directories.length = 0; });
const items = loadItems();
const auth: Credentials = { azure: { key: 'secret-azure', region: 'japaneast' }, google: { apiKey: 'secret-google' } };
const env = { AZURE_SPEECH_KEY: 'secret-azure', AZURE_SPEECH_REGION: 'japaneast', GOOGLE_TTS_API_KEY: 'secret-google' };
const options = (overrides: Partial<Options> = {}): Options => ({ dryRun: false, confirmPaidTier: true, maxUsd: 0.03, output: join(temporary(), 'output'), ...overrides });
const mp3 = Buffer.from([0x49, 0x44, 0x33, 1]);
const success = (url: string | URL | Request) => Promise.resolve(String(url).includes('googleapis')
  ? new Response(JSON.stringify({ audioContent: mp3.toString('base64') }), { status: 200 })
  : new Response(mp3, { status: 200 }));

describe('matched-text corpus and cost guard', () => {
  it('keeps all 14 exact texts, punctuation and pinned sources', () => {
    expect(items.map(item => item.text)).toEqual([
      '我要一杯珍珠奶茶。', '我要一個。', '我想問一個問題。', '不要辣，謝謝。可以外帶嗎？',
      '可以，少冰。要不要辣？', '也不一定，每個人不一樣。', '銀行在哪裡', '重新', '我的行李箱很重。',
      '垃圾', '星期一', '每次不一樣，這次朋友說想準備蔬菜和肉。', '不好意思，我聽不懂。可以說慢一點嗎？', '請問機場捷運在哪裡？',
    ]);
    expect(items.every(item => item.source.includes('/5f630b0efc0b651a8c7ea1673dc29917530cb407/') && item.focus)).toBe(true);
  });
  it('counts Unicode code points, Han twice for Azure, punctuation and Google markup', () => {
    expect(billableCharacters('一𠀀 A，🙂', 'azure')).toBe(8);
    expect(billableCharacters('一𠀀 A，🙂', 'google')).toBe(6);
    expect(billableCharacters('<speak>一</speak>', 'google')).toBe(16);
    const plan = estimate(items, VOICES);
    expect(plan.counts.google).toBe(500);
    expect(plan.counts.azure).toBe(928);
    expect(plan.total).toBeCloseTo(0.01592, 8);
  });
  it('validates the budget and command options', () => {
    expect(() => assertBudget(0.03, 0.03)).not.toThrow();
    for (const max of [0.02, NaN, Infinity, -1]) expect(() => assertBudget(0.03, max)).toThrow();
    expect(parseArgs(['--only', 'google', '--max-usd', '0.02', '--dry-run']).only).toBe('google');
    for (const args of [['--only', 'other'], ['--max-usd', 'NaN'], ['--output'], ['--unknown']]) expect(() => parseArgs(args)).toThrow();
  });
  it('refuses an over-budget run and unconfirmed Azure before fetch or output', async () => {
    const fetcher = vi.fn(success);
    const config = options({ maxUsd: 0.001 });
    await expect(runComparison(config, { env, fetcher, log: vi.fn() })).rejects.toThrow('Cost estimate');
    await expect(runComparison({ ...config, maxUsd: 0.03, confirmPaidTier: false }, { env, fetcher, log: vi.fn() })).rejects.toThrow('--confirm-paid-tier');
    expect(fetcher).not.toHaveBeenCalled();
    const tokenReader = vi.fn(() => 'token');
    await expect(runComparison(config, { env: { GOOGLE_CLOUD_PROJECT: 'project' }, tokenReader, fetcher, log: vi.fn() })).rejects.toThrow('Cost estimate');
    expect(tokenReader).not.toHaveBeenCalled();
    expect(readdirSync(join(config.output, '..'))).toEqual([]);
  });
  it('dry run neither calls gcloud/fetch nor writes, even with credentials', async () => {
    const fetcher = vi.fn(success), tokenReader = vi.fn(), log = vi.fn();
    const config = options({ dryRun: true, confirmPaidTier: false });
    await runComparison(config, { env, fetcher, tokenReader, log });
    expect(log.mock.calls.flat().join('\n')).toContain('112 requests');
    expect(fetcher).not.toHaveBeenCalled(); expect(tokenReader).not.toHaveBeenCalled();
    expect(readdirSync(join(config.output, '..'))).toEqual([]);
  });
});

describe('credentials and output isolation', () => {
  it('skips missing credentials and suppresses gcloud error details', async () => {
    const log = vi.fn(); const token = vi.fn(() => { throw new Error('secret-stderr'); });
    expect(credentials({}, undefined, token, log)).toEqual({});
    expect(token).not.toHaveBeenCalled();
    expect(credentials({ GOOGLE_CLOUD_PROJECT: 'project' }, 'google', token, log)).toEqual({});
    expect(log.mock.calls.flat().join('\n')).not.toContain('secret');
    const fetcher = vi.fn(success); const config = options();
    await runComparison(config, { env: {}, fetcher, log });
    expect(fetcher).not.toHaveBeenCalled();
    expect(readdirSync(join(config.output, '..'))).toEqual([]);
  });
  it('prefers Google API key, otherwise requires project and nonempty gcloud token', () => {
    const token = vi.fn(() => 'oauth-token');
    expect(credentials(env, 'google', token)).toEqual({ google: { apiKey: 'secret-google' } });
    expect(token).not.toHaveBeenCalled();
    expect(credentials({ GOOGLE_CLOUD_PROJECT: 'project' }, 'google', token)).toEqual({ google: { token: 'oauth-token', project: 'project' } });
    expect(() => credentials({ ...env, AZURE_SPEECH_REGION: 'evil.com/path' })).toThrow('Invalid');
  });
  it('rejects root, descendants, traversal, case aliases and symlinked ancestors', () => {
    const root = process.cwd();
    for (const path of [root, join(root, 'new/sub'), join(root, '../voice-compare/out'), root.toUpperCase()]) {
      expect(() => assertOutputOutsideRepo(path)).toThrow();
    }
    const outside = temporary();
    symlinkSync(root, join(outside, 'linked'));
    expect(() => assertOutputOutsideRepo(join(outside, 'linked/new/sub'))).toThrow('outside');
    expect(assertOutputOutsideRepo(join(outside, 'safe/new'))).toContain('safe/new');
    // Every checkout of the repository is guarded, including the main checkout of a linked worktree.
    for (const checkout of repositoryCheckouts()) {
      expect(() => assertOutputOutsideRepo(join(checkout, 'voice-review-output'))).toThrow('outside');
    }
    const mainCheckout = temporary();
    expect(() => assertOutputOutsideRepo(join(mainCheckout, 'out'), undefined, [realpathSync(mainCheckout)])).toThrow('outside');
    expect(assertOutputOutsideRepo(`${root}-sibling`)).toContain('-sibling');
  });
});

describe('synthesis HTTP contract', () => {
  it('escapes SSML and uses the exact normal/slow provider requests', async () => {
    expect(azureSsml('<&>"\'', 'a"b', 'slow')).toContain('<prosody rate="-25%">&lt;&amp;&gt;&quot;&apos;</prosody>');
    expect(azureSsml('一', 'voice', 'normal')).not.toContain('prosody');
    const fetcher = vi.fn(success);
    for (const voice of VOICES) for (const speed of ['normal', 'slow'] as const) await synthesize(items[0], voice, speed, auth, vi.fn(), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(8);
    for (const [url, request] of fetcher.mock.calls as unknown as [string, RequestInit][]) {
      expect(request.redirect).toBe('error');
      if (url.includes('googleapis')) {
        expect(url).toContain('?key=secret-google');
        const body = JSON.parse(request.body as string);
        expect(body.input).toEqual({ text: items[0].text });
        expect([1, 0.75]).toContain(body.audioConfig.speakingRate);
      } else expect(request.body).toContain(items[0].text);
    }
    const oauthFetch = vi.fn(success);
    await synthesize(items[0], VOICES[2], 'normal', { google: { token: 'oauth-token', project: 'project' } }, vi.fn(), oauthFetch);
    expect(oauthFetch.mock.calls[0][0]).not.toContain('?key=');
    expect((oauthFetch.mock.calls as unknown as [string, RequestInit][])[0][1].headers).toMatchObject({ Authorization: 'Bearer oauth-token', 'x-goog-user-project': 'project' });
  });
  it('retries 429/5xx twice, charging every attempt', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(new Response(mp3));
    const charge = vi.fn(), sleep = vi.fn(async () => {});
    expect(await synthesize(items[0], VOICES[0], 'normal', auth, charge, fetcher, sleep)).toEqual(mp3);
    expect(charge).toHaveBeenCalledTimes(3); expect(sleep).toHaveBeenCalledTimes(2);
    const exhausted = vi.fn(async () => new Response('', { status: 500 }));
    await expect(synthesize(items[0], VOICES[0], 'normal', auth, vi.fn(), exhausted, sleep)).rejects.toThrow('HTTP 500');
    expect(exhausted).toHaveBeenCalledTimes(3);
  });
  it('rejects non-200, empty and malformed responses without retrying', async () => {
    for (const response of [new Response(mp3, { status: 201 }), new Response('', { status: 400 }), new Response('')]) {
      const fetcher = vi.fn(async () => response);
      await expect(synthesize(items[0], VOICES[0], 'normal', auth, vi.fn(), fetcher)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    for (const body of ['', '{}', '{"audioContent":""}', '{"audioContent":"%%%"}']) {
      await expect(synthesize(items[0], VOICES[2], 'slow', auth, vi.fn(), vi.fn(async () => new Response(body)))).rejects.toThrow('invalid');
    }
    await expect(synthesize(items[0], VOICES[2], 'normal', auth, vi.fn(), vi.fn(async () => { throw new Error('secret-google'); }))).rejects.toThrow('details withheld');
  });
  it('stops a retry before fetch when the remaining budget cannot cover it', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 429 }));
    await expect(runComparison(options({ maxUsd: estimate(items, VOICES).total }), { env, fetcher, log: vi.fn() })).rejects.toThrow('Cost estimate');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('blind artifacts', () => {
  it('codes are deterministic per seed, opaque and distinct for speed and voice', () => {
    const codes = VOICES.flatMap(voice => ['normal', 'slow'].map(speed => blindCode('seed', items[0].id, voice.name, speed)));
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toBe(blindCode('seed', items[0].id, VOICES[0].name, 'normal'));
    expect(codes[0]).not.toBe(blindCode('other-seed', items[0].id, VOICES[0].name, 'normal'));
    expect(codes.every(code => /^[a-f0-9]{24}$/.test(code) && !/azure|google|Hsiao|Wavenet/.test(code))).toBe(true);
  });
  it('embeds audio, keeps identities in the closed reveal, and gives each candidate independent page-only ratings', () => {
    const clips: Clip[] = VOICES.flatMap(voice => (['normal', 'slow'] as const).map(speed => ({ code: 'opaque', itemId: items[0].id, provider: voice.provider, voice: voice.name, speed, audio: mp3 })));
    const html = buildHtml([items[0]], VOICES, clips, 'seed');
    const window = new Window(); const doc = window.document;
    doc.write(html);
    expect(doc.querySelectorAll('audio')).toHaveLength(8);
    expect([...doc.querySelectorAll('audio')].every(audio => audio.src.startsWith('data:audio/mpeg;base64,'))).toBe(true);
    const reveal = doc.querySelector('details')!;
    expect(reveal.hasAttribute('open')).toBe(false);
    expect(reveal.textContent).toContain('zh-TW-HsiaoChenNeural');
    reveal.setAttribute('open', ''); expect(reveal.hasAttribute('open')).toBe(true);
    reveal.remove();
    expect(doc.body.innerHTML).not.toMatch(/azure|google|Hsiao|Wavenet/);
    expect(doc.querySelectorAll('input[type="radio"]')).toHaveLength(20);
    expect(new Set([...doc.querySelectorAll('input')].map(input => input.name)).size).toBe(4);
    const radio = doc.querySelector('input')!; radio.click(); expect(radio.checked).toBe(true);
    expect(html).not.toMatch(/localStorage|sessionStorage|fetch\(|<script/);
    expect(buildHtml([{ ...items[0], text: '<script>bad</script>' }], VOICES, clips, 'seed')).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(() => buildHtml([items[0]], VOICES, [], 'seed')).toThrow('Incomplete');
    window.happyDOM.abort();
  });
  it('writes a complete private offline bundle, skips unconfigured providers, refuses overwrite', async () => {
    const config = options({ confirmPaidTier: false });
    const fetcher = vi.fn(success), log = vi.fn();
    await runComparison(config, { env: { GOOGLE_TTS_API_KEY: env.GOOGLE_TTS_API_KEY }, fetcher, log });
    expect(fetcher).toHaveBeenCalledTimes(56);
    const files = readdirSync(config.output);
    expect(files.filter(name => name.endsWith('.mp3'))).toHaveLength(56);
    expect(files.some(name => /azure|google|Hsiao|Wavenet/.test(name))).toBe(false);
    const key = JSON.parse(readFileSync(join(config.output, 'key.json'), 'utf8'));
    expect(Object.keys(key.codes)).toHaveLength(56);
    expect(key.humanReview).toBe(false);
    expect(statSync(join(config.output, 'key.json')).mode & 0o777).toBe(0o600);
    expect(statSync(config.output).mode & 0o777).toBe(0o700);
    const html = readFileSync(join(config.output, 'listening.html'), 'utf8');
    expect(html.match(/data:audio\/mpeg;base64,/g)).toHaveLength(56);
    expect(html).not.toContain('secret-google');
    expect(log.mock.calls.flat().join('\n')).not.toContain('secret');
    await expect(runComparison(config, { env, fetcher, log })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(56);
  });
});
