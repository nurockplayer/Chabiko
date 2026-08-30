// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../src/lib/progress';
import { STORAGE_KEY } from '../src/lib/progress';
import { ROLEPLAY_PROGRESS_KEY } from '../src/lib/roleplayProgress';
import { VOCABULARY_PROGRESS_KEY } from '../src/domain/vocabularyProgress';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
  BasicVocabularyProgressStore,
} from '../src/domain/basicVocabularyProgress';
import { getBasicVocabularyProgressStorageKey } from '../src/domain/basicVocabularyProgressScope';
import type { BasicVocabularyProgressCoordinator } from '../src/client/basicVocabularyProgressCoordinator';
import type { BasicVocabularySyncRuntimeSnapshot } from '../src/client/basicVocabularySyncRuntime';
import type { VocabularyProgressEntry } from '../src/domain/vocabularyProgress';
import {
  buildBasicVocabularyTrackSummary,
  buildCrossTrackProgressSnapshot,
  buildHskTrackSummary,
  buildTaiwanTravelTrackSummary,
} from '../src/domain/crossTrackProgress';
import {
  DASHBOARD_TRACK_ORDER,
  DASHBOARD_TRACK_LABELS,
  deriveContinuation,
  trackCardStatusKey,
  trackCardStatusLabel,
  trackDestinationHref,
  trackStatusLabel,
  trackSummaryText,
  unlockedAchievements,
  type DashboardProgressPayload,
} from '../src/domain/dashboardProgress';
import {
  buildDashboardProgressPayload,
  serializeDashboardProgressPayload,
} from '../src/content/dashboardPayload';
import { initDashboard } from '../src/client/dashboardProgress';

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const homeSource = readSource('../src/pages/index.astro');
const domainSource = readSource('../src/domain/dashboardProgress.ts');

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const TAIWAN_LESSONS = [
  { id: 'lesson-001', titleJa: '夜市で注文', coreSentence: '我要這個', pinyin: 'wǒ yào zhège' },
  { id: 'lesson-002', titleJa: '値段を聞く', coreSentence: '多少錢', pinyin: 'duōshǎo qián' },
  { id: 'lesson-003', titleJa: '場所を聞く', coreSentence: '在哪裡', pinyin: 'zài nǎlǐ' },
];

const TEST_PAYLOAD: DashboardProgressPayload = {
  basicVocabularyCorpusIds: [
    'teacher-star-1-a',
    'teacher-star-1-b',
    'teacher-star-1-c',
  ],
  hskLevels: [{ level: 1, ids: ['hsk-001', 'hsk-002'] }],
  taiwanCompletableLessonIds: ['lesson-001', 'lesson-002', 'lesson-003'],
  taiwanLessons: TAIWAN_LESSONS,
};

function guestProgress(entries: Record<string, VocabularyProgressEntry>): string {
  return JSON.stringify({ version: 1, items: entries });
}

function hskProgress(entries: Record<string, VocabularyProgressEntry>): string {
  return JSON.stringify({ version: 1, entries });
}

/** In-memory storage that records every write (for zero-write assertions). */
function createRecordingStorage(initial?: Record<string, string>) {
  const data: Record<string, string> = { ...(initial ?? {}) };
  const writes: { op: 'setItem' | 'removeItem'; key: string }[] = [];
  const storage: StorageLike & {
    _data: Record<string, string>;
    _writes: typeof writes;
  } = {
    getItem: (key: string): string | null => data[key] ?? null,
    setItem: (key: string, value: string): void => {
      data[key] = value;
      writes.push({ op: 'setItem', key });
    },
    removeItem: (key: string): void => {
      delete data[key];
      writes.push({ op: 'removeItem', key });
    },
    _data: data,
    _writes: writes,
  };
  return storage;
}

/** Fake #293 coordinator that owns a real scoped store and switches scope on
 *  request (same shape the cross-track coordinator sees in production). */
