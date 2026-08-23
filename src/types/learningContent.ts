/**
 * Shared learning-content graph contract.
 *
 * Collection files remain the canonical writers. This module describes the
 * typed references and derived relationships that let HSK and Taiwan Travel
 * compose the same learning objects without copying records.
 */

import type { Lesson } from './lesson';
import type { PhrasebookPhrase } from './phrasebook';
import type { RoleplayCardRecord } from './roleplayCard';
import type { HskVocabularyType, Vocabulary } from './vocabulary';

export type LearningContentKind = 'lesson' | 'vocabulary' | 'phrase' | 'roleplay';

export type LearningPathContentKind = Exclude<LearningContentKind, 'roleplay'>;

/** Canonical collection that owns a learning-content record. */
export type LearningContentCollection =
  | 'lessons'
  | 'vocabulary'
  | 'hskVocabulary'
  | 'phrases'
  | 'roleplayCards';

/** Collection discriminator associated with each graph content kind. */
export type LearningContentCollectionFor<K extends LearningContentKind> =
  K extends 'lesson'
    ? 'lessons'
    : K extends 'vocabulary'
      ? 'vocabulary' | 'hskVocabulary'
      : K extends 'phrase'
        ? 'phrases'
        : 'roleplayCards';

/** A stable, collection-qualified content reference. */
export interface ContentRef<K extends LearningContentKind = LearningContentKind> {
  readonly collection: LearningContentCollectionFor<K>;
  readonly type: K;
  readonly id: string;
}

export interface LearningContentRecordMap {
  lesson: Lesson;
  vocabulary: Vocabulary;
  phrase: PhrasebookPhrase;
  roleplay: RoleplayCardRecord;
}

export type LearningContentRecord = LearningContentRecordMap[LearningContentKind];

/** A canonical record plus the path views that currently include it. */
export type LearningContentObject =
  | {
      readonly ref: ContentRef<'lesson'>;
      readonly record: Lesson;
      readonly pathIds: readonly string[];
    }
  | {
      readonly ref: ContentRef<'vocabulary'>;
      readonly record: Vocabulary;
      readonly pathIds: readonly string[];
    }
  | {
      readonly ref: ContentRef<'phrase'>;
      readonly record: PhrasebookPhrase;
      readonly pathIds: readonly string[];
    }
  | {
      readonly ref: ContentRef<'roleplay'>;
      readonly record: RoleplayCardRecord;
      readonly pathIds: readonly string[];
    };

/** Minimal path input accepted by the graph builder. */
export interface LearningContentPath {
  readonly id: string;
  readonly members: readonly ContentRef<LearningPathContentKind>[];
}

export type LearningContentRelationType =
  | 'path-member'
  | 'lesson-vocabulary'
  | 'phrase-vocabulary'
  | 'roleplay-lesson'
  | 'roleplay-phrase';

export type LearningContentRelation =
  | {
      readonly type: 'path-member';
      readonly pathId: string;
      readonly ref: ContentRef<LearningPathContentKind>;
    }
  | {
      readonly type: 'lesson-vocabulary';
      readonly from: ContentRef<'lesson'>;
      readonly to: ContentRef<'vocabulary'>;
    }
  | {
      readonly type: 'phrase-vocabulary';
      readonly from: ContentRef<'phrase'>;
      readonly to: ContentRef<'vocabulary'>;
    }
  | {
      readonly type: 'roleplay-lesson';
      readonly from: ContentRef<'roleplay'>;
      readonly to: ContentRef<'lesson'>;
    }
  | {
      readonly type: 'roleplay-phrase';
      readonly from: ContentRef<'roleplay'>;
      readonly to: ContentRef<'phrase'>;
    };

export interface LearningContentGraphSources {
  readonly lessons: readonly Lesson[];
  readonly vocabulary: readonly Vocabulary[];
  readonly hskVocabulary: readonly HskVocabularyType[];
  readonly phrases: readonly PhrasebookPhrase[];
  readonly roleplayCards: readonly RoleplayCardRecord[];
  readonly paths: readonly LearningContentPath[];
}

/** Read-only derived graph; it never changes review or availability state. */
export interface LearningContentGraph {
  readonly schemaVersion: 1;
  readonly objects: readonly LearningContentObject[];
  readonly relations: readonly LearningContentRelation[];
  readonly pathIds: readonly string[];
  resolve(ref: ContentRef): LearningContentObject | undefined;
  getPathContent(pathId: string): readonly LearningContentObject[];
}
