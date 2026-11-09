// Tela "Histórico": calendário dos dias concluídos, sequência e detalhe de cada dia.

import * as act from '../actions.js';
import { addMonths, daysInMonth, formatLong, formatMonth, joinList, pad, weekday } from '../dates.js';
import { activePause, AREAS, dayStatus, PERIODS, planFor, sortSteps, streaks } from '../routine.js';
import { esc, icons } from '../ui.js';
import { itemRow, supplementRow } from './checklist.js';

const STATUS_LABEL = {
  complete: 'Concluído',
  partial: 'Parcial',
  empty: 'Sem registro',
  future: 'Planejado',
  before: 'Antes do início',
};

const SYMPTOM_LABEL = { ardencia: 'ardência', descamacao: 'descamação', vermelhidao: 'vermelhidão' };

let month = null;   // mês exibido, 'AAAA-MM'
let openDay = null; // dia aberto na folha de detalhe

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function statusOf(state, key, today) {
  if (key > today) return 'future';
  if (key < state.settings.startDate) return 'before';
  return dayStatus(state.log[key]);
}

const hasPause = (state, key) => state.pauses.some((p) => p.from <= key && key <= p.to);

// ---------- Tela ----------

export function render(app) {
  const { state } = app;
  const today = act.todayKey(state, app.now());
  const start = state.settings.startDate;

  if (!start) {
    return `
      <header class="page-header"><h1>Histórico</h1></header>
      <section class="card empty-state">
        <p>O histórico começa quando você iniciar a rotina, na aba Hoje.</p>
      </section>`;
  }

  const thisMonth = today.slice(0, 7);
  const firstMonth = [start, ...Object.keys(state.log)].sort()[0].slice(0, 7);
  if (!month || month > thisMonth) month = thisMonth;
  if (month < firstMonth) month = firstMonth;

  const { current, best } = streaks(state, today);
  const monthDone = Object.keys(state.log)
    .filter((k) => k.startsWith(month) && statusOf(state, k, today) === 'complete').length;

  return `
    <header class="page-header"><h1>Histórico</h1></header>

    <section class="stats">
      ${stat(plural(current, 'dia', 'dias'), 'Sequência atual')}
      ${stat(plural(best, 'dia', 'dias'), 'Recorde')}
      ${stat(String(monthDone), 'Concluídos no mês')}
    </section>

    <section class="card calendar">
      <div class="cal-head">
        <button type="button" class="icon-btn" data-action="prev-month" aria-label="Mês anterior" ${month <= firstMonth ? 'disabled' : ''}>${icons.chevronLeft}</button>
        <h2>${formatMonth(month)}</h2>
        <button type="button" class="icon-btn" data-action="next-month" aria-label="Próximo mês" ${month >= thisMonth ? 'disabled' : ''}>${icons.chevron}</button>
      </div>
      <div class="cal-grid cal-weekdays" aria-hidden="true">
        ${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => `<span>${d}</span>`).join('')}
      </div>
      <div class="cal-grid">${calendarCells(state, today)}</div>
      <div class="cal-legend">
        <span><i class="swatch swatch-complete"></i>Concluído</span>
        <span><i class="swatch swatch-partial"></i>Parcial</span>
        <span><i class="swatch swatch-pause"></i>Pausa</span>
        <span><i class="swatch swatch-irritation"></i>Irritação</span>
      </div>
    </section>
    <p class="muted small center">Toque num dia para ver ou corrigir o que foi feito.</p>`;
}

function stat(value, label) {
  return `<div class="stat"><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`;
}

function calendarCells(state, today) {
  const cells = [];
  const lead = weekday(`${month}-01`); // a semana começa no domingo
  for (let i = 0; i < lead; i++) cells.push('<span></span>');

  for (let d = 1; d <= daysInMonth(month); d++) {
    const key = `${month}-${pad(d)}`;
    const status = statusOf(state, key, today);
    const irritation = state.log[key]?.irritations?.length > 0;
    const paused = hasPause(state, key);
    const classes = [
      'cal-day',
      `is-${status}`,
      key === today ? 'is-today' : '',
      paused ? 'has-pause' : '',
    ].filter(Boolean).join(' ');
    const extras = [paused && 'pausa', irritation && 'irritação'].filter(Boolean);
    const label = `${formatLong(key)}: ${STATUS_LABEL[status].toLowerCase()}${extras.length ? `, ${joinList(extras)}` : ''}`;
    cells.push(`
      <button type="button" class="${classes}" data-action="open-day" data-date="${key}" aria-label="${label}" ${status === 'before' ? 'disabled' : ''}>
        <span>${d}</span>
        ${irritation ? '<i class="cal-dot"></i>' : ''}
      </button>`);
  }
  return cells.join('');
}