function createFakeBasicCoordinator(storage: StorageLike | null) {
  let store = new BasicVocabularyProgressStore(storage);
  let scopeSnap: BasicVocabularySyncRuntimeSnapshot = {
    scope: 'guest',
    userId: null,
    status: 'guest',
  };
  const listeners = new Set<
    (snapshot: BasicVocabularySyncRuntimeSnapshot) => void
  >();
  const notify = (): void => {
    for (const listener of [...listeners]) listener(scopeSnap);
  };
  const coordinator: BasicVocabularyProgressCoordinator = {
    getSnapshot: () => scopeSnap,
    getStore: () => store,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(scopeSnap);
      return () => {
        listeners.delete(listener);
      };
    },
    applyRating: vi.fn((itemId: string, rating: 'again' | 'unsure' | 'known') => {
      store.applyRating(itemId, rating);
    }),
    resetAll: vi.fn(() => {
      store.resetAll();
    }),
    acceptSignedIn: vi.fn((userId: string) => {
      store = new BasicVocabularyProgressStore(
        storage,
        getBasicVocabularyProgressStorageKey({ kind: 'user', userId }),
      );
      scopeSnap = { scope: 'user', userId, status: 'idle' };
      notify();
    }),
    acceptSignedOut: vi.fn(() => {
      store = new BasicVocabularyProgressStore(storage);
      scopeSnap = { scope: 'guest', userId: null, status: 'guest' };
      notify();
    }),
    dispose: () => undefined,
  };
  return coordinator;
}

/** Mount the Dashboard shell with the same hooks index.astro renders. */
function mountDashboard(): HTMLElement {
  const root = document.createElement('div');
  root.dataset.dashboardRoot = 'true';
  root.innerHTML = `
    <a class="continuation-card" data-dashboard-continuation href="/vocabulary/basic/">
      <span data-continuation-kicker>先生厳選単語</span>
      <span data-continuation-title></span>
      <span data-continuation-sentence hidden></span>
      <span data-continuation-pinyin hidden></span>
      <span data-continuation-action></span>
    </a>
    <div class="continuation-card continuation-card--empty" data-dashboard-continuation-empty hidden>
      <span data-continuation-empty-title></span>
      <span data-continuation-action></span>
    </div>
    <a data-dashboard-track="basic-vocabulary" href="/vocabulary/basic/">
      <span data-track-summary></span>
      <span data-track-status></span>
    </a>
    <a data-dashboard-track="hsk" href="/vocabulary/hsk/1/">
      <span data-track-summary></span>
      <span data-track-status></span>
    </a>
    <a data-dashboard-track="taiwan-travel" href="/lessons/lesson-001/">
      <span data-track-summary></span>
      <span data-track-status></span>
    </a>
    <ol data-achievement-list>
      <li data-achievement="first-learning-activity" hidden></li>
      <li data-achievement="vocabulary-first-word" hidden></li>
      <li data-achievement="hsk-start" hidden></li>
      <li data-achievement="taiwan-first-lesson" hidden></li>
    </ol>
    <p data-achievement-empty></p>
    <button id="reset-progress-btn" type="button">進捗をリセット</button>
  `;
  document.body.replaceChildren(root);
  return root;
}

function trackSummary(root: HTMLElement, trackId: string): string | undefined {
  return root
    .querySelector(`[data-dashboard-track="${trackId}"] [data-track-summary]`)
    ?.textContent ?? undefined;
}

