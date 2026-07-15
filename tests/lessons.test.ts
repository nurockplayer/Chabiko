import { describe, it, expect } from 'vitest';
import { loadLessons, loadLessonById } from '../src/content/loadLessons';

describe('loadLessons', () => {
  it('loads lessons from the default fixture file', () => {
    const bundle = loadLessons();
    expect(bundle.lessons).toBeInstanceOf(Array);
    expect(bundle.lessons.length).toBeGreaterThan(0);
  });

  it('contains lesson-001 with required fields', () => {
    const bundle = loadLessons();
    const lesson = bundle.lessons.find((l) => l.id === 'lesson-001');
    expect(lesson).toBeDefined();
    if (!lesson) return;
    expect(lesson.titleJa).toBe('夜市で注文してみよう');
    expect(lesson.hookJa).toContain('夜市');
    expect(lesson.canDoJa).toContain('注文');
    expect(lesson.coreSentence).toBe('我要這個');
    expect(lesson?.examples?.length).toBeGreaterThan(0);
    expect(lesson?.examples?.[0]?.pinyin).toBe('wǒ yào zhège');
  });

  it('loads a lesson from an explicit path', () => {
    const bundle = loadLessons('data/examples/valid/lessons.json');
    expect(bundle.lessons[0].id).toBe('lesson-001');
  });

  it('throws on invalid JSON with a descriptive message', () => {
    expect(() => loadLessons('tests/fixtures/malformed.json')).toThrow(
      /Failed to parse lesson bundle/,
    );
  });

  it('throws on missing lessons array with a descriptive message', () => {
    expect(() => loadLessons('tests/fixtures/missing-array.json')).toThrow(
      /Invalid lesson bundle structure/,
    );
  });

  it('throws when the file does not exist', () => {
    expect(() => loadLessons('data/nonexistent.json')).toThrow();
  });
});

describe('loadLessonById', () => {
  it('returns the lesson for a known id', () => {
    const lesson = loadLessonById('lesson-001');
    expect(lesson).toBeDefined();
    expect(lesson?.titleJa).toBe('夜市で注文してみよう');
  });

  it('returns undefined for an unknown id', () => {
    const lesson = loadLessonById('lesson-999');
    expect(lesson).toBeUndefined();
  });

  it('returns undefined when the file does not exist', () => {
    const lesson = loadLessonById('lesson-001', 'data/nonexistent.json');
    expect(lesson).toBeUndefined();
  });

  it('returns undefined when the file contains invalid JSON', () => {
    const lesson = loadLessonById('lesson-001', 'tests/fixtures/malformed.json');
    expect(lesson).toBeUndefined();
  });

  it('returns undefined when the bundle lacks a lessons array', () => {
    const lesson = loadLessonById('lesson-001', 'tests/fixtures/missing-array.json');
    expect(lesson).toBeUndefined();
  });

  it('returns undefined for an incomplete lesson so callers can render a fallback', () => {
    const lesson = loadLessonById('lesson-001', 'tests/fixtures/incomplete-lesson.json');
    expect(lesson).toBeUndefined();
  });

  it('returns undefined when painPointTags is a string instead of an array', () => {
    const lesson = loadLessonById(
      'lesson-001',
      'tests/fixtures/invalid-painpoint-tag-type.json',
    );
    expect(lesson).toBeUndefined();
  });

  it('returns undefined when painPointTags contains a number element', () => {
    const lesson = loadLessonById(
      'lesson-001',
      'tests/fixtures/invalid-painpoint-number-element.json',
    );
    expect(lesson).toBeUndefined();
  });

  it('returns undefined when painPointTags contains a null element', () => {
    const lesson = loadLessonById(
      'lesson-001',
      'tests/fixtures/invalid-painpoint-null-element.json',
    );
    expect(lesson).toBeUndefined();
  });

  it('returns undefined when painPointTags contains an unknown tag', () => {
    const lesson = loadLessonById(
      'lesson-001',
      'tests/fixtures/invalid-painpoint-unknown-tag.json',
    );
    expect(lesson).toBeUndefined();
  });

  it('returns undefined when painPointTags contains duplicate tags', () => {
    const lesson = loadLessonById(
      'lesson-001',
      'tests/fixtures/invalid-painpoint-duplicate-tag.json',
    );
    expect(lesson).toBeUndefined();
  });

  it('loads a lesson with valid painPointTags string array', () => {
    const lesson = loadLessonById('lesson-001');
    expect(lesson).toBeDefined();
    expect(Array.isArray(lesson?.painPointTags)).toBe(true);
    if (lesson?.painPointTags) {
      expect(lesson.painPointTags).toContain('tone');
    }
  });

  it('loads a lesson when painPointTags is absent', () => {
    const lesson = loadLessonById(
      'lesson-001',
      'tests/fixtures/empty-required-lesson-arrays.json',
    );
    expect(lesson).toBeDefined();
    expect(lesson?.painPointTags).toBeUndefined();
  });

  it('loads a lesson with an empty painPointTags array', () => {
    const lesson = loadLessonById(
      'lesson-001',
      'tests/fixtures/empty-painpoint-tags.json',
    );
    expect(lesson).toBeDefined();
    expect(lesson?.painPointTags).toEqual([]);
  });

  it('returns undefined when required lesson fields are empty or related vocabulary is malformed', () => {
    const lesson = loadLessonById('lesson-001', 'tests/fixtures/invalid-lesson-contract.json');
    expect(lesson).toBeUndefined();
  });

  it('returns undefined when a schema-required lesson-loop array is missing', () => {
    const lesson = loadLessonById(
      'lesson-001',
      'tests/fixtures/missing-required-lesson-array.json',
    );
    expect(lesson).toBeUndefined();
  });

  it('accepts empty required arrays and absent optional arrays', () => {
    const lesson = loadLessonById(
      'lesson-001',
      'tests/fixtures/empty-required-lesson-arrays.json',
    );
    expect(lesson).toBeDefined();
    expect(lesson?.chunks).toEqual([]);
    expect(lesson?.kanjiBridgeNotes).toEqual([]);
    expect(lesson?.soundFocus).toEqual([]);
    expect(lesson?.reviewPrompts).toEqual([]);
    expect(lesson?.sections).toBeUndefined();
    expect(lesson?.examples).toBeUndefined();
    expect(lesson?.relatedVocabulary).toBeUndefined();
  });
});

describe('learner shell uses fixture data', () => {
  it('lesson fixture is non-empty and contains expected content', () => {
    const bundle = loadLessons();
    const lesson = bundle.lessons.find((l) => l.id === 'lesson-001');
    expect(lesson).toBeDefined();
    // The shell relies on real fixture content, not hard-coded strings
    expect(lesson!.titleJa.length).toBeGreaterThan(0);
    expect(lesson!.hookJa.length).toBeGreaterThan(0);
    expect(lesson!.canDoJa.length).toBeGreaterThan(0);
    expect(lesson!.coreSentence.length).toBeGreaterThan(0);
  });
});
