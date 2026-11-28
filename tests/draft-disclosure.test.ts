import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { Window } from 'happy-dom';
import { expect, it, vi } from 'vitest';
import { loadAllRenderableLessons } from '../src/content/loadLessons';
import LessonPage from '../src/pages/lessons/[id].astro';
import RoleplayPage from '../src/pages/roleplay/index.astro';

const site = 'https://chabiko.pages.dev';

vi.mock(import('../src/content/loadRoleplayCards'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadPrelaunchRoleplayCards: () => actual.loadPrelaunchRoleplayCards().map((card) =>
      card.id === 'roleplay-hotel-001' ? { ...card, reviewStatus: 'reviewed' as const } : card,
    ),
  };
});

it.each([
  { id: 'lesson-024', reviewStatus: 'draft', notice: true },
  { id: 'lesson-001', reviewStatus: 'reviewed', notice: false },
])('shows the review notice for $id only when draft', async ({ id, reviewStatus, notice }) => {
  const lessons = loadAllRenderableLessons();
  const index = lessons.findIndex((lesson) => lesson.id === id);
  const lesson = lessons[index];
  expect(lesson.reviewStatus).toBe(reviewStatus);

  const container = await AstroContainer.create({ astroConfig: { site } });
  const html = await container.renderToString(LessonPage, {
    request: new Request(`${site}/lessons/${id}/`),
    props: { lesson, lessonNumber: index + 1 },
  });
  const page = new Window().document;
  page.body.innerHTML = html;
  expect(page.querySelector('.lesson-intro')!.textContent!.includes('未レビュー')).toBe(notice);
});

it('labels only draft roleplay cards in the scenario chooser', async () => {
  const container = await AstroContainer.create({ astroConfig: { site } });
  const html = await container.renderToString(RoleplayPage, {
    request: new Request(`${site}/roleplay/`),
  });
  const page = new Window().document;
  page.body.innerHTML = html;
  const cards = page.querySelectorAll('[data-roleplay-card-select]');
  expect(cards).toHaveLength(6);
  for (const card of cards) {
    const id = card.getAttribute('data-roleplay-card-select');
    expect(card.textContent!.includes('未レビュー'), id ?? undefined).toBe(id !== 'roleplay-hotel-001');
  }
  expect(page.querySelector('[data-roleplay-active]')!.hasAttribute('hidden')).toBe(true);
  expect(page.querySelector('[data-roleplay-root]')!.textContent).not.toContain('我是來台灣旅遊的');
});
