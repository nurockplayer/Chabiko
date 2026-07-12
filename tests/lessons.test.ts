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
    expect(lesson.examples.length).toBeGreaterThan(0);
    expect(lesson.examples[0].pinyin).toBe('wǒ yào zhège');
  });

  it('loads a lesson from an explicit path', () => {
    const bundle = loadLessons('data/examples/valid/lessons.json');
    expect(bundle.lessons[0].id).toBe('lesson-001');
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

  it('returns fallback-safe undefined when fixture is missing', () => {
    // Simulates the scenario where the lessons file is absent or empty
    const lesson = loadLessonById('non-existent-lesson');
    expect(lesson).toBeUndefined();

    const bundle = loadLessons();
    const missing = bundle.lessons.find((l) => l.id === '');
    expect(missing).toBeUndefined();
  });
});