function trackStatus(root: HTMLElement, trackId: string): string | undefined {
  return root
    .querySelector(`[data-dashboard-track="${trackId}"] [data-track-status]`)
    ?.textContent ?? undefined;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

// ─── Build-time payload ────────────────────────────────────────────────────────

describe('dashboard build-time payload', () => {
  it('carries the production corpora and Taiwan destination metadata', () => {
    const payload = buildDashboardProgressPayload();
    expect(payload.basicVocabularyCorpusIds.length).toBeGreaterThan(0);
    // The declared HSK level 1 corpus is non-empty (the published route).
    expect(
      payload.hskLevels.some((level) => level.level === 1 && level.ids.length > 0),
    ).toBe(true);
    expect(payload.taiwanCompletableLessonIds.length).toBeGreaterThan(0);
    for (const lesson of payload.taiwanLessons) {
      expect(lesson.id.length).toBeGreaterThan(0);
      expect(lesson.titleJa.length).toBeGreaterThan(0);
      expect(lesson.coreSentence.length).toBeGreaterThan(0);
    }
    expect(payload.taiwanLessons.length).toBe(
      payload.taiwanCompletableLessonIds.length,
    );
  });

  it('serializes with the inline-script hardening (escapes <)', () => {
    const payload: DashboardProgressPayload = {
      ...TEST_PAYLOAD,
      taiwanLessons: [
        { ...TAIWAN_LESSONS[0], coreSentence: 'a < b' },
        ...TAIWAN_LESSONS.slice(1),
      ],
    };
    const serialized = serializeDashboardProgressPayload(payload);
    expect(serialized).toContain('\\u003c');
    expect(serialized).not.toContain('a < b');
  });
});

// ─── Derivation (pure) ─────────────────────────────────────────────────────────

describe('dashboard continuation derivation', () => {
  const zeroSnapshot = buildCrossTrackProgressSnapshot({
    basicVocabulary: buildBasicVocabularyTrackSummary({
      progress: {},
      corpusIds: new Set(TEST_PAYLOAD.basicVocabularyCorpusIds),
      scope: { kind: 'guest' },
    }),
    hsk: buildHskTrackSummary({ progress: {}, levels: TEST_PAYLOAD.hskLevels }),
    taiwanTravel: buildTaiwanTravelTrackSummary({
      completedLessonIds: new Set(),
      completableLessonIds: TEST_PAYLOAD.taiwanCompletableLessonIds,
    }),
  });

  it('starts the first available track for a fresh learner (never fabricates)', () => {
    const continuation = deriveContinuation(
      zeroSnapshot,
      TEST_PAYLOAD,
      new Set(),
    );
    expect(continuation).toMatchObject({
      kind: 'start',
      trackId: 'basic-vocabulary',
      href: '/vocabulary/basic/',
      actionLabel: '単語学習を始める',
    });
  });

  it('continues an in-progress track in Dashboard order', () => {
    const snapshot = buildCrossTrackProgressSnapshot({
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: {
          'teacher-star-1-a': { status: 'learned', knownStreak: 2 },
        },
        corpusIds: new Set(TEST_PAYLOAD.basicVocabularyCorpusIds),
        scope: { kind: 'guest' },
      }),
      hsk: zeroSnapshot.tracks.hsk,
      taiwanTravel: zeroSnapshot.tracks['taiwan-travel'],
    });
    const continuation = deriveContinuation(snapshot, TEST_PAYLOAD, new Set());
    expect(continuation).toMatchObject({
      kind: 'continue',
      trackId: 'basic-vocabulary',
      href: '/vocabulary/basic/',
      actionLabel: '単語学習を続ける',
    });
  });

  it('continues an in-progress track before starting an unstarted one', () => {
    const snapshot = buildCrossTrackProgressSnapshot({
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: {},
        corpusIds: new Set(TEST_PAYLOAD.basicVocabularyCorpusIds),
        scope: { kind: 'guest' },
      }),
      hsk: buildHskTrackSummary({ progress: {}, levels: TEST_PAYLOAD.hskLevels }),
      taiwanTravel: buildTaiwanTravelTrackSummary({
        completedLessonIds: new Set(['lesson-001']),
        completableLessonIds: TEST_PAYLOAD.taiwanCompletableLessonIds,
      }),
    });
    // Taiwan is in-progress while basic-vocabulary is still not-started: the
    // learner continues Taiwan, not a brand-new track.
    const continuation = deriveContinuation(
      snapshot,
      TEST_PAYLOAD,
      new Set(['lesson-001']),
    );
    expect(continuation).toMatchObject({
      kind: 'continue',
      trackId: 'taiwan-travel',
      href: '/lessons/lesson-002/',
      actionLabel: 'レッスンを続ける',
    });
  });

  it('continues the Taiwan current lesson with a real destination', () => {
    const snapshot = buildCrossTrackProgressSnapshot({
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: Object.fromEntries(
          TEST_PAYLOAD.basicVocabularyCorpusIds.map((id) => [
            id,
            { status: 'learned', knownStreak: 2 },
          ]),
        ),
        corpusIds: new Set(TEST_PAYLOAD.basicVocabularyCorpusIds),
        scope: { kind: 'guest' },
      }),
      hsk: buildHskTrackSummary({
        progress: {
          'hsk-001': { status: 'learned', knownStreak: 2 },
          'hsk-002': { status: 'learned', knownStreak: 2 },
        },
        levels: TEST_PAYLOAD.hskLevels,
      }),
      taiwanTravel: buildTaiwanTravelTrackSummary({
        completedLessonIds: new Set(['lesson-001']),
        completableLessonIds: TEST_PAYLOAD.taiwanCompletableLessonIds,
      }),
    });
    const continuation = deriveContinuation(
      snapshot,
      TEST_PAYLOAD,
      new Set(['lesson-001']),
    );
    expect(continuation).toMatchObject({
      kind: 'continue',
      trackId: 'taiwan-travel',
      href: '/lessons/lesson-002/',
      title: '値段を聞く',
      sentence: '多少錢',
      pinyin: 'duōshǎo qián',
    });
  });

  it('reports completed when every available track is complete', () => {
    const snapshot = buildCrossTrackProgressSnapshot({
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: Object.fromEntries(
          TEST_PAYLOAD.basicVocabularyCorpusIds.map((id) => [
            id,
            { status: 'learned', knownStreak: 2 },
          ]),
        ),
        corpusIds: new Set(TEST_PAYLOAD.basicVocabularyCorpusIds),
        scope: { kind: 'guest' },
      }),
      hsk: buildHskTrackSummary({
        progress: {
          'hsk-001': { status: 'learned', knownStreak: 2 },
          'hsk-002': { status: 'learned', knownStreak: 2 },
        },
        levels: TEST_PAYLOAD.hskLevels,
      }),
      taiwanTravel: buildTaiwanTravelTrackSummary({
        completedLessonIds: new Set(TEST_PAYLOAD.taiwanCompletableLessonIds),
        completableLessonIds: TEST_PAYLOAD.taiwanCompletableLessonIds,
      }),
    });
    const continuation = deriveContinuation(
      snapshot,
      TEST_PAYLOAD,
      new Set(TEST_PAYLOAD.taiwanCompletableLessonIds),
    );
    expect(continuation.kind).toBe('completed');
    expect(continuation.href).toBeNull();
  });

  it('skips a track whose destination is unavailable even when content exists', () => {
    // Partial HSK publication: level 2 has production ids (track availability
    // is available) but level 1 has no published route. The continuation must
    // never fabricate a /vocabulary/hsk/1/ destination.
    const partialPayload: DashboardProgressPayload = {
      ...TEST_PAYLOAD,
      hskLevels: [{ level: 2, ids: ['hsk-999'] }],
    };
    const snapshot = buildCrossTrackProgressSnapshot({
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: Object.fromEntries(
          TEST_PAYLOAD.basicVocabularyCorpusIds.map((id) => [
            id,
            { status: 'learned', knownStreak: 2 },
          ]),
        ),
        corpusIds: new Set(TEST_PAYLOAD.basicVocabularyCorpusIds),
        scope: { kind: 'guest' },
      }),
      hsk: buildHskTrackSummary({
        progress: {},
        levels: partialPayload.hskLevels,
      }),
      taiwanTravel: buildTaiwanTravelTrackSummary({
        completedLessonIds: new Set(),
        completableLessonIds: TEST_PAYLOAD.taiwanCompletableLessonIds,
      }),
    });
    const continuation = deriveContinuation(snapshot, partialPayload, new Set());
    expect(continuation.trackId).toBe('taiwan-travel');
    expect(continuation.href).toBe('/lessons/lesson-001/');
  });

  it('reports unavailable when no track has a usable destination', () => {
    const snapshot = buildCrossTrackProgressSnapshot({
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: {},
        corpusIds: new Set(),
        scope: { kind: 'guest' },
      }),
      hsk: buildHskTrackSummary({ progress: {}, levels: [] }),
      taiwanTravel: buildTaiwanTravelTrackSummary({
        completedLessonIds: new Set(),
        completableLessonIds: [],
      }),
    });
    const continuation = deriveContinuation(snapshot, TEST_PAYLOAD, new Set());
    expect(continuation.kind).toBe('unavailable');
    expect(continuation.href).toBeNull();
    expect(continuation.title).toBe('利用できるコースは準備中です');
  });

  it('reports unavailable (not completed) when content exists but no destination is usable', () => {
    // HSK has level-2 content (track availability is available) but no
    // published level-1 route, and the other tracks are unavailable: the
    // learner has completed nothing, so the state is preparing, never
    // "completed".
    const partialPayload: DashboardProgressPayload = {
      ...TEST_PAYLOAD,
      basicVocabularyCorpusIds: [],
      hskLevels: [{ level: 2, ids: ['hsk-999'] }],
      taiwanCompletableLessonIds: [],
      taiwanLessons: [],
    };
    const snapshot = buildCrossTrackProgressSnapshot({
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: {},
        corpusIds: new Set(),
        scope: { kind: 'guest' },
      }),
      hsk: buildHskTrackSummary({
        progress: {},
        levels: partialPayload.hskLevels,
      }),
      taiwanTravel: buildTaiwanTravelTrackSummary({
        completedLessonIds: new Set(),
        completableLessonIds: [],
      }),
    });
    const continuation = deriveContinuation(snapshot, partialPayload, new Set());
    expect(continuation.kind).toBe('unavailable');
    expect(continuation.href).toBeNull();
  });
});

