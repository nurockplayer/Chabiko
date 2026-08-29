import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadWordOrderPractice } from '../src/content/loadWordOrderPractice';

type JsonRecord = Record<string, unknown>;

const productionPractice = JSON.parse(
  readFileSync('data/examples/valid/practice.json', 'utf8'),
) as { practice: JsonRecord[] };
const productionLessons = JSON.parse(
  readFileSync('data/examples/valid/lessons.json', 'utf8'),
) as { lessons: JsonRecord[] };

const tempDirs: string[] = [];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function writeFixture(
  practice: { practice: JsonRecord[] },
  lessons: { lessons: JsonRecord[] },
): { practicePath: string; lessonsPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'chabiko-practice-source-'));
  tempDirs.push(dir);
  const practicePath = join(dir, 'practice.json');
  const lessonsPath = join(dir, 'lessons.json');
  writeFileSync(practicePath, JSON.stringify(practice), 'utf8');
  writeFileSync(lessonsPath, JSON.stringify(lessons), 'utf8');
  return { practicePath, lessonsPath };
}

function sourceBackedRecords(bundle: { practice: JsonRecord[] }): JsonRecord[] {
  return bundle.practice.filter(
    (record) => record.type === 'word-order' && record.id !== 'practice-002',
  );
}

function sourceLesson(record: JsonRecord): JsonRecord {
  return record.sourceLesson as JsonRecord;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('production word-order source reconciliation', () => {
  it('loads legacy practice-002 plus every mechanically eligible unique lesson target', () => {
    const items = loadWordOrderPractice();
    const sourceRecords = sourceBackedRecords(productionPractice);

    expect(items).toHaveLength(22);
    expect(items[0].recordId).toBe('practice-002');
    expect(sourceRecords).toHaveLength(21);
    expect(new Set(sourceRecords.map((record) => record.correctAnswer)).size).toBe(21);
    expect(items.map((item) => item.recordId)).toEqual(
      productionPractice.practice
        .filter((record) => record.type === 'word-order')
        .map((record) => record.id),
    );

    for (const item of items) {
      const canonical = item.chunks.map((chunk) => chunk.text).join(item.separator);
      const shown = item.shownOrder
        .map((index) => item.chunks[index].text)
        .join(item.separator);
      expect(shown).not.toBe(canonical);
    }
  });

  it('fails closed when a referenced lesson source changes', () => {
    const practice = clone(productionPractice);
    const lessons = clone(productionLessons);
    const record = sourceBackedRecords(practice)[0];
    const source = sourceLesson(record);
    const lesson = lessons.lessons.find((item) => item.id === source.lessonId)!;
    lesson.coreSentence = `${lesson.coreSentence as string}變更`;
    const fixture = writeFixture(practice, lessons);

    expect(() =>
      loadWordOrderPractice(fixture.practicePath, fixture.lessonsPath),
    ).toThrow(/source|reconciliation/i);
  });

  it('fails closed on stale lesson references and review-status drift', () => {
    const stalePractice = clone(productionPractice);
    sourceLesson(sourceBackedRecords(stalePractice)[0]).lessonId = 'lesson-999';
    const stale = writeFixture(stalePractice, clone(productionLessons));
    expect(() =>
      loadWordOrderPractice(stale.practicePath, stale.lessonsPath),
    ).toThrow(/lesson-999|source|reconciliation/i);

    const driftPractice = clone(productionPractice);
    const driftLessons = clone(productionLessons);
    const driftRecord = sourceBackedRecords(driftPractice).find(
      (record) => sourceLesson(record).reviewStatus === 'draft',
    )!;
    const driftSource = sourceLesson(driftRecord);
    const driftLesson = driftLessons.lessons.find(
      (lesson) => lesson.id === driftSource.lessonId,
    )!;
    driftLesson.reviewStatus = 'reviewed';
    const drift = writeFixture(driftPractice, driftLessons);
    expect(() =>
      loadWordOrderPractice(drift.practicePath, drift.lessonsPath),
    ).toThrow(/reviewStatus|review status/i);
  });

  it('fails closed on duplicate or missing source-backed targets', () => {
    const duplicatePractice = clone(productionPractice);
    duplicatePractice.practice.push(clone(sourceBackedRecords(duplicatePractice)[0]));
    (duplicatePractice.practice.at(-1) as JsonRecord).id = 'practice-duplicate';
    const duplicate = writeFixture(duplicatePractice, clone(productionLessons));
    expect(() =>
      loadWordOrderPractice(duplicate.practicePath, duplicate.lessonsPath),
    ).toThrow(/duplicate/i);

    const missingPractice = clone(productionPractice);
    const missingId = sourceBackedRecords(missingPractice)[0].id;
    missingPractice.practice = missingPractice.practice.filter(
      (record) => record.id !== missingId,
    );
    const missing = writeFixture(missingPractice, clone(productionLessons));
    expect(() =>
      loadWordOrderPractice(missing.practicePath, missing.lessonsPath),
    ).toThrow(/missing|reconciliation/i);
  });

  it('fails closed when an exact source cannot round-trip through the tokenizer', () => {
    const practice = clone(productionPractice);
    const lessons = clone(productionLessons);
    const record = sourceBackedRecords(practice)[0];
    record.correctAnswer = '台';
    const source = sourceLesson(record);
    const lesson = lessons.lessons.find((item) => item.id === source.lessonId)!;
    lesson.coreSentence = '台';
    const fixture = writeFixture(practice, lessons);

    expect(() =>
      loadWordOrderPractice(fixture.practicePath, fixture.lessonsPath),
    ).toThrow(/token|eligible|reconciliation/i);
  });

  it('fails closed when shuffled chunks still display a pre-solved target', () => {
    const practice = clone(productionPractice);
    const lessons = clone(productionLessons);
    const record = sourceBackedRecords(practice)[0];
    record.correctAnswer = '哈哈';
    const source = sourceLesson(record);
    const lesson = lessons.lessons.find((item) => item.id === source.lessonId)!;
    lesson.coreSentence = '哈哈';
    const fixture = writeFixture(practice, lessons);

    expect(() =>
      loadWordOrderPractice(fixture.practicePath, fixture.lessonsPath),
    ).toThrow(/pre-solved|eligible|reconciliation/i);
  });
});
