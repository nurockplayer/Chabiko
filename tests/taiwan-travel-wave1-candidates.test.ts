import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildTaiwanTravelWave1ReviewPacket,
  fingerprintTaiwanTravelWave1Lesson,
  loadTaiwanTravelWave1ReviewPacket,
  renderTaiwanTravelWave1ReviewPacket,
  TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS,
  TAIWAN_TRAVEL_WAVE1_GRAPH_PATH,
  TAIWAN_TRAVEL_WAVE1_LESSONS_PATH,
  TAIWAN_TRAVEL_WAVE1_PACKET_PATH,
  TAIWAN_TRAVEL_WAVE1_SCENARIO_DISTRIBUTION,
  TAIWAN_TRAVEL_WAVE1_SCOPE_ID,
  TAIWAN_TRAVEL_WAVE1_SCOPE_PATH,
  type TaiwanTravelWave1ReviewScopeManifest,
  type TaiwanTravelWave1SourceBundle,
} from '../src/content/loadTaiwanTravelWave1ReviewScope';
import { loadAllRenderableLessons } from '../src/content/loadLessons';
import type { Lesson } from '../src/types/lesson';

const root = process.cwd();

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T;
}

function loadManifest(): TaiwanTravelWave1ReviewScopeManifest {
  return readJson<TaiwanTravelWave1ReviewScopeManifest>(
    TAIWAN_TRAVEL_WAVE1_SCOPE_PATH,
  );
}

function loadSourceBundle(): TaiwanTravelWave1SourceBundle {
  const lessons = readJson<{ lessons: Lesson[] }>(
    TAIWAN_TRAVEL_WAVE1_LESSONS_PATH,
  ).lessons;
  const paths = readJson<{ paths: TaiwanTravelWave1SourceBundle['paths'] }>(
    TAIWAN_TRAVEL_WAVE1_GRAPH_PATH,
  ).paths;
  const productionLessons = readJson<{ lessons: Lesson[] }>(
    'data/examples/valid/lessons.json',
  ).lessons;
  return { lessons, paths, productionLessons };
}

function build(
  mutateManifest?: (manifest: TaiwanTravelWave1ReviewScopeManifest) => void,
  mutateSources?: (sources: TaiwanTravelWave1SourceBundle) => void,
) {
  const manifest = structuredClone(loadManifest());
  const sources = structuredClone(loadSourceBundle());
  mutateManifest?.(manifest);
  mutateSources?.(sources);
  return buildTaiwanTravelWave1ReviewPacket(manifest, sources);
}

