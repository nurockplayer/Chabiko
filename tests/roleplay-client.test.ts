// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { mountRoleplayRehearsal } from '../src/client/roleplayRehearsal';

function fixture(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <section data-roleplay-selection><button data-roleplay-card-select="roleplay-airport-001"><span data-roleplay-card-status></span></button></section>
    <section data-roleplay-guidance hidden><h2 data-roleplay-guidance-title></h2><p data-roleplay-guidance-goal></p><p data-roleplay-guidance-copy></p><button data-roleplay-start></button><button data-roleplay-back></button></section>
    <section data-roleplay-active hidden><h2 data-roleplay-active-title></h2><p data-roleplay-progress></p><p data-roleplay-active-hint></p><ol data-roleplay-lines></ol><button data-roleplay-reveal></button><button data-roleplay-next hidden></button></section>
    <section data-roleplay-complete hidden><button data-roleplay-restart></button></section>
    <template data-roleplay-card-template="roleplay-airport-001">
      ${[0, 1, 2, 3, 4, 5].map((index) => `<li data-roleplay-line-template data-line-index="${index}" data-speaker="${index % 2 ? 'partner' : 'learner'}"><span data-roleplay-speaker></span><span data-roleplay-script></span><span data-roleplay-pinyin></span><span data-roleplay-japanese></span><span data-roleplay-fallback></span></li>`).join('')}
    </template>`;
  document.body.append(root);
  return root;
}

afterEach(() => document.body.replaceChildren());

describe('roleplay client', () => {
  it('keeps learner answers, pinyin, and Japanese out of initial markup and reveals them explicitly', () => {
    const root = fixture();
    const sourceBeforeMount = root.innerHTML;
    expect(sourceBeforeMount).not.toContain('我是來台灣旅遊的');
    const controller = mountRoleplayRehearsal(root);
    root.querySelector<HTMLButtonElement>('[data-roleplay-card-select]')!.click();
    root.querySelector<HTMLButtonElement>('[data-roleplay-start]')!.click();
    expect(root.textContent).not.toContain('我是來台灣旅遊的');
    root.querySelector<HTMLButtonElement>('[data-roleplay-reveal]')!.click();
    expect(root.textContent).toContain('我是來台灣旅遊的');
    expect(root.textContent).toContain('台湾へ旅行に来ました。');
    controller.dispose();
  });

  it('allows direct restart and tears down listeners without changing progress keys', () => {
    const root = fixture();
    const controller = mountRoleplayRehearsal(root);
    controller.dispose();
    root.querySelector<HTMLButtonElement>('[data-roleplay-card-select]')!.click();
    expect(root.querySelector('[data-roleplay-guidance]')?.hasAttribute('hidden')).toBe(true);
  });
});
