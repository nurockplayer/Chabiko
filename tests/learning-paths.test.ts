import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type {
  LearningPathMemberRef,
  LearningPathsDocument,
} from '../src/types/learningPath';
import { loadLearningPaths } from '../src/content/loadLearningPaths';

const tempPaths: string[] = [];

afterEach(() => {
  for (const tempPath of tempPaths.splice(0)) {
    rmSync(tempPath, { force: true });
  }
});

/** Write a temporary JSON fixture and return its path. */
function writeTemp(document: LearningPathsDocument): string {
  const path = join(
    'tests',
    'fixtures',
    `tmp-learning-paths-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  writeFileSync(path, JSON.stringify(document), 'utf-8');
  tempPaths.push(path);
  return path;
}

function cloneDocument(document: LearningPathsDocument): LearningPathsDocument {
  return structuredClone(document) as LearningPathsDocument;
}

function ref(type: LearningPathMemberRef['type'], id: string): LearningPathMemberRef {
  return { type, id };
}

describe('loadLearningPaths', () => {
  it('loads the default data file with the three frozen paths in order', () => {
    const document = loadLearningPaths();
    expect(document.schemaVersion).toBe(1);
    expect(document.learningPaths.map((path) => path.id)).toEqual([
      'taiwan-travel',
      'hsk-vocabulary',
      'kanji-bridge',
    ]);
  });

  it('loads from an explicit path', () => {
    const document = loadLearningPaths('data/learning-paths.json');
    expect(document.learningPaths).toHaveLength(3);
  });

  it('has valid script defaults per the frozen contract', () => {
    const document = loadLearningPaths();
    const byId = new Map(document.learningPaths.map((path) => [path.id, path]));
    expect(byId.get('taiwan-travel')?.script).toBe('traditional');
    expect(byId.get('hsk-vocabulary')?.script).toBe('simplified');
    expect(byId.get('kanji-bridge')?.script).toBe('traditional');
  });

  it('has valid destinations per the frozen contract', () => {
    const document = loadLearningPaths();
    const byId = new Map(document.learningPaths.map((path) => [path.id, path]));
    expect(byId.get('taiwan-travel')?.destination).toBe('/lessons/');
    expect(byId.get('hsk-vocabulary')?.destination).toBe('/vocabulary/hsk/');
    expect(byId.get('kanji-bridge')?.destination).toBe('/vocabulary/kanji-bridge/');
  });

  it('reflects the three availability states', () => {
    const document = loadLearningPaths();
    const byId = new Map(document.learningPaths.map((path) => [path.id, path]));
    // taiwan-travel is primary and available.
    expect(byId.get('taiwan-travel')?.availabilityReason).toBe('available');
    expect(byId.get('taiwan-travel')?.availability).toBe('available');
    // kanji-bridge is unavailable until its route/data exist.
    expect(byId.get('kanji-bridge')?.availabilityReason).toBe('unavailable');
    expect(byId.get('kanji-bridge')?.availability).toBe('unavailable');
    // hsk-vocabulary availability is derived from current production HSK data.
    // The imported production batch is all-draft (importer contract), so the
    // reviewed/published level-1 slice is empty and the path is truthfully
    // unavailable until a review pass publishes rows.
    expect(byId.get('hsk-vocabulary')?.availabilityReason).toBe('hsk');
    expect(byId.get('hsk-vocabulary')?.availability).toBe('unavailable');
    expect(byId.get('hsk-vocabulary')?.hsk?.status).toBe('unavailable');
    expect(byId.get('hsk-vocabulary')?.hsk?.levels).toEqual([1]);
  });

  it('every path has Japanese label and description', () => {
    const document = loadLearningPaths();
    for (const path of document.learningPaths) {
      expect(path.labelJa.trim().length).toBeGreaterThan(0);
      expect(path.descriptionJa.trim().length).toBeGreaterThan(0);
    }
  });

  it('references real production content IDs and never duplicates them', () => {
    const document = loadLearningPaths();
    for (const path of document.learningPaths) {
      const keys = path.members.map((member) => `${member.type}:${member.id}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('throws on invalid JSON with a descriptive message', () => {
    expect(() => loadLearningPaths('tests/fixtures/malformed.json')).toThrow(
      /Failed to parse learning paths/,
    );
  });

  it('throws on a missing learningPaths array', () => {
    expect(() => loadLearningPaths('tests/fixtures/missing-array.json')).toThrow(
      /Invalid learning-paths structure/,
    );
  });

  it('throws when the file does not exist', () => {
    expect(() => loadLearningPaths('data/nonexistent.json')).toThrow();
  });

  it('throws on a duplicate path id', () => {
    const document = cloneDocument(loadLearningPaths());
    (document.learningPaths[1] as { id: string }).id = 'taiwan-travel';
    expect(() => loadLearningPaths(writeTemp(document))).toThrow(
      /duplicate learning path id 'taiwan-travel'/,
    );
  });

  it('throws on an out-of-fixed-order path set', () => {
    const document = cloneDocument(loadLearningPaths());
    const [first] = document.learningPaths;
    (document.learningPaths[0] as unknown) = document.learningPaths[1];
    (document.learningPaths[1] as unknown) = first;
    expect(() => loadLearningPaths(writeTemp(document))).toThrow(
      /learning path order violation/,
    );
  });

  it('throws on a missing frozen path', () => {
    const document = cloneDocument(loadLearningPaths());
    (document.learningPaths as unknown) = document.learningPaths.filter(
      (path) => path.id !== 'kanji-bridge',
    );
    expect(() => loadLearningPaths(writeTemp(document))).toThrow(
      /missing required learning path 'kanji-bridge'/,
    );
  });

  it('throws on an invalid script default', () => {
    const document = cloneDocument(loadLearningPaths());
    (document.learningPaths[0] as { script: string }).script = 'zh-hant';
    expect(() => loadLearningPaths(writeTemp(document))).toThrow(
      /invalid script 'zh-hant'/,
    );
  });

  it('throws on a destination that does not end with a slash', () => {
    const document = cloneDocument(loadLearningPaths());
    (document.learningPaths[0] as { destination: string }).destination = '/lessons';
    expect(() => loadLearningPaths(writeTemp(document))).toThrow(
      /must end with '\//,
    );
  });

  it('throws on a duplicate member reference', () => {
    const document = cloneDocument(loadLearningPaths());
    const path = document.learningPaths[0];
    (
      path as unknown as { members: LearningPathMemberRef[] }
    ).members.push(ref('lesson', 'lesson-001'));
    expect(() => loadLearningPaths(writeTemp(document))).toThrow(
      /duplicates member 'lesson:lesson-001'/,
    );
  });

  it('throws on a stale member reference', () => {
    const document = cloneDocument(loadLearningPaths());
    const path = document.learningPaths[0];
    (
      path as unknown as { members: LearningPathMemberRef[] }
    ).members.push(
      ref('lesson', 'lesson-999'),
    );
    expect(() => loadLearningPaths(writeTemp(document))).toThrow(
      /references stale 'lesson-999'/,
    );
  });

  it('throws when an hsk path declares an hsk status that contradicts production HSK data', () => {
    const document = cloneDocument(loadLearningPaths());
    const path = document.learningPaths[1];
    // The production batch is all-draft, so the truthful derived status is
    // 'unavailable'; declaring 'available' contradicts the data.
    (path as { hsk: { status: string } }).hsk.status = 'available';
    expect(() => loadLearningPaths(writeTemp(document))).toThrow(
      /contradicts production HSK data/,
    );
  });

  it('throws when availabilityReason is hsk but the hsk descriptor is missing', () => {
    const document = cloneDocument(loadLearningPaths());
    const path = document.learningPaths[1];
    delete (path as { hsk?: unknown }).hsk;
    expect(() => loadLearningPaths(writeTemp(document))).toThrow(
      /hsk descriptor/,
    );
  });

  it('throws on a non-hsk path that declares an hsk descriptor', () => {
    const document = cloneDocument(loadLearningPaths());
    const path = document.learningPaths[0];
    (path as { hsk: unknown }).hsk = { levels: [1], status: 'available' };
    expect(() => loadLearningPaths(writeTemp(document))).toThrow(
      /hsk descriptor but availabilityReason/,
    );
  });

  it('is deterministic and immutable across repeated loads', () => {
    const first = loadLearningPaths();
    const second = loadLearningPaths();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    for (const path of first.learningPaths) {
      expect(Object.isFrozen(path)).toBe(true);
      expect(Object.isFrozen(path.members)).toBe(true);
    }
    // Mutating a loaded record must not affect the next load.
    const third = loadLearningPaths();
    expect(JSON.stringify(third)).toBe(JSON.stringify(first));
  });

  it('produces independent references across calls', () => {
    const first = loadLearningPaths();
    const second = loadLearningPaths();
    expect(first.learningPaths[0]).not.toBe(second.learningPaths[0]);
  });

  it('performs no runtime script conversion and no content duplication', () => {
    const document = loadLearningPaths();
    const taiwan = document.learningPaths[0];
    const ids = taiwan.members.map((member) => `${member.type}:${member.id}`);
    expect(ids).toContain('lesson:lesson-001');
    expect(ids).toContain('phrase:phrase-001');
    // No HSK-only entry leaks into the Taiwan-travel path.
    expect(taiwan.members).not.toContainEqual(ref('vocabulary', 'hsk-001'));
    // Unavailable path carries no content references.
    expect(document.learningPaths[2].members).toHaveLength(0);
  });
});
