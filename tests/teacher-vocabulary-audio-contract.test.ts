import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface AudioContractItem {
  readonly vocabularyId: string;
  readonly audioId: string;
  readonly spokenText: string;
  readonly spokenTextSha256: string;
  readonly readingOverrideReason: string | null;
  readonly expectedSourceFilename: string;
  readonly expectedAssetPath: string;
}

interface AudioContract {
  readonly version: number;
  readonly sourceId: string;
  readonly locale: string;
  readonly vocabularyBatch: string;
  readonly vocabularyCount: number;
  readonly audioIdRule: string;
  readonly sourceType: string;
  readonly sourceContract: {
    readonly providerOrSpeaker: string;
    readonly modelOrRecordingContext: string;
    readonly voiceIdOrSpeakerId: string;
    readonly generationOrRecordingSettings: Record<string, string | number | boolean>;
    readonly permissionStatus: string;
    readonly permissionEvidence: string;
  };
  readonly derivativeContract: {
    readonly extension: string;
    readonly mimeType: string;
    readonly codec: string;
    readonly sampleRateHz: number;
    readonly channels: number;
    readonly bitDepthOrBitrate: string;
    readonly maximumDurationMs: number;
    readonly maximumBytes: number;
    readonly normalization: string;
  };
  readonly reviewPolicy: {
    readonly initialStatus: string;
    readonly requiredChecks: readonly string[];
  };
  readonly items: readonly AudioContractItem[];
}

interface VocabularyRow {
  readonly id: string;
  readonly simplified: string;
}

const readSource = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const contractText = readSource('../docs/content/teacher-core-v1-audio-contract.json');
const contract = JSON.parse(contractText) as AudioContract;
const markdown = readSource('../docs/content/teacher-core-v1-audio-contract.md');
const vocabularyBatch = JSON.parse(
  readSource('../data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json'),
) as { readonly vocabulary: readonly VocabularyRow[] };

const ROOT_KEYS = [
  'version',
  'sourceId',
  'locale',
  'vocabularyBatch',
  'vocabularyCount',
  'audioIdRule',
  'sourceType',
  'sourceContract',
  'derivativeContract',
  'reviewPolicy',
  'items',
] as const;

const SOURCE_CONTRACT_KEYS = [
  'providerOrSpeaker',
  'modelOrRecordingContext',
  'voiceIdOrSpeakerId',
  'generationOrRecordingSettings',
  'permissionStatus',
  'permissionEvidence',
] as const;

const GENERATION_SETTING_KEYS = [
  'api',
  'region',
  'requestMethod',
  'authenticationMethod',
  'requestContentType',
  'outputFormat',
  'userAgent',
  'ssmlVersion',
  'ssmlLanguage',
  'prosodyRate',
  'prosodyPitch',
  'requestGranularity',
  'responseHandling',
] as const;

const DERIVATIVE_KEYS = [
  'extension',
  'mimeType',
  'codec',
  'sampleRateHz',
  'channels',
  'bitDepthOrBitrate',
  'maximumDurationMs',
  'maximumBytes',
  'normalization',
] as const;

const REVIEW_POLICY_KEYS = ['initialStatus', 'requiredChecks'] as const;

const ITEM_KEYS = [
  'vocabularyId',
  'audioId',
  'spokenText',
  'spokenTextSha256',
  'readingOverrideReason',
  'expectedSourceFilename',
  'expectedAssetPath',
] as const;

const HEX_64 = /^[0-9a-f]{64}$/;

const EXPECTED_VOCABULARY_IDS = [
  'teacher-star-1-37e0eb213f0f',
  'teacher-star-1-a66948a76fda',
  'teacher-star-1-86f5cdb6e25c',
  'teacher-star-1-bdc7865a507e',
  'teacher-star-1-86367b2d53f6',
  'teacher-star-1-8b957a100bd4',
  'teacher-star-1-2cfcacc0503e',
  'teacher-star-1-e7bc12c4f23a',
  'teacher-star-1-e64490a207eb',
  'teacher-star-1-bada4e11125d',
  'teacher-star-1-d903f490725f',
  'teacher-star-1-7420330fee5c',
  'teacher-star-1-ed096023b3be',
  'teacher-star-1-cb42fb8775e5',
  'teacher-star-1-c39a19585434',
  'teacher-star-1-3e6fabf09358',
  'teacher-star-1-1c0cdf0b2b9c',
  'teacher-star-1-8fea4ac29b4c',
  'teacher-star-1-94757170c2b0',
  'teacher-star-1-0cc5799cdbbc',
] as const;

