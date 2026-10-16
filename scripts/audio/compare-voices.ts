import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type Provider = 'azure' | 'google';
export type Speed = 'normal' | 'slow';
export interface Item { id: string; text: string; focus: string; source: string }
export interface Voice { provider: Provider; name: string }
export const VOICES: readonly Voice[] = [
  { provider: 'azure', name: 'zh-TW-HsiaoChenNeural' },
  { provider: 'azure', name: 'zh-TW-HsiaoYuNeural' },
  { provider: 'google', name: 'cmn-TW-Wavenet-A' },
  { provider: 'google', name: 'cmn-TW-Wavenet-B' },
];
const SPEEDS: Speed[] = ['normal', 'slow'];
const RATES = { azure: 15, google: 4 }; // USD per million billable characters.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function billableCharacters(text: string, provider: Provider): number {
  return [...text].reduce((sum, char) => sum + (provider === 'azure' && /\p{Script=Han}/u.test(char) ? 2 : 1), 0);
}

export function estimate(items: readonly Item[], voices: readonly Voice[]) {
  const counts = { azure: 0, google: 0 };
  for (const voice of voices) {
    counts[voice.provider] += items.reduce((sum, item) => sum + billableCharacters(item.text, voice.provider), 0) * SPEEDS.length;
  }
  const usd = { azure: counts.azure * RATES.azure / 1e6, google: counts.google * RATES.google / 1e6 };
  return { counts, usd, total: usd.azure + usd.google };
}

export function assertBudget(usd: number, maxUsd: number): void {
  if (!Number.isFinite(maxUsd) || maxUsd < 0 || usd > maxUsd + 1e-12) {
    throw new Error('Cost estimate exceeds --max-usd, or the budget is invalid. No further requests allowed.');
  }
}

/** Resolve existing ancestors too: a symlink must not bypass the worktree boundary. */
function canonicalPath(path: string): string {
  const absolute = resolve(path);
  try {
    lstatSync(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return join(canonicalPath(dirname(absolute)), basename(absolute));
  }
  return realpathSync(absolute);
}

/** Every checkout of this repository (main checkout and all linked worktrees). */
export function repositoryCheckouts(root = ROOT): string[] {
  const checkouts = new Set([realpathSync(root)]);
  try {
    const listing = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
    for (const line of listing.split('\n')) {
      if (line.startsWith('worktree ')) {
        try { checkouts.add(realpathSync(line.slice('worktree '.length))); } catch { /* pruned worktree */ }
      }
    }
  } catch { /* not a git checkout: the root alone is still guarded */ }
  return [...checkouts];
}

export function assertOutputOutsideRepo(output: string, root = ROOT, checkouts = repositoryCheckouts(root)): string {
  const path = canonicalPath(output.startsWith('~/') ? join(homedir(), output.slice(2)) : output);
  for (const repo of checkouts) {
    // Case-fold conservatively for the default macOS filesystem.
    const rel = relative(repo.toLowerCase(), path.toLowerCase());
    if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) {
      throw new Error(`Output must be outside every checkout of this repository (${repo}).`);
    }
  }
  return path;
}

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

export function azureSsml(text: string, voice: string, speed: Speed): string {
  const spoken = escapeXml(text);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-TW"><voice name="${escapeXml(voice)}">${speed === 'slow' ? `<prosody rate="-25%">${spoken}</prosody>` : spoken}</voice></speak>`;
}

export function blindCode(seed: string, ...parts: string[]): string {
  return createHmac('sha256', seed).update(JSON.stringify(parts)).digest('hex').slice(0, 24);
}

export interface Credentials { azure?: { key: string; region: string }; google?: { apiKey?: string; token?: string; project?: string } }
const readGcloudToken = (): string => execFileSync('gcloud', ['auth', 'print-access-token'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
}).trim();

