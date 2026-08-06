// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { initBasicVocabularySession } from '../src/client/basicVocabularySession';
import { SCRIPT_PREFERENCE_EVENT } from '../src/client/scriptPreferenceControl';
import {
  BASIC_VOCABULARY_PROGRESS_KEY,
} from '../src/domain/basicVocabularyProgress';
import { FALLBACK_ANNOTATION } from '../src/domain/scriptSelection';
import {
  createSessionRoot,
  SESSION_IDS,
} from './helpers/basicVocabularyTestData';
import type { ScriptPreference } from '../src/lib/scriptPreference';

// Session fixture IDs (all three carry traditional === simplified text):
// - teacher-star-1-37e0eb213f0f 大家 (pinyin/japanese/traditional present)
// - teacher-star-1-a66948a76fda 人
// - teacher-star-1-bdc7865a507e 朋友
const REAL_IDS = SESSION_IDS;

const ITEM_A_SIMPLIFIED = '大家';
const ITEM_A_TRADITIONAL = '大家';
const ITEM_B_SIMPLIFIED = '人';

// An item with a different traditional form (妈妈 → 媽媽).
const ITEM_DIFFERENT_TRADITIONAL_ID = 'teacher-star-1-e64490a207eb';
const ITEM_DIFFERENT_TRADITIONAL_TRADITIONAL = '媽媽';

// A derived item with no traditional form (看, manifest index 0).
const ITEM_NO_TRADITIONAL_ID = 'teacher-learner-5762bc98cd920b67';
const ITEM_NO_TRADITIONAL_SIMPLIFIED = '看';

function setPreference(preference: ScriptPreference): void {
  document.documentElement.dataset.scriptPreference = preference;
}

function clearPreference(): void {
  document.documentElement.removeAttribute('data-script-preference');
}

/** Dispatch the exact #252 document event with the given dataset value. */
function changePreference(preference: ScriptPreference): void {
  setPreference(preference);
  document.dispatchEvent(
    new CustomEvent(SCRIPT_PREFERENCE_EVENT, {
      bubbles: true,
      detail: { preference },
    }),
  );
}

function rootWith(ids: readonly string[] = REAL_IDS): HTMLElement {
  return createSessionRoot([...ids]);
}

