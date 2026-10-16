import {
  buildHskQuizQuestions, parseHskQuizAnswers, scoreHskQuiz,
  type HskQuizDirection, type HskQuizEntry, type HskQuizLength, type HskQuizQuestion,
} from '../domain/hskQuiz';
import { HSK_QUIZ_SCORE_EVENT, formatHskQuizBest, readHskQuizBest, saveHskQuizBest } from '../domain/hskQuizBestScore';
import { hskQuizNearSynonymGroupOf } from '../content/hskQuizNearSynonyms';

const cleanups = new WeakMap<HTMLElement, () => void>();

function text(tag: 'p' | 'h2' | 'h3', value: string, className = '', lang = 'ja') {
  const node = document.createElement(tag);
  node.textContent = value;
  node.className = className;
  node.lang = lang;
  return node;
}

function button(label: string, action: string) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.dataset.action = action;
  return node;
}

export function initHskQuiz(root: HTMLElement, random: () => number = Math.random): () => void {
  cleanups.get(root)?.();
  const setup = root.querySelector<HTMLFormElement>('[data-quiz-setup]')!;
  const start = root.querySelector<HTMLButtonElement>('[data-quiz-start]')!;
  const status = root.querySelector<HTMLElement>('[data-quiz-status]')!;
  const card = root.querySelector<HTMLElement>('[data-quiz-card]')!;
  const controller = new AbortController();
  let disposed = false;
  let entries: HskQuizEntry[] = [];
  let level = 0;
  let questions: HskQuizQuestion[] = [];
  let answers: number[] = [];
  let index = 0;
  let direction: HskQuizDirection = 'zh-to-ja';
  let length: HskQuizLength = 10;

  function reset() {
    questions = [];
    answers = [];
    index = 0;
    card.replaceChildren();
    setup.hidden = false;
    status.textContent = formatHskQuizBest(readHskQuizBest(level));
  }

  function showQuestion() {
    const question = questions[index];
    const revealed = answers.length > index;
    const result = scoreHskQuiz(questions, answers);
    status.textContent = `${index + 1} / ${questions.length}問 · 正解 ${result.correct}問`;
    const prompt = text('h2', question.prompt, 'quiz-prompt', direction === 'zh-to-ja' ? 'zh-Hans' : 'ja');
    prompt.tabIndex = -1;
    const options = document.createElement('div');
    options.className = 'quiz-options';
    question.options.forEach((label, optionIndex) => {
      const option = button(label, 'answer');
      option.lang = direction === 'zh-to-ja' ? 'ja' : 'zh-Hans';
      option.dataset.index = String(optionIndex);
      option.disabled = revealed;
      if (revealed) {
        const annotation = document.createElement('span');
        annotation.lang = 'ja';
        if (optionIndex === question.correctIndex) {
          option.dataset.correct = 'true';
          annotation.textContent = '（正解）';
        }
        if (optionIndex === answers[index]) annotation.textContent += '（あなたの回答）';
        option.append(annotation);
      }
      options.append(option);
    });
    card.replaceChildren(text('p', direction === 'zh-to-ja' ? '日本語の意味を選んでください。' : '簡体字の単語を選んでください。'), prompt, options);
    if (!revealed) { prompt.focus(); return; }

    const feedback = text('p', answers[index] === question.correctIndex ? '○ 正解です' : '× 不正解です', 'quiz-feedback');
    feedback.id = 'hsk-quiz-feedback';
    const answer = document.createElement('div');
    answer.className = 'quiz-answer';
    answer.append(text('p', question.entry.simplified, '', 'zh-Hans'),
      text('p', question.entry.pinyin, 'quiz-pinyin', 'zh-Latn'), text('p', question.entry.japanese));
    const pronunciation = button('発音を聞く', 'pronounce');
    pronunciation.className = 'pronunciation-button';
    pronunciation.dataset.pronunciationButton = '';
    pronunciation.dataset.pronunciationText = question.entry.simplified;
    pronunciation.dataset.pronunciationLang = 'zh-CN';
    pronunciation.hidden = true;
    const control = document.createElement('span');
    control.className = 'pronunciation-control';
    control.append(pronunciation);
    answer.append(control);
    const next = button(index + 1 === questions.length ? '結果を見る' : '次の問題へ', 'next');
    next.setAttribute('aria-describedby', feedback.id);
    card.append(feedback, answer, next);
    next.focus();
  }

  function showResult() {
    const result = scoreHskQuiz(questions, answers);
    if (!result.complete) return;
    const saved = saveHskQuizBest(level, { version: 1, correct: result.correct, total: length, direction });
    if (saved) window.dispatchEvent(new Event(HSK_QUIZ_SCORE_EVENT));
    status.textContent = saved
      ? `${formatHskQuizBest(readHskQuizBest(level))} · このブラウザに保存しました。`
      : 'このブラウザには最高得点を保存できませんでした。';
    const heading = text('h2', 'テスト結果');
    heading.tabIndex = -1;
    const score = text('p', `${result.correct} / ${result.total}問正解（${Math.round(result.correct / result.total * 100)}%）`, 'quiz-feedback');
    card.replaceChildren(heading, score, text('h3', result.missed.length ? '間違えた単語' : '全問正解です！'));
    if (result.missed.length) {
      const list = document.createElement('ul');
      list.className = 'quiz-missed';
      for (const entry of result.missed) {
        const item = document.createElement('li');
        item.append(text('p', entry.simplified, '', 'zh-Hans'), text('p', entry.pinyin, '', 'zh-Latn'), text('p', entry.japanese));
        list.append(item);
      }
      card.append(list);
    }
    const back = document.createElement('a');
    back.href = `/vocabulary/hsk/${level}/`;
    back.textContent = `HSK ${level}の学習に戻る`;
    back.className = 'quiz-back';
    card.append(button('もう一度テストする', 'retry'), document.createElement('br'), back);
    heading.focus();
  }

  function onStart(event: SubmitEvent) {
    event.preventDefault();
    if (!entries.length || setup.hidden) return;
    const data = new FormData(setup);
    length = data.get('length') === '20' ? 20 : 10;
    direction = data.get('direction') === 'ja-to-zh' ? 'ja-to-zh' : 'zh-to-ja';
    questions = buildHskQuizQuestions(entries, length, direction, random, hskQuizNearSynonymGroupOf);
    if (!questions.length) {
      status.textContent = 'この条件では十分な問題を作れません。問題数や出題方向を変えてください。';
      return;
    }
    answers = [];
    index = 0;
    setup.hidden = true;
    showQuestion();
  }

  function onClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
    if (!target || !root.contains(target) || target.disabled) return;
    if (target.dataset.action === 'retry') { reset(); start.focus(); }
    if (target.dataset.action === 'answer' && questions[index] && answers.length === index) {
      const choice = Number(target.dataset.index);
      if (!Number.isInteger(choice) || choice < 0 || choice > 3) return;
      answers.push(choice);
      showQuestion();
    }
    if (target.dataset.action === 'next' && answers.length === index + 1) {
      index++;
      if (index === questions.length) showResult();
      else showQuestion();
    }
  }

  setup.addEventListener('submit', onStart);
  root.addEventListener('click', onClick);
  start.disabled = true;
  start.setAttribute('aria-busy', 'true');
  reset();
  status.textContent = '単語データを読み込んでいます。';
  void (async () => {
    try {
      const data = JSON.parse(root.dataset.hskQuiz ?? '{}');
      if (![1, 2, 3, 4].includes(data.level) || !Array.isArray(data.ids) || !data.ids.length ||
        !data.ids.every((id: unknown) => typeof id === 'string' && id.trim()) ||
        data.answerSource !== `/data/hsk/${data.level}.json`) throw new Error('Invalid bootstrap');
      level = data.level;
      const response = await fetch(data.answerSource, {
        signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to load answers');
      const loaded = parseHskQuizAnswers(await response.json(), data.ids);
      if (!loaded) throw new Error('Invalid answers');
      if (disposed) return;
      entries = loaded;
      start.disabled = false;
      status.textContent = formatHskQuizBest(readHskQuizBest(level));
    } catch {
      if (!disposed) status.textContent = '単語データを読み込めませんでした。ページを再読み込みしてください。';
    } finally {
      if (!disposed) start.removeAttribute('aria-busy');
    }
  })();
  const cleanup = () => {
    disposed = true;
    controller.abort();
    setup.removeEventListener('submit', onStart);
    root.removeEventListener('click', onClick);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  return cleanup;
}