function expectExactKeys(value: object, expected: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...expected].sort());
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('teacher-core-v1 audio contract JSON', () => {
  it('has the exact root and nested key contracts', () => {
    expectExactKeys(contract, ROOT_KEYS);
    expectExactKeys(contract.sourceContract, SOURCE_CONTRACT_KEYS);
    expectExactKeys(contract.sourceContract.generationOrRecordingSettings, GENERATION_SETTING_KEYS);
    expectExactKeys(contract.derivativeContract, DERIVATIVE_KEYS);
    expectExactKeys(contract.reviewPolicy, REVIEW_POLICY_KEYS);

    for (const item of contract.items) {
      expectExactKeys(item, ITEM_KEYS);
    }
  });

  it('freezes the exact source identity and controlled values', () => {
    expect(contract.version).toBe(1);
    expect(contract.sourceId).toBe('teacher-core-v1');
    expect(contract.locale).toBe('zh-TW');
    expect(contract.vocabularyBatch).toBe('teacher-vocabulary-batch-01.json');
    expect(contract.vocabularyCount).toBe(20);
    expect(contract.audioIdRule).toBe('audio-{vocabularyId}');
    expect(contract.sourceType).toBe('generated-tts');

    expect(contract.sourceContract.providerOrSpeaker).toBe('Microsoft Azure AI Speech');
    expect(contract.sourceContract.modelOrRecordingContext)
      .toBe('Prebuilt Standard Neural Text-to-Speech');
    expect(contract.sourceContract.voiceIdOrSpeakerId).toBe('zh-TW-HsiaoChenNeural');
    expect(contract.sourceContract.permissionStatus)
      .toBe('approved-for-provisional-web-use');
    expect(contract.sourceContract.permissionEvidence).toContain('paid-tier');
    expect(contract.sourceContract.permissionEvidence).toContain('prebuilt neural voices');
    expect(contract.sourceContract.permissionEvidence).toContain('commercial');
  });

  it('freezes the exact provider request and response handling contract', () => {
    const settings = contract.sourceContract.generationOrRecordingSettings;

    expect(settings).toEqual({
      api: 'Azure Speech REST text-to-speech /cognitiveservices/v1',
      region: 'japaneast',
      requestMethod: 'POST',
      authenticationMethod:
        'Ocp-Apim-Subscription-Key header supplied only at generation time',
      requestContentType: 'application/ssml+xml',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
      userAgent: 'ChabikoTeacherAudio/1.0',
      ssmlVersion: '1.0',
      ssmlLanguage: 'zh-TW',
      prosodyRate: '0%',
      prosodyPitch: '0%',
      requestGranularity: 'one vocabulary item per request',
      responseHandling: 'require HTTP 200 and save response body byte-for-byte',
    });

    expect(String(settings.userAgent).length).toBeGreaterThan(0);
    expect(String(settings.userAgent).length).toBeLessThan(255);
  });

  it('uses the exact frozen production vocabulary IDs and order', () => {
    const productionIds = vocabularyBatch.vocabulary.map(row => row.id);
    const contractIds = contract.items.map(item => item.vocabularyId);

    expect(productionIds).toEqual(EXPECTED_VOCABULARY_IDS);
    expect(contractIds).toEqual(EXPECTED_VOCABULARY_IDS);
    expect(contractIds).toEqual(productionIds);
    expect(contract.items).toHaveLength(contract.vocabularyCount);
    expect(contract.items).toHaveLength(20);
  });

  it('derives unique audio identities, filenames, paths, and fingerprints', () => {
    const vocabularyIds = new Set<string>();
    const audioIds = new Set<string>();
    const filenames = new Set<string>();
    const paths = new Set<string>();
    const fingerprints = new Set<string>();

    for (const item of contract.items) {
      const expectedAudioId = `audio-${item.vocabularyId}`;
      const expectedFilename = `${expectedAudioId}.mp3`;
      const expectedPath =
        `public/assets/audio/teacher-core-v1/${expectedFilename}`;
      const expectedFingerprint =
        sha256(`zh-TW|${item.vocabularyId}|${item.spokenText}`);

      expect(item.audioId).toBe(expectedAudioId);
      expect(item.expectedSourceFilename).toBe(expectedFilename);
      expect(item.expectedAssetPath).toBe(expectedPath);
      expect(item.spokenTextSha256).toBe(expectedFingerprint);
      expect(item.spokenTextSha256).toMatch(HEX_64);

      expect(vocabularyIds.has(item.vocabularyId)).toBe(false);
      expect(audioIds.has(item.audioId)).toBe(false);
      expect(filenames.has(item.expectedSourceFilename)).toBe(false);
      expect(paths.has(item.expectedAssetPath)).toBe(false);
      expect(fingerprints.has(item.spokenTextSha256)).toBe(false);

      vocabularyIds.add(item.vocabularyId);
      audioIds.add(item.audioId);
      filenames.add(item.expectedSourceFilename);
      paths.add(item.expectedAssetPath);
      fingerprints.add(item.spokenTextSha256);
    }
  });

  it('documents every spoken-text difference with a non-empty reason', () => {
    const visibleById = new Map(
      vocabularyBatch.vocabulary.map(row => [row.id, row.simplified]),
    );

    for (const item of contract.items) {
      const visible = visibleById.get(item.vocabularyId);
      expect(visible).toBeDefined();

      if (item.spokenText === visible) {
        expect(item.readingOverrideReason).toBeNull();
      } else {
        expect(typeof item.readingOverrideReason).toBe('string');
        expect(item.readingOverrideReason?.trim().length).toBeGreaterThan(0);
      }
    }

    const overrides = contract.items.filter(item => item.readingOverrideReason !== null);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({
      vocabularyId: 'teacher-star-1-8b957a100bd4',
      spokenText: '小姐，女士',
    });
  });

  it('freezes a valid mono MP3 derivative contract with positive limits', () => {
    const derivative = contract.derivativeContract;

    expect(derivative.extension).toBe('mp3');
    expect(derivative.mimeType).toBe('audio/mpeg');
    expect(derivative.codec).toContain('MP3');
    expect(derivative.sampleRateHz).toBe(24000);
    expect(derivative.channels).toBe(1);
    expect(derivative.bitDepthOrBitrate).toBe('48 kbit/s');
    expect(Number.isInteger(derivative.maximumDurationMs)).toBe(true);
    expect(derivative.maximumDurationMs).toBeGreaterThan(0);
    expect(Number.isInteger(derivative.maximumBytes)).toBe(true);
    expect(derivative.maximumBytes).toBeGreaterThan(0);
    expect(derivative.normalization).toContain('unchanged');
    expect(derivative.normalization).toContain('no transcoding');
  });

  it('keeps pronunciation review provisional and non-empty', () => {
    expect(contract.reviewPolicy.initialStatus).toBe('draft');
    expect(contract.reviewPolicy.requiredChecks.length).toBeGreaterThan(0);
    expect(new Set(contract.reviewPolicy.requiredChecks).size)
      .toBe(contract.reviewPolicy.requiredChecks.length);

    for (const check of contract.reviewPolicy.requiredChecks) {
      expect(check.trim().length).toBeGreaterThan(0);
    }
  });

  it('contains no credentials, secret-like fields, or personal absolute paths', () => {
    const secretFieldPattern =
      /"(?:api[-_]?key|password|authorization|bearer|secret|access[-_]?token|subscription[-_]?key)"\s*:/i;
    const personalPathPattern =
      /(?:\/Users\/[^/]+\/|\/home\/[^/]+\/|[A-Za-z]:\\Users\\[^\\]+\\)/;

    expect(contractText).not.toMatch(secretFieldPattern);
    expect(contractText).not.toMatch(personalPathPattern);
    expect(markdown).not.toMatch(personalPathPattern);
  });
});