function reveal(root: HTMLElement): void {
  (root.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
}

function rate(root: HTMLElement, rating: 'again' | 'unsure' | 'known'): void {
  (root.querySelector(`[data-rating="${rating}"]`) as HTMLButtonElement).click();
}

function frontElement(root: HTMLElement): HTMLElement {
  const el = root.querySelector('.basic-vocabulary-simplified');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

function progressWrites(): number {
  const raw = window.localStorage.getItem(BASIC_VOCABULARY_PROGRESS_KEY);
  return raw === null ? 0 : Object.keys(JSON.parse(raw).items).length;
}

afterEach(() => {
  clearPreference();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe('basic vocabulary script preference', () => {
  describe('initial script from the validated root dataset', () => {
    it('shows the path-default simplified form with lang zh-Hans when no preference is stored', () => {
      clearPreference();
      const root = rootWith();
      initBasicVocabularySession(root);

      const front = frontElement(root);
      expect(front.textContent).toBe(ITEM_A_SIMPLIFIED);
      expect(front.lang).toBe('zh-Hans');
      expect(root.querySelector('.basic-vocabulary-script-fallback')).toBeNull();
    });

    it('shows the path-default simplified form when the preference is explicitly path-default', () => {
      setPreference('path-default');
      const root = rootWith();
      initBasicVocabularySession(root);

      const front = frontElement(root);
      expect(front.textContent).toBe(ITEM_A_SIMPLIFIED);
      expect(front.lang).toBe('zh-Hans');
      expect(root.querySelector('.basic-vocabulary-script-fallback')).toBeNull();
    });

    it('shows the simplified form for a simplified preference', () => {
      setPreference('simplified');
      const root = rootWith();
      initBasicVocabularySession(root);

      const front = frontElement(root);
      expect(front.textContent).toBe(ITEM_A_SIMPLIFIED);
      expect(front.lang).toBe('zh-Hans');
      expect(root.querySelector('.basic-vocabulary-script-fallback')).toBeNull();
    });

    it('falls back to path-default behavior for an invalid root dataset value', () => {
      setPreference('garbage' as ScriptPreference);
      const root = rootWith();
      initBasicVocabularySession(root);

      const front = frontElement(root);
      expect(front.textContent).toBe(ITEM_A_SIMPLIFIED);
      expect(front.lang).toBe('zh-Hans');
      expect(root.querySelector('.basic-vocabulary-script-fallback')).toBeNull();
    });

    it('shows the authored traditional form with lang zh-Hant for a traditional preference', () => {
      setPreference('traditional');
      const root = rootWith();
      initBasicVocabularySession(root);

      const front = frontElement(root);
      expect(front.textContent).toBe(ITEM_A_TRADITIONAL);
      expect(front.lang).toBe('zh-Hant');
      expect(root.querySelector('.basic-vocabulary-script-fallback')).toBeNull();
    });

    it('shows a different traditional form (妈妈 → 媽媽) for a traditional preference', () => {
      setPreference('traditional');
      const root = rootWith([ITEM_DIFFERENT_TRADITIONAL_ID]);
      initBasicVocabularySession(root);

      const front = frontElement(root);
      expect(front.textContent).toBe(ITEM_DIFFERENT_TRADITIONAL_TRADITIONAL);
      expect(front.lang).toBe('zh-Hant');
      expect(root.querySelector('.basic-vocabulary-script-fallback')).toBeNull();
    });

    it('never fabricates a missing traditional form and shows the exact fallback annotation', () => {
      setPreference('traditional');
      const root = rootWith([ITEM_NO_TRADITIONAL_ID]);
      initBasicVocabularySession(root);

      const front = frontElement(root);
      expect(front.textContent).toBe(ITEM_NO_TRADITIONAL_SIMPLIFIED);
      expect(front.lang).toBe('zh-Hans');
      const fallback = root.querySelector('.basic-vocabulary-script-fallback');
      expect(fallback).not.toBeNull();
      expect(fallback?.textContent).toBe(FALLBACK_ANNOTATION);
      expect(fallback?.getAttribute('lang')).toBe('ja');
    });
  });

  describe('revealed comparison field follows the preference', () => {
    it('shows the traditional comparison field after reveal under traditional', () => {
      setPreference('traditional');
      const root = rootWith();
      initBasicVocabularySession(root);
      reveal(root);

      const answer = root.querySelector('.basic-vocabulary-answer');
      expect(answer).not.toBeNull();
      const traditional = answer?.querySelector('.basic-vocabulary-traditional');
      expect(traditional).not.toBeNull();
      expect(traditional?.textContent).toBe(ITEM_A_TRADITIONAL);
      expect(traditional?.getAttribute('lang')).toBe('zh-Hant');
    });

    it('keeps the traditional comparison field under path-default', () => {
      clearPreference();
      const root = rootWith();
      initBasicVocabularySession(root);
      reveal(root);

      const answer = root.querySelector('.basic-vocabulary-answer');
      expect(answer).not.toBeNull();
      // Path-default preserves the existing production comparison field.
      const traditional = answer?.querySelector('.basic-vocabulary-traditional');
      expect(traditional).not.toBeNull();
      expect(traditional?.textContent).toBe(ITEM_A_TRADITIONAL);
      expect(traditional?.getAttribute('lang')).toBe('zh-Hant');
    });

    it('omits the traditional comparison field under simplified', () => {
      setPreference('simplified');
      const root = rootWith();
      initBasicVocabularySession(root);
      reveal(root);

      const answer = root.querySelector('.basic-vocabulary-answer');
      expect(answer).not.toBeNull();
      expect(answer?.querySelector('.basic-vocabulary-traditional')).toBeNull();
    });

    it('omits the traditional comparison field when the item has no authored form', () => {
      setPreference('traditional');
      const root = rootWith([ITEM_NO_TRADITIONAL_ID]);
      initBasicVocabularySession(root);
      reveal(root);

      const answer = root.querySelector('.basic-vocabulary-answer');
      expect(answer).not.toBeNull();
      expect(answer?.querySelector('.basic-vocabulary-traditional')).toBeNull();
      // pinyin/japanese still reveal truthfully.
      expect(answer?.querySelector('.basic-vocabulary-pinyin')).not.toBeNull();
      expect(answer?.querySelector('.basic-vocabulary-japanese')).not.toBeNull();
    });
  });

  describe('preference change event', () => {
    it('re-renders the visible front script without restarting or rating', () => {
      clearPreference();
      const root = rootWith();
      initBasicVocabularySession(root);
      expect(frontElement(root).textContent).toBe(ITEM_A_SIMPLIFIED);

      // Progress untouched before the change.
      expect(progressWrites()).toBe(0);

      changePreference('traditional');
      expect(frontElement(root).textContent).toBe(ITEM_A_TRADITIONAL);
      expect(frontElement(root).lang).toBe('zh-Hant');
      // No progress write and no session restart.
      expect(progressWrites()).toBe(0);
      expect(root.querySelector('[data-progress]')?.textContent).toBe('今回 0 / 3語');
      // The card is still the active item, not a completion screen.
      expect(root.querySelector('.basic-vocabulary-simplified')).not.toBeNull();

      changePreference('simplified');
      expect(frontElement(root).textContent).toBe(ITEM_A_SIMPLIFIED);
      expect(frontElement(root).lang).toBe('zh-Hans');
      expect(progressWrites()).toBe(0);
    });

    it('does not reveal answers on a preference change', () => {
      clearPreference();
      const root = rootWith();
      initBasicVocabularySession(root);

      changePreference('traditional');
      // Still pre-reveal: reveal button present, no ratings, no answer fields.
      expect(root.querySelector('[data-action="reveal"]')).not.toBeNull();
      expect(root.querySelector('[data-rating="again"]')).toBeNull();
      expect(root.querySelector('.basic-vocabulary-answer')).toBeNull();
      expect(root.querySelector('.basic-vocabulary-pinyin')).toBeNull();
      expect(root.querySelector('.basic-vocabulary-traditional')).toBeNull();
    });

    it('preserves a revealed state and ratings across a preference change', () => {
      clearPreference();
      const root = rootWith();
      initBasicVocabularySession(root);
      reveal(root);
      expect(root.querySelector('[data-rating="again"]')).not.toBeNull();

      changePreference('traditional');
      // Still revealed: ratings present, answer truthfully includes traditional.
      expect(root.querySelector('[data-rating="again"]')).not.toBeNull();
      const answer = root.querySelector('.basic-vocabulary-answer');
      expect(answer?.querySelector('.basic-vocabulary-traditional')?.textContent)
        .toBe(ITEM_A_TRADITIONAL);

      // Focus must not move on a preference change.
      const focusedBefore = document.activeElement;
      changePreference('simplified');
      expect(document.activeElement).toBe(focusedBefore);
    });

    it('does not move focus when an answer was revealed before the change', () => {
      clearPreference();
      const root = rootWith();
      initBasicVocabularySession(root);
      reveal(root);
      // Reveal moved focus to the again rating button.
      expect(document.activeElement).toBe(root.querySelector('[data-rating="again"]'));
      const focusedBefore = document.activeElement;

      changePreference('traditional');
      expect(document.activeElement).toBe(focusedBefore);
    });

    it('applies the fallback annotation when switching to traditional for a form-less item', () => {
      clearPreference();
      const root = rootWith([ITEM_NO_TRADITIONAL_ID]);
      initBasicVocabularySession(root);
      expect(frontElement(root).textContent).toBe(ITEM_NO_TRADITIONAL_SIMPLIFIED);
      expect(root.querySelector('.basic-vocabulary-script-fallback')).toBeNull();

      changePreference('traditional');
      expect(frontElement(root).textContent).toBe(ITEM_NO_TRADITIONAL_SIMPLIFIED);
      expect(frontElement(root).lang).toBe('zh-Hans');
      expect(root.querySelector('.basic-vocabulary-script-fallback')?.textContent)
        .toBe(FALLBACK_ANNOTATION);

      changePreference('path-default');
      expect(frontElement(root).textContent).toBe(ITEM_NO_TRADITIONAL_SIMPLIFIED);
      expect(root.querySelector('.basic-vocabulary-script-fallback')).toBeNull();
    });

    it('keeps the image, dimensions, and alt unchanged across preference changes', () => {
      setPreference('traditional');
      const root = rootWith();
      initBasicVocabularySession(root);

      const imageBefore = root.querySelector('img');
      expect(imageBefore).not.toBeNull();
      const snapshot = {
        src: imageBefore?.getAttribute('src'),
        width: imageBefore?.width,
        height: imageBefore?.height,
        alt: imageBefore?.alt,
      };

      changePreference('simplified');
      changePreference('traditional');
      const imageAfter = root.querySelector('img');
      expect(imageAfter?.getAttribute('src')).toBe(snapshot.src);
      expect(imageAfter?.width).toBe(snapshot.width);
      expect(imageAfter?.height).toBe(snapshot.height);
      expect(imageAfter?.alt).toBe(snapshot.alt);
    });

    it('applies the new preference to the next item after rating', () => {
      setPreference('traditional');
      const root = rootWith();
      initBasicVocabularySession(root);
      expect(frontElement(root).textContent).toBe(ITEM_A_TRADITIONAL);

      reveal(root);
      rate(root, 'known');
      // Next item (人) also renders traditional.
      expect(frontElement(root).textContent).toBe(ITEM_B_SIMPLIFIED);
      expect(frontElement(root).lang).toBe('zh-Hant');
    });
  });

  describe('storage, pageshow, and teardown', () => {
    it('re-reads the preference from the root dataset on pageshow', () => {
      clearPreference();
      const root = rootWith();
      initBasicVocabularySession(root);
      expect(frontElement(root).textContent).toBe(ITEM_A_SIMPLIFIED);

      // Another tab persisted a preference; the control updated the root
      // dataset, and pageshow re-reads it.
      setPreference('traditional');
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
      expect(frontElement(root).textContent).toBe(ITEM_A_TRADITIONAL);
    });

    it('re-renders after a preference change when the session has rated items', () => {
      clearPreference();
      const root = rootWith();
      initBasicVocabularySession(root);
      reveal(root);
      rate(root, 'known');
      expect(progressWrites()).toBe(1);

      setPreference('traditional');
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
      // Session preserved (hasRatedSinceInit) and the visible script updated.
      expect(root.querySelector('[data-card]')).not.toBeNull();
      expect(frontElement(root).textContent).toBe(ITEM_B_SIMPLIFIED);
      expect(frontElement(root).lang).toBe('zh-Hant');
      expect(progressWrites()).toBe(1);
    });

    it('cleans up the preference listener so later changes do not re-render', () => {
      clearPreference();
      const root = rootWith();
      const cleanup = initBasicVocabularySession(root);
      cleanup();

      changePreference('traditional');
      // No active session listener: card keeps the last rendered front.
      expect(frontElement(root).textContent).toBe(ITEM_A_SIMPLIFIED);
      expect(frontElement(root).lang).toBe('zh-Hans');
    });

    it('repeated initialization does not duplicate preference listeners', () => {
      clearPreference();
      const root = rootWith();
      const cleanup1 = initBasicVocabularySession(root);
      const cleanup2 = initBasicVocabularySession(root);
      cleanup1();

      changePreference('traditional');
      // Exactly one listener remains active: one re-render, no duplicates.
      expect(frontElement(root).textContent).toBe(ITEM_A_TRADITIONAL);
      cleanup2();

      changePreference('simplified');
      // No listeners remain.
      expect(frontElement(root).textContent).toBe(ITEM_A_TRADITIONAL);
    });
  });

  describe('initial HTML secrecy', () => {
    it('keeps answer values out of the initial HTML and data attributes', () => {
      clearPreference();
      const root = rootWith();
      initBasicVocabularySession(root);

      const cardHtml = root.querySelector('[data-card]')?.outerHTML ?? '';
      // Front simplified is visible, but no pinyin/japanese in the DOM.
      expect(cardHtml).toContain(ITEM_A_SIMPLIFIED);
      expect(cardHtml).not.toContain('dà jiā');
      expect(cardHtml).not.toContain('みんな');
      const idsAttr = root.dataset.basicVocabularyIds ?? '';
      expect(idsAttr).not.toContain('dà jiā');
      expect(idsAttr).not.toContain('みんな');
    });

    it('does not add hidden script metadata to the initial data attributes', () => {
      setPreference('traditional');
      const root = rootWith([ITEM_NO_TRADITIONAL_ID]);
      initBasicVocabularySession(root);

      // No hidden traditional/audio/asset metadata in the root data.
      const idsAttr = root.dataset.basicVocabularyIds ?? '';
      expect(idsAttr).not.toContain(ITEM_NO_TRADITIONAL_SIMPLIFIED);
      expect(idsAttr).not.toContain('traditional');
      expect(idsAttr).not.toContain('audio');
      // The inline payload carries only render metadata (totalCount/render).
      const payload = document.getElementById('basic-vocabulary-data')?.textContent ?? '';
      expect(payload).toContain('totalCount');
      expect(payload).toContain('render');
      expect(payload).not.toContain('pinyin');
      expect(payload).not.toContain('japanese');
      expect(payload).not.toContain('traditional');
    });
  });

  describe('containment styles for the fallback annotation', () => {
    it('keeps overflow-safe wrapping declarations in the Astro stylesheet', async () => {
      const source = await readFile(
        'src/components/vocabulary/BasicVocabularySession.astro',
        'utf8',
      );
      const styleMatch = source.match(/<style is:global>([\s\S]*?)<\/style>/);
      expect(styleMatch).not.toBeNull();
      const css = styleMatch![1];

      // The fallback annotation and answer fields all wrap anywhere so long
      // Japanese/Chinese text cannot overflow the card at 320/375/390 px.
      expect(css).toMatch(
        /\.basic-vocabulary-script-fallback\s*\{[^}]*overflow-wrap:\s*anywhere/,
      );
      expect(css).toMatch(
        /\.basic-vocabulary-pinyin,\s*\.basic-vocabulary-japanese,\s*\.basic-vocabulary-traditional,\s*\.basic-vocabulary-script-fallback\s*\{[^}]*overflow-wrap:\s*anywhere/,
      );
      // The front script keeps its existing containment.
      expect(css).toMatch(
        /\.basic-vocabulary-simplified\s*\{[^}]*overflow-wrap:\s*anywhere/,
      );
    });
  });
});