describe('dashboard track destination + summary helpers', () => {
  const snapshot = buildCrossTrackProgressSnapshot({
    basicVocabulary: buildBasicVocabularyTrackSummary({
      progress: {},
      corpusIds: new Set(TEST_PAYLOAD.basicVocabularyCorpusIds),
      scope: { kind: 'guest' },
    }),
    hsk: buildHskTrackSummary({ progress: {}, levels: TEST_PAYLOAD.hskLevels }),
    taiwanTravel: buildTaiwanTravelTrackSummary({
      completedLessonIds: new Set(),
      completableLessonIds: TEST_PAYLOAD.taiwanCompletableLessonIds,
    }),
  });

  it('links exactly the three first-class tracks to real destinations', () => {
    expect(DASHBOARD_TRACK_ORDER).toEqual([
      'basic-vocabulary',
      'hsk',
      'taiwan-travel',
    ]);
    expect(DASHBOARD_TRACK_LABELS).toEqual({
      'basic-vocabulary': '先生厳選単語',
      hsk: 'HSK',
      'taiwan-travel': '台湾旅行',
    });
    expect(
      trackDestinationHref('basic-vocabulary', snapshot, TEST_PAYLOAD, new Set()),
    ).toBe('/vocabulary/basic/');
    expect(
      trackDestinationHref('hsk', snapshot, TEST_PAYLOAD, new Set()),
    ).toBe('/vocabulary/hsk/1/');
    expect(
      trackDestinationHref('taiwan-travel', snapshot, TEST_PAYLOAD, new Set()),
    ).toBe('/lessons/lesson-001/');
  });

  it('follows the current Taiwan lesson and falls back to the first when done', () => {
    expect(
      trackDestinationHref(
        'taiwan-travel',
        snapshot,
        TEST_PAYLOAD,
        new Set(['lesson-001']),
      ),
    ).toBe('/lessons/lesson-002/');
    expect(
      trackDestinationHref(
        'taiwan-travel',
        snapshot,
        TEST_PAYLOAD,
        new Set(['lesson-001', 'lesson-002', 'lesson-003']),
      ),
    ).toBe('/lessons/lesson-001/');
  });

  it('keeps the HSK card preparing when level 1 has no published content', () => {
    const partial: DashboardProgressPayload = {
      ...TEST_PAYLOAD,
      hskLevels: [{ level: 2, ids: ['hsk-999'] }],
    };
    expect(
      trackDestinationHref('hsk', snapshot, partial, new Set()),
    ).toBeNull();
    expect(trackCardStatusLabel('hsk', snapshot, partial)).toBe('準備中');
    expect(trackCardStatusKey('hsk', snapshot, partial)).toBe('preparing');
    expect(trackSummaryText('hsk', snapshot, partial)).toBe('');
  });

  it('formats truthful compact summaries and status labels', () => {
    expect(trackSummaryText('basic-vocabulary', snapshot, TEST_PAYLOAD)).toBe(
      '0 / 3 語学習済み',
    );
    expect(trackSummaryText('taiwan-travel', snapshot, TEST_PAYLOAD)).toBe(
      '0 / 3 レッスン完了',
    );
    expect(trackStatusLabel('not-started')).toBe('未開始');
    expect(trackStatusLabel('in-progress')).toBe('学習中');
    expect(trackStatusLabel('completed')).toBe('完了');
  });

  it('evaluates unlocked achievements from the snapshot only', () => {
    expect(unlockedAchievements(snapshot)).toEqual([]);
    const learned = buildCrossTrackProgressSnapshot({
      basicVocabulary: buildBasicVocabularyTrackSummary({
        progress: {
          'teacher-star-1-a': { status: 'learned', knownStreak: 2 },
        },
        corpusIds: new Set(TEST_PAYLOAD.basicVocabularyCorpusIds),
        scope: { kind: 'guest' },
      }),
      hsk: snapshot.tracks.hsk,
      taiwanTravel: snapshot.tracks['taiwan-travel'],
    });
    const unlocked = unlockedAchievements(learned).map(
      (evaluation) => evaluation.achievement.id,
    );
    expect(unlocked).toContain('first-learning-activity');
    expect(unlocked).toContain('vocabulary-first-word');
    expect(unlocked).not.toContain('hsk-start');
  });
});