export function credentials(
  env: NodeJS.ProcessEnv, only?: Provider, tokenReader = readGcloudToken, log: (message: string) => void = console.log,
): Credentials {
  const result: Credentials = {};
  if (!only || only === 'azure') {
    if (env.AZURE_SPEECH_KEY?.trim() && env.AZURE_SPEECH_REGION?.trim()) {
      // Never interpolate arbitrary environment input into a credential-bearing URL.
      if (!/^[a-z][a-z0-9-]*$/.test(env.AZURE_SPEECH_REGION)) throw new Error('Invalid AZURE_SPEECH_REGION.');
      result.azure = { key: env.AZURE_SPEECH_KEY, region: env.AZURE_SPEECH_REGION };
    } else log('Skipping Azure: set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
  }
  if (!only || only === 'google') {
    if (env.GOOGLE_TTS_API_KEY?.trim()) result.google = { apiKey: env.GOOGLE_TTS_API_KEY };
    else if (env.GOOGLE_CLOUD_PROJECT?.trim()) {
      try {
        const token = tokenReader().trim();
        if (token) result.google = { token, project: env.GOOGLE_CLOUD_PROJECT };
      } catch { /* Do not expose gcloud stderr, tokens or credential paths. */ }
    }
    if (!result.google) log('Skipping Google: set GOOGLE_TTS_API_KEY, or GOOGLE_CLOUD_PROJECT with a working gcloud login.');
  }
  return result;
}

export interface Options { dryRun: boolean; confirmPaidTier: boolean; maxUsd: number; output: string; only?: Provider }
export function parseArgs(args: string[]): Options {
  const options: Options = {
    dryRun: false, confirmPaidTier: false, maxUsd: 0.03,
    output: join(homedir(), 'Downloads', `chabiko-voice-compare-${new Date().toISOString().slice(0, 10)}`),
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--confirm-paid-tier') options.confirmPaidTier = true;
    else if (['--only', '--max-usd', '--output'].includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing option value.');
      if (flag === '--only') {
        if (value !== 'azure' && value !== 'google') throw new Error('--only must be azure or google.');
        options.only = value;
      } else if (flag === '--max-usd') options.maxUsd = Number(value);
      else options.output = value;
    } else throw new Error('Unknown option. Use --dry-run, --only azure|google, --confirm-paid-tier, --max-usd or --output.');
  }
  assertBudget(0, options.maxUsd);
  return options;
}

export function loadItems(root = ROOT): Item[] {
  const data = JSON.parse(readFileSync(join(root, 'data/audio-eval/matched-text-v1.json'), 'utf8'));
  if (!Array.isArray(data.items) || data.items.length !== 14 || data.items.some((item: Item) =>
    !item || ['id', 'text', 'focus', 'source'].some(key => typeof item[key as keyof Item] !== 'string' || !item[key as keyof Item]) ||
    !item.source.startsWith('https://github.com/nurockplayer/Chabiko/blob/')) ||
    new Set(data.items.map((item: Item) => item.id)).size !== 14) throw new Error('Invalid matched-text-v1 corpus.');
  return data.items;
}

export async function synthesize(
  item: Item, voice: Voice, speed: Speed, auth: Credentials,
  beforeAttempt: () => void, fetcher: typeof fetch = fetch,
  sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
): Promise<Buffer> {
  let url: string;
  let headers: Record<string, string>;
  let body: string;
  if (voice.provider === 'azure') {
    if (!auth.azure) throw new Error('Azure credentials unavailable.');
    url = `https://${auth.azure.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    headers = { 'Ocp-Apim-Subscription-Key': auth.azure.key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' };
    body = azureSsml(item.text, voice.name, speed);
  } else {
    if (!auth.google) throw new Error('Google credentials unavailable.');
    url = 'https://texttospeech.googleapis.com/v1/text:synthesize';
    headers = { 'Content-Type': 'application/json' };
    if (auth.google.apiKey) url += `?key=${encodeURIComponent(auth.google.apiKey)}`;
    else {
      headers.Authorization = `Bearer ${auth.google.token}`;
      headers['x-goog-user-project'] = auth.google.project!;
    }
    body = JSON.stringify({ input: { text: item.text }, voice: { languageCode: 'cmn-TW', name: voice.name }, audioConfig: { audioEncoding: 'MP3', speakingRate: speed === 'slow' ? 0.75 : 1 } });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    beforeAttempt();
    let response: Response;
    try {
      response = await fetcher(url, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    } catch { throw new Error(`${voice.provider}: network request failed (details withheld to protect credentials).`); }
    if (response.status !== 200) {
      await response.body?.cancel();
      if (attempt < 2 && (response.status === 429 || (response.status >= 500 && response.status <= 599))) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new Error(`${voice.provider}: HTTP ${response.status}; synthesis stopped.`);
    }
    try {
      let audio: Buffer;
      if (voice.provider === 'azure') audio = Buffer.from(await response.arrayBuffer());
      else {
        const data = await response.json() as { audioContent?: unknown };
        if (typeof data.audioContent !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.audioContent)) throw new Error();
        audio = Buffer.from(data.audioContent, 'base64');
      }
      if (!audio.length) throw new Error();
      return audio;
    } catch { throw new Error(`${voice.provider}: empty or invalid synthesis response.`); }
  }
  throw new Error('Retry limit reached.');
}

export interface Clip { code: string; itemId: string; provider: Provider; voice: string; speed: Speed; audio: Buffer }
export function buildHtml(items: readonly Item[], voices: readonly Voice[], clips: readonly Clip[], seed: string): string {
  const sections = items.map((item, index) => {
    const ordered = [...voices].sort((a, b) => blindCode(seed, item.id, a.name).localeCompare(blindCode(seed, item.id, b.name)));
    const candidates = ordered.map((voice, candidate) => {
      const label = String.fromCharCode(65 + candidate);
      const players = SPEEDS.map(speed => {
        const clip = clips.find(clip => clip.itemId === item.id && clip.voice === voice.name && clip.speed === speed);
        if (!clip) throw new Error('Incomplete audio set; listening page was not written.');
        const speedLabel = speed === 'normal' ? '通常' : 'ゆっくり';
        return `<div><p>${speedLabel}</p><audio controls preload="none" aria-label="文${index + 1} ${label} ${speedLabel}" src="data:audio/mpeg;base64,${clip.audio.toString('base64')}"></audio></div>`;
      }).join('');
      const radios = [1, 2, 3, 4, 5].map(value => `<label><input type="radio" name="rating-${index}-${candidate}" value="${value}">${value}</label>`).join('');
      return `<article><h3>${label}</h3>${players}<fieldset><legend>${label} の総合評価（1：低い〜5：高い）</legend>${radios}</fieldset></article>`;
    }).join('');
    return `<section><h2>${index + 1}. <span lang="zh-Hant">${escapeXml(item.text)}</span></h2><p>${escapeXml(item.focus)}</p><p><a href="${escapeXml(item.source)}" rel="noreferrer">原文の出典</a></p><div class="candidates">${candidates}</div></section>`;
  }).join('\n');
  const key = items.map((item, index) => {
    const ordered = [...voices].sort((a, b) => blindCode(seed, item.id, a.name).localeCompare(blindCode(seed, item.id, b.name)));
    return `<li>文${index + 1}: ${ordered.map((voice, candidate) => `${String.fromCharCode(65 + candidate)} = ${escapeXml(voice.provider)} / ${escapeXml(voice.name)}`).join('、')}</li>`;
  }).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><title>台湾華語 音声比較</title><style>
body{font-family:system-ui,sans-serif;line-height:1.6;max-width:1000px;margin:auto;padding:16px;color:#202020;background:#fff}h2{overflow-wrap:anywhere}.candidates{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px}article{border:1px solid #777;border-radius:8px;padding:12px;min-width:0}audio{width:100%}fieldset{margin-top:16px;min-width:0}label{display:inline-flex;align-items:center;padding:8px}section{margin-bottom:32px}summary{cursor:pointer;padding:12px}details{overflow-wrap:anywhere}a{color:#124b92}
</style></head><body><h1>台湾華語 音声比較</h1><p>評価用の合成音声です。公開教材ではありません。下書き・試作・テスト用の原文を含み、先生による発音確認は未実施です。注目点はAIによる暫定案です。</p><p>文ごとにA〜Dの順序を入れ替えています。同じ文の通常・ゆっくりは同じ声です。利用できた提供元のみ表示します。速度指定は提供元によって聞こえ方が異なります。</p><p>評価はこのページを開いている間だけ保持され、送信・保存されません。再読み込みやページを閉じる操作で失われることがあります。</p>${sections}<details id="reveal"><summary>声の対応表を表示／非表示</summary><ol>${key}</ol></details></body></html>`;
}

export async function runComparison(options: Options, deps: {
  env?: NodeJS.ProcessEnv; tokenReader?: () => string; fetcher?: typeof fetch;
  log?: (message: string) => void; root?: string;
} = {}): Promise<void> {
  const log = deps.log ?? console.log;
  const root = deps.root ?? ROOT;
  const output = assertOutputOutsideRepo(options.output, root);
  const items = loadItems(root);
  const selected = VOICES.filter(voice => !options.only || voice.provider === options.only);
  const env = deps.env ?? process.env;
  // Check locally configured candidates before gcloud can refresh a token online.
  const candidates = options.dryRun ? selected : selected.filter(voice => voice.provider === 'azure'
    ? env.AZURE_SPEECH_KEY?.trim() && env.AZURE_SPEECH_REGION?.trim()
    : env.GOOGLE_TTS_API_KEY?.trim() || env.GOOGLE_CLOUD_PROJECT?.trim());
  const preflight = estimate(items, candidates);
  if (preflight.total > options.maxUsd) {
    log(`Preflight estimate: US$${preflight.total.toFixed(6)}; cap: US$${options.maxUsd.toFixed(6)}.`);
    assertBudget(preflight.total, options.maxUsd);
  }
  // A dry run never invokes gcloud (which may refresh tokens over the network).
  const auth = options.dryRun ? {} : credentials(env, options.only, deps.tokenReader, log);
  const voices = options.dryRun ? selected : selected.filter(voice => auth[voice.provider]);
  const plan = estimate(items, voices);
  log(`${items.length} exact-text items; ${voices.length} voices; normal + slow; ${items.length * voices.length * 2} requests.`);
  for (const voice of voices) log(`${voice.provider} / ${voice.name}: normal + slow (${voice.provider === 'azure' ? 'SSML -25%' : 'speakingRate 0.75'}).`);
  for (const provider of ['azure', 'google'] as const) log(`${provider}: ${plan.counts[provider]} billable characters, US$${plan.usd[provider].toFixed(6)}.`);
  log(`Total estimate: US$${plan.total.toFixed(6)}; cap: US$${options.maxUsd.toFixed(6)}. Failed/retried attempts also consume the cap.`);
  assertBudget(plan.total, options.maxUsd);
  if (options.dryRun) {
    log('Dry run: all selected voices estimated regardless of credentials; no network or files.');
    return;
  }
  if (!voices.length) { log('No providers available; no files written.'); return; }
  if (voices.some(voice => voice.provider === 'azure') && !options.confirmPaidTier) throw new Error('Azure requires --confirm-paid-tier for paid-tier output rights.');
  // Exclusive directory creation prevents overwrites and accidental rerun charges.
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(output, { mode: 0o700 });
  const seed = randomBytes(32).toString('hex');
  const clips: Clip[] = [];
  const key: Record<string, { itemId: string; provider: Provider; voice: string; speed: Speed }> = {};
  const saveKey = () => writeFileSync(join(output, 'key.json'), JSON.stringify({ seed, reviewStatus: 'draft', humanReview: false, codes: key }, null, 2) + '\n', { mode: 0o600 });
  let attemptsUsd = 0;
  let pendingUsd = plan.total;
  for (const item of items) for (const voice of voices) for (const speed of SPEEDS) {
    const cost = billableCharacters(item.text, voice.provider) * RATES[voice.provider] / 1e6;
    pendingUsd -= cost;
    const audio = await synthesize(item, voice, speed, auth, () => {
      // Reserve enough for all remaining first attempts; count even failed attempts.
      assertBudget(attemptsUsd + cost + pendingUsd, options.maxUsd);
      attemptsUsd += cost;
    }, deps.fetcher);
    const code = blindCode(seed, item.id, voice.name, speed);
    writeFileSync(join(output, `${code}.mp3`), audio, { mode: 0o600, flag: 'wx' });
    key[code] = { itemId: item.id, provider: voice.provider, voice: voice.name, speed };
    saveKey();
    clips.push({ code, ...key[code], audio });
  }
  writeFileSync(join(output, 'listening.html'), buildHtml(items, voices, clips, seed), { mode: 0o600, flag: 'wx' });
  log(`Wrote ${clips.length} evaluation clips, private key.json and listening.html outside the repository. Attempt estimate: US$${attemptsUsd.toFixed(6)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runComparison(parseArgs(process.argv.slice(2))).catch(error => {
    // Only our fixed messages are safe; filesystem errors may include private paths.
    const message = error instanceof Error && !('code' in error) ? error.message : 'Comparison failed; check output directory access (it must not already exist).';
    console.error(message);
    process.exitCode = 1;
  });
}
