import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectPronunciationInputs, createAzureSpeechProvider, generatePronunciationAudio, manifestKey, normalizePronunciationText, selectGenerationInputs, type PronunciationManifestEntry } from '../scripts/audio/generate';

const temporaryRoots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'chabiko-audio-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('pronunciation audio source collection', () => {
  it('normalizes keys and collects only Chinese script fields with language tags', () => {
    expect(normalizePronunciationText('  謝謝\n  你  ')).toBe('謝謝 你');
    const root = tempRoot();
    mkdirSync(join(root, 'data/content-pilots/taiwan-travel-wave-1'), { recursive: true });
    mkdirSync(join(root, 'data/content-pilots/taiwan-travel-golden'), { recursive: true });
    mkdirSync(join(root, 'data/roleplay'), { recursive: true });
    mkdirSync(join(root, 'data/hsk-vocabulary'), { recursive: true });
    mkdirSync(join(root, 'data/vocabulary/teacher-core-v1'), { recursive: true });
    mkdirSync(join(root, 'data/teacher-vocabulary-preview'), { recursive: true });
    mkdirSync(join(root, 'data/examples/valid'), { recursive: true });
    writeFileSync(join(root, 'data/content-pilots/taiwan-travel-wave-1/lessons.json'), JSON.stringify({ lessons: [{ coreSentence: '  謝謝 你！ ', chunks: [{ chunk: '謝謝' }], hookJa: '漢字の日本語は除外' }] }));
    writeFileSync(join(root, 'data/content-pilots/taiwan-travel-golden/lessons.json'), JSON.stringify({ lessons: [] }));
    writeFileSync(join(root, 'data/roleplay/card.json'), JSON.stringify({ lines: [{ traditional: '謝謝你', simplified: '谢谢你' }] }));
    writeFileSync(join(root, 'data/hsk-vocabulary/words.json'), JSON.stringify({ vocabulary: [{ simplified: '谢谢' }] }));
    writeFileSync(join(root, 'data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json'), JSON.stringify({ vocabulary: [{ traditional: '謝謝', simplified: '谢谢' }] }));
    writeFileSync(join(root, 'data/teacher-vocabulary-preview/learner-manifest.json'), JSON.stringify({ rows: [{ example: '你好' }] }));
    writeFileSync(join(root, 'data/examples/valid/lessons.json'), JSON.stringify({ lessons: [{ coreSentence: '謝謝 你', chunks: [{ chunk: '謝謝' }] }] }));
    writeFileSync(join(root, 'data/examples/valid/vocabulary.json'), JSON.stringify({ vocabulary: [{ traditional: '謝謝', simplified: '谢谢' }] }));
    writeFileSync(join(root, 'data/examples/valid/practice.json'), JSON.stringify({ practice: [
      { type: 'tone-discrimination', promptJa: '声調を聞いて「媽 mā」を選びます。', correctAnswerTraditional: '我明天去台北' },
      { type: 'word-order', promptJa: '答え「不用発音」', text: '不要読まない' },
    ] }));
    writeFileSync(join(root, 'data/examples/valid/sentences.json'), JSON.stringify({ sentences: [{ traditional: '請問到台北', simplified: '请问到台北' }] }));
    writeFileSync(join(root, 'data/teacher-vocabulary-preview/teacher-phrase-promoted.json'), JSON.stringify({ records: [{ traditional: '老師好' }] }));
    writeFileSync(join(root, 'data/examples/valid/phrasebook.json'), JSON.stringify({ phrasebook: [] }));
    writeFileSync(join(root, 'data/examples/valid/phrasebook-dialogs.json'), JSON.stringify({ phrasebookDialogs: [] }));

    const inputs = collectPronunciationInputs(root);
    expect(inputs).toEqual(expect.arrayContaining([
      { text: '你好', lang: 'zh-CN' },
      { text: '谢谢', lang: 'zh-CN' },
      { text: '谢谢你', lang: 'zh-CN' },
      { text: '请问到台北', lang: 'zh-CN' },
      { text: '謝謝', lang: 'zh-TW' },
      { text: '謝謝你', lang: 'zh-TW' },
      { text: '謝謝 你', lang: 'zh-TW' },
      { text: '謝謝 你!', lang: 'zh-TW' },
      { text: '媽', lang: 'zh-TW' },
      { text: '我明天去台北', lang: 'zh-TW' },
      { text: '請問到台北', lang: 'zh-TW' },
      { text: '老師好', lang: 'zh-TW' },
    ]));
    expect(inputs).toHaveLength(12);
    expect(inputs.some((input) => input.text.includes('答え'))).toBe(false);
    expect(inputs.some((input) => input.text === '不要読まない')).toBe(false);
  });

  it('deduplicates by normalized text and language, while preserving teacher precedence', () => {
    const inputs = [
      { text: '謝謝', lang: 'zh-TW' as const },
      { text: '谢谢', lang: 'zh-CN' as const },
    ];
    const manifest = [{ text: ' 謝謝 ', lang: 'zh_TW', source: 'teacher-recording' } as PronunciationManifestEntry];
    expect(manifestKey(' 謝謝 ', 'zh_TW')).toBe('zh-tw|謝謝');
    expect(selectGenerationInputs(inputs, manifest)).toEqual([inputs[1]]);
  });
});