// ─── SSR page structure (source-level) ────────────────────────────────────────

describe('dashboard home page (index.astro)', () => {
  it('renders one coherent learner dashboard hierarchy in order', () => {
    const continuation = homeSource.indexOf('続きを学ぶ');
    const courses = homeSource.indexOf('学習コース');
    const achievements = homeSource.indexOf('実績');
    expect(continuation).toBeGreaterThan(0);
    expect(courses).toBeGreaterThan(continuation);
    expect(achievements).toBeGreaterThan(courses);
    expect(homeSource).toContain('<BaseLayout title="ホーム"');
    expect(homeSource).toContain('<Header themeEnabled />');
  });

  it('renders the three track cards from the canonical order, not a lesson list', () => {
    expect(homeSource).toContain('DASHBOARD_TRACK_ORDER.map');
    expect(homeSource).toContain('data-dashboard-track={trackId}');
    // The old static home lesson list and feature entry are gone.
    expect(homeSource).not.toContain('lessons.map((lesson, index)');
    expect(homeSource).not.toContain('basic-vocabulary-entry');
    expect(homeSource).not.toContain('class="home-journey"');
  });

  it('wires the build-time payload to the cross-track coordinator', () => {
    expect(homeSource).toContain('buildDashboardProgressPayload()');
    expect(homeSource).toContain(
      '<script is:inline type="application/json" id="dashboard-progress-data"',
    );
    expect(homeSource).toContain("import { initDashboard }");
    // One client script block (the payload script carries attributes).
    expect(homeSource.match(/<script>/g)).toHaveLength(1);
  });

  it('keeps the paths route discoverable with a compact link', () => {
    expect(homeSource.match(/href="\/paths\/"/g)).toHaveLength(1);
    expect(homeSource).toContain('学習ルート一覧');
  });

  it('keeps the preserved Taiwan reset control', () => {
    expect(homeSource).toContain('id="reset-progress-btn"');
    expect(homeSource).toContain('進捗をリセット');
  });

  it('keeps Chinese and pinyin semantics for the continuation destination', () => {
    expect(homeSource).toContain('lang="zh-Hant"');
    expect(homeSource).toContain('lang="zh-Latn"');
  });

  it('keeps primary, secondary, interactive-row, and passive Home states distinct at rest', () => {
    // A regression that removes the persistent filled continuation control
    // would make the most important next step read like editorial copy again.
    expect(homeSource).toContain(
      'class="featured-action featured-action--primary"',
    );
    expect(homeSource).toMatch(
      /\.featured-action\s*\{[^}]*min-height:\s*44px/,
    );
    expect(homeSource).toMatch(
      /\.featured-action--primary\s*\{[^}]*border:\s*1px solid var\(--coral-deep\)[^}]*border-radius:\s*var\(--radius-control\)[^}]*background:\s*var\(--coral-deep\)[^}]*color:\s*var\(--color-on-primary\)/,
    );
    expect(homeSource).toContain('.featured:focus-visible');
    expect(homeSource).toContain('.featured:active .featured-action--primary');

    // Available course entries remain whole native anchors, but their resting
    // object boundary and trailing affordance must never collapse into the
    // flat unavailable-row treatment.
    expect(homeSource).toContain('class="track-row track-row--available"');
    expect(homeSource).toMatch(
      /\.track-row--available\s*\{[^}]*border:\s*1px solid var\(--hairline-strong\)[^}]*border-radius:\s*var\(--radius-content\)[^}]*background:\s*var\(--paper\)/,
    );
    expect(homeSource).toMatch(
      /\.track-arrow\s*\{[^}]*border:\s*1px solid var\(--hairline-strong\)[^}]*border-radius:\s*var\(--radius-control\)/,
    );
    expect(homeSource).toContain('.track-row--available:focus-visible');
    expect(homeSource).toContain('.track-row--available:active');
    expect(homeSource).toMatch(
      /\.track-row--unavailable\s*\{[^}]*cursor:\s*default/,
    );

    // The Home route list is the secondary action. Headings stay flat
    // editorial content rather than acquiring the same boundary treatment.
    expect(homeSource).toMatch(
      /\.dashboard-paths-link\s*\{[^}]*border:\s*1px solid var\(--jade\)[^}]*border-radius:\s*var\(--radius-control\)[^}]*background:\s*var\(--jade-soft\)/,
    );
    expect(homeSource).not.toMatch(/\.section-head\s*\{[^}]*background:/);
    expect(homeSource).not.toMatch(/\.section-head\s*\{[^}]*border-radius:/);
  });

  it('does not hard-code storage keys or progress totals into the page', () => {
    expect(homeSource).not.toContain('chabiko_completed_lessons');
    expect(homeSource).not.toContain('1582');
    expect(domainSource).not.toMatch(/localStorage|sessionStorage|chabiko_/);
  });
});