describe('teacher-core-v1 audio contract Markdown', () => {
  it('agrees with JSON on source, locale, voice, format, permission, count, and review policy', () => {
    expect(markdown).toContain(contract.sourceContract.providerOrSpeaker);
    expect(markdown).toContain(contract.locale);
    expect(markdown).toContain(contract.sourceContract.voiceIdOrSpeakerId);
    expect(markdown).toContain(
      String(contract.sourceContract.generationOrRecordingSettings.outputFormat),
    );
    expect(markdown).toContain(
      String(contract.sourceContract.generationOrRecordingSettings.userAgent),
    );
    expect(markdown).toContain(contract.sourceContract.permissionStatus);
    expect(markdown).toContain(String(contract.vocabularyCount));
    expect(markdown).toContain(contract.reviewPolicy.initialStatus);
  });

  it('records the static-audio rationale and rejects runtime synthesis', () => {
    expect(markdown).toContain('static committed audio');
    expect(markdown).toContain('speechSynthesis');
    expect(markdown).toContain('runtime provider calls');
    expect(markdown).toContain('credentials and provider dependencies out of the learner runtime');
  });

  it('records exact request headers, deterministic IDs, paths, response handling, and stop conditions', () => {
    expect(markdown).toContain('Ocp-Apim-Subscription-Key: <supplied securely at generation time>');
    expect(markdown).toContain('User-Agent: ChabikoTeacherAudio/1.0');
    expect(markdown).toContain('below the documented 255-character limit');
    expect(markdown).toContain('audioId = audio-{vocabularyId}');
    expect(markdown).toContain('public/assets/audio/teacher-core-v1/{audioId}.mp3');
    expect(markdown).toContain('save the response body byte-for-byte');
    expect(markdown).toContain('## Stop conditions');

    for (const item of contract.items) {
      expect(markdown).toContain(item.vocabularyId);
      expect(markdown).toContain(item.expectedSourceFilename);
    }
  });

  it('states the paid-tier permission boundary and remaining limitations', () => {
    expect(markdown).toContain('paid Azure Text-to-Speech tier');
    expect(markdown).toContain('including commercially');
    expect(markdown).toContain('## Remaining limitations');
    expect(markdown).toContain('identified by their committed checksums');
  });
});
