// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/pronunciation/manifest.json', () => ({ default: [
  { text: '謝謝', lang: 'zh-TW', file: '/audio/test.mp3', source: 'tts' },
] }));
import { canPlayPronunciation, findRecording, normalizeText, playPronunciation, selectVoice, stopPronunciation } from '../src/lib/pronunciation/player';
import type { PronunciationEntry } from '../src/lib/pronunciation/player';

const voice = (lang: string) => ({ lang, name: lang }) as SpeechSynthesisVoice;
class Utterance {
  text: string;
  lang = '';
  rate = 1;
  voice?: SpeechSynthesisVoice;
  onend?: () => void;
  onerror?: () => void;
  constructor(text: string) { this.text = text; }
}
let spoken: Utterance[];
let voices: SpeechSynthesisVoice[];
let synth: { cancel: ReturnType<typeof vi.fn>; speak: ReturnType<typeof vi.fn>; getVoices: () => SpeechSynthesisVoice[] };
beforeEach(() => {
  spoken = [];
  voices = [];
  synth = { cancel: vi.fn(), speak: vi.fn((item: Utterance) => spoken.push(item)), getVoices: () => voices };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
});
afterEach(() => { stopPronunciation(); vi.unstubAllGlobals(); });

describe('pronunciation selection', () => {
  it('normalizes whitespace and width without conflating scripts or language', () => {
    expect(normalizeText('  Ａ\n 謝謝  ')).toBe('A 謝謝');
    const entries = [
      { text: '謝謝', lang: 'zh_TW', source: 'tts' },
      { text: '謝謝', lang: 'zh-TW', source: 'teacher-recording' },
    ] as PronunciationEntry[];
    expect(findRecording(' 謝謝 ', 'zh-tw', entries)?.source).toBe('teacher-recording');
    expect(findRecording('谢谢', 'zh-CN', entries)).toBeUndefined();
  });
  it('prefers the exact locale, accepts underscore tags, then any Chinese voice', () => {
    const available = [voice('en-US'), voice('zh-CN'), voice('zh_TW')];
    expect(selectVoice(available, 'zh-TW')).toBe(available[2]);
    expect(selectVoice(available, 'zh_CN')).toBe(available[1]);
    expect(selectVoice(available, 'zh-HK')).toBe(available[1]);
    expect(selectVoice([voice('en-US')], 'zh-TW')).toBeUndefined();
  });
  it('prefers natural standard voices over character voices in the same locale', () => {
    const named = (lang: string, name: string) => ({ ...voice(lang), name }) as SpeechSynthesisVoice;
    const available = [named('zh-TW', 'Eddy (Chinese (Taiwan))'), named('zh-TW', 'Grandpa (Chinese (Taiwan))'), named('zh-TW', 'Meijia'), named('zh-CN', 'Tingting')];
    expect(selectVoice(available, 'zh-TW')?.name).toBe('Meijia');
    expect(selectVoice(available, 'zh-CN')?.name).toBe('Tingting');
    expect(selectVoice([named('zh-TW', 'Eddy (Chinese (Taiwan))')], 'zh-TW')?.name).toBe('Eddy (Chinese (Taiwan))');
  });
  it('never falls back to a Cantonese voice for Mandarin content', () => {
    const available = [voice('zh-HK'), voice('yue-Hant-HK'), voice('zh-CN')];
    expect(selectVoice(available, 'zh-TW')).toBe(available[2]);
    expect(selectVoice([voice('zh-HK'), voice('zh_MO')], 'zh-TW')).toBeUndefined();
    expect(selectVoice([voice('cmn-Hant-TW')], 'zh-TW')?.lang).toBe('cmn-Hant-TW');
  });
  it('speaks in the gesture call stack even before voices load, then uses newly loaded voices', async () => {
    const first = playPronunciation('你好', { lang: 'zh-TW' });
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatchObject({ text: '你好', lang: 'zh-TW', rate: 0.9 });
    spoken[0].onend?.();
    expect(await first).toBe(true);
    voices = [voice('zh_TW')];
    const second = playPronunciation('你好', { lang: 'zh-TW', rate: 0.65 });
    expect(spoken[1].voice).toBe(voices[0]);
    expect(spoken[1].rate).toBe(0.65);
    spoken[1].onend?.();
    await second;
  });
  it('cancels the previous utterance and settles its pending promise', async () => {
    const first = playPronunciation('你好');
    const second = playPronunciation('再見');
    expect(await first).toBe(false);
    expect(synth.cancel).toHaveBeenCalled();
    spoken[1].onend?.();
    expect(await second).toBe(true);
  });
  it('plays a matching static file at the requested rate without synthesis', async () => {
    const audios: AudioMock[] = [];
    class AudioMock {
      url: string;
      playbackRate = 1;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pause = vi.fn();
      play = vi.fn(() => Promise.resolve());
      constructor(url: string) { this.url = url; audios.push(this); }
    }
    vi.stubGlobal('Audio', AudioMock);
    const result = playPronunciation('謝謝', { rate: 0.65 });
    const audio = audios[0];
    expect(audio.url).toBe('/audio/test.mp3');
    expect(audio.playbackRate).toBe(0.65);
    expect(spoken).toHaveLength(0);
    audio.onended?.();
    expect(await result).toBe(true);
  });
  it('uses a static recording first and falls back after playback failure', async () => {
    const play = vi.fn(() => Promise.reject(new Error('missing file')));
    class AudioMock { play = play; pause = vi.fn(); playbackRate = 1; onended = null; onerror = null; }
    vi.stubGlobal('Audio', AudioMock);
    const result = playPronunciation('謝謝');
    expect(play).toHaveBeenCalledOnce();
    expect(spoken).toHaveLength(0);
    await Promise.resolve();
    expect(spoken).toHaveLength(1);
    spoken[0].onend?.();
    expect(await result).toBe(true);
  });
  it('does not restart stale audio after cancellation', async () => {
    let reject!: (error: Error) => void;
    class AudioMock { play = () => new Promise<void>((_, no) => { reject = no; }); pause = vi.fn(); }
    vi.stubGlobal('Audio', AudioMock);
    const first = playPronunciation('謝謝');
    const second = playPronunciation('你好');
    reject(new Error('late rejection'));
    await Promise.resolve();
    expect(await first).toBe(false);
    expect(spoken).toHaveLength(1);
    spoken[0].onend?.();
    await second;
  });
  it('fails gracefully without a browser speech path and rejects empty text', async () => {
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    expect(canPlayPronunciation('你好')).toBe(false);
    expect(canPlayPronunciation(' ')).toBe(false);
    expect(await playPronunciation('你好')).toBe(false);
    expect(canPlayPronunciation('謝謝')).toBe(true);
  });
  it('settles synthesis errors without affecting text content', async () => {
    const result = playPronunciation('你好');
    spoken[0].onerror?.();
    expect(await result).toBe(false);
  });
});