describe('Azure Speech provider', () => {
  it('selects both neural voices and sends escaped SSML with mono MP3 output', async () => {
    let request: { input: string | URL; init?: RequestInit } | undefined;
    const provider = createAzureSpeechProvider('test-key', 'eastasia', async (input, init) => {
      request = { input, init };
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    });
    expect(provider.voiceFor('zh-TW')).toBe('zh-TW-HsiaoChenNeural');
    expect(provider.voiceFor('zh-CN')).toBe('zh-CN-XiaoxiaoNeural');
    expect([...await provider.synthesize('A&B <C>', 'zh-TW', provider.voiceFor('zh-TW'))]).toEqual([1, 2, 3]);
    expect(request?.input).toBe('https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1');
    expect(request?.init?.headers).toMatchObject({ 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' });
    expect(request?.init?.body).toContain('A&amp;B &lt;C&gt;');
  });

  it('rejects failed provider responses', async () => {
    const provider = createAzureSpeechProvider('test-key', 'eastasia', async () => ({
      ok: false, status: 401, arrayBuffer: async () => new ArrayBuffer(0),
    }));
    await expect(provider.synthesize('你好', 'zh-CN', provider.voiceFor('zh-CN'))).rejects.toThrow('HTTP 401');
  });
});

describe('pronunciation audio generation', () => {
  it('supports dry-run without credentials and writes content-addressed, incremental entries', async () => {
    const root = tempRoot();
    const logs: string[] = [];
    mkdirSync(join(root, 'src/lib/pronunciation'), { recursive: true });
    const inputs = [{ text: '你好', lang: 'zh-CN' as const }];
    await generatePronunciationAudio({ root, inputs, manifest: [], dryRun: true, log: (message) => logs.push(message) });
    expect(logs.join('\n')).toContain('1 distinct text/language pairs');

    let calls = 0;
    const provider = {
      name: 'mock',
      voiceFor: () => 'mock-voice',
      synthesize: async () => { calls += 1; return new Uint8Array([7, 8, 9]); },
    };
    await generatePronunciationAudio({ root, inputs, manifest: [], dryRun: false, provider, log: () => undefined });
    expect(calls).toBe(1);
    const manifest = JSON.parse(readFileSync(join(root, 'src/lib/pronunciation/manifest.json'), 'utf8')) as PronunciationManifestEntry[];
    expect(manifest[0]).toMatchObject({ text: '你好', lang: 'zh-CN', source: 'tts', provider: 'mock', file: `/audio/${manifest[0]?.sha256}.mp3` });
    await generatePronunciationAudio({ root, inputs, manifest, dryRun: false, provider, log: () => undefined });
    expect(calls).toBe(1);
  });

  it('preserves existing entries and checkpoints successful files before a later failure', async () => {
    const root = tempRoot();
    mkdirSync(join(root, 'src/lib/pronunciation'), { recursive: true });
    const existing: PronunciationManifestEntry = {
      text: '老師好', lang: 'zh-TW', voice: 'teacher', provider: 'teacher',
      file: '/audio/teacher.mp3', sha256: '0'.repeat(64), generatedAt: '2026-01-01T00:00:00.000Z',
      source: 'teacher-recording',
    };
    const provider = {
      name: 'mock',
      voiceFor: () => 'mock-voice',
      synthesize: async (text: string) => {
        if (text === '第二個') throw new Error('simulated provider interruption');
        return new Uint8Array([4, 5, 6]);
      },
    };
    await expect(generatePronunciationAudio({
      root,
      inputs: [{ text: '第一個', lang: 'zh-CN' }, { text: '第二個', lang: 'zh-CN' }],
      manifest: [existing],
      dryRun: false,
      provider,
      log: () => undefined,
    })).rejects.toThrow('simulated provider interruption');

    const saved = JSON.parse(readFileSync(join(root, 'src/lib/pronunciation/manifest.json'), 'utf8')) as PronunciationManifestEntry[];
    expect(saved.some((entry) => entry.source === 'teacher-recording' && entry.text === '老師好')).toBe(true);
    expect(saved.some((entry) => entry.source === 'tts' && entry.text === '第一個' && entry.file.startsWith('/audio/'))).toBe(true);
  });

  it('exercises dry-run limits and missing-key errors through the executable CLI', () => {
    const script = join(process.cwd(), 'scripts/audio/generate.ts');
    const env = { ...process.env, AZURE_SPEECH_KEY: '', AZURE_SPEECH_REGION: '' };
    const dryRun = spawnSync(process.execPath, [script, '--dry-run', '--limit', '1'], {
      cwd: process.cwd(), env, encoding: 'utf8',
    });
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain('selected by limit: 1');

    const missingKey = spawnSync(process.execPath, [script, '--limit', '1'], {
      cwd: process.cwd(), env, encoding: 'utf8',
    });
    expect(missingKey.status).toBe(1);
    expect(missingKey.stderr).toContain('AZURE_SPEECH_KEY is required');
  });

  it('fails clearly when generation is requested without credentials', async () => {
    await expect(generatePronunciationAudio({ inputs: [{ text: '你好', lang: 'zh-CN' }], manifest: [], dryRun: false, key: '', region: 'eastasia' })).rejects.toThrow('AZURE_SPEECH_KEY is required');
    await expect(generatePronunciationAudio({ inputs: [{ text: '你好', lang: 'zh-CN' }], manifest: [], dryRun: false, key: 'k', region: 'eastasia' })).rejects.toThrow('--confirm-paid-tier');
  });
});
