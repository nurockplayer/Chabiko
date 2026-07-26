import { describe, expect, it } from 'vitest';
import type { Illustration } from '../src/types/illustration';
import type { ReviewStatus } from '../src/types/vocabulary';

function makeBase() {
  return {
    id: 'test-ill',
    vocabularyId: 'teacher-voc-test',
    assetPath: '/assets/vocabulary/teacher-core-v1/test.webp',
    sourceChecksumSha256: 'a'.repeat(64),
    width: 512,
    height: 512,
    mimeType: 'image/webp' as const,
    fileSizeBytes: 1000,
    altJa: 'テスト',
  };
}

describe('illustration type contract – pending rights only with draft', () => {
  it('pending rights + draft is valid', () => {
    // reviewStatus: 'draft' permits both pending and cleared rights.
    const ill: Illustration = {
      ...makeBase(),
      reviewStatus: 'draft',
      rights: {
        status: 'pending' as const,
        source: 'teacher-provided' as const,
        note: 'Awaiting rights confirmation',
      },
    };
    // Check that the discriminated union correctly narrows cleanly (no TS errors)
    const isPending = 'status' in ill.rights;
    if (isPending) {
      expect(ill.rights).toHaveProperty('source', 'teacher-provided');
    }
    expect(ill.reviewStatus).toBe('draft');
  });

  it('cleared rights + draft is valid', () => {
    const ill: Illustration = {
      ...makeBase(),
      reviewStatus: 'draft',
      rights: {
        basis: 'commissioned-for-chabiko',
        publicWebDisplay: true,
        staticAssetRedistribution: true,
        modificationScope: 'technical-only',
        attributionRequired: false,
        reuseOutsideChabiko: 'not-granted',
      },
    };
    expect(ill.reviewStatus).toBe('draft');
  });
});

describe('illustration type contract – cleared rights with every status', () => {
  const clearedRights = {
    basis: 'commissioned-for-chabiko' as const,
    publicWebDisplay: true as const,
    staticAssetRedistribution: true as const,
    modificationScope: 'technical-only' as const,
    attributionRequired: false as const,
    reuseOutsideChabiko: 'not-granted' as const,
  };

  const states: ReviewStatus[] = ['draft', 'reviewed', 'published'];

  for (const reviewStatus of states) {
    it(`cleared rights + ${reviewStatus} is valid`, () => {
      const ill: Illustration = {
        ...makeBase(),
        reviewStatus,
        rights: clearedRights,
      };
      expect(ill.reviewStatus).toBe(reviewStatus);
    });
  }
});

describe('type-level contract – mixed (pending + cleared) rights rejected for all statuses', () => {
  // A variable holding both pending and cleared fields must be structurally
  // rejected for every reviewStatus, not just via excess-property checking.
  const mixedRights = {
    status: 'pending' as const,
    source: 'teacher-provided' as const,
    note: 'test note',
    basis: 'commissioned-for-chabiko' as const,
    publicWebDisplay: true as const,
    staticAssetRedistribution: true as const,
    modificationScope: 'technical-only' as const,
    attributionRequired: false as const,
    reuseOutsideChabiko: 'not-granted' as const,
  };

  it('mixed rights + draft is a compile-time error', () => {
    // @ts-expect-error – mixed pending+cleared is structurally invalid for Illustration
    const _ill: Illustration = { ...makeBase(), reviewStatus: 'draft' as const, rights: mixedRights };
    expect(_ill).toBeDefined();
  });

  it('mixed rights + reviewed is a compile-time error', () => {
    // @ts-expect-error – mixed pending+cleared is structurally invalid for Illustration
    const _ill: Illustration = { ...makeBase(), reviewStatus: 'reviewed' as const, rights: mixedRights };
    expect(_ill).toBeDefined();
  });

  it('mixed rights + published is a compile-time error', () => {
    // @ts-expect-error – mixed pending+cleared is structurally invalid for Illustration
    const _ill: Illustration = { ...makeBase(), reviewStatus: 'published' as const, rights: mixedRights };
    expect(_ill).toBeDefined();
  });
});

describe('type-level contract – pending rights rejected for non-draft statuses', () => {
  const pendingRights = {
    status: 'pending' as const,
    source: 'teacher-provided' as const,
    note: 'test',
  };

  it('pending + reviewed is a compile-time error', () => {
    // @ts-expect-error – pending rights with reviewStatus 'reviewed' is forbidden
    const _ill: Illustration = {
      ...makeBase(),
      reviewStatus: 'reviewed',
      rights: pendingRights,
    };
    expect(_ill).toBeDefined();
  });

  it('pending + published is a compile-time error', () => {
    // @ts-expect-error – pending rights with reviewStatus 'published' is forbidden
    const _ill: Illustration = {
      ...makeBase(),
      reviewStatus: 'published',
      rights: pendingRights,
    };
    expect(_ill).toBeDefined();
  });
});
