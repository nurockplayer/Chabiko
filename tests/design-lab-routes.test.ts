// @vitest-environment happy-dom

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import * as designLabCapture from '../scripts/capture-design-lab';
import {
  CAPTURE_MANIFEST,
  CAPTURE_METADATA_FILENAME,
  COMPARISON_VIEWPORT,
  EVIDENCE_DIRECTORY,
  INDIVIDUAL_VIEWPORT,
  validateCapturePublication,
  validateLocalBaseUrl,
} from '../scripts/capture-design-lab';
import { initDesignLabPrototype } from '../src/client/designLabPrototype';
import {
  buildDesignLabFixture,
  buildDesignLabFixtureFromSources,
} from '../src/content/designLabFixture';
import { loadLessonById } from '../src/content/loadLessons';
import learningPathsData from '../data/learning-paths.json';
import readinessData from '../data/travel-quest-readiness.json';
import vocabularyData from '../data/examples/valid/vocabulary.json';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function snapshotFileBytes(directory: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};

  async function walk(currentDirectory: string, prefix = ''): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
      } else {
        snapshot[relativePath] = (await readFile(absolutePath)).toString('base64');
      }
    }
  }

  await walk(directory);
  return snapshot;
}

function fixtureSources(): {
  lesson: ReturnType<typeof loadLessonById>;
  vocabularyDocument: unknown;
  readinessDocument: unknown;
  learningPathsDocument: unknown;
} {
  return {
    lesson: loadLessonById('lesson-001'),
    vocabularyDocument: clone(vocabularyData),
    readinessDocument: clone(readinessData),
    learningPathsDocument: clone(learningPathsData),
  };
}

