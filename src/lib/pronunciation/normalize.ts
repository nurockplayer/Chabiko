// Shared by the browser player and scripts/audio/generate.ts so audio index keys always match lookups.

// Alternatives written with a slash (e.g. 小姐/女士) are spoken as a list with a pause (小姐，女士).
export const normalizeText = (text: string): string => text.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  .replace(/(\p{Script=Han})\s*\/\s*(?=\p{Script=Han})/gu, '$1，');
export const normalizeLang = (lang: string): string => lang.replace(/_/g, '-').toLowerCase();

/** Key of the audio index: normalized language and text, e.g. `zh-tw|謝謝`. */
export const pronunciationKey = (text: string, lang: string): string => `${normalizeLang(lang)}|${normalizeText(text)}`;
