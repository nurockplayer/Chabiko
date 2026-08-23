export function mountV2ReferenceAudio(root: HTMLElement): void {
  if (root.dataset.v2AudioMounted === 'true') return;
  root.dataset.v2AudioMounted = 'true';

  const button = root.querySelector<HTMLButtonElement>('[data-v2-audio-button]');
  const status = root.querySelector<HTMLElement>('[data-v2-audio-status]');
  const phrase = root.dataset.v2AudioPhrase?.trim();
  if (!button || !status || !phrase) return;

  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    button.disabled = true;
    status.textContent = 'このブラウザでは音声を再生できません。';
    status.dataset.visible = 'true';
    return;
  }

  button.addEventListener('click', () => {
    delete status.dataset.visible;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = 'zh-TW';
    utterance.rate = 0.78;
    utterance.pitch = 1;
    const taiwanVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase() === 'zh-tw');
    if (taiwanVoice) utterance.voice = taiwanVoice;

    utterance.addEventListener('start', () => {
      button.dataset.playing = 'true';
      delete status.dataset.visible;
      status.textContent = '再生中です。';
    });
    utterance.addEventListener('end', () => {
      delete button.dataset.playing;
      delete status.dataset.visible;
      status.textContent = '音声を再生しました。';
    });
    utterance.addEventListener('error', () => {
      delete button.dataset.playing;
      status.textContent = '音声を再生できませんでした。';
      status.dataset.visible = 'true';
    });
    window.speechSynthesis.speak(utterance);
  });
}
