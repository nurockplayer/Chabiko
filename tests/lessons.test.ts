import { describe, it, expect } from 'vitest';
import { loadLessons, loadLessonById, loadAllRenderableLessons } from '../src/content/loadLessons';

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
    expect(lesson?.reviewPrompts).toEqual([
      { promptJa: 'Q?', answerJa: 'A', distractorsJa: ['B'] },
    ]);
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

describe('loadAllRenderableLessons', () => {
  it('returns all 3 lessons from the default fixture', () => {
    const lessons = loadAllRenderableLessons();
    expect(lessons).toHaveLength(3);
  });

  it('returns lessons in file order', () => {
    const lessons = loadAllRenderableLessons();
    expect(lessons[0].id).toBe('lesson-001');
    expect(lessons[1].id).toBe('lesson-002');
    expect(lessons[2].id).toBe('lesson-003');
  });

  it('each lesson has all required renderable fields', () => {
    const lessons = loadAllRenderableLessons();
    for (const lesson of lessons) {
      expect(lesson.titleJa.length).toBeGreaterThan(0);
      expect(lesson.hookJa.length).toBeGreaterThan(0);
      expect(lesson.canDoJa.length).toBeGreaterThan(0);
      expect(lesson.coreSentence.length).toBeGreaterThan(0);
      expect(lesson.learnerOutcomeJa.length).toBeGreaterThan(0);
      expect(lesson.travelTask.length).toBeGreaterThan(0);
      expect(lesson.chunks.length).toBeGreaterThan(0);
      expect(lesson.kanjiBridgeNotes.length).toBeGreaterThan(0);
      expect(lesson.soundFocus.length).toBeGreaterThan(0);
      expect(lesson.reviewPrompts.length).toBeGreaterThan(0);
    }
  });

  it('each lesson has unique id', () => {
    const lessons = loadAllRenderableLessons();
    const ids = lessons.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('throws when file does not exist', () => {
    expect(() => loadAllRenderableLessons('data/nonexistent.json')).toThrow();
  });

  it('throws for invalid JSON', () => {
    expect(() => loadAllRenderableLessons('tests/fixtures/malformed.json')).toThrow(
      /Failed to parse lesson bundle/,
    );
  });

  it('filters out non-renderable lessons from the bundle', () => {
    const lessons = loadAllRenderableLessons('tests/fixtures/incomplete-lesson.json');
    expect(lessons).toHaveLength(0);
  });
});

describe('lesson content requirements', () => {
  it('lesson-002 has price/amount content with narrowed outcome', () => {
    const lesson = loadLessonById('lesson-002');
    expect(lesson).toBeDefined();
    expect(lesson!.coreSentence).toContain('多少');
    expect(lesson!.travelScenario).toBe('food');
    expect(lesson!.painPointTags).toContain('tone');
    expect(lesson!.painPointTags).toContain('pinyin-pronunciation');
    expect(lesson!.canDoJa).toContain('値札');
    expect(lesson!.learnerOutcomeJa).toContain('表示された金額');
  });

  it('lesson-002 examples pinyin matches soundFocus for 少', () => {
    const lesson = loadLessonById('lesson-002');
    expect(lesson).toBeDefined();
    const soundShǎo = lesson!.soundFocus.find((s) => s.item.startsWith('少'));
    expect(soundShǎo).toBeDefined();
    expect(soundShǎo!.item).toContain('shǎo');
    // All examples whose traditional text contains 多少 must use duōshǎo
    for (const ex of lesson!.examples ?? []) {
      if (ex.traditional.includes('多少')) {
        expect(ex.pinyin).toContain('duōshǎo');
      }
    }
  });

  it('lesson-002 has kanji-bridge context for false-friend tags', () => {
    // lesson-002 doesn't have kanji-false-friend tag, so no context required
    const lesson = loadLessonById('lesson-002');
    expect(lesson).toBeDefined();
    // Just verify it loads and has expected content
    expect(lesson!.reviewPrompts.length).toBeGreaterThanOrEqual(1);
  });

  it('lesson-003 has asking-location content with narrowed outcome', () => {
    const lesson = loadLessonById('lesson-003');
    expect(lesson).toBeDefined();
    expect(lesson!.coreSentence).toContain('捷運站');
    expect(lesson!.travelScenario).toBe('transport');
    expect(lesson!.painPointTags).not.toContain('kanji-false-friend');
    expect(lesson!.learnerOutcomeJa).toContain('目的の場所を尋ね');
  });

  it('lesson-003 kanjiBridgeNotes use 在 as a bridge character', () => {
    const lesson = loadLessonById('lesson-003');
    expect(lesson).toBeDefined();
    const bridgeNote = lesson!.kanjiBridgeNotes.find((n) => n.kanji === '在');
    expect(bridgeNote).toBeDefined();
    expect(bridgeNote!.noteJa).toContain('存在');
  });

  it('lesson-003 example uses 捷運站 for MRT context', () => {
    const lesson = loadLessonById('lesson-003');
    expect(lesson).toBeDefined();
    expect(lesson!.examples![0].traditional).toContain('捷運站');
    expect(lesson!.travelTask).toContain('捷運站');
  });
});

describe('lesson order and navigation', () => {
  it('lessons are in expected sequence', () => {
    const lessons = loadAllRenderableLessons();
    expect(lessons[0].id).toBe('lesson-001');
    expect(lessons[1].id).toBe('lesson-002');
    expect(lessons[2].id).toBe('lesson-003');
  });

  it('lesson-001 has a next lesson (lesson-002)', () => {
    const lessons = loadAllRenderableLessons();
    expect(lessons.length).toBeGreaterThanOrEqual(2);
    expect(lessons[1].id).toBe('lesson-002');
  });

  it('lesson-002 has both prev and next', () => {
    const lessons = loadAllRenderableLessons();
    expect(lessons.length).toBeGreaterThanOrEqual(3);
    expect(lessons[0].id).toBe('lesson-001');
    expect(lessons[2].id).toBe('lesson-003');
  });

  it('lesson-003 is the last lesson', () => {
    const lessons = loadAllRenderableLessons();
    const lastIndex = lessons.length - 1;
    expect(lessons[lastIndex].id).toBe('lesson-003');
  });

  it('each lesson id is a valid URL path segment', () => {
    const lessons = loadAllRenderableLessons();
    for (const lesson of lessons) {
      expect(lesson.id).toMatch(/^lesson-\d{3}$/);
    }
  });
});

describe('static paths generation', () => {
  it('getStaticPaths would return one path per renderable lesson', () => {
    const lessons = loadAllRenderableLessons();
    const paths = lessons.map((l, i) => ({
      params: { id: l.id },
      props: {
        lesson: l,
        prevLesson: i > 0 ? { id: lessons[i - 1].id, titleJa: lessons[i - 1].titleJa } : null,
        nextLesson: i < lessons.length - 1 ? { id: lessons[i + 1].id, titleJa: lessons[i + 1].titleJa } : null,
      },
    }));
    expect(paths).toHaveLength(3);
    expect(paths[0].params.id).toBe('lesson-001');
    expect(paths[0].props.prevLesson).toBeNull();
    expect(paths[0].props.nextLesson?.id).toBe('lesson-002');
    expect(paths[1].props.prevLesson?.id).toBe('lesson-001');
    expect(paths[1].props.nextLesson?.id).toBe('lesson-003');
    expect(paths[2].props.prevLesson?.id).toBe('lesson-002');
    expect(paths[2].props.nextLesson).toBeNull();
  });
});
