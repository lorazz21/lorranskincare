// Ações que alteram o estado. Recebem o "agora" como parâmetro,
// o que deixa as regras independentes do relógio e fáceis de testar.

import { addDays, dayKey, formatTime } from './dates.js';
import { activePause, isRecurrence, planFor, sortSteps } from './routine.js';

export const todayKey = (state, now) => dayKey(now, state.settings.dayStartsAt);

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function entryFor(state, date) {
  if (!state.log[date]) state.log[date] = { expected: planFor(state, date).expected, done: [] };
  return state.log[date];
}

/**
 * Atualiza a lista de passos esperados de um dia que já tem registro.
 * Só é chamada para hoje: dias passados guardam a própria lista, então mudar
 * a rotina depois não reescreve o histórico.
 */
export function syncDay(state, date) {
  if (state.log[date]) state.log[date].expected = planFor(state, date).expected;
}

const syncToday = (state, now) => syncDay(state, todayKey(state, now));

export function startRoutine(state, date) {
  state.settings.startDate = date;
  syncDay(state, date);
}

/** Marca ou desmarca um passo. Em dias passados, mantém a lista daquele dia. */
export function toggleStep(state, date, stepId, now) {
  const entry = entryFor(state, date);
  entry.done = entry.done.includes(stepId)
    ? entry.done.filter((id) => id !== stepId)
    : [...entry.done, stepId];
  if (date === todayKey(state, now)) syncDay(state, date);
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

// ---------- Ajustes ----------

export function setStartDate(state, date, now) {
  if (!date) return;
  state.settings.startDate = date;
  syncToday(state, now);
}

export function updateSettings(state, patch, now) {
  Object.assign(state.settings, patch);
  syncToday(state, now);
}

export function updateSupplement(state, patch) {
  Object.assign(state.settings.supplement, patch);
}

function groupOf(state, period, area) {
  return sortSteps(state.steps.filter((s) => !s.archived && s.period === period && s.area === area));
}

function nextOrder(state, period, area, exceptId) {
  const orders = groupOf(state, period, area).filter((s) => s.id !== exceptId).map((s) => s.order);
  return Math.max(0, ...orders) + 1;
}

/**
 * Cria ou atualiza um passo. `fields`: { id?, productId, period, area, weekdays, adaptation, note }.
 * Mudando de período ou área, o passo vai para o fim do novo grupo.
 */
export function saveStep(state, fields, now) {
  const { id, ...data } = fields;
  let step = id && state.steps.find((s) => s.id === id);
  if (step) {
    const moved = step.period !== data.period || step.area !== data.area;
    Object.assign(step, data);
    if (moved) step.order = nextOrder(state, step.period, step.area, step.id);
  } else {
    step = {
      id: `${data.period}-${data.area}-${newId()}`,
      ...data,
      order: nextOrder(state, data.period, data.area),
      archived: false,
    };
    state.steps.push(step);
  }
  syncToday(state, now);
  return step;
}

/** Sobe (-1) ou desce (+1) um passo dentro do seu grupo (período + área). */
export function moveStep(state, id, direction) {
  const step = state.steps.find((s) => s.id === id);
  if (!step) return;
  const group = groupOf(state, step.period, step.area);
  group.forEach((s, i) => { s.order = i + 1; });
  const target = group[group.indexOf(step) + direction];
  if (target) [step.order, target.order] = [target.order, step.order];
}

const isLogged = (state, stepId) => Object.values(state.log)
  .some((e) => e.expected?.includes(stepId) || e.done?.includes(stepId));

/** Remove um passo. Se ele já aparece no histórico, só arquiva. */
export function removeStep(state, id, now) {
  const step = state.steps.find((s) => s.id === id);
  if (!step) return;
  if (isLogged(state, id)) step.archived = true;
  else state.steps = state.steps.filter((s) => s !== step);
  syncToday(state, now);
}

/** Cria ou atualiza um produto. `fields`: { id?, name, pausable, sunscreen }. */
export function saveProduct(state, fields, now) {
  const data = { name: fields.name.trim(), pausable: Boolean(fields.pausable), sunscreen: Boolean(fields.sunscreen) };
  let product = fields.id && state.products.find((p) => p.id === fields.id);
  if (product) {
    Object.assign(product, data);
  } else {
    product = { id: `p-${newId()}`, ...data, openedAt: null, durationDays: null, archived: false };
    state.products.push(product);
  }
  syncToday(state, now);
  return product;
}

/**
 * Remove um produto. Não deixa remover se algum passo da rotina usa o produto.
 * Se só passos arquivados usam, arquiva (para o histórico continuar com o nome).
 */
export function removeProduct(state, id) {
  if (state.steps.some((s) => !s.archived && s.productId === id)) return { ok: false, reason: 'in-use' };
  const product = state.products.find((p) => p.id === id);
  if (!product) return { ok: false, reason: 'missing' };
  if (state.steps.some((s) => s.productId === id)) product.archived = true;
  else state.products = state.products.filter((p) => p !== product);
  return { ok: true };
}
