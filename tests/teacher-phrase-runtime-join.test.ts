import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProductionLearnerCorpus } from '../src/content/loadProductionLearnerCorpus';
import { buildLearnerSessionPayloadFromItems } from '../src/content/learnerSessionPayload';
import type { LearnerManifest } from '../src/types/learnerManifest';
import type { TeacherPhraseProjection } from '../src/types/teacherPhraseProjection';

const manifest = JSON.parse(
  readFileSync('data/teacher-vocabulary-preview/learner-manifest.json', 'utf8'),
) as LearnerManifest;
const committedProjection = JSON.parse(
  readFileSync('data/teacher-vocabulary-preview/teacher-phrase-promoted.json', 'utf8'),
) as TeacherPhraseProjection;
const alwaysTracked = () => true;

function fakeWebp(): Uint8Array {
  const data = new Uint8Array(10);
  data[4] = 0xf3;
  data[5] = 0x01;
  data[7] = 0xf3;
  data[8] = 0x01;
  const ascii = (text: string) => new Uint8Array([...text].map((value) => value.charCodeAt(0)));
  const u32 = (value: number) => new Uint8Array([
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ]);
  const parts = [ascii('RIFF'), u32(22), ascii('WEBP'), ascii('VP8X'), u32(10), data];
  const result = new Uint8Array(parts.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function loaderOptions(projection: unknown) {
  return {
    assetTracked: alwaysTracked,
    readAssetBytes: () => fakeWebp(),
    promotedProjection: projection,
  };
}

function promotedFixture(): TeacherPhraseProjection {
  const row = manifest.rows.find((value) => value.example !== undefined)!;
  return {
    ...structuredClone(committedProjection),
    base: {
      ...structuredClone(committedProjection.base),
      sidecarSha256: '1'.repeat(64),
    },
    records: [
      {
        learnerId: row.learnerId,
        source: {
          sheet: row.sourceSheet,
          row: row.sourceRow,
          column: '造词/造句',
          sourceRevision: `teacher-phrase-source-v1-${'2'.repeat(64)}`,
        },
        reviewVersion: '3'.repeat(64),
        teacherPhrases: [
          {
            phraseId: `teacher-phrase-v1-${'4'.repeat(64)}`,
            simplified: '大家好',
            traditional: '大家好',
            pinyin: 'dàjiā hǎo',
            japanese: '皆さん、こんにちは',
          },
          {
            phraseId: `teacher-phrase-v1-${'5'.repeat(64)}`,
            simplified: '大家请听',
            traditional: '大家請聽',
            pinyin: 'dàjiā qǐng tīng',
            japanese: '皆さん、聞いてください',
          },
        ],
      },
    ],
  };
}

describe('teacher phrase promoted runtime join', () => {
  it('keeps the committed empty projection byte-compatible with raw example behavior', () => {
    const corpus = loadProductionLearnerCorpus(loaderOptions(committedProjection));
    expect(corpus.map((item) => item.learnerId)).toEqual(manifest.rows.map((row) => row.learnerId));
    for (const item of corpus) {
      const row = manifest.rows.find((value) => value.learnerId === item.learnerId)!;
      expect(item.example).toBe(row.example);
      expect(Object.keys(item)).not.toContain('teacherPhrases');
    }
  });

  it('joins a complete promoted cell without removing its raw example', () => {
    const projection = promotedFixture();
    const corpus = loadProductionLearnerCorpus(loaderOptions(projection));
    const promoted = corpus.find((item) => item.learnerId === projection.records[0].learnerId)!;

    expect(promoted.example).toBe(
      manifest.rows.find((row) => row.learnerId === promoted.learnerId)!.example,
    );
    expect(promoted.teacherPhrases).toEqual(projection.records[0].teacherPhrases);
    expect(Object.isFrozen(promoted.teacherPhrases)).toBe(true);
    expect(Object.isFrozen(promoted.teacherPhrases![0])).toBe(true);
    expect(Object.keys(promoted)).not.toContain('sourceRevision');
    expect(Object.keys(promoted)).not.toContain('reviewVersion');
  });

  it('preserves learner identity/order and session payload semantics after enrichment', () => {
    const baseline = loadProductionLearnerCorpus(loaderOptions(committedProjection));
    const promoted = loadProductionLearnerCorpus(loaderOptions(promotedFixture()));

    expect(promoted.map((item) => item.learnerId)).toEqual(baseline.map((item) => item.learnerId));
    expect(buildLearnerSessionPayloadFromItems(promoted)).toEqual(
      buildLearnerSessionPayloadFromItems(baseline),
    );
  });

  it('fails closed on a wrong base, malformed phrase, duplicate, or unknown record', () => {
    const cases: Array<[string, (projection: TeacherPhraseProjection) => void, RegExp]> = [
      ['manifest base', (value) => { value.base.learnerManifestSemanticSha256 = '0'.repeat(64); }, /manifest semantic digest/],
      ['workbook base', (value) => { value.base.workbookSha256 = '0'.repeat(64); }, /workbook digest/],
      ['sidecar digest', (value) => { value.base.sidecarSha256 = null; }, /sidecar digest/],
      ['coordinate', (value) => { value.records[0].source.row += 1; }, /source coordinate/],
      ['phrase field', (value) => { value.records[0].teacherPhrases[0].pinyin = ' '; }, /pinyin/],
      ['duplicate record', (value) => { value.records.push(structuredClone(value.records[0])); }, /duplicate learner ID/],
      ['unknown record', (value) => { value.records[0].learnerId = 'teacher-learner-0000000000000000'; }, /unknown learner ID/],
    ];
    for (const [label, mutate, expected] of cases) {
      const projection = promotedFixture();
      mutate(projection);
      expect(
        () => loadProductionLearnerCorpus(loaderOptions(projection)),
        label,
      ).toThrow(expected);
    }
  });

  it('never imports the authoring sidecar or mutable review evidence at runtime', () => {
    const source = readFileSync('src/content/loadProductionLearnerCorpus.ts', 'utf8');
    expect(source).toContain('teacher-phrase-promoted.json');
    expect(source).not.toContain('teacher-phrase-authoring.json');
    expect(source).not.toContain('reviewStatus');
    expect(source).not.toContain('human-review');
  });
});
