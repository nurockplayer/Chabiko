import manifestData from './manifest.json';

export interface PronunciationEntry {
  text: string;
  lang: string;
  voice: string;
  provider: string;
  file: string;
  sha256: string;
  generatedAt: string;
  source: 'tts' | 'teacher-recording';
}

export const normalizeText = (text: string): string => text.normalize('NFKC').trim().replace(/\s+/gu, ' ');
export const normalizeLang = (lang: string): string => lang.replace(/_/g, '-').toLowerCase();

export function findRecording(text: string, lang: string, entries: readonly PronunciationEntry[] = manifestData as PronunciationEntry[]): PronunciationEntry | undefined {
  const matches = entries.filter((entry) => normalizeText(entry.text) === normalizeText(text) && normalizeLang(entry.lang) === normalizeLang(lang));
  return matches.find((entry) => entry.source === 'teacher-recording') ?? matches[0];
}

export function selectVoice(voices: readonly SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const requested = normalizeLang(lang);
  const best = (candidates: SpeechSynthesisVoice[]) =>
    candidates.length ? candidates.reduce((a, b) => (voiceQuality(b) > voiceQuality(a) ? b : a)) : undefined;
  return best(voices.filter((voice) => normalizeLang(voice.lang) === requested))
    ?? best(voices.filter((voice) => isMandarinLocale(voice.lang)));
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

function speechAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.speechSynthesis) && typeof window.SpeechSynthesisUtterance === 'function';
}

export function canPlayPronunciation(text: string, lang = 'zh-TW'): boolean {
  return Boolean(normalizeText(text)) && typeof window !== 'undefined'
    && ((typeof window.Audio === 'function' && Boolean(findRecording(text, lang))) || speechAvailable());
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
      if (!speechAvailable()) { finish(false); return; }
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
        audio = new window.Audio(recording.file);
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
