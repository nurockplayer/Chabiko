/**
 * Mount the basic-vocabulary preview flashcard session.
 * Self-contained, no external dependencies.
 */

export interface PreviewWord {
  id: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  japanese: string;
}

export function mountPreviewSession(data: { words: PreviewWord[] }): void {
  const WORDS = data.words;
  let currentIndex = 0;
  let revealed = false;
  const results: string[] = [];

  const $ = <T extends HTMLElement>(id: string): T | null =>
    document.getElementById(id) as T | null;

  const frontZh          = $<HTMLElement>('frontZh')!;
  const backPinyin       = $<HTMLElement>('backPinyin');
  const backJa           = $<HTMLElement>('backJa');
  const backTraditional  = $<HTMLElement>('backTraditional');
  const mockImage        = $<HTMLImageElement>('mockImage')!;
  const imgFallback      = $<HTMLElement>('imgFallback')!;
  const flashcardInner   = $<HTMLElement>('flashcardInner')!;
  const flashcardBack    = $<HTMLElement>('flashcardBack');
  const tapHint          = $<HTMLElement>('tapHint');
  const progressFill     = $<HTMLElement>('progressFill');
  const progressCount    = $<HTMLElement>('progressCount');
  const assessmentGroup  = $<HTMLElement>('assessmentGroup');
  const assessmentStrip  = $<HTMLElement>('assessmentStrip');
  const completionScreen = $<HTMLElement>('completionScreen');
  const statKnew  = $<HTMLElement>('statKnew');
  const statShaky = $<HTMLElement>('statShaky');
  const statRetry = $<HTMLElement>('statRetry');

  if (!frontZh || !mockImage || !flashcardInner) return;

  function loadImage(word: PreviewWord): void {
    const url = 'https://picsum.photos/seed/' + word.id + '/960/720';
    mockImage.src = url;
    mockImage.alt = 'MOCK IMAGE — ' + word.simplified;
    if (imgFallback) imgFallback.style.display = 'flex';
    mockImage.style.display = 'none';
    mockImage.onload = function () {
      if (imgFallback) imgFallback.style.display = 'none';
      mockImage.style.display = 'block';
    };
    mockImage.onerror = function () {
      if (imgFallback) imgFallback.style.display = 'flex';
      mockImage.style.display = 'none';
    };
  }

  function renderCard(): void {
    const w = WORDS[currentIndex];
    frontZh.textContent = w.simplified;
    if (backPinyin) backPinyin.textContent = w.pinyin;
    if (backJa) backJa.textContent = w.japanese;
    if (backTraditional) backTraditional.textContent = w.traditional;
    loadImage(w);

    if (flashcardBack) flashcardBack.classList.remove('flashcard-back--visible');
    if (flashcardBack) flashcardBack.removeAttribute('tabindex');
    revealed = false;
    if (tapHint) tapHint.classList.remove('flashcard__hint--hidden');
    if (assessmentGroup) assessmentGroup.classList.add('assessment-group--hidden');
    flashcardInner.setAttribute('role', 'button');
    flashcardInner.setAttribute('tabindex', '0');
    flashcardInner.setAttribute('aria-labelledby', 'frontZh');
    flashcardInner.setAttribute('aria-describedby', 'tapHint');

    updateProgress();
  }

  function revealCard(): void {
    if (revealed) return;
    if (assessmentStrip) {
      assessmentStrip.className = 'assessment-strip assessment-strip--empty';
      assessmentStrip.textContent = '';
    }
    revealed = true;
    if (flashcardBack) flashcardBack.classList.add('flashcard-back--visible');
    tapHint?.classList.add('flashcard__hint--hidden');
    if (assessmentGroup) assessmentGroup.classList.remove('assessment-group--hidden');
    flashcardInner.removeAttribute('role');
    flashcardInner.removeAttribute('tabindex');
    flashcardInner.setAttribute('aria-labelledby', 'backPinyin backJa backTraditional');
    flashcardInner.removeAttribute('aria-describedby');
    if (flashcardBack) {
      flashcardBack.setAttribute('tabindex', '-1');
      flashcardBack.focus();
    }
  }

  function assess(outcome: string): void {
    if (!revealed) return;
    results.push(outcome);
    currentIndex++;

    const labels: Record<string, string> = {
      retry: 'もう一度 — 忘れた',
      shaky: 'まだ曖昧 — もう少し',
      knew: '覚えた — 大丈夫',
    };
    const classes: Record<string, string> = {
      retry: 'assessment-strip assessment-strip--retry',
      shaky: 'assessment-strip assessment-strip--shaky',
      knew: 'assessment-strip assessment-strip--knew',
    };
    if (assessmentStrip) {
      assessmentStrip.className = classes[outcome] || classes.shaky;
      assessmentStrip.textContent = labels[outcome] || outcome;
    }

    if (currentIndex >= WORDS.length) {
      showCompletion();
    } else {
      renderCard();
      flashcardInner.focus();
    }
  }

  function updateProgress(): void {
    const done = results.length;
    const pct = (done / WORDS.length) * 100;
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressCount) progressCount.textContent = done + ' / ' + WORDS.length;
  }

  function showCompletion(): void {
    const flashcard = document.querySelector('.flashcard') as HTMLElement | null;
    if (flashcard) flashcard.style.display = 'none';
    tapHint?.classList.add('flashcard__hint--hidden');
    if (assessmentGroup) assessmentGroup.classList.add('assessment-group--hidden');
    if (assessmentStrip) {
      assessmentStrip.className = 'assessment-strip assessment-strip--empty';
      assessmentStrip.textContent = '';
    }
    if (completionScreen) completionScreen.classList.add('completion--visible');

    const c: Record<string, number> = { retry: 0, shaky: 0, knew: 0 };
    results.forEach(function (r) { if (r in c) c[r]++; });
    if (statRetry) statRetry.textContent = String(c.retry);
    if (statShaky) statShaky.textContent = String(c.shaky);
    if (statKnew) statKnew.textContent = String(c.knew);

    updateProgress();
    if (progressFill) progressFill.style.width = '100%';
    if (progressCount) progressCount.textContent = WORDS.length + ' / ' + WORDS.length;

    const completionTitle = $<HTMLElement>('completionTitle');
    if (completionTitle) completionTitle.focus();
  }

  function restart(): void {
    currentIndex = 0;
    results.length = 0;
    if (completionScreen) completionScreen.classList.remove('completion--visible');
    const flashcard = document.querySelector('.flashcard') as HTMLElement | null;
    if (flashcard) flashcard.style.display = 'flex';
    if (assessmentStrip) {
      assessmentStrip.className = 'assessment-strip assessment-strip--empty';
      assessmentStrip.textContent = '';
    }
    renderCard();
    flashcardInner.focus();
  }

  // Events
  flashcardInner.addEventListener('click', function () {
    if (completionScreen?.classList.contains('completion--visible')) return;
    revealCard();
  });
  flashcardInner.addEventListener('keydown', function (e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (completionScreen?.classList.contains('completion--visible')) return;
      revealCard();
    }
  });

  $<HTMLButtonElement>('btnRetry')?.addEventListener('click', function () { assess('retry'); });
  $<HTMLButtonElement>('btnShaky')?.addEventListener('click', function () { assess('shaky'); });
  $<HTMLButtonElement>('btnKnew')?.addEventListener('click', function () { assess('knew'); });
  $<HTMLButtonElement>('btnRestart')?.addEventListener('click', restart);

  renderCard();
}
