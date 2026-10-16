export type HskQuizDirection = 'zh-to-ja' | 'ja-to-zh';
export type HskQuizLength = 10 | 20;

export interface HskQuizEntry {
  readonly id: string;
  readonly simplified: string;
  readonly japanese: string;
  readonly pinyin: string;
}

export interface HskQuizQuestion {
  readonly entry: HskQuizEntry;
  readonly prompt: string;
  readonly options: readonly string[];
  readonly correctIndex: number;
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
}

/** Conservatively exclude overlapping gloss senses, including annotated variants. */
function meanings(value: string): string[] {
  return value.normalize('NFKC').replace(/\([^)]*\)/g, '')
    .split(/[。、.,;；/／・\n]/u).map(normalized).filter(Boolean);
}

const HAN = /\p{Script=Han}/gu;
/** Kanji in a Japanese gloss: お母さん and 母 share 母, so they must not appear as competing choices. */
function hanSet(value: string): Set<string> {
  return new Set(value.normalize('NFKC').match(HAN) ?? []);
}
function overlaps(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const item of a) if (b.has(item)) return true;
  return false;
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** Input is the admitted cumulative pool for one level, never a global corpus. */
export function buildHskQuizQuestions(
  entries: readonly HskQuizEntry[],
  length: HskQuizLength,
  direction: HskQuizDirection,
  random: () => number = Math.random,
): HskQuizQuestion[] {
  if (length !== 10 && length !== 20) return [];
  if (direction !== 'zh-to-ja' && direction !== 'ja-to-zh') return [];
  const ids = new Set<string>();
  const pool = entries.filter((entry) => {
    if (!entry.id.trim() || ids.has(entry.id) || !normalized(entry.simplified) ||
      !entry.pinyin.trim() || meanings(entry.japanese).length === 0) return false;
    ids.add(entry.id);
    return true;
  }).map((entry) => ({
    entry,
    headword: normalized(entry.simplified),
    senses: meanings(entry.japanese),
    glossKanji: hanSet(entry.japanese),
  }));
  const questions: HskQuizQuestion[] = [];
  const prompts = new Set<string>();
  for (const answer of shuffle(pool, random)) {
    const prompt = direction === 'zh-to-ja' ? answer.entry.simplified : answer.entry.japanese;
    if (prompts.has(normalized(prompt))) continue;
    const choices = [answer];
    for (const candidate of shuffle(pool, random)) {
      // Exclude near-synonyms conservatively: shared sense text, shared kanji in the
      // Japanese gloss (お母さん／母), or one headword containing the other (妈妈／妈).
      if (choices.some((choice) => choice.headword.includes(candidate.headword) ||
        candidate.headword.includes(choice.headword) ||
        choice.senses.some((sense) => candidate.senses.includes(sense)) ||
        overlaps(choice.glossKanji, candidate.glossKanji))) continue;
      choices.push(candidate);
      if (choices.length === 4) break;
    }
    if (choices.length !== 4) continue;
    const shuffled = shuffle(choices, random);
    questions.push({
      entry: answer.entry,
      prompt,
      options: shuffled.map(({ entry }) => direction === 'zh-to-ja' ? entry.japanese : entry.simplified),
      correctIndex: shuffled.indexOf(answer),
    });
    prompts.add(normalized(prompt));
    if (questions.length === length) return questions;
  }
  // Never silently shorten a test or offer ambiguous/fabricated choices.
  return [];
}

export function scoreHskQuiz(questions: readonly HskQuizQuestion[], answers: readonly number[]) {
  const missed: HskQuizEntry[] = [];
  let correct = 0;
  let answered = 0;
  questions.forEach((question, index) => {
    const answer = answers[index];
    if (!Number.isInteger(answer) || answer < 0 || answer >= question.options.length) return;
    answered++;
    if (answer === question.correctIndex) correct++;
    else missed.push(question.entry);
  });
  return { correct, answered, total: questions.length, missed, complete: questions.length > 0 && answered === questions.length };
}

/** Validate the separate answer artifact against the exact server-admitted IDs. */
export function parseHskQuizAnswers(payload: unknown, ids: readonly string[]): HskQuizEntry[] | null {
  if (!payload || typeof payload !== 'object' || new Set(ids).size !== ids.length) return null;
  const data = payload as { version?: unknown; entries?: unknown };
  if (data.version !== 1 || !Array.isArray(data.entries) || data.entries.length !== ids.length) return null;
  const entries: HskQuizEntry[] = [];
  for (const [index, raw] of data.entries.entries()) {
    if (!raw || typeof raw !== 'object') return null;
    const entry = raw as Record<string, unknown>;
    if (entry.id !== ids[index] ||
      !['authored', 'verified'].includes(String(entry.simplifiedStatus)) ||
      !['id', 'simplified', 'japanese', 'pinyin'].every((key) => typeof entry[key] === 'string' && entry[key].trim())) return null;
    entries.push({ id: entry.id as string, simplified: entry.simplified as string,
      japanese: entry.japanese as string, pinyin: entry.pinyin as string });
  }
  return entries;
}
