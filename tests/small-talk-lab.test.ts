// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountSmallTalkLab } from '../src/client/smallTalkLab';

function markup(): string {
  return `
    <div data-small-talk-lab-root>
      <section data-small-talk-mission>
        <h1 data-small-talk-heading tabindex="-1"></h1>
        <p data-small-talk-mission-copy></p>
        <p data-small-talk-premise></p>
        <p data-small-talk-setting></p>
        <button type="button" data-small-talk-start>会話を始める</button>
      </section>
      <section data-small-talk-encounter hidden>
        <p data-small-talk-stage></p>
        <p data-small-talk-progress></p>
        <h2 data-small-talk-encounter-heading tabindex="-1"></h2>
        <div data-small-talk-cue>
          <p data-small-talk-cue-zh></p>
          <p data-small-talk-cue-pinyin></p>
          <p data-small-talk-cue-ja></p>
        </div>
        <p data-small-talk-opportunity></p>
        <div data-small-talk-strategies></div>
      </section>
      <section data-small-talk-complete hidden>
        <h2 data-small-talk-complete-heading tabindex="-1">会話の証拠を振り返る</h2>
        <p data-small-talk-terminal-zh></p>
        <p data-small-talk-terminal-pinyin></p>
        <p data-small-talk-terminal-ja></p>
        <ol data-small-talk-evidence></ol>
        <div data-small-talk-passport></div>
        <button type="button" data-small-talk-replay hidden>条件を変えてもう一度</button>
        <button type="button" data-small-talk-transfer hidden>中秋節の場面へ転用する</button>
      </section>
      <button type="button" data-small-talk-reset>最初からやり直す</button>
      <p data-small-talk-status role="status" aria-live="polite"></p>
    </div>`;
}

function click(selector: string): void {
  const button = document.querySelector<HTMLButtonElement>(selector);
  expect(button, `missing ${selector}`).not.toBeNull();
  button?.click();
}

describe('Small Talk Lab learner adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = markup();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
  });

  it('runs the baseline, recap, replay, and seasonal transfer without persistent state', () => {
    localStorage.setItem('chabiko_completed_lessons', 'sentinel');
    sessionStorage.setItem('small-talk-sentinel', 'untouched');
    const root = document.querySelector<HTMLElement>('[data-small-talk-lab-root]');
    expect(root).not.toBeNull();
    const controller = mountSmallTalkLab(root!);

    expect(controller.getJourney()).toBe('mission');
    expect(document.querySelector('[data-small-talk-mission]')?.hasAttribute('hidden')).toBe(false);
    expect(document.body.textContent).toContain('週末の経験を二つの場面でつなぎ');

    click('[data-small-talk-start]');
    expect(controller.getJourney()).toBe('encounter');
    expect(document.body.textContent).toContain('我上週末去北投泡溫泉');
    expect(document.querySelectorAll('[data-small-talk-strategy]')).toHaveLength(3);

    click('[data-small-talk-strategy="weekend-medium-connect-experience"]');
    expect(document.body.textContent).toContain('有，泡完以後舒服多了');
    click('[data-small-talk-strategy="weekend-medium-follow-detail"]');
    expect(controller.getJourney()).toBe('complete');
    expect(document.querySelectorAll('[data-small-talk-evidence-item]')).toHaveLength(2);
    expect(document.body.textContent).toContain('最近の週末を二段階で話す');
    expect(document.querySelector<HTMLButtonElement>('[data-small-talk-replay]')?.hidden).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('[data-small-talk-transfer]')?.hidden).toBe(true);

    click('[data-small-talk-replay]');
    expect(document.body.textContent).toContain('我上週末沒出門');
    click('[data-small-talk-strategy="weekend-medium-home-share-movie"]');
    click('[data-small-talk-strategy="weekend-medium-home-follow-genre"]');
    expect(document.querySelector<HTMLButtonElement>('[data-small-talk-transfer]')?.hidden).toBe(false);

    click('[data-small-talk-transfer]');
    expect(controller.getJourney()).toBe('encounter');
    expect(document.body.textContent).toContain('我還沒決定中秋節要不要回家');
    expect(localStorage.getItem('chabiko_completed_lessons')).toBe('sentinel');
    expect(sessionStorage.getItem('small-talk-sentinel')).toBe('untouched');

    controller.dispose();
  });

  it('renders repair as an authored conversational move and can return to the thread', () => {
    const root = document.querySelector<HTMLElement>('[data-small-talk-lab-root]')!;
    const controller = mountSmallTalkLab(root);
    click('[data-small-talk-start]');
    click('[data-small-talk-strategy="weekend-medium-connect-experience"]');
    click('[data-small-talk-strategy="weekend-medium-follow-detail"]');
    click('[data-small-talk-replay]');
    click('[data-small-talk-strategy="weekend-medium-home-share-movie"]');
    click('[data-small-talk-strategy="weekend-medium-home-follow-genre"]');
    click('[data-small-talk-transfer]');
    click('[data-small-talk-strategy="mid-autumn-share-preference"]');
    click('[data-small-talk-strategy="mid-autumn-repair-kaorou"]');

    expect(controller.getJourney()).toBe('encounter');
    expect(document.body.textContent).toContain('聞き返しは、会話を戻すための選択です');
    expect(document.body.textContent).toContain('就是大家一起烤東西吃');
    click('[data-small-talk-strategy="mid-autumn-confirm-and-return"]');
    expect(controller.getJourney()).toBe('complete');
    expect(document.body.textContent).toContain('聞き返して会話へ戻る');
    expect(document.body.textContent).toContain('中秋節前の予定と食べ物の雑談');

    controller.dispose();
  });

  it('reset rebuilds the mission and remount does not restore progress', () => {
    const root = document.querySelector<HTMLElement>('[data-small-talk-lab-root]')!;
    const controller = mountSmallTalkLab(root);
    click('[data-small-talk-start]');
    click('[data-small-talk-reset]');
    expect(controller.getJourney()).toBe('mission');
    expect(document.activeElement).toBe(document.querySelector('[data-small-talk-start]'));
    controller.dispose();

    const remounted = mountSmallTalkLab(root);
    expect(remounted.getJourney()).toBe('mission');
    expect(document.querySelector('[data-small-talk-encounter]')?.hasAttribute('hidden')).toBe(true);
    remounted.dispose();
  });
});