// ---------- Detalhe do dia ----------

/**
 * Itens do dia. Dias passados com registro usam a lista salva naquele dia;
 * hoje, dias futuros e dias sem registro usam as regras atuais.
 */
function dayItems(state, date, today) {
  const entry = state.log[date];
  if (date < today && entry) {
    const steps = new Map(state.steps.map((s) => [s.id, s]));
    const products = new Map(state.products.map((p) => [p.id, p]));
    return sortSteps(entry.expected.map((id) => steps.get(id)).filter(Boolean))
      .map((step) => ({ step, product: products.get(step.productId), skip: null }))
      .filter((item) => item.product);
  }
  return planFor(state, date).items;
}

function records(state, date) {
  const entry = state.log[date];
  const lines = [];
  for (const i of entry?.irritations ?? []) {
    const where = i.areas.map((a) => AREAS.find((x) => x.id === a).inLabel);
    const what = i.symptoms.map((s) => SYMPTOM_LABEL[s] ?? s);
    lines.push(`${i.time} · Irritação ${joinList(where)}${what.length ? ` (${joinList(what)})` : ''}`
      + `${i.pauseDays ? ` · pausa de ${i.pauseDays} dias` : ''}`);
  }
  for (const area of AREAS) {
    if (activePause(state, date, area.id)) lines.push(`Pausa dos ativos ${area.inLabel}`);
  }
  if (entry?.outings?.length) lines.push(`Saiu às ${joinList(entry.outings)}`);
  if (entry?.reapplied?.length) lines.push(`Reaplicou o protetor às ${joinList(entry.reapplied)}`);
  return lines;
}

function daySheet(app) {
  const { state } = app;
  const date = openDay;
  const today = act.todayKey(state, app.now());
  const future = date > today;
  const entry = state.log[date];
  const items = dayItems(state, date, today);
  const supplement = planFor(state, date).supplement;
  const status = statusOf(state, date, today);
  const rows = records(state, date);
  const options = { action: 'day-toggle', disabled: future };

  const periods = PERIODS.map((period) => {
    const inPeriod = items.filter((i) => i.step.period === period.id);
    const sup = supplement?.period === period.id ? supplement : null;
    if (!inPeriod.length && !sup) return '';
    const groups = AREAS.map((area) => {
      const list = inPeriod.filter((i) => i.step.area === area.id);
      if (!list.length) return '';
      return `
        <p class="group-title">${area.label}</p>
        <ul class="checklist">${list.map((i) => itemRow(i, entry?.done?.includes(i.step.id) ?? false, options)).join('')}</ul>`;
    }).join('');
    return `
      <h3 class="sub-title">${period.label}</h3>
      ${groups}
      ${sup ? `
        <p class="group-title">Suplemento</p>
        <ul class="checklist">${supplementRow(sup, Boolean(entry?.supplement), { action: 'day-supplement', disabled: future })}</ul>` : ''}`;
  }).join('');

  return `
    <div class="sheet-head">
      <div class="sheet-title">
        <h2>${formatLong(date)}</h2>
        <span class="chip chip-status is-${status}">${STATUS_LABEL[status]}</span>
      </div>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fechar">${icons.close}</button>
    </div>
    <p class="muted small">${future ? 'O que está previsto para este dia.' : 'Toque para corrigir o que ficou sem marcar.'}</p>
    ${periods || '<p class="muted">Nada previsto para este dia.</p>'}
    ${rows.length ? `
      <h3 class="sub-title">Registros</h3>
      <ul class="records">${rows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}`;
}

const refreshSheet = (app) => app.openSheet(daySheet(app));

// ---------- Ações ----------

export const actions = {
  'prev-month'(app) {
    month = addMonths(month, -1);
    app.render();
  },

  'next-month'(app) {
    month = addMonths(month, 1);
    app.render();
  },

  'open-day'(app, el) {
    openDay = el.dataset.date;
    refreshSheet(app);
  },

  'day-toggle'(app, el) {
    app.update((s) => act.toggleStep(s, openDay, el.dataset.step, app.now()));
    refreshSheet(app);
  },

  'day-supplement'(app) {
    app.update((s) => act.toggleSupplement(s, openDay));
    refreshSheet(app);
  },

  'close-sheet'(app) {
    app.closeSheet();
  },
};
