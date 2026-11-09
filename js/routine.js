// Motor da rotina: dado o estado e um dia, decide o que entra no checklist.
// Só funções puras (sem DOM nem armazenamento), para poderem ser testadas no Node.

import { addDays, dayKey, diffDays, joinList, weekday, WEEKDAY_SHORT } from './dates.js';

export const PERIODS = [
  { id: 'manha', label: 'Manhã' },
  { id: 'noite', label: 'Noite' },
];

export const AREAS = [
  { id: 'rosto', label: 'Rosto', inLabel: 'no rosto' },
  { id: 'corpo', label: 'Corpo', inLabel: 'no corpo' },
];

/** Irritação até N dias depois do fim de uma pausa conta como recorrência. */
export const RECURRENCE_WINDOW_DAYS = 7;

export const activeSteps = (state) => state.steps.filter((s) => !s.archived);
export const activeProducts = (state) => state.products.filter((p) => !p.archived);

/**
 * Fase da rotina num dia:
 * none (sem data de início) | before (início no futuro) | adaptation | full
 */
export function phaseOn(settings, date) {
  const { startDate, adaptationDays } = settings;
  if (!startDate) return { kind: 'none' };
  const index = diffDays(startDate, date);
  if (index < 0) return { kind: 'before', startDate };
  if (index < adaptationDays) return { kind: 'adaptation', day: index + 1, of: adaptationDays };
  return { kind: 'full', day: index + 1 };
}

export function activePause(state, date, area) {
  return state.pauses.find((p) => p.area === area && p.from <= date && date <= p.to) ?? null;
}

function adaptationAllows(rule, phase, wd) {
  if (!rule || phase.kind !== 'adaptation') return true;
  if (rule.skip) return false;
  if (rule.alternate) return phase.day % 2 === 1; // dias 1, 3, 5, 7
  if (rule.weekdays) return rule.weekdays.includes(wd);
  return true;
}

const indexIn = (list, id) => list.findIndex((x) => x.id === id);

export function sortSteps(steps) {
  return [...steps].sort((a, b) =>
    indexIn(PERIODS, a.period) - indexIn(PERIODS, b.period)
    || indexIn(AREAS, a.area) - indexIn(AREAS, b.area)
    || a.order - b.order);
}

/**
 * Plano do dia. Cada item tem `skip`: null (fazer), 'pausa' ou 'adaptacao'.
 * Passos fora do dia da semana nem aparecem. `expected` são os ids que contam
 * para o progresso (o suplemento é opcional e fica de fora).
 */
export function planFor(state, date) {
  const phase = phaseOn(state.settings, date);
  const running = phase.kind === 'adaptation' || phase.kind === 'full';
  const products = new Map(state.products.map((p) => [p.id, p]));
  const wd = weekday(date);
  const items = [];

  if (running) {
    for (const step of sortSteps(activeSteps(state))) {
      if (step.weekdays?.length && !step.weekdays.includes(wd)) continue;
      const product = products.get(step.productId);
      if (!product) continue;
      const pause = product.pausable ? activePause(state, date, step.area) : null;
      let skip = null;
      if (pause) skip = 'pausa';
      else if (!adaptationAllows(step.adaptation, phase, wd)) skip = 'adaptacao';
      items.push({ step, product, skip, pause });
    }
  }

  const supplement = state.settings.supplement;
  return {
    date,
    phase,
    items,
    expected: items.filter((i) => !i.skip).map((i) => i.step.id),
    supplement: running && supplement?.enabled ? supplement : null,
    pauses: Object.fromEntries(AREAS.map((a) => [a.id, activePause(state, date, a.id)])),
  };
}

export function progress(expected, entry) {
  const done = expected.filter((id) => entry?.done?.includes(id)).length;
  return { done, total: expected.length };
}

/** 'complete' | 'partial' | 'empty', usando o que ficou salvo no próprio dia. */
export function dayStatus(entry) {
  const { done, total } = progress(entry?.expected ?? [], entry);
  if (total > 0 && done === total) return 'complete';
  return done > 0 ? 'partial' : 'empty';
}

