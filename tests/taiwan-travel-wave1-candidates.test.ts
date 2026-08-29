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

  it('keeps every rich lesson complete and every prompt mechanically unambiguous', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();

    for (const { lesson } of packet.records) {
      expect(lesson.sections?.length).toBeGreaterThanOrEqual(2);
      expect(lesson.chunks.length).toBeGreaterThanOrEqual(3);
      expect(lesson.soundFocus.length).toBeGreaterThanOrEqual(2);
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

  it('renders the exact committed pending-human-review packet', async () => {
    const packet = await loadTaiwanTravelWave1ReviewPacket();
    const rendered = renderTaiwanTravelWave1ReviewPacket(packet);
    const committed = readFileSync(resolve(root, TAIWAN_TRAVEL_WAVE1_PACKET_PATH), 'utf8');

    expect(rendered).toBe(committed);
    expect(rendered).toContain('**Overall review outcome:** pending-human-review');
    expect(rendered).toContain('**Reviewer identity:** {{HUMAN_REVIEWER_IDENTITY}}');
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
});
