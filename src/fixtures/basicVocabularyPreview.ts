/**
 * Dev-only synthetic vocabulary fixture for the basic-preview route.
 *
 * NOT FOR PRODUCTION:
 * - All records are synthetic (common nouns for UI validation)
 * - No real teacher workbook or #117 review data is used
 * - Content is unreviewed and unaudited
 * - No illustration metadata or approved alt text exists
 */

export interface PreviewVocabularyEntry {
  id: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  japanese: string;
}

const ALL_WORDS: PreviewVocabularyEntry[] = [
  { id: "syn-001", simplified: "猫",   traditional: "貓",   pinyin: "māo",      japanese: "猫" },
  { id: "syn-002", simplified: "犬",   traditional: "犬",   pinyin: "quǎn",     japanese: "犬" },
  { id: "syn-003", simplified: "鱼",   traditional: "魚",   pinyin: "yú",       japanese: "魚" },
  { id: "syn-004", simplified: "花",   traditional: "花",   pinyin: "huā",      japanese: "花" },
  { id: "syn-005", simplified: "山",   traditional: "山",   pinyin: "shān",     japanese: "山" },
  { id: "syn-006", simplified: "水",   traditional: "水",   pinyin: "shuǐ",     japanese: "水" },
  { id: "syn-007", simplified: "火",   traditional: "火",   pinyin: "huǒ",      japanese: "火" },
  { id: "syn-008", simplified: "月",   traditional: "月",   pinyin: "yuè",      japanese: "月" },
  { id: "syn-009", simplified: "星",   traditional: "星",   pinyin: "xīng",     japanese: "星" },
  { id: "syn-010", simplified: "雨",   traditional: "雨",   pinyin: "yǔ",       japanese: "雨" },
  { id: "syn-011", simplified: "云",   traditional: "雲",   pinyin: "yún",      japanese: "雲" },
  { id: "syn-012", simplified: "海",   traditional: "海",   pinyin: "hǎi",      japanese: "海" },
  { id: "syn-013", simplified: "风",   traditional: "風",   pinyin: "fēng",     japanese: "風" },
  { id: "syn-014", simplified: "林",   traditional: "林",   pinyin: "lín",      japanese: "林" },
  { id: "syn-015", simplified: "空",   traditional: "空",   pinyin: "kōng",     japanese: "空" },
  { id: "syn-016", simplified: "石",   traditional: "石",   pinyin: "shí",      japanese: "石" },
  { id: "syn-017", simplified: "太阳", traditional: "太陽", pinyin: "tài yáng", japanese: "太陽" },
  { id: "syn-018", simplified: "鸟",   traditional: "鳥",   pinyin: "niǎo",     japanese: "鳥" },
  { id: "syn-019", simplified: "虫",   traditional: "蟲",   pinyin: "chóng",    japanese: "虫" },
  { id: "syn-020", simplified: "竹",   traditional: "竹",   pinyin: "zhú",      japanese: "竹" },
];

/** Each preview session uses the first 10 records. */
export const SESSION_WORDS = ALL_WORDS.slice(0, 10);

export default ALL_WORDS;