/**
 * Sequência atual (dias concluídos seguidos até hoje) e recorde.
 * Hoje ainda em andamento não quebra a sequência: ela conta até ontem.
 */
export function streaks(state, today) {
  const start = state.settings.startDate;
  if (!start) return { current: 0, best: 0 };
  const complete = new Set(Object.entries(state.log)
    .filter(([key, entry]) => key >= start && key <= today && dayStatus(entry) === 'complete')
    .map(([key]) => key));

  let current = 0;
  let day = complete.has(today) ? today : addDays(today, -1);
  while (complete.has(day)) {
    current += 1;
    day = addDays(day, -1);
  }

  let best = 0;
  for (const key of complete) {
    if (complete.has(addDays(key, -1))) continue; // só a partir do começo de cada sequência
    let length = 0;
    for (let d = key; complete.has(d); d = addDays(d, 1)) length += 1;
    best = Math.max(best, length);
  }
  return { current, best };
}

/** Produtos que saem do checklist quando a área entra em pausa. */
export function pausableProducts(state, area) {
  const used = new Set(activeSteps(state).filter((s) => s.area === area).map((s) => s.productId));
  return activeProducts(state).filter((p) => p.pausable && used.has(p.id));
}

/** A irritação voltou pouco depois de uma pausa (já encerrada) na mesma área? */
export function isRecurrence(state, date, area) {
  return state.pauses.some((p) => p.area === area && p.to < date
    && diffDays(p.to, date) <= RECURRENCE_WINDOW_DAYS);
}

/** Lembrete do protetor em andamento hoje, ou null. */
export function sunscreenStatus(state, now) {
  const s = state.sunscreen;
  if (!s) return null;
  const startsAt = state.settings.dayStartsAt;
  if (dayKey(new Date(s.setAt), startsAt) !== dayKey(now, startsAt)) return null;
  const dueAt = new Date(s.dueAt);
  const remainingMs = dueAt.getTime() - now.getTime();
  return { dueAt, remainingMs, due: remainingMs <= 0 };
}

/**
 * Lembrete das fotos de progresso. As primeiras ("antes") são pedidas desde o
 * início da rotina; depois, a cada `photoIntervalDays` desde as últimas.
 * Retorna null se o lembrete estiver desligado.
 */
export function photoReminder(settings, lastPhotoDate, today) {
  const interval = settings.photoIntervalDays;
  if (!interval) return null;
  const first = !lastPhotoDate;
  const next = first ? settings.startDate : addDays(lastPhotoDate, interval);
  const due = Boolean(next) && today >= next;
  return {
    first,
    next,
    due,
    snoozed: due && settings.photoSnoozeDate === today,
    daysSince: first ? null : diffDays(lastPhotoDate, today),
  };
}

// ---------- Textos ----------

const sortWeekdays = (days) => [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // seg → dom

/** [1, 3, 5] → "seg, qua e sex"; null ou todos → "Todo dia" */
export function describeWeekdays(weekdays) {
  if (!weekdays?.length || weekdays.length === 7) return 'Todo dia';
  return joinList(sortWeekdays(weekdays).map((d) => WEEKDAY_SHORT[d]));
}

/** Regra de adaptação em texto, ou null se o passo segue a rotina normal. */
export function describeAdaptation(step) {
  const rule = step.adaptation;
  if (!rule) return null;
  if (rule.skip) return 'fica de fora';
  if (rule.alternate) return step.period === 'noite' ? 'noites alternadas' : 'manhãs alternadas';
  if (rule.weekdays) return `só ${joinList(sortWeekdays(rule.weekdays).map((d) => WEEKDAY_SHORT[d]))}`;
  return null;
}

/** Frases que descrevem a fase de adaptação, para a tela de boas-vindas. */
export function adaptationSummary(state) {
  const products = new Map(state.products.map((p) => [p.id, p]));
  return sortSteps(activeSteps(state))
    .filter((s) => describeAdaptation(s) && products.has(s.productId))
    .map((s) => `${products.get(s.productId).name}: ${describeAdaptation(s)}`);
}
