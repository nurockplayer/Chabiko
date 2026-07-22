/**
 * basic-vocabulary-placeholder.fixture.js
 *
 * Dev-only synthetic vocabulary fixture for the flashcard prototype.
 *
 * NOT FOR PRODUCTION:
 * - All records are synthetic (common nouns for UI validation)
 * - No real teacher workbook or preflight data is used
 * - Content is unreviewed and unaudited
 * - No illustration metadata or approved alt text exists
 *
 * Each record contains:
 *   id            — stable synthetic ID
 *   zh            — Simplified Chinese (front of card)
 *   trad          — Traditional Chinese (revealed on back)
 *   pinyin        — pinyin (revealed on back)
 *   ja            — Japanese translation (revealed on back)
 *   category      — semantic category (for future filtering)
 *   source        — always "synthetic-dev"
 *   reviewStatus  — always "unreviewed"
 *   example       — dev-only synthetic example sentence (unreviewed)
 *   toneNote      — dev-only synthetic tone/pronunciation note (unreviewed)
 *   caution       — dev-only synthetic usage caution (unreviewed)
 */

const ALL_WORDS = [
  { id: "syn-001", zh: "猫",   trad: "貓",   pinyin: "māo",      ja: "猫",       category: "animal",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一只猫",          toneNote: "第一声・平らに伸ばす",             caution: "猫は量詞「只」を使う" },
  { id: "syn-002", zh: "犬",   trad: "犬",   pinyin: "quǎn",     ja: "犬",       category: "animal",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一只狗",          toneNote: "第三声・下がって上がる",             caution: "" },
  { id: "syn-003", zh: "鱼",   trad: "魚",   pinyin: "yú",       ja: "魚",       category: "animal",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一条鱼",          toneNote: "第二声・上がる",                    caution: "魚は量詞「条」を使う" },
  { id: "syn-004", zh: "花",   trad: "花",   pinyin: "huā",      ja: "花",       category: "plant",    source: "synthetic-dev", reviewStatus: "unreviewed", example: "一朵花",          toneNote: "第一声・平らに",                    caution: "" },
  { id: "syn-005", zh: "山",   trad: "山",   pinyin: "shān",     ja: "山",       category: "nature",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一座山",          toneNote: "第一声・平らに",                    caution: "山の量詞は「座」" },
  { id: "syn-006", zh: "水",   trad: "水",   pinyin: "shuǐ",     ja: "水",       category: "nature",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一杯水",          toneNote: "第三声・下がる",                    caution: "" },
  { id: "syn-007", zh: "火",   trad: "火",   pinyin: "huǒ",      ja: "火",       category: "nature",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一把火",          toneNote: "第三声・下がる",                    caution: "火の量詞は「把」" },
  { id: "syn-008", zh: "月",   trad: "月",   pinyin: "yuè",      ja: "月",       category: "nature",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一轮明月",        toneNote: "第四声・急降下",                    caution: "" },
  { id: "syn-009", zh: "星",   trad: "星",   pinyin: "xīng",     ja: "星",       category: "nature",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一颗星",          toneNote: "第一声・平らに",                    caution: "星は量詞「颗」" },
  { id: "syn-010", zh: "雨",   trad: "雨",   pinyin: "yǔ",       ja: "雨",       category: "weather",  source: "synthetic-dev", reviewStatus: "unreviewed", example: "一场雨",          toneNote: "第三声・下がる",                    caution: "雨の量詞は「场」" },
  { id: "syn-011", zh: "云",   trad: "雲",   pinyin: "yún",      ja: "雲",       category: "weather",  source: "synthetic-dev", reviewStatus: "unreviewed", example: "一片云",          toneNote: "第二声・上がる",                    caution: "" },
  { id: "syn-012", zh: "海",   trad: "海",   pinyin: "hǎi",      ja: "海",       category: "nature",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一片海",          toneNote: "第三声・下がる",                    caution: "" },
  { id: "syn-013", zh: "风",   trad: "風",   pinyin: "fēng",     ja: "風",       category: "weather",  source: "synthetic-dev", reviewStatus: "unreviewed", example: "一阵风",          toneNote: "第一声・平らに",                    caution: "風の量詞は「阵」" },
  { id: "syn-014", zh: "林",   trad: "林",   pinyin: "lín",      ja: "林",       category: "plant",    source: "synthetic-dev", reviewStatus: "unreviewed", example: "一片森林",        toneNote: "第二声・上がる",                    caution: "" },
  { id: "syn-015", zh: "空",   trad: "空",   pinyin: "kōng",     ja: "空",       category: "nature",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一片天空",        toneNote: "第一声・平らに",                    caution: "" },
  { id: "syn-016", zh: "石",   trad: "石",   pinyin: "shí",      ja: "石",       category: "nature",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一块石头",        toneNote: "第二声・上がる",                    caution: "石の量詞は「块」" },
  { id: "syn-017", zh: "太阳", trad: "太陽", pinyin: "tài yáng", ja: "太陽",     category: "nature",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一个太阳",        toneNote: "第四声＋第二声",                    caution: "" },
  { id: "syn-018", zh: "鸟",   trad: "鳥",   pinyin: "niǎo",     ja: "鳥",       category: "animal",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一只鸟",          toneNote: "第三声・下がる",                    caution: "鳥の量詞は「只」" },
  { id: "syn-019", zh: "虫",   trad: "蟲",   pinyin: "chóng",    ja: "虫",       category: "animal",   source: "synthetic-dev", reviewStatus: "unreviewed", example: "一只虫",          toneNote: "第二声・上がる",                    caution: "" },
  { id: "syn-020", zh: "竹",   trad: "竹",   pinyin: "zhú",      ja: "竹",       category: "plant",    source: "synthetic-dev", reviewStatus: "unreviewed", example: "一根竹子",        toneNote: "第二声・上がる",                    caution: "竹の量詞は「根」" },
];

/* Each session uses the first 10 records */
const SESSION_WORDS = ALL_WORDS.slice(0, 10);