function createDesignLabRoot(): HTMLElement {
  const root = document.createElement('main');
  root.setAttribute('data-design-lab', '');
  root.innerHTML = `
    <nav>
      <button type="button" data-lab-nav data-lab-target="home">Home</button>
      <button type="button" data-lab-nav data-lab-target="vocabulary">Vocabulary</button>
      <button type="button" data-lab-nav data-lab-target="lesson">Lesson</button>
      <button type="button" data-lab-nav data-lab-target="travel">Travel</button>
    </nav>
    <section data-lab-view="home">Home view</section>
    <section data-lab-view="vocabulary">
      <button type="button" data-lab-reveal>Reveal</button>
      <p data-lab-answer hidden>これ</p>
      <button type="button" data-lab-rating="again">Again</button>
      <button type="button" data-lab-rating="known">Known</button>
    </section>
    <section data-lab-view="lesson">
      <button type="button" data-lab-quiz-choice data-lab-correct="true">我要這個</button>
      <button type="button" data-lab-quiz-choice data-lab-correct="false">你要這個</button>
    </section>
    <section data-lab-view="travel">Travel view</section>
  `;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('design lab fixture', () => {
  test('derives the shared learner content from canonical structured sources', () => {
    const fixture = buildDesignLabFixture();

    expect(fixture.lesson.id).toBe('lesson-001');
    expect(fixture.lesson.coreSentence).toBe('我要這個');
    expect(fixture.vocabulary.id).toBe('voc-002');
    expect(fixture.travelTargets).toHaveLength(4);
  });

  test('rejects malformed required vocabulary fields and example metadata', () => {
    expect(buildDesignLabFixtureFromSources).toBeTypeOf('function');

    const invalidStatus = fixtureSources();
    const vocabularyWithInvalidStatus = invalidStatus.vocabularyDocument as {
      vocabulary: Array<Record<string, unknown>>;
    };
    vocabularyWithInvalidStatus.vocabulary.find((entry) => entry.id === 'voc-002')!.simplifiedStatus = 'unavailable';
    expect(() => buildDesignLabFixtureFromSources(invalidStatus)).toThrow();

    const invalidExample = fixtureSources();
    const vocabularyWithInvalidExample = invalidExample.vocabularyDocument as {
      vocabulary: Array<Record<string, unknown>>;
    };
    vocabularyWithInvalidExample.vocabulary.find((entry) => entry.id === 'voc-002')!.examples = [
      { traditional: '這個多少錢', traditionalStatus: 'authored', pinyin: 2, japanese: 'これはいくらですか？' },
    ];
    expect(() => buildDesignLabFixtureFromSources(invalidExample)).toThrow();
  });

  test.each([
    ['traditional', ''],
    ['simplified', ''],
    ['traditionalStatus', 'invalid-status'],
    ['simplifiedStatus', 'invalid-status'],
    ['pinyin', ''],
    ['japanese', ''],
    ['kana', ''],
    ['category', ''],
    ['reviewStatus', 'invalid-status'],
  ] as const)('rejects malformed required vocabulary field %s', (field, value) => {
    const invalidSource = fixtureSources();
    const vocabularyDocument = invalidSource.vocabularyDocument as {
      vocabulary: Array<Record<string, unknown>>;
    };
    const vocabulary = vocabularyDocument.vocabulary.find((entry) => entry.id === 'voc-002')!;
    vocabulary[field] = value;

    expect(() => buildDesignLabFixtureFromSources(invalidSource)).toThrow();
  });

  test('rejects malformed travel readiness documents, targets, and evidence', () => {
    const invalidDocument = fixtureSources();
    (invalidDocument.readinessDocument as { schemaVersion: unknown }).schemaVersion = 2;
    expect(() => buildDesignLabFixtureFromSources(invalidDocument)).toThrow();

    const invalidTarget = fixtureSources();
    const readinessWithInvalidTarget = invalidTarget.readinessDocument as {
      targets: Array<Record<string, unknown>>;
    };
    readinessWithInvalidTarget.targets[0].evidence = [];
    expect(() => buildDesignLabFixtureFromSources(invalidTarget)).toThrow();

    const invalidEvidence = fixtureSources();
    const readinessWithInvalidEvidence = invalidEvidence.readinessDocument as {
      targets: Array<{ evidence: Array<Record<string, unknown>> }>;
    };
    readinessWithInvalidEvidence.targets[0].evidence[0].type = 'opened-lesson';
    expect(() => buildDesignLabFixtureFromSources(invalidEvidence)).toThrow();
  });
});

describe('design lab layout isolation', () => {
  test('owns the baseline reset required by prototype routes', () => {
    const layout = readFileSync('src/layouts/DesignLabLayout.astro', 'utf8');

    expect(layout).toMatch(/<style\s+is:global(?:\s|>)/);
    expect(layout).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box;/);
    expect(layout).toMatch(/body\s*\{\s*margin:\s*0;/);
    expect(layout).toMatch(/button,\s*input,\s*select,\s*textarea\s*\{\s*font:\s*inherit;/);
    expect(layout).toMatch(/img,\s*picture,\s*svg,\s*video,\s*canvas\s*\{[\s\S]*?display:\s*block;[\s\S]*?max-width:\s*100%;/);
  });
});

describe('design lab controller', () => {
  test('uses roving focus to activate tab views while preserving native keys', () => {
    window.history.replaceState({}, '', '/design-lab/apple/?view=vocabulary');
    const root = createDesignLabRoot();

    initDesignLabPrototype(root);

    const navigation = [
      ...root.querySelectorAll<HTMLButtonElement>('[data-lab-nav]'),
    ];
    const [home, vocabulary, lesson, travel] = navigation;
    expect(navigation.map((item) => item.tabIndex)).toEqual([-1, 0, -1, -1]);

    const press = (item: HTMLButtonElement, key: string): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      item.dispatchEvent(event);
      return event;
    };

    expect(press(vocabulary, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(lesson);
    expect(lesson.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector<HTMLElement>('[data-lab-view="lesson"]')?.hidden).toBe(false);
    expect(navigation.map((item) => item.tabIndex)).toEqual([-1, -1, 0, -1]);

    press(lesson, 'End');
    expect(document.activeElement).toBe(travel);
    press(travel, 'ArrowRight');
    expect(document.activeElement).toBe(home);
    press(home, 'ArrowLeft');
    expect(document.activeElement).toBe(travel);
    press(travel, 'Home');
    expect(document.activeElement).toBe(home);
    expect(home.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector<HTMLElement>('[data-lab-view="home"]')?.hidden).toBe(false);

    for (const key of ['Tab', 'Enter', ' ']) {
      expect(press(home, key).defaultPrevented).toBe(false);
    }
    travel.click();
    expect(travel.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector<HTMLElement>('[data-lab-view="travel"]')?.hidden).toBe(false);
  });

  test('removes tab key handlers during cleanup', () => {
    const root = createDesignLabRoot();
    const cleanup = initDesignLabPrototype(root);
    const vocabulary = root.querySelector<HTMLButtonElement>(
      '[data-lab-nav][data-lab-target="vocabulary"]',
    )!;

    const activateVocabulary = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    root.querySelector<HTMLButtonElement>('[data-lab-nav][data-lab-target="home"]')!
      .dispatchEvent(activateVocabulary);
    expect(vocabulary.getAttribute('aria-selected')).toBe('true');

    cleanup();
    const afterCleanup = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    vocabulary.dispatchEvent(afterCleanup);

    expect(afterCleanup.defaultPrevented).toBe(false);
    expect(vocabulary.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector<HTMLElement>('[data-lab-view="lesson"]')?.hidden).toBe(true);
  });

  test('ignores navigation owned by a nested prototype root', () => {
    const root = createDesignLabRoot();
    const nestedRoot = createDesignLabRoot();
    root.append(nestedRoot);

    initDesignLabPrototype(root);

    expect([
      ...nestedRoot.querySelectorAll<HTMLButtonElement>('[data-lab-nav]'),
    ].map((item) => item.tabIndex)).toEqual([0, 0, 0, 0]);
  });

  test('keeps every controller state surface inside the owning prototype root', () => {
    const root = createDesignLabRoot();
    const parentViews = [...root.querySelectorAll<HTMLElement>('[data-lab-view]')];
    const parentReveal = root.querySelector<HTMLButtonElement>('[data-lab-reveal]')!;
    const parentAnswer = root.querySelector<HTMLElement>('[data-lab-answer]')!;
    const parentKnown = root.querySelector<HTMLButtonElement>('[data-lab-rating="known"]')!;
    const parentQuizChoice = root.querySelector<HTMLButtonElement>('[data-lab-quiz-choice]')!;
    const parentLesson = root.querySelector<HTMLElement>('[data-lab-view="lesson"]')!;
    const nestedRoot = createDesignLabRoot();
    const nestedViews = [...nestedRoot.querySelectorAll<HTMLElement>('[data-lab-view]')];
    const nestedReveal = nestedRoot.querySelector<HTMLButtonElement>('[data-lab-reveal]')!;
    const nestedAnswer = nestedRoot.querySelector<HTMLElement>('[data-lab-answer]')!;
    const nestedRatings = [
      ...nestedRoot.querySelectorAll<HTMLButtonElement>('[data-lab-rating]'),
    ];
    const nestedKnown = nestedRoot.querySelector<HTMLButtonElement>('[data-lab-rating="known"]')!;
    const nestedQuizChoice = nestedRoot.querySelector<HTMLButtonElement>(
      '[data-lab-quiz-choice][data-lab-correct="false"]',
    )!;
    const nestedFeedback = document.createElement('p');
    nestedFeedback.setAttribute('data-lab-quiz-feedback', '');
    nestedRoot.querySelector<HTMLElement>('[data-lab-view="lesson"]')!.append(nestedFeedback);
    root.append(nestedRoot);

    initDesignLabPrototype(root);

    expect(parentViews.map((view) => view.hidden)).toEqual([false, true, true, true]);
    expect(nestedViews.map((view) => view.hidden)).toEqual([false, false, false, false]);
    expect(nestedFeedback.getAttribute('role')).toBeNull();
    expect(nestedFeedback.getAttribute('aria-live')).toBeNull();

    nestedReveal.click();
    expect(parentAnswer.hidden).toBe(true);
    expect(nestedAnswer.hidden).toBe(true);
    expect(nestedReveal.hidden).toBe(false);

    nestedKnown.click();
    expect(root.dataset.labRating).toBeUndefined();
    expect(nestedRatings.map((rating) => rating.disabled)).toEqual([false, false]);
    expect(nestedRatings.map((rating) => rating.getAttribute('aria-pressed'))).toEqual([
      null,
      null,
    ]);

    const parentFeedback = parentLesson.querySelector<HTMLElement>(
      '[data-lab-quiz-feedback]',
    )!;
    expect(parentFeedback).not.toBe(nestedFeedback);
    nestedQuizChoice.click();
    expect(parentFeedback.textContent).toBe('');
    expect(nestedFeedback.textContent).toBe('');
    expect(nestedQuizChoice.getAttribute('aria-pressed')).toBeNull();

    parentReveal.click();
    expect(parentAnswer.hidden).toBe(false);
    expect(nestedAnswer.hidden).toBe(true);

    parentKnown.click();
    expect(root.dataset.labRating).toBe('known');
    expect(nestedRatings.map((rating) => rating.disabled)).toEqual([false, false]);
    expect(nestedRatings.map((rating) => rating.getAttribute('aria-pressed'))).toEqual([
      null,
      null,
    ]);

    parentQuizChoice.click();
    expect(parentFeedback.textContent).toBe('正解です');
    expect(nestedFeedback.textContent).toBe('');
    expect(nestedQuizChoice.getAttribute('aria-pressed')).toBeNull();
  });

  test('falls back from an invalid query and keeps exactly one selected view', () => {
    window.history.replaceState({}, '', '/design-lab/apple/?view=unknown');
    const root = createDesignLabRoot();

    initDesignLabPrototype(root);

    const visibleViews = [...root.querySelectorAll<HTMLElement>('[data-lab-view]')].filter(
      (view) => !view.hidden,
    );
    const selectedNav = [...root.querySelectorAll<HTMLElement>('[data-lab-nav]')].filter(
      (nav) => nav.getAttribute('aria-selected') === 'true',
    );
    expect(visibleViews.map((view) => view.dataset.labView)).toEqual(['home']);
    expect(selectedNav.map((nav) => nav.dataset.labTarget)).toEqual(['home']);
  });

  test('switches views and keeps prototype interactions local to the mounted root', () => {
    window.history.replaceState({}, '', '/design-lab/apple/?view=vocabulary');
    const root = createDesignLabRoot();
    const localGetItem = vi.spyOn(window.localStorage, 'getItem');
    const localSetItem = vi.spyOn(window.localStorage, 'setItem');
    const localRemoveItem = vi.spyOn(window.localStorage, 'removeItem');
    const localClear = vi.spyOn(window.localStorage, 'clear');
    const localKey = vi.spyOn(window.localStorage, 'key');
    const sessionGetItem = vi.spyOn(window.sessionStorage, 'getItem');
    const sessionSetItem = vi.spyOn(window.sessionStorage, 'setItem');
    const sessionRemoveItem = vi.spyOn(window.sessionStorage, 'removeItem');
    const sessionClear = vi.spyOn(window.sessionStorage, 'clear');
    const sessionKey = vi.spyOn(window.sessionStorage, 'key');
    const localStoragePrototype = Object.getPrototypeOf(window.localStorage) as Storage;
    const sessionStoragePrototype = Object.getPrototypeOf(window.sessionStorage) as Storage;
    const nativeLocalStorageLength = Object.getOwnPropertyDescriptor(
      localStoragePrototype,
      'length',
    )?.get;
    if (!nativeLocalStorageLength) throw new Error('Storage length getter is unavailable');
    const localLength = vi.spyOn(localStoragePrototype, 'length', 'get').mockImplementation(
      function (this: Storage) {
        return nativeLocalStorageLength.call(this);
      },
    );
    let sessionLength = localLength;
    if (sessionStoragePrototype !== localStoragePrototype) {
      const nativeSessionStorageLength = Object.getOwnPropertyDescriptor(
        sessionStoragePrototype,
        'length',
      )?.get;
      if (!nativeSessionStorageLength) throw new Error('Storage length getter is unavailable');
      sessionLength = vi.spyOn(sessionStoragePrototype, 'length', 'get').mockImplementation(
        function (this: Storage) {
          return nativeSessionStorageLength.call(this);
        },
      );
    }
    // Preflight both areas, then clear only test-created getter reads before mounting.
    void window.localStorage.length;
    expect(localLength).toHaveBeenCalledTimes(1);
    void window.sessionStorage.length;
    expect(sessionLength).toHaveBeenCalledTimes(sessionLength === localLength ? 2 : 1);
    localLength.mockClear();
    if (sessionLength !== localLength) sessionLength.mockClear();

    initDesignLabPrototype(root);

    expect(root.querySelector<HTMLElement>('[data-lab-view="vocabulary"]')?.hidden).toBe(false);
    (root.querySelector<HTMLButtonElement>('[data-lab-reveal]') as HTMLButtonElement).click();
    expect(root.querySelector<HTMLElement>('[data-lab-answer]')?.hidden).toBe(false);

    (root.querySelector<HTMLButtonElement>('[data-lab-rating="known"]') as HTMLButtonElement).click();
    expect(root.dataset.labRating).toBe('known');

    (root.querySelector<HTMLButtonElement>('[data-lab-nav][data-lab-target="lesson"]') as HTMLButtonElement).click();
    expect(root.querySelector<HTMLElement>('[data-lab-view="lesson"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-lab-view="vocabulary"]')?.hidden).toBe(true);

    (root.querySelectorAll<HTMLButtonElement>('[data-lab-quiz-choice]')[0]).click();
    const feedback = root.querySelector<HTMLElement>('[data-lab-quiz-feedback]');
    expect(feedback?.getAttribute('role')).toBe('status');
    expect(feedback?.textContent).toBe('正解です');

    for (const storageApi of [
      localGetItem,
      localSetItem,
      localRemoveItem,
      localClear,
      localKey,
      sessionGetItem,
      sessionSetItem,
      sessionRemoveItem,
      sessionClear,
      sessionKey,
    ]) {
      expect(storageApi).not.toHaveBeenCalled();
    }
    expect(localLength).not.toHaveBeenCalled();
    if (sessionLength !== localLength) expect(sessionLength).not.toHaveBeenCalled();
  });

  test('retains the current cleanup after a stale cleanup runs', () => {
    const root = createDesignLabRoot();
    const staleCleanup = initDesignLabPrototype(root);
    initDesignLabPrototype(root);
    staleCleanup();

    const homeNavigation = root.querySelector<HTMLElement>(
      '[data-lab-nav][data-lab-target="home"]',
    )!;
    const setAttribute = vi.spyOn(homeNavigation, 'setAttribute');
    initDesignLabPrototype(root);
    setAttribute.mockClear();

    homeNavigation.click();

    const selectedUpdates = setAttribute.mock.calls.filter(
      ([name]) => name === 'aria-selected',
    );
    expect(selectedUpdates).toHaveLength(1);
  });

  test('does not treat the undocumented data-correct alias as a correct answer', () => {
    const root = createDesignLabRoot();
    const aliasChoice = root.querySelectorAll<HTMLElement>('[data-lab-quiz-choice]')[1];
    aliasChoice.dataset.correct = 'true';

    initDesignLabPrototype(root);
    aliasChoice.click();

    expect(root.querySelector('[data-lab-quiz-feedback]')?.textContent).toBe(
      'もう一度試してみましょう',
    );
  });
});

const grammarContracts = [
  {
    slug: 'apple',
    componentName: 'ApplePrototype',
    componentFile: 'src/components/design-lab/ApplePrototype.astro',
    routeFile: 'src/pages/design-lab/apple/index.astro',
  },
  {
    slug: 'airbnb',
    componentName: 'AirbnbPrototype',
    componentFile: 'src/components/design-lab/AirbnbPrototype.astro',
    routeFile: 'src/pages/design-lab/airbnb/index.astro',
  },
  {
    slug: 'notion',
    componentName: 'NotionPrototype',
    componentFile: 'src/components/design-lab/NotionPrototype.astro',
    routeFile: 'src/pages/design-lab/notion/index.astro',
  },
  {
    slug: 'linear',
    componentName: 'LinearPrototype',
    componentFile: 'src/components/design-lab/LinearPrototype.astro',
    routeFile: 'src/pages/design-lab/linear/index.astro',
  },
  {
    slug: 'duolingo',
    componentName: 'DuolingoPrototype',
    componentFile: 'src/components/design-lab/DuolingoPrototype.astro',
    routeFile: 'src/pages/design-lab/duolingo/index.astro',
  },
] as const;

type DesignLabAssetRecord = {
  path: string;
  allowedUse: string;
  useCase: string;
  promptSummary: string;
  sourceArtifact: {
    id: string;
    kind: string;
    format: string;
    sha256: string;
  };
  committedArtifact: {
    kind: string;
    format: string;
    width: number;
    height: number;
    sha256: string;
  };
  consumers: string[];
};

type DesignLabAssetManifest = {
  schemaVersion: number;
  scope: string;
  generator: {
    provider: string;
    product: string;
    outputKind: string;
    generatedAt: string;
  };
  rightsDecision: {
    decision: string;
    accountContext: string;
    requesterAuthorization: string;
    rightsBasis: Array<{
      document: string;
      url: string;
      effectiveDate: string;
      section: string;
      basis: string;
    }>;
    limitations: string;
    humanReview: {
      reviewed: boolean;
      findings: string[];
    };
    attribution: {
      uiDisplay: string;
      repositoryRecord: string;
      rationale: string;
    };
  };
  assets: DesignLabAssetRecord[];
};

function loadDesignLabAssetManifest(): DesignLabAssetManifest {
  return JSON.parse(
    readFileSync('docs/design/prototypes/design-lab/assets.json', 'utf8'),
  ) as DesignLabAssetManifest;
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

describe('design lab generated asset provenance', () => {
  test('records a portable, qualified prototype-only rights decision', () => {
    const manifest = loadDesignLabAssetManifest();

    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.scope).toBe('prototype-only');
    expect(manifest.generator).toEqual({
      provider: 'OpenAI',
      product: 'built-in image generation',
      outputKind: 'generated',
      generatedAt: '2026-08-24',
    });
    expect(manifest.rightsDecision).toEqual({
      decision: 'approved-for-prototype-only-use',
      accountContext:
        'The task used OpenAI built-in image generation under the requester account context.',
      requesterAuthorization:
        'The task requester authorized generation and use within the Design Lab prototype scope.',
      rightsBasis: [
        {
          document: 'OpenAI Terms of Use',
          url: 'https://openai.com/policies/terms-of-use/',
          effectiveDate: '2026-01-01',
          section: 'Content ownership',
          basis:
            'Records OpenAI\'s allocation of Output ownership to the user, subject to the agreement.',
        },
        {
          document: 'OpenAI Services Agreement',
          url: 'https://openai.com/policies/services-agreement/',
          effectiveDate: '2026-01-01',
          section: '§4.1',
          basis:
            'Records OpenAI\'s allocation of Output ownership to the customer, subject to the agreement.',
        },
      ],
      limitations:
        'This provenance record documents rights allocation and project scope; it is not a non-infringement guarantee.',
      humanReview: {
        reviewed: true,
        findings: [
          'No readable text',
          'No visible logo',
          'No identifiable specific person',
        ],
      },
      attribution: {
        uiDisplay: 'none',
        repositoryRecord: 'required',
        rationale:
          'Generated imagery carries no third-party source credit in the prototype UI; repository metadata remains required so the generation context, rights basis, scope, review, and hashes stay auditable.',
      },
    });
    expect(JSON.stringify(manifest)).not.toMatch(/(?:sourceFile|\/Users\/|[A-Za-z]:\\\\)/);
  });

  test('binds every committed image to its portable source artifact and actual output bytes', () => {
    const manifest = loadDesignLabAssetManifest();
    const expectedArtifacts = new Map([
      [
        '/assets/design-lab/night-market-ordering.webp',
        {
          sourceArtifact: {
            id: 'openai-imagegen:exec-11450f1e-8d34-44c3-9c88-2b7c9ee0404f',
            kind: 'generated-png',
            format: 'png',
            sha256: '08ddefd1e012095c0a38bb113d10d9e6d4edbc5a2c3609a1c3e8838245a62049',
          },
          committedArtifact: {
            kind: 'optimized-webp',
            format: 'webp',
            width: 1536,
            height: 1024,
            sha256: '78d3ad47f0496871f0dca8f99bec57c77911ec182b26bc3696490a512ea6a9bf',
          },
        },
      ],
      [
        '/assets/design-lab/rainy-taiwan-street.webp',
        {
          sourceArtifact: {
            id: 'openai-imagegen:exec-474550a5-ab9f-4492-a557-ee263344e068',
            kind: 'generated-png',
            format: 'png',
            sha256: '96ec3e60f15cc0332fcabfd4c65fc17a8cd61395ea6cb24a635ac70afa2c4825',
          },
          committedArtifact: {
            kind: 'optimized-webp',
            format: 'webp',
            width: 1536,
            height: 1024,
            sha256: 'c1a704d3b8a427f387daed04f9318462bac5d424ac4871330a699f24107069e4',
          },
        },
      ],
    ]);

    for (const asset of manifest.assets) {
      const expected = expectedArtifacts.get(asset.path);

      expect(expected).toBeDefined();
      expect(asset.allowedUse).toBe('prototype-only');
      expect(asset.useCase).toBe('photorealistic-natural');
      expect(asset.promptSummary).toMatch(/\S/);
      expect(asset.sourceArtifact).toEqual(expected?.sourceArtifact);
      expect(asset.committedArtifact).toEqual(expected?.committedArtifact);

      const publicPath = join('public', asset.path);
      const actualDigest = createHash('sha256')
        .update(readFileSync(publicPath))
        .digest('hex');
      expect(actualDigest).toBe(asset.committedArtifact.sha256);
    }
  });

  test('keeps the public Design Lab asset inventory closed over metadata', () => {
    const manifest = loadDesignLabAssetManifest();
    const actualAssets = readdirSync('public/assets/design-lab', { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => `/assets/design-lab/${entry.name}`)
      .sort();

    expect(actualAssets).toEqual(manifest.assets.map((asset) => asset.path).sort());
  });

  test('keeps metadata consumer allowlists and runtime asset references bidirectionally aligned', () => {
    const manifest = loadDesignLabAssetManifest();
    const sourceFiles = listFiles('src');

    for (const asset of manifest.assets) {
      const actualConsumers = sourceFiles
        .filter((sourceFile) => readFileSync(sourceFile, 'utf8').includes(asset.path))
        .sort();

      expect(asset.consumers).toEqual([...new Set(asset.consumers)].sort());
      expect(actualConsumers).toEqual(asset.consumers);
    }
  });
});

describe('design lab grammar routes', () => {
  test.each(grammarContracts)('$slug route wires the isolated layout, canonical fixture, grammar, and controller', ({ componentName, routeFile }) => {
    const route = readFileSync(routeFile, 'utf8');

    expect(route).toContain("import DesignLabLayout from '../../../layouts/DesignLabLayout.astro'");
    expect(route).toContain("import { buildDesignLabFixture } from '../../../content/designLabFixture'");
    expect(route).toContain(`import ${componentName} from '../../../components/design-lab/${componentName}.astro'`);
    expect(route).toContain('const fixture = buildDesignLabFixture()');
    expect(route).toContain('<DesignLabLayout');
    expect(route).toContain(`<${componentName} fixture={fixture} />`);
    expect(route).toContain("import { initDesignLabPrototype } from '../../../client/designLabPrototype'");
    expect(route).toContain("document.querySelector<HTMLElement>('[data-design-lab]')");
    expect(route).toContain('initDesignLabPrototype(root)');
    expect(route).not.toMatch(/(?:local|session)Storage/);
  });

  test.each(grammarContracts)('$slug grammar exposes all shared views and interaction attributes', ({ componentFile }) => {
    const source = readFileSync(componentFile, 'utf8');

    expect(source).toContain('data-design-lab');
    for (const view of ['home', 'vocabulary', 'lesson', 'travel']) {
      expect(source).toContain(`data-lab-view="${view}"`);
      expect(source).toContain(`data-lab-target="${view}"`);
      expect(source.match(new RegExp(`data-lab-target="${view}"`, 'g')) ?? []).toHaveLength(1);
    }
    for (const attribute of [
      'data-lab-nav',
      'aria-selected',
      'data-lab-continuation',
      'data-lab-reveal',
      'data-lab-answer',
      'data-lab-rating="again"',
      'data-lab-rating="known"',
      'data-lab-quiz-choice',
      'data-lab-correct="true"',
      'data-lab-quiz-feedback',
    ]) {
      expect(source).toContain(attribute);
    }
    const tabPanels = source.match(/<section\b(?=[^>]*\brole="tabpanel")[^>]*>/gs) ?? [];
    expect(tabPanels).toHaveLength(4);
    for (const panel of tabPanels) {
      expect(panel).toMatch(/aria-(?:label|labelledby)=/);
    }
    expect(source).toContain('type="button"');
    expect(source).toMatch(/data-lab-continuation\s+href="\?view=lesson"/);
  });

  test.each(grammarContracts)('$slug grammar renders the complete shared fixture and prototype imagery', ({ componentFile }) => {
    const source = readFileSync(componentFile, 'utf8');

    for (const fixtureReference of [
      'fixture.pathLabels',
      'fixture.vocabulary.traditional',
      'fixture.vocabulary.simplified',
      'fixture.vocabulary.pinyin',
      'fixture.vocabulary.japanese',
      'fixture.vocabulary.kana',
      'fixture.vocabulary.category',
      'fixture.lesson.hookJa',
      'fixture.lesson.canDoJa',
      'fixture.lesson.learnerOutcomeJa',
      'fixture.lesson.coreSentence',
      'fixture.lesson.level',
      'fixture.lesson.travelScenario',
      'fixture.lesson.chunks',
      'fixture.lesson.kanjiBridgeNotes',
      'fixture.lesson.soundFocus',
      'fixture.lesson.examples',
      'fixture.lesson.reviewPrompts',
      'fixture.lesson.travelTask',
      'fixture.travelTargets',
    ]) {
      expect(source).toContain(fixtureReference);
    }
    expect(source).toMatch(/fixture\.pathLabels\.map\(/);
    expect(source).toMatch(/fixture\.lesson\.examples(?:\?|!)?\.map\(/);
    expect(source).toContain('/assets/design-lab/night-market-ordering.webp');
    expect(source).toContain('/assets/design-lab/rainy-taiwan-street.webp');
  });

  test.each(grammarContracts)('$slug prototype source avoids forbidden copy and visual effects', ({ componentFile, routeFile }) => {
    const source = `${readFileSync(componentFile, 'utf8')}\n${readFileSync(routeFile, 'utf8')}`;

    expect(source).not.toMatch(/[—–]/);
    expect(source).not.toMatch(/backdrop-filter|\b(?:linear|radial|conic)-gradient\(/);
  });

  test('Duolingo grammar distinguishes complete, current, and next path steps', () => {
    const source = readFileSync('src/components/design-lab/DuolingoPrototype.astro', 'utf8');

    for (const state of ['complete', 'current', 'next']) {
      expect(source).toContain(`path-node-${state}`);
    }
    for (const label of ['完了', '現在', '次']) {
      expect(source).toContain(label);
    }
    expect(source).toContain('if (!taiwanPath)');
    expect(source).not.toMatch(/\?\?\s*['"][^'"]*台湾/);
  });

  test('Duolingo travel leads with the readiness sequence before supporting imagery', () => {
    const source = readFileSync('src/components/design-lab/DuolingoPrototype.astro', 'utf8');
    const travelPanel = source.slice(source.indexOf('id="duo-travel"'), source.indexOf('</main>'));
    const readinessIndex = travelPanel.indexOf('data-lab-travel-priority');
    const mediaIndex = travelPanel.indexOf('data-lab-travel-media');

    expect(readinessIndex).toBeGreaterThan(-1);
    expect(mediaIndex).toBeGreaterThan(-1);
    expect(readinessIndex).toBeLessThan(mediaIndex);
    expect(travelPanel).toContain('data-readiness-state={index === 0 ? \'current\' : \'next\'}');
  });

  test('Linear learner chrome uses Japanese learning semantics instead of internal tool labels', () => {
    const source = readFileSync('src/components/design-lab/LinearPrototype.astro', 'utf8');

    for (const internalLabel of [
      'LAB',
      'CONTENT',
      'STRUCTURED',
      'LEARNING OPERATIONS',
      'HOME / CURRENT',
      'OUTCOME',
      'SCENARIO',
      'VOCAB',
      'SCRIPT',
      'KANA',
      'TYPE',
      'RECALL',
      'TRAVEL / READINESS',
      'REQUIRED ACTIONS',
    ]) {
      expect(source).not.toContain(`>${internalLabel}<`);
    }
    for (const learnerLabel of [
      '台湾編',
      '学習ステージ',
      'できること',
      '使う場面',
      '単語',
      '簡体字',
      '日本語',
      '分類',
      '復習',
      '旅行 / 準備度',
      '必要な行動',
    ]) {
      expect(source).toContain(`>${learnerLabel}<`);
    }
  });

  test('Linear category metadata reserves space without arbitrary word breaks', () => {
    const source = readFileSync('src/components/design-lab/LinearPrototype.astro', 'utf8');
    const factsRule = source.match(/\.compact-facts\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';
    const definitionRules = [...source.matchAll(/\.compact-facts dd\s*\{(?<body>[^}]*)\}/g)]
      .map((match) => match.groups?.body ?? '')
      .join('\n');

    expect(source).toContain('class="category-fact"');
    expect(factsRule).toContain('minmax(118px, 1.35fr)');
    expect(definitionRules).toContain('margin: 0');
    expect(definitionRules).toContain('white-space: nowrap');
    expect(definitionRules).not.toContain('overflow-wrap: anywhere');
  });

  test('Airbnb travel evidence stays flat inside the tactile itinerary card', () => {
    const source = readFileSync('src/components/design-lab/AirbnbPrototype.astro', 'utf8');
    const listRule = source.match(/\.airbnb-target-card ul\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';
    const rowRule = source.match(/\.airbnb-target-card li\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';

    expect(listRule).toContain('gap: 0');
    expect(rowRule).toContain('border-top: 1px solid');
    expect(rowRule).toContain('background: transparent');
    expect(rowRule).not.toContain('border-radius');
  });

  test.each([
    ['airbnb', 'src/components/design-lab/AirbnbPrototype.astro', '.airbnb-target-card summary'],
    ['notion', 'src/components/design-lab/NotionPrototype.astro', '.document-disclosure summary'],
    ['linear', 'src/components/design-lab/LinearPrototype.astro', '.vocabulary-inspector summary'],
  ])('%s disclosures expose hover and active states', (_slug, componentFile, selector) => {
    const source = readFileSync(componentFile, 'utf8');

    expect(source).toContain(`${selector}:hover`);
    expect(source).toContain(`${selector}:active`);
  });
});

describe('design lab comparison and evidence capture', () => {
  const views = ['home', 'vocabulary', 'lesson', 'travel'] as const;
  const expectedManifest = [
    ...views.flatMap((view) => grammarContracts.map(({ slug }) => `${slug}-${view}.png`)),
    ...views.map((view) => `comparison-${view}.png`),
  ];

  test('comparison route embeds every labeled grammar at the selected shared view', () => {
    const source = readFileSync('src/pages/design-lab/index.astro', 'utf8');

    for (const { slug } of grammarContracts) {
      expect(source).toContain(`/design-lab/${slug}/`);
      expect(source).toContain(`${slug}-comparison-label`);
    }
    expect(source).toContain('grammars.map(');
    expect(source).toContain('<iframe');
    expect(source).toContain('width="390"');
    expect(source).toContain('height="844"');
    expect(source).toContain("const views = ['home', 'vocabulary', 'lesson', 'travel']");
    expect(source).toMatch(/views\.includes\([^)]+\)\s*\?[^:]+:\s*'home'/);
  });

  test('capture manifest is fixed to 20 mobile views and four comparisons', () => {
    expect(INDIVIDUAL_VIEWPORT).toEqual({ width: 390, height: 844 });
    expect(COMPARISON_VIEWPORT.width).toBeGreaterThanOrEqual(1950);
    expect(COMPARISON_VIEWPORT.height).toBeGreaterThanOrEqual(844);
    expect(EVIDENCE_DIRECTORY).toBe('docs/design/evidence/design-lab');
    expect(CAPTURE_MANIFEST.map(({ filename }) => filename)).toEqual(expectedManifest);
    expect(new Set(CAPTURE_MANIFEST.map(({ filename }) => filename))).toHaveLength(24);

    const source = readFileSync('scripts/capture-design-lab.ts', 'utf8');
    expect(source).toContain('fullPage: false');
  });

  test('exports the canonical rendered validation contract and required widths', () => {
    const captureExports = designLabCapture as Record<string, unknown>;

    expect(captureExports.REQUIRED_WIDTHS).toEqual([320, 375, 390, 430, 768, 1440]);
    expect(captureExports.validateRenderedDesignLab).toBeTypeOf('function');
  });

  test('capture base URL accepts only a loopback HTTP server', () => {
    expect(validateLocalBaseUrl('http://127.0.0.1:4321').origin).toBe('http://127.0.0.1:4321');
    expect(validateLocalBaseUrl('http://localhost:4321').origin).toBe('http://localhost:4321');
    expect(() => validateLocalBaseUrl('https://example.com')).toThrow(/loopback HTTP/);
    expect(() => validateLocalBaseUrl('https://127.0.0.1:4321')).toThrow(/loopback HTTP/);
  });

  test('canonical capture publishes a metadata-closed snapshot and rolls back a late swap failure', async () => {
    const views = ['home', 'vocabulary', 'lesson', 'travel'] as const;
    const grammars = ['apple', 'airbnb', 'notion', 'linear', 'duolingo'] as const;
    let comparisonToolbarDrift = false;
    let forceComparisonFrameScroll = false;
    const comparisonFrameScrollReports: number[] = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const requestedView = url.searchParams.get('view');
      const view = views.includes(requestedView as (typeof views)[number]) ? requestedView : 'home';
      const grammar = grammars.find((candidate) => url.pathname.includes(`/design-lab/${candidate}/`))
        ?? 'apple';

      if (url.pathname === '/design-lab/capture-scroll-report') {
        const scrollY = Number(url.searchParams.get('y'));
        if (Number.isFinite(scrollY) && scrollY > 0) comparisonFrameScrollReports.push(scrollY);
        response.statusCode = 204;
        response.end();
        return;
      }

      const embeddedForCapture = url.searchParams.get('capture-test-embedded') === 'true';
      response.setHeader('content-type', 'text/html; charset=utf-8');

      if (url.pathname === '/design-lab/' || url.pathname === '/design-lab') {
        response.end(`<!doctype html><html><head><style>
          * { box-sizing: border-box; }
          html, body { margin: 0; width: 100%; overflow-x: hidden; }
          [data-comparison-toolbar] { height: 54px; display: flex; align-items: center; }
          [data-comparison-toolbar] nav { display: flex; gap: 8px; }
          [data-comparison-view] {
            min-width: 72px; min-height: 44px; display: inline-flex; align-items: center;
            justify-content: center; border-bottom: 2px solid transparent; border-radius: 0;
            color: #202020; background: transparent; text-decoration: none; font-size: 0;
          }
          [data-comparison-view]:hover { color: #000; background: #ebe8df; }
          [data-comparison-view]:active { color: #fff; background: #3d3a34; transform: translateY(1px); }
          [data-comparison-view]:focus-visible { outline: 3px solid #1254a6; outline-offset: 2px; }
          [data-comparison-view][aria-current="page"] { border-bottom-color: #202020; font-weight: 700; }
          ${comparisonToolbarDrift ? `
            [data-comparison-view] { min-width: 28px; min-height: 28px; }
          ` : ''}
          .row { display: flex; gap: 8px; }
          section { width: 390px; }
          iframe { display: block; width: 390px; height: 844px; border: 0; }
        </style></head><body>
          <main data-design-lab-comparison data-active-view="${view}">
            <header data-comparison-toolbar>
              <nav aria-label="Shared learner view">
                ${views.map((candidate) => `<a href="?view=${candidate}" aria-label="${candidate}" data-comparison-view="${candidate}"${candidate === view ? ' aria-current="page"' : ''}>${candidate}</a>`).join('')}
              </nav>
            </header>
            <div class="row">${grammars.map((grammar) => `
              <section><iframe data-comparison-frame="${grammar}" src="/design-lab/${grammar}/?view=${view}&capture-test-embedded=true" width="390" height="844"></iframe></section>
            `).join('')}</div>
          </main>
        </body></html>`);
        return;
      }

      response.end(`<!doctype html><html lang="ja"><head>
        <meta charset="utf-8"><title>${grammar} fixture</title><style>
        * { box-sizing: border-box; }
        html, body { margin: 0; width: 100%; overflow-x: hidden; }
        body { color: #202020; background: #f7f7f5; font-family: sans-serif; }
        main { min-height: 100vh; padding: 12px; }
        nav { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
        button, a, summary { min-width: 44px; min-height: 44px; font: inherit; }
        .capture-scroll-target {
          position: absolute; top: 3200px; left: 12px; display: inline-flex;
          width: 44px; height: 44px; align-items: center; justify-content: center;
        }
        button:focus-visible, a:focus-visible, summary:focus-visible {
          outline: 3px solid #1254a6; outline-offset: 2px;
        }
        nav button { border: 1px solid #555; background: #fff; }
        [aria-selected="true"] { color: #fff; background: #252525; }
        [data-lab-view] { min-height: 740px; padding: 18px 4px 48px; }
        .fixture-visual { margin: 20px 0; background: #444; }
        .fixture-copy { max-width: 28rem; font-size: 1.4rem; font-weight: 700; }
        .fixture-actions { display: grid; gap: 12px; max-width: 20rem; margin-top: 24px; }
        .fixture-actions button, .fixture-actions a {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 8px 16px; border: 1px solid #333; color: inherit; background: #fff;
        }
        [data-grammar="apple"] .fixture-visual {
          width: 58%; height: 250px; margin: 90px auto 40px; border-radius: 48px;
        }
        [data-grammar="apple"] .fixture-copy,
        [data-grammar="apple"] .fixture-actions { margin-inline: auto; text-align: center; }
        [data-grammar="airbnb"] .fixture-visual {
          width: 100%; height: 310px; border-radius: 28px; background: #737373;
        }
        [data-grammar="airbnb"] .fixture-copy { font-size: 2rem; }
        [data-grammar="notion"] { background: #fff; }
        [data-grammar="notion"] .fixture-visual {
          width: 76%; height: 180px; border-left: 6px solid #222; background: #e5e5e5;
        }
        [data-grammar="notion"] .fixture-copy { border-bottom: 1px solid #555; padding-bottom: 28px; }
        [data-grammar="linear"] { color: #f1f1f1; background: #111216; }
        [data-grammar="linear"] nav button,
        [data-grammar="linear"] .fixture-actions button,
        [data-grammar="linear"] .fixture-actions a { color: #f1f1f1; background: #202129; }
        [data-grammar="linear"] .fixture-visual {
          width: calc(100% - 52px); height: 360px; margin-left: 52px;
          border: 1px solid #777; background: #292a32;
        }
        [data-grammar="duolingo"] { color: #183b2a; background: #f3f8f3; }
        [data-grammar="duolingo"] .fixture-visual {
          width: 168px; height: 168px; margin: 70px auto 80px;
          border: 18px solid #47765e; border-radius: 50%; background: #f3f8f3;
        }
        [data-grammar="duolingo"] .fixture-copy,
        [data-grammar="duolingo"] .fixture-actions { margin-inline: auto; text-align: center; }
        @media (min-width: 768px) {
          main { padding-inline: 32px; }
          [data-lab-view] { max-width: 1120px; margin-inline: auto; }
        }
      </style></head><body>
        ${embeddedForCapture ? `
          <a class="capture-scroll-target" href="#capture-scroll-end" aria-label="Embedded capture focus target">Target</a>
        ` : ''}
        <main data-design-lab data-grammar="${grammar}">
          <nav aria-label="学習ビュー" role="tablist">
            ${views.map((candidate) => `<button type="button" role="tab" id="${grammar}-${candidate}-tab" data-lab-nav data-lab-target="${candidate}" aria-controls="${grammar}-${candidate}" aria-selected="${candidate === view}" tabindex="${candidate === view ? '0' : '-1'}">${candidate}</button>`).join('')}
          </nav>
          <section data-lab-view="home" id="${grammar}-home" role="tabpanel" aria-labelledby="${grammar}-home-tab"${view === 'home' ? '' : ' hidden'}>
            <div class="fixture-visual" aria-hidden="true"></div>
            <h1 class="fixture-copy">Home learning fixture</h1>
            <div class="fixture-actions"><a data-lab-continuation href="?view=lesson">Continue lesson</a></div>
          </section>
          <section data-lab-view="vocabulary" id="${grammar}-vocabulary" role="tabpanel" aria-labelledby="${grammar}-vocabulary-tab"${view === 'vocabulary' ? '' : ' hidden'}>
            <div class="fixture-visual" aria-hidden="true"></div>
            <h1 class="fixture-copy">Vocabulary learning fixture</h1>
            <div class="fixture-actions">
              <button type="button" data-lab-reveal aria-expanded="false">Reveal answer</button>
              <p data-lab-answer hidden>Answer</p>
              <button type="button" data-lab-rating="again" aria-pressed="false">Again</button>
              <button type="button" data-lab-rating="known" aria-pressed="false">Known</button>
            </div>
          </section>
          <section data-lab-view="lesson" id="${grammar}-lesson" role="tabpanel" aria-labelledby="${grammar}-lesson-tab"${view === 'lesson' ? '' : ' hidden'}>
            <div class="fixture-visual" aria-hidden="true"></div>
            <h1 class="fixture-copy">Lesson learning fixture</h1>
            <div class="fixture-actions">
              <button type="button" data-lab-quiz-choice data-lab-correct="true" aria-pressed="false">Correct answer</button>
              <button type="button" data-lab-quiz-choice data-lab-correct="false" aria-pressed="false">Incorrect answer</button>
              <p data-lab-quiz-feedback role="status" aria-live="polite"></p>
            </div>
          </section>
          <section data-lab-view="travel" id="${grammar}-travel" role="tabpanel" aria-labelledby="${grammar}-travel-tab"${view === 'travel' ? '' : ' hidden'}>
            <div class="fixture-visual" aria-hidden="true"></div>
            <h1 class="fixture-copy">Travel readiness fixture</h1>
            <div class="fixture-actions"><details><summary>Readiness details</summary><p>Ready</p></details></div>
          </section>
          <span id="capture-scroll-end"></span>
        </main>
        <script>
          ${embeddedForCapture ? `
            addEventListener('scroll', () => {
              if (scrollY > 0) {
                fetch('/design-lab/capture-scroll-report?y=' + scrollY, { keepalive: true });
              }
            });
            ${forceComparisonFrameScroll ? `requestAnimationFrame(() => scrollTo(0, 640));` : ''}
          ` : ''}
          const views = ['home', 'vocabulary', 'lesson', 'travel'];
          const root = document.querySelector('[data-design-lab]');
          const navigation = [...root.querySelectorAll('[data-lab-nav]')];
          const panels = [...root.querySelectorAll('[data-lab-view]')];
          function applyView(requested) {
            const active = views.includes(requested) ? requested : 'home';
            panels.forEach((panel) => { panel.hidden = panel.dataset.labView !== active; });
            navigation.forEach((item) => {
              const selected = item.dataset.labTarget === active;
              item.setAttribute('aria-selected', String(selected));
              item.tabIndex = selected ? 0 : -1;
            });
          }
          navigation.forEach((item, index) => {
            item.addEventListener('click', () => applyView(item.dataset.labTarget));
            item.addEventListener('keydown', (event) => {
              let targetIndex;
              if (event.key === 'ArrowRight') targetIndex = (index + 1) % navigation.length;
              else if (event.key === 'ArrowLeft') targetIndex = (index - 1 + navigation.length) % navigation.length;
              else if (event.key === 'Home') targetIndex = 0;
              else if (event.key === 'End') targetIndex = navigation.length - 1;
              else return;
              event.preventDefault();
              const target = navigation[targetIndex];
              target.focus();
              applyView(target.dataset.labTarget);
            });
          });
          root.querySelector('[data-lab-reveal]').addEventListener('click', (event) => {
            root.querySelector('[data-lab-answer]').hidden = false;
            event.currentTarget.hidden = true;
            event.currentTarget.setAttribute('aria-expanded', 'true');
          });
          root.querySelectorAll('[data-lab-rating]').forEach((rating) => {
            rating.addEventListener('click', () => {
              root.dataset.labRating = rating.dataset.labRating;
              root.querySelectorAll('[data-lab-rating]').forEach((option) => {
                option.setAttribute('aria-pressed', String(option === rating));
                option.disabled = true;
              });
            });
          });
          root.querySelectorAll('[data-lab-quiz-choice]').forEach((choice) => {
            choice.addEventListener('click', () => {
              root.querySelector('[data-lab-quiz-feedback]').textContent =
                choice.dataset.labCorrect === 'true' ? '正解です' : 'もう一度試してみましょう';
            });
          });
          applyView(new URLSearchParams(location.search).get('view'));
        </script>
      </body></html>`);
    });
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'chabiko-design-lab-capture-'));
    const evidenceDirectory = join(temporaryRoot, EVIDENCE_DIRECTORY);
    const sentinel = join(evidenceDirectory, 'developer-notes', 'keep.txt');
    const canonicalReadme = readFileSync(join(EVIDENCE_DIRECTORY, 'README.md'));

    try {
      await new Promise<void>((ready, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => ready());
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not expose a port');
      await mkdir(evidenceDirectory, { recursive: true });
      await writeFile(join(evidenceDirectory, 'README.md'), canonicalReadme);

      const runCapture = (extraEnvironment: Record<string, string> = {}) => (
        new Promise<{ code: number | null; output: string }>((done, reject) => {
          const child = spawn(process.execPath, [resolve('scripts/capture-design-lab.ts')], {
            cwd: temporaryRoot,
            env: {
              ...process.env,
              NODE_ENV: 'test',
              DESIGN_LAB_BASE_URL: `http://127.0.0.1:${address.port}`,
              ...extraEnvironment,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          let output = '';
          child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
          child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
          child.once('error', reject);
          child.once('close', (code) => done({ code, output }));
        })
      );

      const result = await runCapture();

      expect(result.code, result.output).toBe(0);
      expect(result.output).toContain('validated rendered Design Lab contract');
      expect(result.output).toContain('120 responsive states');
      expect(result.output).toContain('20 axe scans');
      expect(result.output).toContain('captured 24 Design Lab evidence files without browser errors');
      expect(comparisonFrameScrollReports).toEqual([]);
      const pngFiles = (await readdir(evidenceDirectory)).filter((file) => file.endsWith('.png')).sort();
      expect(pngFiles).toEqual(CAPTURE_MANIFEST.map(({ filename }) => filename).sort());
      const firstCapture = new Map(await Promise.all([
        ...pngFiles,
        'README.md',
        CAPTURE_METADATA_FILENAME,
      ].map(async (filename) => [
        filename,
        await readFile(join(evidenceDirectory, filename)),
      ] as const)));
      const metadata = await validateCapturePublication(evidenceDirectory);

      expect(metadata.schemaVersion).toBe(1);
      expect(metadata.validation).toEqual({
        interactionScenarios: 5,
        responsiveStates: 120,
        axeScans: 20,
        focusVisibleChecks: 20,
        reducedMotionChecks: 20,
      });
      expect(metadata.entries).toHaveLength(24);
      expect(metadata.entries[0]).toMatchObject({
        filename: 'apple-home.png',
        kind: 'individual',
        grammar: 'apple',
        view: 'home',
        width: 390,
        height: 844,
      });
      expect(metadata.entries[0].sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(metadata.manifestDigest).toMatch(/^[a-f0-9]{64}$/);

      await mkdir(join(evidenceDirectory, 'developer-notes'), { recursive: true });
      await writeFile(sentinel, 'preserve me');

      const repeatedResult = await runCapture();

      expect(repeatedResult.code, repeatedResult.output).toBe(0);
      expect(await readFile(sentinel, 'utf8')).toBe('preserve me');
      for (const filename of [...pngFiles, 'README.md', CAPTURE_METADATA_FILENAME]) {
        expect(await readFile(join(evidenceDirectory, filename)), filename).toEqual(firstCapture.get(filename));
      }

      const beforeLateFailure = await snapshotFileBytes(evidenceDirectory);
      const lateFailureResult = await runCapture({
        DESIGN_LAB_CAPTURE_TEST_FAILPOINT: 'after-original-backup',
      });

      expect(lateFailureResult.code, lateFailureResult.output).toBe(1);
      expect(lateFailureResult.output).toContain('test failpoint after-original-backup');
      expect(await snapshotFileBytes(evidenceDirectory)).toEqual(beforeLateFailure);

      const beforePublishedFailure = await snapshotFileBytes(evidenceDirectory);
      const publishedFailureResult = await runCapture({
        DESIGN_LAB_CAPTURE_TEST_FAILPOINT: 'after-candidate-publish',
      });

      expect(publishedFailureResult.code, publishedFailureResult.output).toBe(1);
      expect(publishedFailureResult.output).toContain('test failpoint after-candidate-publish');
      expect(await snapshotFileBytes(evidenceDirectory)).toEqual(beforePublishedFailure);

      forceComparisonFrameScroll = true;
      const beforeScrolledFailure = await snapshotFileBytes(evidenceDirectory);
      const scrolledResult = await runCapture();

      expect(scrolledResult.code, scrolledResult.output).toBe(1);
      expect(scrolledResult.output).toContain('iframe scroll position');
      expect(await snapshotFileBytes(evidenceDirectory)).toEqual(beforeScrolledFailure);
      forceComparisonFrameScroll = false;
      comparisonFrameScrollReports.length = 0;

      comparisonToolbarDrift = true;
      const beforeRenderedFailure = await snapshotFileBytes(evidenceDirectory);
      const driftedResult = await runCapture();

      expect(driftedResult.code, driftedResult.output).toBe(1);
      expect(driftedResult.output).toContain('comparison toolbar controls smaller than 44px');
      expect(await snapshotFileBytes(evidenceDirectory)).toEqual(beforeRenderedFailure);

      const metadataPath = join(evidenceDirectory, CAPTURE_METADATA_FILENAME);
      const driftedMetadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
        entries: Array<{ sha256: string }>;
      };
      driftedMetadata.entries[0].sha256 = '0'.repeat(64);
      await writeFile(metadataPath, `${JSON.stringify(driftedMetadata, null, 2)}\n`);

      await expect(validateCapturePublication(evidenceDirectory)).rejects.toThrow(
        /apple-home\.png digest does not match capture metadata/,
      );
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 90_000);
});
