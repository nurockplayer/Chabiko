export interface LessonSection {
  headingJa: string;
  contentJa: string;
}

export interface LessonChunk {
  chunk: string;
  meaning: string;
  notesJa?: string;
}

export interface KanjiBridgeNote {
  kanji: string;
  jpReading: string;
  noteJa: string;
}

export interface SoundFocus {
  item: string;
  noteJa: string;
}

export type LessonExampleScriptStatus = 'authored' | 'verified' | 'generated';

interface LessonExampleBase {
  traditional: string;
  traditionalStatus: LessonExampleScriptStatus;
  pinyin: string;
  japanese: string;
}

export type LessonExample = LessonExampleBase &
  (
    | { simplified?: never; simplifiedStatus?: never }
    | { simplified?: never; simplifiedStatus: 'unavailable' }
    | { simplified: string; simplifiedStatus: LessonExampleScriptStatus }
  );

export interface ReviewPrompt {
  promptJa: string;
  answerJa: string;
  /** Explicit wrong-answer options for multiple-choice practice.
   *  Draft content may populate this later; production content is validated
   *  to have at least one effective distractor by the content schema. */
  distractorsJa?: string[];
}

export interface Lesson {
  id: string;
  titleJa: string;
  level: string;
  canDoJa: string;
  learnerOutcomeJa: string;
  hookJa: string;
  travelScenario: string;
  coreSentence: string;
  sections?: LessonSection[];
  chunks: LessonChunk[];
  kanjiBridgeNotes: KanjiBridgeNote[];
  soundFocus: SoundFocus[];
  examples?: LessonExample[];
  reviewPrompts: ReviewPrompt[];
  travelTask: string;
  /** Lesson-loop step 9. Optional in the shared contract for legacy lessons;
   *  candidate packages may require it before promotion. */
  reviewHookJa?: string;
  relatedVocabulary?: string[];
  painPointTags?: string[];
  reviewStatus: string;
}

export interface LessonBundle {
  lessons: Lesson[];
}
