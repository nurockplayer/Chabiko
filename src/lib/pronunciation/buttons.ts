import { canPlayPronunciation, playPronunciation, stopPronunciation } from './player';

let installed = false;
let activeButton: HTMLButtonElement | undefined;
let generation = 0;
let activeText = '';
let activeLang = '';

export function refreshPronunciationButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-pronunciation-button]').forEach((button) => {
    const text = button.dataset.pronunciationText ?? '';
    const lang = button.dataset.pronunciationLang ?? 'zh-TW';
    button.hidden = !canPlayPronunciation(text, lang);
    const label = `${button.dataset.pronunciationSlow === 'true' ? 'ゆっくり発音を聞く' : '発音を聞く'}：${text}`;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  });
}

/** Every control gets a live status region, including buttons created at runtime. */
function ensureStatus(button: HTMLButtonElement): HTMLElement {
  const existing = button.parentElement?.querySelector<HTMLElement>('[data-pronunciation-status]');
  if (existing) return existing;
  const status = document.createElement('span');
  status.className = 'pronunciation-status';
  status.setAttribute('data-pronunciation-status', '');
  status.setAttribute('role', 'status');
  status.setAttribute('lang', 'ja');
  button.insertAdjacentElement('afterend', status);
  return status;
}

function resetButton(): void {
  if (activeButton) {
    activeButton.removeAttribute('aria-busy');
    activeButton.removeAttribute('data-playing');
    activeButton = undefined;
  }
}

export function installPronunciationButtons(): void {
  if (installed) { refreshPronunciationButtons(); return; }
  installed = true;
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-pronunciation-button]') : null;
    if (!button || button.hidden || button.disabled) return;
    const token = ++generation;
    resetButton();
    activeButton = button;
    activeText = button.dataset.pronunciationText ?? '';
    activeLang = button.dataset.pronunciationLang ?? 'zh-TW';
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('data-playing', 'true');
    const status = ensureStatus(button);
    status.textContent = '';
    // Keep this call in the click stack for mobile Safari's user activation.
    void playPronunciation(button.dataset.pronunciationText ?? '', {
      lang: button.dataset.pronunciationLang ?? 'zh-TW',
      rate: button.dataset.pronunciationSlow === 'true' ? 0.65 : 0.9,
    }).then((success) => {
      if (token !== generation) return;
      resetButton();
      if (!success) status.textContent = '音声を再生できませんでした。もう一度お試しください。';
    });
  });
  const stop = () => { generation++; stopPronunciation(); resetButton(); };
  document.addEventListener('astro:before-swap', stop);
  window.addEventListener('pagehide', stop);
  document.addEventListener('astro:page-load', refreshPronunciationButtons);
  document.addEventListener('pronunciation:refresh', refreshPronunciationButtons);
  window.speechSynthesis?.addEventListener('voiceschanged', refreshPronunciationButtons);
  new MutationObserver(() => {
    if (activeButton && (!activeButton.isConnected || activeButton.closest('[hidden]')
      || activeButton.dataset.pronunciationText !== activeText
      || activeButton.dataset.pronunciationLang !== activeLang)) stop();
    refreshPronunciationButtons();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pronunciation-text', 'data-pronunciation-lang'] });
  refreshPronunciationButtons();
}
