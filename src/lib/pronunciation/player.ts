import { normalizeLang, normalizeText, pronunciationKey } from './normalize';

export { normalizeLang, normalizeText } from './normalize';

/** Compact index written by scripts/audio/generate.ts: `lang|text` key → root-relative audio file. */
export const PRONUNCIATION_INDEX_URL = '/audio/index.json';

let audioIndex: ReadonlyMap<string, string> | undefined;
let indexRequest: Promise<void> | undefined;

/** Accepts only an object of root-relative file paths; anything else leaves playback on speech synthesis. */
export function parsePronunciationIndex(data: unknown): Map<string, string> | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const index = new Map<string, string>();
  for (const [key, file] of Object.entries(data)) {
    if (typeof file === 'string' && file.startsWith('/') && !file.startsWith('//')) index.set(key, file);
  }
  return index;
}

/** Replaces the loaded index (tests, or callers that already have the data). */
export function setPronunciationIndex(index: ReadonlyMap<string, string> | undefined): void {
  audioIndex = index;
  indexRequest = undefined;
}

/**
 * Fetches the audio index once, off the critical path. Until it arrives, or if it fails,
 * playback uses browser speech; a failed request is retried on the next call.
 */
export function loadPronunciationIndex(fetcher: typeof fetch = fetch): Promise<void> {
  if (audioIndex || indexRequest) return indexRequest ?? Promise.resolve();
  indexRequest = fetcher(PRONUNCIATION_INDEX_URL)
    .then((response) => (response.ok ? response.json() : undefined))
    .then((data: unknown) => {
      const index = parsePronunciationIndex(data);
      if (!index) throw new Error('Invalid pronunciation index.');
      audioIndex = index;
      if (typeof document !== 'undefined') document.dispatchEvent(new Event('pronunciation:refresh'));
    })
    .catch(() => { indexRequest = undefined; });
  return indexRequest;
}

/** Synchronous so it can run inside the click handler; teacher precedence is resolved by the generator. */
export function findRecording(text: string, lang: string, index: ReadonlyMap<string, string> | undefined = audioIndex): string | undefined {
  return index?.get(pronunciationKey(text, lang));
}

export function selectVoice(voices: readonly SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const requested = normalizeLang(lang);
  const best = (candidates: SpeechSynthesisVoice[]) =>
    candidates.length ? candidates.reduce((a, b) => (voiceQuality(b) > voiceQuality(a) ? b : a)) : undefined;
  const region = mandarinRegion(requested);
  return best(voices.filter((voice) => normalizeLang(voice.lang) === requested))
    // Equivalent tags for the same region (e.g. cmn-Hant-TW for zh-TW) before any other Mandarin voice.
    ?? best(voices.filter((voice) => isMandarinLocale(voice.lang) && region !== undefined && mandarinRegion(voice.lang) === region))
    ?? best(voices.filter((voice) => isMandarinLocale(voice.lang)));
}

/** 'tw' or 'cn' for Mandarin tags, using the region subtag or, failing that, the script subtag. */
function mandarinRegion(lang: string): 'tw' | 'cn' | undefined {
  const subtags = normalizeLang(lang).split('-').slice(1);
  if (subtags.includes('tw') || (!subtags.includes('cn') && !subtags.includes('sg') && subtags.includes('hant'))) return 'tw';
  if (subtags.includes('cn') || subtags.includes('sg') || subtags.includes('hans')) return 'cn';
  return undefined;
}

// Natural standard voices first; Apple's character voices (Eddy, Grandpa, ...) last.
const PREFERRED_VOICE = /mei-?jia|ting-?ting|hsiaochen|hsiaoyu|yating|hanhan|xiaoxiao|google|microsoft|natural|premium|enhanced/i;
const NOVELTY_VOICE = /^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;

function voiceQuality(voice: SpeechSynthesisVoice): number {
  if (PREFERRED_VOICE.test(voice.name)) return 2;
  if (NOVELTY_VOICE.test(voice.name)) return 0;
  return 1;
}

// Cantonese (zh-HK, zh-MO, yue-*) voices must never read Mandarin content.
const NON_MANDARIN_ZH = new Set(['hk', 'mo', 'yue']);

export function isMandarinLocale(lang: string): boolean {
  const [language, ...subtags] = normalizeLang(lang).split('-');
  if (language === 'cmn') return true;
  if (language !== 'zh') return false;
  return !subtags.some((tag) => NON_MANDARIN_ZH.has(tag));
}

function speechAvailable(lang = 'zh-TW'): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return false;
  // An empty list means voices are still loading; a loaded list must contain a Mandarin voice.
  const voices = window.speechSynthesis.getVoices();
  return voices.length === 0 || Boolean(selectVoice(voices, lang));
}

export function canPlayPronunciation(text: string, lang = 'zh-TW'): boolean {
  return Boolean(normalizeText(text)) && typeof window !== 'undefined'
    && ((typeof window.Audio === 'function' && Boolean(findRecording(text, lang))) || speechAvailable(lang));
}

let cancelActive: (() => void) | undefined;

export function stopPronunciation(): void {
  cancelActive?.();
  cancelActive = undefined;
}

/** Call synchronously from a user gesture. Never await voice loading before speak(). */
export function playPronunciation(text: string, { lang = 'zh-TW', rate = 0.9 }: { lang?: string; rate?: number } = {}): Promise<boolean> {
  stopPronunciation();
  if (!canPlayPronunciation(text, lang)) return Promise.resolve(false);
  return new Promise((resolve) => {
    let audio: HTMLAudioElement | undefined;
    let utterance: SpeechSynthesisUtterance | undefined;
    let finished = false;
    const finish = (success: boolean) => {
      if (finished) return;
      finished = true;
      if (cancelActive === cancel) cancelActive = undefined;
      resolve(success);
    };
    const cancel = () => {
      finish(false);
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      }
      if (utterance) {
        utterance.onend = null;
        utterance.onerror = null;
      }
      if (speechAvailable()) window.speechSynthesis.cancel();
    };
    cancelActive = cancel;
    // Cancel speech started elsewhere in the application as well.
    if (speechAvailable()) window.speechSynthesis.cancel();
    const speak = () => {
      if (finished) return;
      if (!speechAvailable(lang)) { finish(false); return; }
      try {
        utterance = new window.SpeechSynthesisUtterance(normalizeText(text));
        utterance.lang = lang.replace(/_/g, '-');
        utterance.rate = rate;
        const voices = window.speechSynthesis.getVoices();
        const voice = selectVoice(voices, lang);
        // Loaded voices but no Mandarin one (e.g. Cantonese only): do not let the OS pick a wrong-language default.
        if (!voice && voices.length > 0) { finish(false); return; }
        if (voice) utterance.voice = voice;
        utterance.onend = () => finish(true);
        utterance.onerror = () => finish(false);
        // An empty voice list is normal on first use. The language asks the OS
        // to choose now; later taps use the voices loaded by voiceschanged.
        window.speechSynthesis.speak(utterance);
      } catch { finish(false); }
    };
    const recording = findRecording(text, lang);
    if (recording && typeof window.Audio === 'function') {
      try {
        audio = new window.Audio(recording);
        audio.playbackRate = rate;
        audio.onended = () => finish(true);
        let fellBack = false;
        const fallback = () => {
          if (fellBack || finished) return;
          fellBack = true;
          if (audio) { audio.onerror = null; audio.onended = null; audio.pause(); }
          speak();
        };
        audio.onerror = fallback;
        void audio.play().catch(fallback);
      } catch { speak(); }
    } else speak();
  });
}
