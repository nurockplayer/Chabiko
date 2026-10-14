import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

export type PronunciationLanguage = 'zh-TW' | 'zh-CN';

export interface PronunciationInput {
  readonly text: string;
  readonly lang: PronunciationLanguage;
}

const CONTENT_DIRECTORIES = ['data/roleplay', 'data/hsk-vocabulary'];

const CONTENT_FILES = [
  'data/content-pilots/taiwan-travel-wave-1/lessons.json',
  'data/content-pilots/taiwan-travel-golden/lessons.json',
  'data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json',
  'data/teacher-vocabulary-preview/learner-manifest.json',
  'data/examples/valid/lessons.json',
  'data/examples/valid/vocabulary.json',
  'data/examples/valid/practice.json',
  'data/examples/valid/sentences.json',
  'data/examples/valid/phrasebook.json',
  'data/examples/valid/phrasebook-dialogs.json',
  'data/teacher-vocabulary-preview/teacher-phrase-promoted.json',
];

const LANGUAGE_FIELDS: Readonly<Record<string, PronunciationLanguage>> = {
  traditional: 'zh-TW',
  simplified: 'zh-CN',
  traditionalMandarin: 'zh-TW',
  correctAnswerTraditional: 'zh-TW',
  correctAnswerSimplified: 'zh-CN',
  example: 'zh-CN',
  coreSentence: 'zh-TW',
  chunk: 'zh-TW',
  spokenText: 'zh-TW',
};

const HAN_CHARACTER = /\p{Script=Han}/u;
const JAPANESE_KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

export function normalizePronunciationText(text: string): string {
  // Slash-separated alternatives (小姐/女士) are spoken as a list (小姐，女士); mirrors player normalizeText.
  return text.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    .replace(/(\p{Script=Han})\s*\/\s*(?=\p{Script=Han})/gu, '$1，');
}

function addInput(
  output: Map<string, PronunciationInput>,
  rawText: string,
  lang: PronunciationLanguage,
): void {
  const text = normalizePronunciationText(rawText);
  if (text && HAN_CHARACTER.test(text) && !JAPANESE_KANA.test(text)) {
    output.set(`${lang.toLowerCase()}|${text}`, { text, lang });
  }
}

/**
 * Taiwan-path content is always spoken in zh-TW, even its Simplified forms: the
 * script toggle changes characters, not pronunciation, and the lesson/phrasebook/
 * roleplay controls request zh-TW. HSK and teacher vocabulary use per-field locales.
 */
export function isTaiwanPathSource(relativePath: string): boolean {
  return !/^data\/(hsk-vocabulary|vocabulary\/teacher-core-v1|teacher-vocabulary-preview)\//u.test(relativePath);
}

function collectFromValue(value: unknown, output: Map<string, PronunciationInput>, taiwanPath = false): void {
  if (!Array.isArray(value) && value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.type === 'tone-discrimination' && typeof record.promptJa === 'string') {
      const quotedText = record.promptJa.match(/「([^」]+)」/u)?.[1];
      const text = quotedText?.match(/\p{Script=Han}+/gu)?.join('');
      if (text) addInput(output, text, 'zh-TW');
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFromValue(item, output, taiwanPath);
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    const lang = LANGUAGE_FIELDS[key];
    if (lang && typeof nested === 'string') {
      addInput(output, nested, taiwanPath ? 'zh-TW' : lang);
    }
    collectFromValue(nested, output, taiwanPath);
  }
}

function listJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  });
}