describe('Taiwan Travel Wave 1 candidate package', () => {
  it('reconciles exact IDs, order, draft state, scenarios, and production isolation', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();

    expect(packet.scopeId).toBe(TAIWAN_TRAVEL_WAVE1_SCOPE_ID);
    expect(packet.records.map((record) => record.lesson.id)).toEqual([
      ...TAIWAN_TRAVEL_WAVE1_EXPECTED_IDS,
    ]);
    expect(packet.records).toHaveLength(14);
    expect(packet.records.every((record) => record.lesson.reviewStatus === 'draft')).toBe(true);
    expect(packet.scenarioDistribution).toEqual(
      TAIWAN_TRAVEL_WAVE1_SCENARIO_DISTRIBUTION,
    );
    expect(packet.productionLinked).toBe(false);
    expect(packet.promotionAllowed).toBe(false);
    expect(packet.decisionCount).toBe(0);
  });

  it('completes lesson-loop step 9 with distinct review hooks that resolve to real lessons', async () => {
    const sources = loadSourceBundle();
    const knownLessonIds = new Set(
      [...sources.productionLessons, ...sources.lessons].map((lesson) => lesson.id),
    );
    const reviewHooks = sources.lessons.map((lesson) => {
      const reviewHookJa = (lesson as unknown as { reviewHookJa?: unknown })
        .reviewHookJa;
      expect(reviewHookJa).toEqual(expect.any(String));
      expect(String(reviewHookJa).trim().length).toBeGreaterThan(0);
      const target = /第(\d+)課/.exec(String(reviewHookJa));
      expect(target).not.toBeNull();
      const targetId = `lesson-${String(Number(target?.[1])).padStart(3, '0')}`;
      expect(knownLessonIds).toContain(targetId);
      expect(targetId).not.toBe(lesson.id);
      return String(reviewHookJa);
    });
    expect(new Set(reviewHooks).size).toBe(14);
    const sharedLoaderLessons = loadAllRenderableLessons(
      resolve(root, TAIWAN_TRAVEL_WAVE1_LESSONS_PATH),
    );
    expect(sharedLoaderLessons).toHaveLength(14);
    expect(sharedLoaderLessons.map((lesson) => lesson.reviewHookJa)).toEqual(
      reviewHooks,
    );

    await expect(
      build(undefined, (candidateSources) => {
        delete (candidateSources.lessons[0] as unknown as Record<string, unknown>)
          .reviewHookJa;
      }),
    ).rejects.toThrow(/lesson 'lesson-011'\.reviewHookJa must be a non-empty string/);

    await expect(
      build(undefined, (candidateSources) => {
        (candidateSources.lessons[0] as unknown as Record<string, unknown>)
          .reviewHookJa = '   ';
      }),
    ).rejects.toThrow(/lesson 'lesson-011'\.reviewHookJa must be a non-empty string/);

    await expect(
      build(undefined, (candidateSources) => {
        candidateSources.lessons[0].reviewHookJa =
          '第999課で同じ表現をもう一度使います。';
      }),
    ).rejects.toThrow(
      /lesson 'lesson-011'\.reviewHookJa has unresolved review target 'lesson-999'/,
    );

    await expect(
      build(undefined, (candidateSources) => {
        candidateSources.productionLessons.push({
          ...structuredClone(candidateSources.productionLessons[0]),
          id: 'lesson-025',
          canDoJa: '将来追加される別の学習目標',
          coreSentence: '未來的句子。',
        });
        candidateSources.lessons[0].reviewHookJa =
          '第25課で同じ表現をもう一度使います。';
      }),
    ).rejects.toThrow(
      /lesson 'lesson-011'\.reviewHookJa has unresolved review target 'lesson-025'/,
    );

    await expect(
      build(undefined, (candidateSources) => {
        candidateSources.lessons[1].reviewHookJa =
          candidateSources.lessons[0].reviewHookJa;
      }),
    ).rejects.toThrow(
      /lesson 'lesson-012'\.reviewHookJa must be distinct within the candidate package/,
    );

    const originalFingerprint = await fingerprintTaiwanTravelWave1Lesson(
      sources.lessons[0],
    );
    const changedLesson = structuredClone(sources.lessons[0]) as Lesson & {
      reviewHookJa: string;
    };
    changedLesson.reviewHookJa += ' 別の復習時点。';
    await expect(fingerprintTaiwanTravelWave1Lesson(changedLesson)).resolves.not.toBe(
      originalFingerprint,
    );
  });

  it('aligns canonical human-review outcomes and keeps non-accepted outcomes non-promotable', async () => {
    const expectedContract = {
      outcomes: ['accepted', 'rejected', 'needs-changes'],
      promotableOutcomes: ['accepted'],
      nonPromotableOutcomes: ['rejected', 'needs-changes'],
    };
    const manifest = loadManifest();
    const manifestContract = manifest.decisionContract as unknown as Record<
      string,
      unknown
    >;
    expect(manifestContract).toMatchObject(expectedContract);

    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const packetContract = (packet as unknown as Record<string, unknown>)
      .decisionContract;
    expect(packetContract).toMatchObject(expectedContract);
    const rendered = renderTaiwanTravelWave1ReviewPacket(packet);
    expect(rendered).toContain(
      '**Decision contract:** Canonical outcomes: accepted, rejected, needs-changes. Promotable: accepted. Non-promotable: rejected, needs-changes.',
    );
    expect(rendered).toContain('needs-changes maps to needs_changes');
    expect(rendered).toContain(
      'rejected remains non-promotable and is never written as an accepted decision',
    );

    await expect(
      build((candidateManifest) => {
        const contract = candidateManifest.decisionContract as unknown as Record<
          string,
          unknown
        >;
        contract.outcomes = ['accepted', 'needs-changes'];
      }),
    ).rejects.toThrow(/decision outcomes drifted/);
    await expect(
      build((candidateManifest) => {
        const contract = candidateManifest.decisionContract as unknown as Record<
          string,
          unknown
        >;
        contract.promotableOutcomes = ['accepted', 'rejected'];
      }),
    ).rejects.toThrow(/promotable outcomes drifted/);
    await expect(
      build((candidateManifest) => {
        const contract = candidateManifest.decisionContract as unknown as Record<
          string,
          unknown
        >;
        contract.nonPromotableOutcomes = ['rejected'];
      }),
    ).rejects.toThrow(/non-promotable outcomes drifted/);
  });

  it('keeps required-role outcomes independent from each other and from the overall decision', async () => {
    const manifest = loadManifest();
    for (const dimension of manifest.dimensions) {
      expect(dimension).not.toHaveProperty('outcome');
      expect(
        dimension.reviewerEvidence.every(
          (evidence) =>
            (evidence as unknown as { outcome?: string }).outcome === 'not-reviewed' &&
            evidence.reviewerIdentity === null &&
            evidence.reviewDate === null &&
            evidence.findings === null,
        ),
      ).toBe(true);
    }

    const packet = await build((candidateManifest) => {
      const evidence = candidateManifest.dimensions[7]
        .reviewerEvidence as unknown as Array<{
        role: string;
        outcome: string;
        reviewerIdentity: string | null;
        reviewDate: string | null;
        findings: string | null;
      }>;
      evidence[0] = {
        ...evidence[0],
        outcome: 'accepted',
        reviewerIdentity: '@source-reviewer',
        reviewDate: '2026-08-29',
        findings: 'Source metadata accepted.',
      };
      evidence[1] = {
        ...evidence[1],
        outcome: 'needs-changes',
        reviewerIdentity: '@script-reviewer',
        reviewDate: '2026-08-29',
        findings: 'Script verification needs changes.',
      };
    });

    expect(
      packet.dimensions[7].reviewerEvidence.map(
        (evidence) => (evidence as unknown as { outcome: string }).outcome,
      ),
    ).toEqual(['accepted', 'needs-changes']);
    expect(packet.reviewState).toBe('pending-human-review');
    expect(packet.overallDecision).toBeNull();
    expect(packet.decisionCount).toBe(0);
    expect(packet.promotionAllowed).toBe(false);

    const rendered = renderTaiwanTravelWave1ReviewPacket(packet);
    expect(rendered).toContain(
      '**Overall review outcome:** {{accepted | rejected | needs-changes}}',
    );
    expect(rendered).toContain(
      '**Current repository review state:** pending-human-review; no overall human decision is recorded; promotion is not allowed.',
    );
    expect(rendered).toContain(
      'Each required role records its own outcome independently.',
    );
    expect(rendered).toContain(
      '| Source and script provenance correctness | human-source-reviewer | accepted | @source-reviewer | 2026-08-29 | Source metadata accepted. |',
    );
    expect(rendered).toContain(
      '| Source and script provenance correctness | human-script-verifier | needs-changes | @script-reviewer | 2026-08-29 | Script verification needs changes. |',
    );

    await expect(
      build((candidateManifest) => {
        const dimension = candidateManifest.dimensions[0] as unknown as Record<
          string,
          unknown
        >;
        dimension.outcome = 'accepted';
      }),
    ).rejects.toThrow(
      /dimension 'natural-taiwan-mandarin' has unknown field 'outcome'/,
    );
  });

  it('authorizes each review dimension through its exact ordered reviewer-role set', async () => {
    const expectedRoles = new Map([
      ['natural-taiwan-mandarin', ['human-language-reviewer', 'human-regional-reviewer']],
      ['natural-japanese-explanation', ['human-language-reviewer']],
      ['lesson-loop-usefulness', ['human-teaching-reviewer']],
      ['pronunciation-guidance', ['human-language-reviewer', 'human-teaching-reviewer']],
      ['kanji-bridge-accuracy', ['human-teaching-reviewer']],
      ['exercise-quality', ['human-teaching-reviewer']],
      ['graph-and-scope-correctness', ['maintainer']],
      ['source-and-script-provenance', ['human-source-reviewer', 'human-script-verifier']],
    ]);
    const manifest = loadManifest();

    expect(
      manifest.dimensions.map((dimension) => [dimension.id, dimension.reviewerRoles]),
    ).toEqual([...expectedRoles]);

    await expect(
      build((candidateManifest) => {
        candidateManifest.dimensions[0].reviewerRoles.pop();
      }),
    ).rejects.toThrow(/reviewer roles drifted for dimension 'natural-taiwan-mandarin'/);
    await expect(
      build((candidateManifest) => {
        candidateManifest.dimensions[0].reviewerRoles.push(
          'human-language-reviewer',
        );
      }),
    ).rejects.toThrow(/reviewer roles drifted for dimension 'natural-taiwan-mandarin'/);
    await expect(
      build((candidateManifest) => {
        candidateManifest.dimensions[0].reviewerRoles.reverse();
      }),
    ).rejects.toThrow(/reviewer roles drifted for dimension 'natural-taiwan-mandarin'/);
    await expect(
      build((candidateManifest) => {
        candidateManifest.dimensions[1].reviewerRoles.push('maintainer');
      }),
    ).rejects.toThrow(/reviewer roles drifted for dimension 'natural-japanese-explanation'/);
  });

  it('binds each role outcome to complete evidence while keeping promotion separate', async () => {
    const manifest = loadManifest();
    for (const dimension of manifest.dimensions) {
      const evidence = dimension.reviewerEvidence;
      expect(evidence.map(({ role }) => role)).toEqual(dimension.reviewerRoles);
      expect(
        evidence.every(
          ({ outcome, reviewerIdentity, reviewDate, findings }) =>
            outcome === 'not-reviewed' &&
            reviewerIdentity === null && reviewDate === null && findings === null,
        ),
      ).toBe(true);
    }

    const partiallyReviewed = await build((candidateManifest) => {
      const dimension = candidateManifest.dimensions[0];
      dimension.reviewerEvidence[0] = {
        ...dimension.reviewerEvidence[0],
        outcome: 'accepted',
        reviewerIdentity: '@language-reviewer',
        reviewDate: '2026-08-29',
        findings: 'Language review accepted; regional review remains pending.',
      };
    });
    expect(
      partiallyReviewed.dimensions[0].reviewerEvidence.map(({ outcome }) => outcome),
    ).toEqual(['accepted', 'not-reviewed']);
    expect(partiallyReviewed.promotionAllowed).toBe(false);

    const rejectedByOneRole = await build((candidateManifest) => {
      const dimension = candidateManifest.dimensions[0];
      dimension.reviewerEvidence[0] = {
        ...dimension.reviewerEvidence[0],
        outcome: 'rejected',
        reviewerIdentity: '@language-reviewer',
        reviewDate: '2026-08-29',
        findings: 'Blocking language finding.',
      };
    });
    expect(rejectedByOneRole.dimensions[0].reviewerEvidence[0].outcome).toBe('rejected');
    expect(rejectedByOneRole.promotionAllowed).toBe(false);

    await expect(
      build((candidateManifest) => {
        candidateManifest.dimensions[0].reviewerEvidence[0].outcome = 'rejected';
      }),
    ).rejects.toThrow(
      /rejected reviewer evidence 'natural-taiwan-mandarin:human-language-reviewer' requires complete reviewer evidence/,
    );

    await expect(
      build((candidateManifest) => {
        candidateManifest.dimensions[0].reviewerEvidence[0].reviewerIdentity =
          '@language-reviewer';
      }),
    ).rejects.toThrow(
      /not-reviewed reviewer evidence 'natural-taiwan-mandarin:human-language-reviewer' must remain empty/,
    );

    await expect(
      build((candidateManifest) => {
        const evidence = candidateManifest.dimensions[0].reviewerEvidence[0] as unknown as Record<
          string,
          unknown
        >;
        evidence.outcome = 'pending';
      }),
    ).rejects.toThrow(
      /reviewer evidence 'natural-taiwan-mandarin:human-language-reviewer' has invalid outcome 'pending'/,
    );

    await expect(
      build((candidateManifest) => {
        const evidence = candidateManifest.dimensions[0].reviewerEvidence[0] as unknown as Record<
          string,
          unknown
        >;
        delete evidence.outcome;
      }),
    ).rejects.toThrow(
      /reviewer evidence 'natural-taiwan-mandarin:human-language-reviewer' has invalid outcome 'undefined'/,
    );

    await expect(
      build((candidateManifest) => {
        candidateManifest.dimensions[0].reviewerEvidence[0].outcome = 'accepted';
      }),
    ).rejects.toThrow(
      /accepted reviewer evidence 'natural-taiwan-mandarin:human-language-reviewer' requires complete reviewer evidence/,
    );

    const accepted = await build((candidateManifest) => {
      candidateManifest.dimensions.forEach((dimension) => {
        dimension.reviewerEvidence = dimension.reviewerEvidence.map((evidence) => ({
          ...evidence,
          outcome: 'accepted',
          reviewerIdentity: `@${evidence.role}`,
          reviewDate: '2026-08-29',
          findings: 'None.',
        }));
      });
    });
    expect(
      accepted.dimensions.every((dimension) =>
        dimension.reviewerEvidence.every(({ outcome }) => outcome === 'accepted'),
      ),
    ).toBe(true);
    expect(accepted.overallDecision).toBeNull();
    expect(accepted.promotionAllowed).toBe(false);

    await expect(
      build((candidateManifest) => {
        const evidence = candidateManifest.dimensions[1].reviewerEvidence[0];
        candidateManifest.dimensions[1].reviewerEvidence[0] = {
          ...evidence,
          outcome: 'accepted',
          reviewerIdentity: '@language-reviewer',
          reviewDate: '2026-02-30',
          findings: 'None.',
        };
      }),
    ).rejects.toThrow(
      /accepted reviewer evidence 'natural-japanese-explanation:human-language-reviewer' requires a valid ISO review date/,
    );
  });

  it('rejects unknown review-manifest root fields before packet construction', async () => {
    await expect(
      build((manifest) => {
        const value = manifest as unknown as Record<string, unknown>;
        value.reviewStat = value.reviewState;
        delete value.reviewState;
      }),
    ).rejects.toThrow(/manifest has unknown field 'reviewStat'/);
  });

  it('rejects unknown review decision-contract fields before packet construction', async () => {
    await expect(
      build((manifest) => {
        const contract = manifest.decisionContract as unknown as Record<string, unknown>;
        contract.approvedOutcomes = ['accepted'];
      }),
    ).rejects.toThrow(/decisionContract has unknown field 'approvedOutcomes'/);
  });

  it('rejects unknown review-dimension fields before packet construction', async () => {
    await expect(
      build((manifest) => {
        const dimension = manifest.dimensions[0] as unknown as Record<string, unknown>;
        dimension.reviewerRole = dimension.reviewerRoles;
      }),
    ).rejects.toThrow(
      /dimension 'natural-taiwan-mandarin' has unknown field 'reviewerRole'/,
    );
    await expect(
      build((manifest) => {
        const evidence = manifest.dimensions[0].reviewerEvidence[0] as unknown as Record<
          string,
          unknown
        >;
        evidence.reviewer = evidence.role;
      }),
    ).rejects.toThrow(
      /reviewer evidence 'natural-taiwan-mandarin:human-language-reviewer' has unknown field 'reviewer'/,
    );
  });

  it('rejects unknown review-record fields before packet construction', async () => {
    await expect(
      build((manifest) => {
        const record = manifest.records[0] as unknown as Record<string, unknown>;
        record.source = record.sourcePath;
      }),
    ).rejects.toThrow(/record 'lesson-011' has unknown field 'source'/);
  });

  it('keeps every rich lesson complete and every prompt mechanically unambiguous', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();

    for (const { lesson } of packet.records) {
      expect(lesson.sections?.length).toBeGreaterThanOrEqual(2);
      expect(lesson.chunks.length).toBeGreaterThanOrEqual(3);
      expect(lesson.soundFocus).toHaveLength(1);
      expect(lesson.examples?.length).toBeGreaterThanOrEqual(2);
      expect(lesson.reviewPrompts.length).toBeGreaterThanOrEqual(2);
      for (const prompt of lesson.reviewPrompts) {
        expect(prompt.promptJa.trim()).not.toBe('');
        expect(prompt.answerJa.trim()).not.toBe('');
        expect(prompt.distractorsJa?.length).toBeGreaterThanOrEqual(2);
        expect(new Set(prompt.distractorsJa).size).toBe(prompt.distractorsJa?.length);
        expect(prompt.distractorsJa).not.toContain(prompt.answerJa);
      }
      for (const example of lesson.examples ?? []) {
        const value = example as unknown as Record<string, unknown>;
        expect(value.traditionalStatus).toBe('generated');
        expect(value.simplifiedStatus).toBe('generated');
      }
    }

    const transportLesson = packet.records.find(
      (record) => record.lesson.id === 'lesson-013',
    )?.lesson;
    const busExample = transportLesson?.examples?.find((example) =>
      example.traditional.includes('公車'),
    );
    expect(busExample?.simplified).toContain('公车');
    expect(busExample?.simplified).not.toContain('公交车');
    expect(busExample?.pinyin).toContain('gōngchē');
  });

  it('rejects unknown fields and invalid optional types in every nested lesson shape', async () => {
    const cases: Array<{
      name: string;
      mutate: (lesson: Lesson) => void;
      expectedError: RegExp;
    }> = [
      {
        name: 'section unknown field',
        mutate: (lesson) => {
          (lesson.sections?.[0] as unknown as Record<string, unknown>).heading =
            lesson.sections?.[0].headingJa;
        },
        expectedError: /sections\[0\] has unknown field 'heading'/,
      },
      {
        name: 'chunk unknown field',
        mutate: (lesson) => {
          (lesson.chunks[0] as unknown as Record<string, unknown>).noteJa =
            lesson.chunks[0].notesJa;
        },
        expectedError: /chunks\[0\] has unknown field 'noteJa'/,
      },
      {
        name: 'chunk invalid optional type',
        mutate: (lesson) => {
          (lesson.chunks[0] as unknown as Record<string, unknown>).notesJa = 7;
        },
        expectedError: /chunks\[0\]\.notesJa must be a string/,
      },
      {
        name: 'kanji bridge unknown field',
        mutate: (lesson) => {
          (lesson.kanjiBridgeNotes[0] as unknown as Record<string, unknown>).reading =
            lesson.kanjiBridgeNotes[0].jpReading;
        },
        expectedError: /kanjiBridgeNotes\[0\] has unknown field 'reading'/,
      },
      {
        name: 'sound focus unknown field',
        mutate: (lesson) => {
          (lesson.soundFocus[0] as unknown as Record<string, unknown>).pinyin =
            lesson.soundFocus[0].item;
        },
        expectedError: /soundFocus\[0\] has unknown field 'pinyin'/,
      },
      {
        name: 'example unknown field',
        mutate: (lesson) => {
          (lesson.examples?.[0] as unknown as Record<string, unknown>).translationJa =
            lesson.examples?.[0].japanese;
        },
        expectedError: /examples\[0\] has unknown field 'translationJa'/,
      },
      {
        name: 'example invalid optional type',
        mutate: (lesson) => {
          (lesson.examples?.[0] as unknown as Record<string, unknown>).simplified = 7;
        },
        expectedError: /examples\[0\]\.simplified must be a string/,
      },
      {
        name: 'review prompt unknown field',
        mutate: (lesson) => {
          (lesson.reviewPrompts[0] as unknown as Record<string, unknown>).optionsJa =
            lesson.reviewPrompts[0].distractorsJa;
        },
        expectedError: /reviewPrompts\[0\] has unknown field 'optionsJa'/,
      },
      {
        name: 'review prompt invalid optional type',
        mutate: (lesson) => {
          (lesson.reviewPrompts[0] as unknown as Record<string, unknown>)
            .distractorsJa = 'not-an-array';
        },
        expectedError: /reviewPrompts\[0\]\.distractorsJa must be an array/,
      },
    ];

    for (const testCase of cases) {
      await expect(
        build(undefined, ({ lessons }) => testCase.mutate(lessons[0])),
        testCase.name,
      ).rejects.toThrow(testCase.expectedError);
    }
  });

  it('fails closed when a candidate lesson has no kanji bridge note', async () => {
    await expect(
      build(undefined, ({ lessons }) => {
        lessons[0].kanjiBridgeNotes = [];
      }),
    ).rejects.toThrow(/at least one kanji bridge note/);
  });

  it('keeps one canonical pronunciation point per lesson', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const expectedSoundFocus = new Map([
      ['lesson-011', '壞了 huài le'],
      ['lesson-012', '託運 tuōyùn'],
      ['lesson-013', '這班車 zhè bān chē'],
      ['lesson-014', '哪一站 nǎ yí zhàn'],
      ['lesson-015', '兩位 liǎng wèi'],
      ['lesson-016', '花生 huāshēng'],
      ['lesson-017', '可以 kěyǐ'],
      ['lesson-018', '試穿 shìchuān'],
      ['lesson-019', '給我 gěi wǒ'],
      ['lesson-020', '寄放 jìfàng'],
      ['lesson-021', '不能用 bù néng yòng'],
      ['lesson-022', '走散 zǒusàn'],
      ['lesson-023', '救護車 jiùhùchē'],
      ['lesson-024', '你好 nǐ hǎo'],
    ]);

    expect(
      packet.records.map(({ lesson }) => ({
        id: lesson.id,
        soundFocus: lesson.soundFocus.map(({ item }) => item),
      })),
    ).toEqual(
      [...expectedSoundFocus].map(([id, item]) => ({
        id,
        soundFocus: [item],
      })),
    );
  });

  it('fails closed when a lesson has zero or multiple sound-focus points', async () => {
    await expect(
      build(undefined, ({ lessons }) => {
        lessons[0].soundFocus = [];
      }),
    ).rejects.toThrow(/exactly one sound-focus item/);

    await expect(
      build(undefined, ({ lessons }) => {
        lessons[0].soundFocus.push(structuredClone(lessons[1].soundFocus[0]));
      }),
    ).rejects.toThrow(/exactly one sound-focus item/);
  });

  it('extends airport arrival coverage with damaged baggage instead of location or missing-baggage semantics', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const sourceBundle = loadSourceBundle();
    const damagedBaggageLesson = packet.records.find(
      (record) => record.lesson.id === 'lesson-011',
    )?.lesson;
    const productionLocationLesson = sourceBundle.productionLessons.find(
      (lesson) => lesson.id === 'lesson-003',
    );
    const missingBaggageLesson = packet.records.find(
      (record) => record.lesson.id === 'lesson-012',
    )?.lesson;
    const semanticSurface = [
      damagedBaggageLesson?.canDoJa,
      damagedBaggageLesson?.coreSentence,
      damagedBaggageLesson?.travelTask,
    ].join(' ');
    const coverageMatrix = readFileSync(
      resolve(root, 'docs/content/taiwan-travel-wave-1-candidates.md'),
      'utf8',
    );

    expect(damagedBaggageLesson?.travelScenario).toBe('airport');
    expect(damagedBaggageLesson?.coreSentence).toBe(
      '我的行李箱壞了，可以幫我看看嗎？',
    );
    expect(semanticSurface).toMatch(/壊れている|壞了/);
    expect(semanticSurface).toMatch(/確認を頼める|幫我看看/);
    expect(semanticSurface).not.toMatch(/どこ|在哪裡|出てこない|還沒出來/);
    expect(productionLocationLesson?.coreSentence).toContain('在哪裡');
    expect(missingBaggageLesson?.coreSentence).toContain('還沒出來');
    expect(coverageMatrix).toContain('Report damaged checked baggage');
    expect(coverageMatrix).not.toContain('Find baggage claim');
  });

  it('explains 給我 third-tone sandhi while keeping lexical pinyin and grammatical chunk glosses', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const lessons = new Map(
      packet.records.map((record) => [record.lesson.id, record.lesson]),
    );
    const receiptLesson = lessons.get('lesson-019');
    expect(
      receiptLesson?.soundFocus.find((focus) => focus.item.startsWith('給我')),
    ).toEqual({
      item: '給我 gěi wǒ',
      noteJa:
        '第三声が二つ続くため、表記は gěi wǒ のままでも、発音では最初の gěi が第二声のように上がって géi wǒ となる。',
    });

    expect(
      lessons.get('lesson-018')?.chunks.find((chunk) => chunk.chunk === '這件嗎')
        ?.meaning,
    ).toBe('この一着を');
    expect(
      receiptLesson?.chunks.find((chunk) => chunk.chunk === '收據嗎')?.meaning,
    ).toBe('領収書を');
    expect(
      lessons.get('lesson-020')?.chunks.find((chunk) => chunk.chunk === '行李嗎')
        ?.meaning,
    ).toBe('荷物を');
    expect(
      packet.records.flatMap((record) => record.lesson.chunks).some((chunk) =>
        chunk.meaning.includes('をですか'),
      ),
    ).toBe(false);
  });

  it('uses Taiwan Traditional 託運 while preserving Simplified and lexical pinyin', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const baggageLesson = packet.records.find(
      (record) => record.lesson.id === 'lesson-012',
    )?.lesson;
    const baggageExample = baggageLesson?.examples?.find((example) =>
      example.traditional.includes('行李還沒出來'),
    );

    expect(JSON.stringify(baggageLesson)).not.toContain('托運');
    expect(baggageLesson?.coreSentence).toBe('我的託運行李還沒出來。');
    expect(baggageExample).toMatchObject({
      traditional: '我的託運行李還沒出來。',
      simplified: '我的托运行李还没出来。',
      pinyin: 'wǒ de tuōyùn xínglǐ hái méi chūlái.',
    });
  });

  it('uses a natural Taiwan restaurant pattern for asking about a party of two', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const seatingLesson = packet.records.find(
      (record) => record.lesson.id === 'lesson-015',
    )?.lesson;
    const seatingExample = seatingLesson?.examples?.[0];

    expect(JSON.stringify(seatingLesson)).not.toContain('有兩位的位子嗎');
    expect(seatingLesson?.learnerOutcomeJa).toContain('「兩位有位子嗎？」');
    expect(seatingLesson?.coreSentence).toBe('請問，兩位有位子嗎？');
    expect(seatingLesson?.sections?.[1].contentJa).toContain(
      '「人数＋位＋有位子嗎？」',
    );
    expect(seatingLesson?.chunks.map((chunk) => chunk.chunk)).toEqual([
      '請問',
      '兩位',
      '有位子嗎',
    ]);
    expect(seatingExample).toMatchObject({
      traditional: '請問，兩位有位子嗎？',
      simplified: '请问，两位有位子吗？',
      pinyin: 'qǐngwèn, liǎng wèi yǒu wèizi ma?',
    });
    expect(seatingLesson?.reviewPrompts[1].answerJa).toBe('有位子嗎？');
    expect(seatingLesson?.travelTask).toContain('請問，＋人数＋位有位子嗎？');
  });

  it('explains required 可以 third-tone sandhi while preserving lexical pinyin', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const takeawayLesson = packet.records.find(
      (record) => record.lesson.id === 'lesson-017',
    )?.lesson;

    expect(
      takeawayLesson?.soundFocus.find((focus) => focus.item === '可以 kěyǐ'),
    ).toEqual({
      item: '可以 kěyǐ',
      noteJa:
        '第三声が二つ続くため、表記は kěyǐ のままでも、発音では最初の kě が第二声のように上がって kéyǐ となる。',
    });
    expect(
      takeawayLesson?.examples
        ?.filter((example) => example.traditional.includes('可以'))
        .every((example) => example.pinyin.includes('kěyǐ')),
    ).toBe(true);
  });

  it('explains required 你好 third-tone sandhi while preserving lexical pinyin', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const socialLesson = packet.records.find(
      (record) => record.lesson.id === 'lesson-024',
    )?.lesson;

    expect(
      socialLesson?.soundFocus.find((focus) => focus.item === '你好 nǐ hǎo'),
    ).toEqual({
      item: '你好 nǐ hǎo',
      noteJa:
        '第三声が二つ続くため、表記は nǐ hǎo のままでも、発音では最初の nǐ が第二声のように上がって ní hǎo となる。',
    });
    expect(socialLesson?.examples?.[0].pinyin).toBe(
      'nǐ hǎo, wǒ jiào Tiánzhōng, cóng Rìběn lái.',
    );
  });

  it('fails closed on wrong order, duplicate source IDs, stale graph refs, and production overlap', async () => {
    await expect(
      build(undefined, ({ lessons }) => lessons.reverse()),
    ).rejects.toThrow(/lesson order/);

    await expect(
      build(undefined, ({ lessons }) => {
        lessons[1] = structuredClone(lessons[0]);
      }),
    ).rejects.toThrow(/duplicate content ref/);

    await expect(
      build(undefined, ({ paths }) => {
        paths[0].members[0] = {
          collection: 'lessons',
          type: 'lesson',
          id: 'lesson-does-not-exist',
        };
      }),
    ).rejects.toThrow(/stale member/);

    await expect(
      build(undefined, ({ lessons, productionLessons }) => {
        productionLessons.push(structuredClone(lessons[0]));
      }),
    ).rejects.toThrow(/overlaps production/);
  });

  it('rejects duplicate Can-Dos and core sentences within or before the wave', async () => {
    await expect(
      build(undefined, ({ lessons, productionLessons }) => {
        lessons[0].canDoJa = productionLessons[0].canDoJa;
      }),
    ).rejects.toThrow(/duplicates a production Can-Do/);

    await expect(
      build(undefined, ({ lessons }) => {
        lessons[1].coreSentence = lessons[0].coreSentence;
      }),
    ).rejects.toThrow(/duplicate candidate core sentence/);
  });

  it('fails closed on malformed, duplicate, stale, and source-path-drifted review refs', async () => {
    await expect(
      build((manifest) => {
        manifest.records[0].type = 'vocabulary' as 'lesson';
      }),
    ).rejects.toThrow(/collection\/type mismatch/);

    await expect(
      build((manifest) => {
        manifest.records[1] = structuredClone(manifest.records[0]);
      }),
    ).rejects.toThrow(/duplicate record/);

    await expect(
      build((manifest) => {
        manifest.records[0].id = 'lesson-does-not-exist';
      }),
    ).rejects.toThrow(/stale record reference/);

    await expect(
      build((manifest) => {
        manifest.records[0].sourcePath = 'data/examples/valid/lessons.json';
      }),
    ).rejects.toThrow(/unexpected source path/);
  });

  it('rejects scenario, review-state, and prompt-quality drift', async () => {
    await expect(
      build(undefined, ({ lessons }) => {
        lessons[0].travelScenario = 'food';
      }),
    ).rejects.toThrow(/scenario distribution/);

    await expect(
      build(undefined, ({ lessons }) => {
        lessons[0].reviewStatus = 'reviewed';
      }),
    ).rejects.toThrow(/must remain draft/);

    await expect(
      build(undefined, ({ lessons }) => {
        lessons[0].reviewPrompts[0].distractorsJa = [
          lessons[0].reviewPrompts[0].answerJa,
          lessons[0].reviewPrompts[0].answerJa,
        ];
      }),
    ).rejects.toThrow(/unambiguous distractors/);
  });

  it('binds semantic content to deterministic review versions and rejects graph drift', async () => {
    const first = await loadTaiwanTravelWave1ReviewPacket();
    const second = await loadTaiwanTravelWave1ReviewPacket();
    expect(second).toEqual(first);
    expect(first.reviewVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(first.records.every((record) => /^[0-9a-f]{64}$/.test(record.fingerprint))).toBe(true);

    const statusChanged = {
      ...first.records[0].lesson,
      reviewStatus: 'reviewed',
    };
    expect(await fingerprintTaiwanTravelWave1Lesson(statusChanged)).toBe(
      first.records[0].fingerprint,
    );

    const contentChanged = await build(undefined, ({ lessons }) => {
      lessons[0].titleJa += '（変更）';
    });
    expect(contentChanged.records[0].fingerprint).not.toBe(
      first.records[0].fingerprint,
    );
    expect(contentChanged.reviewVersion).not.toBe(first.reviewVersion);

    await expect(
      build(undefined, ({ paths }) => {
        paths[0].members = [...paths[0].members].reverse();
      }),
    ).rejects.toThrow(/graph member order/);
  });

  it('rejects unknown candidate graph-path fields before normalization', async () => {
    await expect(
      build(undefined, ({ paths }) => {
        const path = paths[0] as unknown as Record<string, unknown>;
        path.reviewVersion = 'ignored-by-normalizer';
      }),
    ).rejects.toThrow(
      /candidate graph path 'candidate-taiwan-travel-wave-1' has unknown field 'reviewVersion'/,
    );
  });

  it('rejects unknown candidate graph-member fields before normalization', async () => {
    await expect(
      build(undefined, ({ paths }) => {
        const member = paths[0].members[0] as unknown as Record<string, unknown>;
        member.sourcePath = TAIWAN_TRAVEL_WAVE1_LESSONS_PATH;
      }),
    ).rejects.toThrow(
      /candidate graph member 'lesson-011' has unknown field 'sourcePath'/,
    );
  });

  it('renders the exact committed pending-human-review packet', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const rendered = renderTaiwanTravelWave1ReviewPacket(packet);
    const committed = readFileSync(resolve(root, TAIWAN_TRAVEL_WAVE1_PACKET_PATH), 'utf8');

    expect(rendered).toBe(committed);
    expect(rendered).toContain(
      '**Overall review outcome:** {{accepted | rejected | needs-changes}}',
    );
    expect(rendered).toContain(
      '**Current repository review state:** pending-human-review; no overall human decision is recorded; promotion is not allowed.',
    );
    expect(rendered).toContain(
      '| Natural Taiwan Mandarin | human-language-reviewer | not-reviewed | {{natural-taiwan-mandarin__human-language-reviewer__IDENTITY}} |',
    );
    expect(rendered).not.toContain('**Reviewer identity:**');
    expect(rendered).not.toContain('**Reviewer role:**');
    expect(rendered).not.toContain('**Review date:**');
    expect(rendered).toContain(
      'Each required role records its own outcome independently.',
    );
    expect(rendered).toContain(
      'Mixed outcomes in a multi-role dimension are retained and remain non-promotable',
    );
    expect(rendered).toContain(
      '| Natural Taiwan Mandarin | human-language-reviewer | not-reviewed | {{natural-taiwan-mandarin__human-language-reviewer__IDENTITY}} | {{natural-taiwan-mandarin__human-language-reviewer__YYYY-MM-DD}} | {{natural-taiwan-mandarin__human-language-reviewer__FINDINGS_OR_None.}} |',
    );
    expect(rendered).toContain(
      '| Natural Taiwan Mandarin | human-regional-reviewer | not-reviewed | {{natural-taiwan-mandarin__human-regional-reviewer__IDENTITY}} | {{natural-taiwan-mandarin__human-regional-reviewer__YYYY-MM-DD}} | {{natural-taiwan-mandarin__human-regional-reviewer__FINDINGS_OR_None.}} |',
    );
    expect(rendered).toContain('human language, teaching, and regional review remain pending');
    for (const record of packet.records) {
      expect(rendered).toContain(record.lesson.id);
      expect(rendered).toContain(record.fingerprint);
    }
  });

  it('rebuild command runs through Node, writes only its target, and is idempotent', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'chabiko-wave1-review-'));
    const outputPath = join(temporaryDirectory, 'packet.md');
    const rendererPath = 'scripts/render-taiwan-travel-wave1-review-packet.ts';
    const commandArguments = [
      rendererPath,
      '--root',
      root,
      '--output',
      outputPath,
    ];
    try {
      const workflow = readFileSync(
        resolve(root, 'docs/content/taiwan-travel-wave-1-candidates.md'),
        'utf8',
      );
      expect(workflow).toContain(`\`\`\`bash\nnode ${rendererPath}\n\`\`\``);
      execFileSync(process.execPath, commandArguments, { cwd: root, stdio: 'pipe' });
      const first = readFileSync(outputPath, 'utf8');
      execFileSync(process.execPath, commandArguments, { cwd: root, stdio: 'pipe' });
      expect(readFileSync(outputPath, 'utf8')).toBe(first);
      expect(first).toBe(
        readFileSync(resolve(root, TAIWAN_TRAVEL_WAVE1_PACKET_PATH), 'utf8'),
      );
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('rebuild command fails closed before replacing output when shared schema validation fails', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'chabiko-wave1-invalid-'));
    const outputPath = join(temporaryRoot, 'packet.md');
    const sentinel = 'preexisting packet must remain byte-identical\n';
    const requiredPaths = [
      TAIWAN_TRAVEL_WAVE1_LESSONS_PATH,
      TAIWAN_TRAVEL_WAVE1_GRAPH_PATH,
      TAIWAN_TRAVEL_WAVE1_SCOPE_PATH,
      'data/examples/valid/lessons.json',
    ];

    try {
      for (const path of requiredPaths) {
        const destination = resolve(temporaryRoot, path);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(resolve(root, path), destination);
      }

      const invalidBundle = readJson<{ lessons: Lesson[] }>(
        resolve(temporaryRoot, TAIWAN_TRAVEL_WAVE1_LESSONS_PATH),
      );
      invalidBundle.lessons[0].level = 'advanced';
      writeFileSync(
        resolve(temporaryRoot, TAIWAN_TRAVEL_WAVE1_LESSONS_PATH),
        `${JSON.stringify(invalidBundle, null, 2)}\n`,
        'utf8',
      );
      writeFileSync(outputPath, sentinel, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'scripts/render-taiwan-travel-wave1-review-packet.ts',
          '--root',
          temporaryRoot,
          '--output',
          outputPath,
        ],
        { cwd: root, encoding: 'utf8' },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("level: 'advanced' is not valid");
      expect(readFileSync(outputPath, 'utf8')).toBe(sentinel);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rebuild command rejects malformed nested lesson fields without replacing output', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'chabiko-wave1-nested-'));
    const outputPath = join(temporaryRoot, 'packet.md');
    const sentinel = 'nested drift must not replace this packet\n';
    const requiredPaths = [
      TAIWAN_TRAVEL_WAVE1_LESSONS_PATH,
      TAIWAN_TRAVEL_WAVE1_GRAPH_PATH,
      TAIWAN_TRAVEL_WAVE1_SCOPE_PATH,
      'data/examples/valid/lessons.json',
    ];

    try {
      for (const path of requiredPaths) {
        const destination = resolve(temporaryRoot, path);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(resolve(root, path), destination);
      }

      const invalidBundle = readJson<{ lessons: Lesson[] }>(
        resolve(temporaryRoot, TAIWAN_TRAVEL_WAVE1_LESSONS_PATH),
      );
      (invalidBundle.lessons[0].chunks[0] as unknown as Record<string, unknown>)
        .notesJa = 7;
      writeFileSync(
        resolve(temporaryRoot, TAIWAN_TRAVEL_WAVE1_LESSONS_PATH),
        `${JSON.stringify(invalidBundle, null, 2)}\n`,
        'utf8',
      );
      writeFileSync(outputPath, sentinel, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'scripts/render-taiwan-travel-wave1-review-packet.ts',
          '--root',
          temporaryRoot,
          '--output',
          outputPath,
        ],
        { cwd: root, encoding: 'utf8' },
      );

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        'root.lessons[0].chunks[0].notesJa must be str, got int',
      );
      expect(readFileSync(outputPath, 'utf8')).toBe(sentinel);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rebuild command rejects unknown graph-root fields without replacing output', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'chabiko-wave1-unknown-'));
    const outputPath = join(temporaryRoot, 'packet.md');
    const sentinel = 'preexisting packet must remain byte-identical\n';
    const requiredPaths = [
      TAIWAN_TRAVEL_WAVE1_LESSONS_PATH,
      TAIWAN_TRAVEL_WAVE1_GRAPH_PATH,
      TAIWAN_TRAVEL_WAVE1_SCOPE_PATH,
      'data/examples/valid/lessons.json',
    ];

    try {
      for (const path of requiredPaths) {
        const destination = resolve(temporaryRoot, path);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(resolve(root, path), destination);
      }

      const invalidGraph = readJson<Record<string, unknown>>(
        resolve(temporaryRoot, TAIWAN_TRAVEL_WAVE1_GRAPH_PATH),
      );
      invalidGraph.graphVersion = 'ignored-by-loader';
      writeFileSync(
        resolve(temporaryRoot, TAIWAN_TRAVEL_WAVE1_GRAPH_PATH),
        `${JSON.stringify(invalidGraph, null, 2)}\n`,
        'utf8',
      );
      writeFileSync(outputPath, sentinel, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'scripts/render-taiwan-travel-wave1-review-packet.ts',
          '--root',
          temporaryRoot,
          '--output',
          outputPath,
        ],
        { cwd: root, encoding: 'utf8' },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "candidate graph has unknown field 'graphVersion'",
      );
      expect(readFileSync(outputPath, 'utf8')).toBe(sentinel);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rebuild command rejects reviewer-role and outcome-contract drift without replacing output', () => {
    const cases: Array<{
      name: string;
      mutate: (manifest: TaiwanTravelWave1ReviewScopeManifest) => void;
      expectedError: RegExp;
    }> = [
      {
        name: 'missing required role',
        mutate: (manifest) => {
          manifest.dimensions[0].reviewerRoles.pop();
        },
        expectedError: /reviewer roles drifted for dimension 'natural-taiwan-mandarin'/,
      },
      {
        name: 'duplicate required role',
        mutate: (manifest) => {
          manifest.dimensions[0].reviewerRoles[1] = 'human-language-reviewer';
        },
        expectedError: /reviewer roles drifted for dimension 'natural-taiwan-mandarin'/,
      },
      {
        name: 'accepted role with incomplete evidence',
        mutate: (manifest) => {
          manifest.dimensions[0].reviewerEvidence[0].outcome = 'accepted';
        },
        expectedError:
          /accepted reviewer evidence 'natural-taiwan-mandarin:human-language-reviewer' requires complete reviewer evidence/,
      },
      {
        name: 'conflicting legacy shared outcome',
        mutate: (manifest) => {
          const dimension = manifest.dimensions[7];
          dimension.reviewerEvidence[0] = {
            ...dimension.reviewerEvidence[0],
            outcome: 'accepted',
            reviewerIdentity: '@source-reviewer',
            reviewDate: '2026-08-29',
            findings: 'Source metadata accepted.',
          };
          const legacyDimension = dimension as unknown as Record<string, unknown>;
          legacyDimension.outcome = 'rejected';
        },
        expectedError:
          /dimension 'source-and-script-provenance' has unknown field 'outcome'/,
      },
    ];

    for (const testCase of cases) {
      const temporaryRoot = mkdtempSync(join(tmpdir(), 'chabiko-wave1-role-'));
      const outputPath = join(temporaryRoot, 'packet.md');
      const sentinel = `${testCase.name}: preexisting packet must remain byte-identical\n`;
      const requiredPaths = [
        TAIWAN_TRAVEL_WAVE1_LESSONS_PATH,
        TAIWAN_TRAVEL_WAVE1_GRAPH_PATH,
        TAIWAN_TRAVEL_WAVE1_SCOPE_PATH,
        'data/examples/valid/lessons.json',
      ];

      try {
        for (const path of requiredPaths) {
          const destination = resolve(temporaryRoot, path);
          mkdirSync(dirname(destination), { recursive: true });
          copyFileSync(resolve(root, path), destination);
        }
        const manifest = readJson<TaiwanTravelWave1ReviewScopeManifest>(
          resolve(temporaryRoot, TAIWAN_TRAVEL_WAVE1_SCOPE_PATH),
        );
        testCase.mutate(manifest);
        writeFileSync(
          resolve(temporaryRoot, TAIWAN_TRAVEL_WAVE1_SCOPE_PATH),
          `${JSON.stringify(manifest, null, 2)}\n`,
          'utf8',
        );
        writeFileSync(outputPath, sentinel, 'utf8');

        const result = spawnSync(
          process.execPath,
          [
            'scripts/render-taiwan-travel-wave1-review-packet.ts',
            '--root',
            temporaryRoot,
            '--output',
            outputPath,
          ],
          { cwd: root, encoding: 'utf8' },
        );

        expect(result.status, testCase.name).not.toBe(0);
        expect(result.stderr, testCase.name).toMatch(testCase.expectedError);
        expect(readFileSync(outputPath, 'utf8'), testCase.name).toBe(sentinel);
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    }
  });
});
