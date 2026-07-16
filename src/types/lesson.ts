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

export interface LessonExample {
  traditional: string;
  simplified?: string;
  pinyin: string;
  japanese: string;
}

export interface ReviewPrompt {
  promptJa: string;
  answerJa: string;
  /** Explicit wrong-answer options for multiple-choice practice, if available. */
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
  relatedVocabulary?: string[];
  painPointTags?: string[];
  reviewStatus: string;
}

export interface LessonBundle {
  lessons: Lesson[];
}