export function collectPronunciationInputs(root = process.cwd()): PronunciationInput[] {
  const paths = [
    ...CONTENT_FILES,
    ...CONTENT_DIRECTORIES.flatMap((directory) =>
      listJsonFiles(join(root, directory)).map((path) => relative(root, path)),
    ),
  ];
  const results = new Map<string, PronunciationInput>();

  for (const path of paths) {
    const data: unknown = JSON.parse(readFileSync(join(root, path), 'utf8'));
    collectFromValue(data, results, isTaiwanPathSource(path.split(sep).join('/')));
  }

  return [...results.values()].sort((left, right) => {
    const leftKey = `${left.lang}|${left.text}`;
    const rightKey = `${right.lang}|${right.text}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

export function countHanCharacters(inputs: readonly PronunciationInput[]): number {
  return inputs.reduce(
    (total, input) => total + [...input.text].filter((character) => HAN_CHARACTER.test(character)).length,
    0,
  );
}


export interface SpeechProvider {
  readonly name: string;
  voiceFor(lang: PronunciationLanguage): string;
  synthesize(text: string, lang: PronunciationLanguage, voice: string): Promise<Uint8Array>;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<FetchResponseLike>;

function escapeXml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

export function createAzureSpeechProvider(
  key: string,
  region: string,
  fetcher: FetchLike = fetch,
): SpeechProvider {
  return {
    name: 'azure-ai-speech',
    voiceFor: (lang) => lang === 'zh-TW' ? 'zh-TW-HsiaoChenNeural' : 'zh-CN-XiaoxiaoNeural',
    async synthesize(text, lang, voice) {
      const response = await fetcher(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          },
          body: `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}"><prosody rate="0%">${escapeXml(text)}</prosody></voice></speak>`,
        },
      );
      if (!response.ok) {
        throw new Error(`Azure Speech returned HTTP ${response.status}.`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

const ROOT = process.cwd();

export interface PronunciationManifestEntry {
  readonly text: string;
  readonly lang: string;
  readonly voice: string;
  readonly provider: string;
  readonly file: string;
  readonly sha256: string;
  readonly generatedAt: string;
  readonly source: 'tts' | 'teacher-recording';
}

export interface GenerationOptions {
  readonly dryRun: boolean;
  readonly limit?: number;
  readonly inputs?: readonly PronunciationInput[];
  readonly manifest?: readonly PronunciationManifestEntry[];
  readonly provider?: SpeechProvider;
  readonly key?: string;
  readonly region?: string;
  /** Operator confirms the Azure resource is a paid tier; Microsoft grants neural-voice output use rights to paid-tier customers. */
  readonly confirmPaidTier?: boolean;
  readonly root?: string;
  readonly log?: (message: string) => void;
}

export function manifestKey(text: string, lang: string): string {
  const normalizedText = normalizePronunciationText(text);
  const normalizedLang = lang.replace(/_/gu, '-').toLowerCase();
  return `${normalizedLang}|${normalizedText}`;
}

export function selectGenerationInputs(
  inputs: readonly PronunciationInput[],
  manifest: readonly PronunciationManifestEntry[],
): PronunciationInput[] {
  const entries = new Map<string, PronunciationManifestEntry>();
  for (const entry of manifest) {
    const key = manifestKey(entry.text, entry.lang);
    const current = entries.get(key);
    if (!current || entry.source === 'teacher-recording') entries.set(key, entry);
  }

  return inputs.filter((input) => {
    const existing = entries.get(manifestKey(input.text, input.lang));
    return !existing || existing.source !== 'teacher-recording';
  });
}

function hash(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readManifest(path: string): PronunciationManifestEntry[] {
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`Expected an array in ${path}.`);
  return parsed as PronunciationManifestEntry[];
}

function assetExistsAndMatches(root: string, entry: PronunciationManifestEntry): boolean {
  const path = join(root, 'public', entry.file.replace(/^\/+/, ''));
  return existsSync(path) && hash(readFileSync(path)) === entry.sha256;
}

export async function generatePronunciationAudio(options: GenerationOptions): Promise<void> {
  const root = options.root ?? ROOT;
  const log = options.log ?? console.log;
  const allInputs = options.inputs ?? collectPronunciationInputs(root);
  const manifest = [...(options.manifest ?? readManifest(join(root, 'src/lib/pronunciation/manifest.json')))];
  const existingByKey = new Map(manifest.map((entry) => [manifestKey(entry.text, entry.lang), entry]));
  const needed = selectGenerationInputs(allInputs, manifest).filter((input) => {
    const existing = existingByKey.get(manifestKey(input.text, input.lang));
    return !existing || existing.source === 'teacher-recording' || !assetExistsAndMatches(root, existing);
  }).filter((input) => existingByKey.get(manifestKey(input.text, input.lang))?.source !== 'teacher-recording');
  const selected = options.limit === undefined ? needed : needed.slice(0, options.limit);

  if (options.dryRun) {
    log(`Pronunciation audio: ${allInputs.length} distinct text/language pairs, ${countHanCharacters(allInputs)} Han characters.`);
    log(`Pending generation: ${needed.length}; selected by limit: ${selected.length}.`);
    return;
  }

  const key = options.key ?? process.env.AZURE_SPEECH_KEY;
  const region = options.region ?? process.env.AZURE_SPEECH_REGION;
  if (!options.provider && !key) throw new Error('AZURE_SPEECH_KEY is required. Set it in the environment; it is never written to the manifest.');
  if (!options.provider && !region) throw new Error('AZURE_SPEECH_REGION is required. Set it in the environment.');
  if (!options.provider && !options.confirmPaidTier) {
    throw new Error('Azure neural voice output may be published only from a paid-tier (S0) Speech resource. Confirm the resource tier, then re-run with --confirm-paid-tier.');
  }
  const provider = options.provider ?? createAzureSpeechProvider(key!, region!);

  const rootAudio = join(root, 'public/audio');
  mkdirSync(rootAudio, { recursive: true });
  for (const input of selected) {
    const voice = provider.voiceFor(input.lang);
    const bytes = await provider.synthesize(input.text, input.lang, voice);
    const sha256 = hash(bytes);
    const file = `${sha256}.mp3`;
    const audioPath = join(rootAudio, file);
    if (!existsSync(audioPath) || hash(readFileSync(audioPath)) !== sha256) {
      writeFileSync(audioPath, bytes);
    }
    const key = manifestKey(input.text, input.lang);
    const current = manifest.findIndex((entry) => manifestKey(entry.text, entry.lang) === key);
    const entry: PronunciationManifestEntry = {
      text: input.text,
      lang: input.lang,
      voice,
      provider: provider.name,
      file: `/audio/${file}`,
      sha256,
      generatedAt: new Date().toISOString(),
      source: 'tts',
    };
    if (current === -1) manifest.push(entry);
    else if (manifest[current]?.source !== 'teacher-recording') manifest[current] = entry;
    manifest.sort((left, right) => {
      const leftKey = manifestKey(left.text, left.lang);
      const rightKey = manifestKey(right.text, right.lang);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    const manifestPath = join(root, 'src/lib/pronunciation/manifest.json');
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    log(`Generated ${input.lang} ${input.text} → ${entry.file}`);
  }

  manifest.sort((left, right) => {
    const leftKey = manifestKey(left.text, left.lang);
    const rightKey = manifestKey(right.text, right.lang);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const manifestPath = join(root, 'src/lib/pronunciation/manifest.json');
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`Manifest updated with ${manifest.length} entries.`);
}

function parseArguments(args: readonly string[]): { dryRun: boolean; limit?: number; confirmPaidTier: boolean } {
  let dryRun = false;
  let confirmPaidTier = false;
  let limit: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    else if (argument === '--dry-run') dryRun = true;
    else if (argument === '--confirm-paid-tier') confirmPaidTier = true;
    else if (argument === '--limit') {
      const raw = args[++index];
      if (!raw || !/^\d+$/u.test(raw)) throw new Error('--limit requires a non-negative integer.');
      limit = Number(raw);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return { dryRun, limit, confirmPaidTier };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  try {
    await generatePronunciationAudio(parseArguments(args));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('/scripts/audio/generate.ts') || process.argv[1]?.endsWith('/scripts/audio/generate.js')) {
  await main();
}
