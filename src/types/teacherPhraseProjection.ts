export interface TeacherPhraseProjectionPhrase {
  phraseId: string;
  simplified: string;
  traditional?: string;
  pinyin: string;
  japanese: string;
}

export interface TeacherPhraseProjectionRecord {
  learnerId: string;
  source: {
    sheet: string;
    row: number;
    column: '造词/造句';
    sourceRevision: string;
  };
  reviewVersion: string;
  teacherPhrases: TeacherPhraseProjectionPhrase[];
}

export interface TeacherPhraseProjection {
  schemaVersion: 1;
  contractId: 'teacher-phrase-promoted-v1';
  base: {
    sidecarSchemaVersion: 1;
    sidecarContractId: 'teacher-phrase-authoring-v1';
    sidecarSha256: string | null;
    learnerManifestSemanticSha256: string;
    workbookSha256: string;
  };
  records: TeacherPhraseProjectionRecord[];
}
