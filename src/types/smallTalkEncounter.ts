export type ConversationMove =
  | 'REACT'
  | 'ANSWER'
  | 'ADD'
  | 'INVITE'
  | 'CONNECT'
  | 'NAVIGATE'
  | 'REPAIR'
  | 'CALIBRATE';

export type ConversationOutcome = 'CONTINUE' | 'REPAIR' | 'CLOSE' | 'STALL';
export type SmallTalkScale = 'micro' | 'medium';
export type TopicDepth = 'D0' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7';
export type ContentProvenance = 'generated' | 'authored' | 'verified';
export type ReviewDimensionStatus = 'not-reviewed' | 'needs-changes' | 'accepted';

export interface SmallTalkLocalizedText {
  readonly traditional: string;
  readonly simplifiedStatus: 'unavailable';
  readonly pinyin: string;
  readonly japanese: string;
  readonly provenance: {
    readonly traditional: ContentProvenance;
    readonly pinyin: ContentProvenance;
    readonly japanese: ContentProvenance;
  };
}

export interface SmallTalkSourceRef {
  readonly id: string;
  readonly kind: 'product-authority' | 'official-date' | 'official-cultural-reference';
  readonly title: string;
  readonly publisher: string;
  readonly url: string;
  readonly retrievedAt: string;
  readonly supports: string;
  readonly rights: {
    readonly allowedUse: 'reference-only';
    readonly copiedText: false;
  };
}

export interface SmallTalkReviewMetadata {
  readonly reviewStatus: 'draft';
  readonly contentOrigin: 'ai-assisted-draft';
  readonly dimensions: {
    readonly traditionalMandarin: ReviewDimensionStatus;
    readonly pinyin: ReviewDimensionStatus;
    readonly japanese: ReviewDimensionStatus;
    readonly socialPragmatics: ReviewDimensionStatus;
    readonly seasonalClaims: ReviewDimensionStatus;
  };
}

export interface SmallTalkChallengeProfile {
  readonly band: 'beginner' | 'intermediate' | 'advanced';
  readonly cuePredictability: 'beginner' | 'intermediate' | 'advanced';
  readonly responseFreedom: 'beginner' | 'intermediate' | 'advanced';
  readonly initiativeBurden: 'beginner' | 'intermediate' | 'advanced';
  readonly listeningBurden: 'beginner' | 'intermediate' | 'advanced';
  readonly discourseBurden: 'beginner' | 'intermediate' | 'advanced';
  readonly repairBurden: 'beginner' | 'intermediate' | 'advanced';
  readonly pragmaticBurden: 'beginner' | 'intermediate' | 'advanced';
  readonly partnerVariability: 'beginner' | 'intermediate' | 'advanced';
}

export interface SmallTalkEvidenceAnnotation {
  readonly dimensions: readonly (
    | 'contingency'
    | 'contribution'
    | 'reciprocity'
    | 'continuation'
    | 'repair-resilience'
    | 'pragmatic-fit'
  )[];
  readonly decisiveMomentJa: string;
  readonly explanationJa: string;
  readonly nextMoveJa: string;
}

export interface SmallTalkPartnerCue {
  readonly id: string;
  readonly stance: 'cooperative' | 'brief' | 'misunderstanding' | 'repair-support';
  readonly text: SmallTalkLocalizedText;
}

export type SmallTalkBranch =
  | {
      readonly kind: 'beat';
      readonly outcome: ConversationOutcome;
      readonly beatId: string;
      readonly cueId: string;
    }
  | {
      readonly kind: 'terminal';
      readonly outcome: ConversationOutcome;
      readonly partnerReply: SmallTalkLocalizedText;
    };

export interface SmallTalkStrategy {
  readonly id: string;
  readonly labelJa: string;
  readonly fit: 'acceptable' | 'stall-prone';
  readonly movePattern: readonly ConversationMove[];
  readonly realizations: readonly SmallTalkLocalizedText[];
  readonly branch: SmallTalkBranch;
  readonly evidence: SmallTalkEvidenceAnnotation;
}

export interface SmallTalkBeat {
  readonly id: string;
  readonly kind: 'conversation' | 'repair-return';
  readonly opportunityJa: string;
  readonly targetMovePattern: readonly ConversationMove[];
  readonly partnerCues: readonly SmallTalkPartnerCue[];
  readonly strategies: readonly SmallTalkStrategy[];
}

export interface SmallTalkEncounter {
  readonly id: string;
  readonly scale: SmallTalkScale;
  readonly capability: 'KEEP_GOING';
  readonly missionJa: string;
  readonly premiseJa: string;
  readonly participants: readonly {
    readonly id: string;
    readonly role: 'learner' | 'partner';
    readonly labelJa: string;
  }[];
  readonly relationship: {
    readonly familiarity: 'acquaintance';
    readonly power: 'peer';
  };
  readonly settingJa: string;
  readonly targetMovePattern: readonly ConversationMove[];
  readonly challenge: SmallTalkChallengeProfile;
  readonly depth: {
    readonly min: TopicDepth;
    readonly max: TopicDepth;
  };
  readonly sensitivity: 'low' | 'contextual';
  readonly start: { readonly beatId: string; readonly cueId: string };
  readonly replay: {
    readonly modifierJa: string;
    readonly start: { readonly beatId: string; readonly cueId: string };
  };
  readonly beats: readonly SmallTalkBeat[];
  readonly passportProjection: {
    readonly situationJa: string;
    readonly capabilityJa: string;
    readonly evidenceStage: 'supported';
    readonly limitationJa: string;
  };
}

export interface SmallTalkSeasonalMetadata {
  readonly definitionId: string;
  readonly occurrence: {
    readonly year: 2026;
    readonly startDate: string;
    readonly endDate: string;
    readonly eventTimeZone: 'Asia/Taipei';
    readonly displayTimeZone: 'Asia/Tokyo';
    readonly phase: 'anticipation';
    readonly visibleFrom: string;
    readonly visibleUntil: string;
    readonly dateStatus: 'verified';
    readonly sourceRefIds: readonly string[];
  };
  readonly claims: readonly {
    readonly id: string;
    readonly claimJa: string;
    readonly scopeNoteJa: string;
    readonly sourceRefIds: readonly string[];
  }[];
}

export interface SmallTalkEncounterFamily {
  readonly id: string;
  readonly kind: 'evergreen-baseline' | 'seasonal-transfer';
  readonly titleJa: string;
  readonly sourceRefs: readonly SmallTalkSourceRef[];
  readonly review: SmallTalkReviewMetadata;
  readonly seasonal?: SmallTalkSeasonalMetadata;
  readonly encounters: readonly SmallTalkEncounter[];
}

export interface SmallTalkEncounterDocument {
  readonly schemaVersion: 1;
  readonly families: readonly SmallTalkEncounterFamily[];
}
