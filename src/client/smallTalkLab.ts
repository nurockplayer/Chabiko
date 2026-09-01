import { loadSmallTalkEncounterDocument } from '../content/loadSmallTalkEncounters';
import {
  applySmallTalkEncounterAction,
  createSmallTalkEncounterSession,
  resolveCurrentSmallTalkBeat,
  type SmallTalkEncounterSessionState,
} from '../domain/smallTalkEncounterRuntime';
import type {
  SmallTalkEncounter,
  SmallTalkLocalizedText,
  SmallTalkStrategy,
} from '../types/smallTalkEncounter';

type JourneyPhase = 'mission' | 'encounter' | 'complete';
type LabFamily = 'baseline' | 'seasonal';

const BASELINE = {
  familyId: 'weekend-baseline',
  encounterId: 'weekend-medium',
} as const;
const SEASONAL = {
  familyId: 'mid-autumn-2026-transfer',
  encounterId: 'mid-autumn-2026-medium',
} as const;

const cleanups = new WeakMap<HTMLElement, () => void>();
const documentData = loadSmallTalkEncounterDocument();

function requireElement<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Small Talk Lab markup is missing '${selector}'`);
  return element;
}

function setText(element: Element, value: string): void {
  element.textContent = value;
}

function applyLocalizedText(
  root: HTMLElement,
  prefix: string,
  text: SmallTalkLocalizedText | null,
): void {
  setText(requireElement(root, `[data-small-talk-${prefix}-zh]`), text?.traditional ?? '');
  setText(requireElement(root, `[data-small-talk-${prefix}-pinyin]`), text?.pinyin ?? '');
  setText(requireElement(root, `[data-small-talk-${prefix}-ja]`), text?.japanese ?? '');
}

function createTextLine(className: string, value: string, lang?: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = value;
  if (lang !== undefined) element.lang = lang;
  return element;
}

function renderStrategyButton(strategy: SmallTalkStrategy): HTMLButtonElement {
  const example = strategy.realizations[0];
  if (example === undefined) throw new Error(`Small Talk strategy '${strategy.id}' has no realization`);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'small-talk-strategy';
  button.dataset.smallTalkStrategy = strategy.id;
  button.append(
    createTextLine('small-talk-strategy__label', strategy.labelJa),
    createTextLine('small-talk-strategy__example-label', '言い方の一例'),
    createTextLine('small-talk-strategy__zh', example.traditional, 'zh-Hant'),
    createTextLine('small-talk-strategy__pinyin', example.pinyin, 'zh-Latn'),
  );
  return button;
}

function selection(family: LabFamily): typeof BASELINE | typeof SEASONAL {
  return family === 'baseline' ? BASELINE : SEASONAL;
}

export interface SmallTalkLabController {
  getJourney: () => JourneyPhase;
  getState: () => SmallTalkEncounterSessionState | null;
  dispose: () => void;
}

/** Bind one isolated, in-memory Small Talk Lab journey to its dev-only route. */
export function mountSmallTalkLab(root: HTMLElement): SmallTalkLabController {
  cleanups.get(root)?.();

  const mission = requireElement<HTMLElement>(root, '[data-small-talk-mission]');
  const encounter = requireElement<HTMLElement>(root, '[data-small-talk-encounter]');
  const complete = requireElement<HTMLElement>(root, '[data-small-talk-complete]');
  const start = requireElement<HTMLButtonElement>(root, '[data-small-talk-start]');
  const replay = requireElement<HTMLButtonElement>(root, '[data-small-talk-replay]');
  const transfer = requireElement<HTMLButtonElement>(root, '[data-small-talk-transfer]');
  const reset = requireElement<HTMLButtonElement>(root, '[data-small-talk-reset]');
  const status = requireElement<HTMLElement>(root, '[data-small-talk-status]');
  const strategyList = requireElement<HTMLElement>(root, '[data-small-talk-strategies]');
  const evidenceList = requireElement<HTMLOListElement>(root, '[data-small-talk-evidence]');
  const passport = requireElement<HTMLElement>(root, '[data-small-talk-passport]');

  let journey: JourneyPhase = 'mission';
  let family: LabFamily = 'baseline';
  let state: SmallTalkEncounterSessionState | null = null;
  let baselineReplayCompleted = false;

  function currentEncounter(): SmallTalkEncounter {
    if (state === null) throw new Error('Small Talk Lab has no active runtime state');
    return state.encounter;
  }

  function renderMission(focus = false): void {
    const baseline = createSmallTalkEncounterSession(documentData, BASELINE).encounter;
    setText(requireElement(root, '[data-small-talk-heading]'), '会話を一往復先へ');
    setText(requireElement(root, '[data-small-talk-mission-copy]'), baseline.missionJa);
    setText(requireElement(root, '[data-small-talk-premise]'), baseline.premiseJa);
    setText(requireElement(root, '[data-small-talk-setting]'), baseline.settingJa);
    mission.hidden = false;
    encounter.hidden = true;
    complete.hidden = true;
    reset.hidden = true;
    status.textContent = '';
    if (focus) start.focus();
  }

  function renderEncounter(focus = true): void {
    if (state === null || state.status !== 'active') {
      throw new Error('Small Talk Lab cannot render an inactive Encounter');
    }
    const beat = resolveCurrentSmallTalkBeat(state);
    const encounterData = currentEncounter();
    mission.hidden = true;
    encounter.hidden = false;
    complete.hidden = true;
    reset.hidden = false;
    setText(
      requireElement(root, '[data-small-talk-stage]'),
      family === 'baseline'
        ? state.mode === 'initial' ? 'BASELINE ENCOUNTER' : 'CONTROLLED REPLAY'
        : 'SEASONAL TRANSFER',
    );
    setText(
      requireElement(root, '[data-small-talk-progress]'),
      `${state.evidenceEvents.length + 1}つ目の会話のきっかけ`,
    );
    setText(
      requireElement(root, '[data-small-talk-encounter-heading]'),
      state.mode === 'replay' ? encounterData.replay.modifierJa : encounterData.missionJa,
    );
    applyLocalizedText(root, 'cue', beat.partnerCue.text);
    setText(requireElement(root, '[data-small-talk-opportunity]'), beat.opportunityJa);
    strategyList.replaceChildren(...beat.strategies.map(renderStrategyButton));
    status.textContent = '自分の返し方を考えてから、会話の進め方を選びます。正解文を当てる練習ではありません。';
    if (focus) requireElement<HTMLElement>(root, '[data-small-talk-encounter-heading]').focus();
  }

  function renderEvidence(): void {
    if (state === null || state.status !== 'completed') {
      throw new Error('Small Talk Lab cannot summarize an active Encounter');
    }
    const events = state.completionSummary.evidenceEvents.slice(-3);
    evidenceList.replaceChildren(...events.map((event) => {
      const item = document.createElement('li');
      item.className = 'small-talk-evidence';
      item.dataset.smallTalkEvidenceItem = '';
      item.append(
        createTextLine('small-talk-evidence__moment', event.authoredEvidence.decisiveMomentJa),
        createTextLine('small-talk-evidence__explanation', event.authoredEvidence.explanationJa),
        createTextLine('small-talk-evidence__next', `次の一手：${event.authoredEvidence.nextMoveJa}`),
      );
      return item;
    }));
  }

  function renderPassport(): void {
    if (state === null || state.status !== 'completed') return;
    const projection = state.completionSummary.passportProjection;
    passport.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'この回の Passport';
    passport.append(heading);
    if (projection === null) {
      const note = document.createElement('p');
      note.textContent = 'この回は Passport に残せる証拠がまだそろっていません。能力全体の判定ではありません。';
      passport.append(note);
      return;
    }
    const list = document.createElement('dl');
    for (const [term, description] of [
      ['場面', projection.situationJa],
      ['今回支えられたこと', projection.capabilityJa],
      ['範囲', projection.limitationJa],
    ]) {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = description;
      list.append(dt, dd);
    }
    passport.append(list);
  }

  function renderComplete(): void {
    if (state === null || state.status !== 'completed') {
      throw new Error('Small Talk Lab cannot render completion from an active Encounter');
    }
    mission.hidden = true;
    encounter.hidden = true;
    complete.hidden = false;
    reset.hidden = false;
    applyLocalizedText(root, 'terminal', state.terminalPartnerReply);
    renderEvidence();
    renderPassport();
    replay.hidden = family !== 'baseline' || state.mode !== 'initial';
    transfer.hidden = !(family === 'baseline' && baselineReplayCompleted);
    status.textContent = 'この回に残った具体的な証拠を振り返ります。能力全体の判定ではありません。';
    requireElement<HTMLElement>(root, '[data-small-talk-complete-heading]').focus();
  }

  function startFamily(nextFamily: LabFamily): void {
    family = nextFamily;
    state = createSmallTalkEncounterSession(documentData, selection(nextFamily));
    journey = 'encounter';
    renderEncounter();
  }

  function selectStrategy(strategyId: string): void {
    if (state === null) return;
    const transition = applySmallTalkEncounterAction(state, {
      kind: 'select-strategy',
      strategyId,
    });
    if (transition.kind === 'rejected') return;
    state = transition.state;
    if (state.status === 'active') {
      renderEncounter();
      return;
    }
    if (family === 'baseline' && state.mode === 'replay') baselineReplayCompleted = true;
    journey = 'complete';
    renderComplete();
  }

  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const strategy = target.closest<HTMLButtonElement>('[data-small-talk-strategy]');
    if (strategy !== null && root.contains(strategy)) {
      selectStrategy(strategy.dataset.smallTalkStrategy ?? '');
      return;
    }
    if (target.closest('[data-small-talk-start]')) {
      startFamily('baseline');
      return;
    }
    if (target.closest('[data-small-talk-replay]') && state !== null) {
      const transition = applySmallTalkEncounterAction(state, { kind: 'start-replay' });
      if (transition.kind === 'accepted') {
        state = transition.state;
        journey = 'encounter';
        renderEncounter();
      }
      return;
    }
    if (target.closest('[data-small-talk-transfer]')) {
      startFamily('seasonal');
      return;
    }
    if (target.closest('[data-small-talk-reset]')) {
      family = 'baseline';
      state = null;
      journey = 'mission';
      baselineReplayCompleted = false;
      strategyList.replaceChildren();
      evidenceList.replaceChildren();
      passport.replaceChildren();
      renderMission(true);
    }
  }

  root.addEventListener('click', onClick);
  const cleanup = (): void => {
    root.removeEventListener('click', onClick);
    if (cleanups.get(root) === cleanup) cleanups.delete(root);
  };
  cleanups.set(root, cleanup);
  renderMission();
  return {
    getJourney: () => journey,
    getState: () => state,
    dispose: cleanup,
  };
}
