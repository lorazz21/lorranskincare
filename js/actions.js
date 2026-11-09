// Ações que alteram o estado. Recebem o "agora" como parâmetro,
// o que deixa as regras independentes do relógio e fáceis de testar.

import { addDays, dayKey, formatTime } from './dates.js';
import { activePause, isRecurrence, planFor } from './routine.js';

export const todayKey = (state, now) => dayKey(now, state.settings.dayStartsAt);

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function entryFor(state, date) {
  if (!state.log[date]) state.log[date] = { expected: planFor(state, date).expected, done: [] };
  return state.log[date];
}

/**
 * Atualiza a lista de passos esperados de um dia que já tem registro.
 * Cada dia guarda a própria lista, então mudar a rotina depois não reescreve o histórico.
 */
export function syncDay(state, date) {
  if (state.log[date]) state.log[date].expected = planFor(state, date).expected;
}

export function startRoutine(state, date) {
  state.settings.startDate = date;
  syncDay(state, date);
}

export function toggleStep(state, date, stepId) {
  const entry = entryFor(state, date);
  entry.done = entry.done.includes(stepId)
    ? entry.done.filter((id) => id !== stepId)
    : [...entry.done, stepId];
  syncDay(state, date);
}

export function toggleSupplement(state, date) {
  const entry = entryFor(state, date);
  entry.supplement = !entry.supplement;
}

// ---------- Irritação e modo pausa ----------

function startPause(state, { area, from, days, symptoms }) {
  const to = addDays(from, days - 1);
  const current = activePause(state, from, area);
  if (current) {
    if (to > current.to) current.to = to; // nova irritação durante a pausa: estende
    return;
  }
  state.pauses.push({ id: newId(), area, from, to, symptoms });
}

/**
 * Registra a irritação de hoje. Com `pauseDays` > 0, pausa os ativos das áreas
 * afetadas a partir de hoje. Retorna `recurrence: true` se a irritação voltou
 * logo depois de uma pausa (o app sugere procurar um dermatologista).
 */
export function registerIrritation(state, { now, areas, symptoms = [], pauseDays = 0 }) {
  const date = todayKey(state, now);
  const recurrence = areas.some((area) => isRecurrence(state, date, area));
  const entry = entryFor(state, date);
  entry.irritations = [
    ...(entry.irritations ?? []),
    { time: formatTime(now), areas, symptoms, pauseDays, recurrence },
  ];
  if (pauseDays > 0) {
    for (const area of areas) startPause(state, { area, from: date, days: pauseDays, symptoms });
  }
  syncDay(state, date);
  return { recurrence };
}

/** Encerra a pausa antes do previsto: os ativos voltam hoje mesmo. */
export function endPause(state, { now, area }) {
  const date = todayKey(state, now);
  const pause = activePause(state, date, area);
  if (!pause) return;
  if (pause.from === date) state.pauses = state.pauses.filter((p) => p !== pause);
  else pause.to = addDays(date, -1);
  syncDay(state, date);
}

// ---------- Lembrete do protetor ----------

function scheduleSunscreen(state, now) {
  const dueAt = new Date(now.getTime() + state.settings.sunscreenIntervalMin * 60_000);
  state.sunscreen = { dueAt: dueAt.toISOString(), setAt: now.toISOString() };
}

export function leaveHome(state, now) {
  const entry = entryFor(state, todayKey(state, now));
  entry.outings = [...(entry.outings ?? []), formatTime(now)];
  scheduleSunscreen(state, now);
}

export function reapplySunscreen(state, now) {
  const entry = entryFor(state, todayKey(state, now));
  entry.reapplied = [...(entry.reapplied ?? []), formatTime(now)];
  scheduleSunscreen(state, now);
}

export function backHome(state) {
  state.sunscreen = null;
}