// ─── Client hydration ─────────────────────────────────────────────────────────

describe('dashboard client hydration', () => {
  it('hydrates the fresh-learner shell with truthful zero evidence', () => {
    const root = mountDashboard();
    const basic = createFakeBasicCoordinator(null);
    initDashboard(root, TEST_PAYLOAD, { basicVocabulary: basic, storage: null });

    expect(trackSummary(root, 'basic-vocabulary')).toBe('0 / 3 語学習済み');
    expect(trackStatus(root, 'basic-vocabulary')).toBe('未開始');
    expect(trackSummary(root, 'hsk')).toBe('0 / 2 語学習済み');
    expect(trackSummary(root, 'taiwan-travel')).toBe('0 / 3 レッスン完了');
    expect(trackStatus(root, 'taiwan-travel')).toBe('未開始');

    const continuation = root.querySelector<HTMLAnchorElement>(
      '[data-dashboard-continuation]',
    );
    expect(continuation?.hidden).toBe(false);
    expect(continuation?.getAttribute('href')).toBe('/vocabulary/basic/');
    expect(
      root.querySelector('[data-continuation-title]')?.textContent,
    ).toBe('先生厳選単語');
    expect(root.querySelector('[data-continuation-action]')?.textContent).toContain(
      '単語学習を始める',
    );
    expect(
      root.querySelector('[data-dashboard-continuation-empty]')?.hasAttribute('hidden'),
    ).toBe(true);

    // No achievements yet.
    expect(
      root.querySelector('[data-achievement-empty]')?.hasAttribute('hidden'),
    ).toBe(false);
  });

  it('reflects partial progress across all three tracks and unlocks achievements', () => {
    const storage = createRecordingStorage();
    storage._data[STORAGE_KEY] = JSON.stringify(['lesson-001']);
    storage._data[VOCABULARY_PROGRESS_KEY] = hskProgress({
      'hsk-001': { status: 'learned', knownStreak: 2 },
    });
    storage._data[BASIC_VOCABULARY_PROGRESS_KEY] = guestProgress({
      'teacher-star-1-a': { status: 'learned', knownStreak: 2 },
    });
    const root = mountDashboard();
    const basic = createFakeBasicCoordinator(storage);
    initDashboard(root, TEST_PAYLOAD, { basicVocabulary: basic, storage });

    expect(trackSummary(root, 'basic-vocabulary')).toBe('1 / 3 語学習済み');
    expect(trackStatus(root, 'basic-vocabulary')).toBe('学習中');
    expect(trackSummary(root, 'hsk')).toBe('1 / 2 語学習済み');
    expect(trackStatus(root, 'hsk')).toBe('学習中');
    expect(trackSummary(root, 'taiwan-travel')).toBe('1 / 3 レッスン完了');
    expect(trackStatus(root, 'taiwan-travel')).toBe('学習中');

    // The Taiwan card re-points to the current (next) lesson.
    expect(
      root
        .querySelector('[data-dashboard-track="taiwan-travel"]')
        ?.getAttribute('href'),
    ).toBe('/lessons/lesson-002/');

    // Continuation prefers the in-progress basic-vocabulary track.
    const continuation = root.querySelector<HTMLAnchorElement>(
      '[data-dashboard-continuation]',
    );
    expect(continuation?.getAttribute('href')).toBe('/vocabulary/basic/');
    expect(root.querySelector('[data-continuation-action]')?.textContent).toContain(
      '単語学習を続ける',
    );

    // Achievements unlocked from #373 evidence.
    for (const id of ['first-learning-activity', 'vocabulary-first-word', 'hsk-start']) {
      expect(
        root
          .querySelector(`[data-achievement="${id}"]`)
          ?.hasAttribute('hidden'),
      ).toBe(false);
    }
    expect(
      root.querySelector('[data-achievement-empty]')?.hasAttribute('hidden'),
    ).toBe(true);
  });

  it('keeps the basic-vocabulary summary scoped to the active identity', () => {
    const storage = createRecordingStorage();
    storage._data[BASIC_VOCABULARY_PROGRESS_KEY] = guestProgress({
      'teacher-star-1-a': { status: 'learned', knownStreak: 2 },
    });
    const root = mountDashboard();
    const basic = createFakeBasicCoordinator(storage);
    initDashboard(root, TEST_PAYLOAD, { basicVocabulary: basic, storage });
    expect(trackSummary(root, 'basic-vocabulary')).toBe('1 / 3 語学習済み');

    // Signing in switches to the (empty) user scope; guest progress never leaks.
    const userA = 'f0b6d6c4-2f4e-4d8a-9a1c-6f5c4b3a2d1e';
    storage._data[getBasicVocabularyProgressStorageKey({ kind: 'user', userId: userA })] =
      guestProgress({});
    basic.acceptSignedIn(userA);
    expect(trackSummary(root, 'basic-vocabulary')).toBe('0 / 3 語学習済み');

    // Logging out returns to the guest scope and its own progress.
    basic.acceptSignedOut();
    expect(trackSummary(root, 'basic-vocabulary')).toBe('1 / 3 語学習済み');
  });

  it('stays truthful when storage is malformed or unavailable', () => {
    const storage = createRecordingStorage();
    storage._data[STORAGE_KEY] = '{ not json';
    storage._data[VOCABULARY_PROGRESS_KEY] = 'garbage';
    storage._data[BASIC_VOCABULARY_PROGRESS_KEY] = '[[[';
    const root = mountDashboard();
    const basic = createFakeBasicCoordinator(storage);
    expect(() =>
      initDashboard(root, TEST_PAYLOAD, { basicVocabulary: basic, storage }),
    ).not.toThrow();
    expect(trackSummary(root, 'basic-vocabulary')).toBe('0 / 3 語学習済み');
    expect(trackSummary(root, 'hsk')).toBe('0 / 2 語学習済み');
    expect(trackSummary(root, 'taiwan-travel')).toBe('0 / 3 レッスン完了');
    expect(
      root.querySelector('[data-achievement-empty]')?.hasAttribute('hidden'),
    ).toBe(false);
  });

  it('introduces zero writes on init and snapshot reads', () => {
    const storage = createRecordingStorage();
    const root = mountDashboard();
    const basic = createFakeBasicCoordinator(storage);
    const cleanup = initDashboard(root, TEST_PAYLOAD, { basicVocabulary: basic, storage });

    // Drive reads like pageshow/storage (read-only) — no writes.
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    cleanup();
    expect(storage._writes).toEqual([]);
  });

  it('clears Taiwan and roleplay progress, then re-renders', () => {
    const storage = createRecordingStorage();
    storage._data[STORAGE_KEY] = JSON.stringify(['lesson-001', 'lesson-002']);
    storage._data[ROLEPLAY_PROGRESS_KEY] = JSON.stringify({
      version: 1,
      completedCardIds: ['roleplay-food-001'],
    });
    const root = mountDashboard();
    const basic = createFakeBasicCoordinator(storage);
    initDashboard(root, TEST_PAYLOAD, { basicVocabulary: basic, storage });
    expect(trackSummary(root, 'taiwan-travel')).toBe('2 / 3 レッスン完了');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    root
      .querySelector<HTMLButtonElement>('#reset-progress-btn')
      ?.dispatchEvent(new MouseEvent('click'));

    expect(storage._data[STORAGE_KEY]).toBeUndefined();
    expect(storage._data[ROLEPLAY_PROGRESS_KEY]).toBeUndefined();
    expect(trackSummary(root, 'taiwan-travel')).toBe('0 / 3 レッスン完了');
    expect(trackStatus(root, 'taiwan-travel')).toBe('未開始');
  });

  it('shows the preparing continuation when no destination is available', () => {
    const emptyPayload: DashboardProgressPayload = {
      basicVocabularyCorpusIds: [],
      hskLevels: [{ level: 1, ids: [] }],
      taiwanCompletableLessonIds: [],
      taiwanLessons: [],
    };
    const root = mountDashboard();
    const basic = createFakeBasicCoordinator(null);
    initDashboard(root, emptyPayload, { basicVocabulary: basic, storage: null });

    const link = root.querySelector<HTMLAnchorElement>(
      '[data-dashboard-continuation]',
    );
    expect(link?.hasAttribute('hidden')).toBe(true);
    const empty = root.querySelector<HTMLElement>(
      '[data-dashboard-continuation-empty]',
    );
    expect(empty?.hasAttribute('hidden')).toBe(false);
    expect(
      root.querySelector('[data-continuation-empty-title]')?.textContent,
    ).toBe('利用できるコースは準備中です');
    // Every track stays preparing with no summary.
    for (const trackId of DASHBOARD_TRACK_ORDER) {
      expect(
        root
          .querySelector(`[data-dashboard-track="${trackId}"] [data-track-status]`)
          ?.textContent,
      ).toBe('準備中');
    }
  });
});
