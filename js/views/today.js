// Tela "Hoje": checklist do dia, progresso, lembrete do protetor e modo pausa.

import * as act from '../actions.js';
import { addDays, formatDuration, formatLong, formatShort, formatTime, joinList } from '../dates.js';
import { buildEvent, openEvent } from '../ics.js';
import {
  activeProducts, adaptationSummary, AREAS, isRecurrence, pausableProducts, PERIODS, photoReminder, planFor,
  progress, streaks, sunscreenStatus,
} from '../routine.js';
import { esc, icons, ring } from '../ui.js';
import { itemRow, supplementRow } from './checklist.js';

const SYMPTOMS = [
  { id: 'ardencia', label: 'Ardência' },
  { id: 'descamacao', label: 'Descamação' },
  { id: 'vermelhidao', label: 'Vermelhidão' },
];

const AREA_CHOICES = [
  { id: 'rosto', label: 'Rosto', areas: ['rosto'] },
  { id: 'corpo', label: 'Corpo', areas: ['corpo'] },
  { id: 'ambos', label: 'Os dois', areas: ['rosto', 'corpo'] },
];

const areaInfo = (id) => AREAS.find((a) => a.id === id);

// O que foi desenhado por último, para o relógio saber quando redesenhar.
const rendered = { day: null, due: null };
// Estado do formulário de irritação enquanto a folha está aberta.
let form = null;

// ---------- Tela ----------

export function render(app) {
  const { state } = app;
  const now = app.now();
  const date = act.todayKey(state, now);
  const plan = planFor(state, date);
  const sun = sunscreenStatus(state, now);
  rendered.day = date;
  rendered.due = sun ? sun.due : null;

  if (plan.phase.kind === 'none') return welcome(state);

  const entry = state.log[date];
  return `
    ${header(plan)}
    ${plan.phase.kind === 'before' ? beforeStart(plan) : `
      ${summary(state, plan, entry, sun)}
      ${notices(state, plan, entry, sun)}
      ${photoCard(app, plan.date)}
      ${PERIODS.map((period) => periodSection(period, plan, entry)).join('')}
    `}`;
}

function header(plan) {
  const { phase } = plan;
  let chip = '';
  if (phase.kind === 'adaptation') chip = `<span class="chip">Adaptação · dia ${phase.day} de ${phase.of}</span>`;
  if (phase.kind === 'full') chip = '<span class="chip chip-quiet">Rotina completa</span>';
  return `
    <header class="page-header">
      <h1>${formatLong(plan.date)}</h1>
      ${chip}
    </header>`;
}

function welcome(state) {
  const rules = adaptationSummary(state);
  return `
    <section class="welcome">
      <div class="welcome-mark">${icons.drop}</div>
      <h1>Sua rotina de skincare</h1>
      <p class="lead">Quando os produtos chegarem, é só começar. A primeira semana é de adaptação:</p>
      <ul class="welcome-list">${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <p class="muted">Depois de ${state.settings.adaptationDays} dias, o app passa sozinho para a rotina completa.</p>
      <button type="button" class="btn btn-primary btn-block btn-lg" data-action="start">Começar rotina hoje</button>
      <p class="muted small center">A data de início pode ser alterada depois, em Ajustes.</p>
      <p class="muted small center">Dica: tire as fotos de "antes" na aba Fotos antes de começar.</p>
    </section>`;
}

function beforeStart(plan) {
  return `
    <section class="card empty-state">
      <p>Sua rotina começa <strong>${formatShort(plan.phase.startDate)}</strong>.</p>
      <button type="button" class="btn btn-primary" data-action="start">Começar hoje</button>
    </section>`;
}

function summary(state, plan, entry, sun) {
  const { done, total } = progress(plan.expected, entry);
  const left = total - done;
  const complete = total > 0 && left === 0;
  const streak = streaks(state, plan.date).current;
  const streakText = streak > 0 ? ` · sequência de ${streak} ${streak === 1 ? 'dia' : 'dias'}` : '';
  return `
    <section class="card summary">
      ${ring(done, total)}
      <div class="summary-text">
        <p class="summary-title">${complete ? 'Dia concluído' : `${done} de ${total} passos`}</p>
        <p class="muted">${complete ? 'Tudo feito por hoje' : `${left === 1 ? 'Falta 1 passo' : `Faltam ${left} passos`}`}${streakText}</p>
      </div>
    </section>
    <div class="quick-actions">
      ${sun ? '' : `<button type="button" class="btn btn-soft" data-action="leave">${icons.sun}Vou sair</button>`}
      <button type="button" class="btn btn-soft" data-action="open-irritation">${icons.alert}Tive irritação</button>
    </div>`;
}

function notices(state, plan, entry, sun) {
  const cards = [];
  if (sun) cards.push(sunCard(state, sun));
  if (entry?.irritations?.some((i) => i.recurrence)) cards.push(dermCard());
  for (const area of AREAS) {
    const pause = plan.pauses[area.id];
    if (pause) cards.push(pauseCard(state, plan.date, area, pause));
  }
  return cards.join('');
}

function sunCard(state, sun) {
  const names = activeProducts(state).filter((p) => p.sunscreen).map((p) => p.name);
  if (sun.due) {
    return `
      <section class="card notice notice-accent">
        <div class="notice-icon">${icons.sun}</div>
        <div class="notice-body">
          <p class="notice-title">Hora de reaplicar o protetor</p>
          <p class="notice-text">${esc(joinList(names))}</p>
          <div class="notice-actions">
            <button type="button" class="btn btn-primary btn-sm" data-action="reapply">Reapliquei</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="back-home">Voltei pra casa</button>
          </div>
        </div>
      </section>`;
  }
  return `
    <section class="card notice notice-accent">
      <div class="notice-icon">${icons.sun}</div>
      <div class="notice-body">
        <p class="notice-title">Reaplicar o protetor às ${formatTime(sun.dueAt)}</p>
        <p class="notice-text">Rosto e corpo · faltam <span data-countdown>${formatDuration(sun.remainingMs)}</span></p>
        <div class="notice-actions">
          <button type="button" class="btn btn-soft btn-sm" data-action="add-calendar">${icons.calendarPlus}Adicionar ao Calendário</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="reapply">Reapliquei</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="back-home">Voltei</button>
        </div>
      </div>
    </section>`;
}

function photoCard(app, date) {
  if (app.photos.status !== 'ready') return '';
  const r = photoReminder(app.state.settings, app.photos.lastDate(), date);
  if (!r?.due || r.snoozed) return '';
  return `
    <section class="card notice notice-accent">
      <div class="notice-icon">${icons.camera}</div>
      <div class="notice-body">
        <p class="notice-title">${r.first ? 'Fotos de antes' : 'Hora das fotos de progresso'}</p>
        <p class="notice-text">${r.first
    ? 'Tire fotos de frente e dos dois lados para comparar depois.'
    : `Já faz ${r.daysSince} dias desde as últimas.`}</p>
        <div class="notice-actions">
          <a class="btn btn-primary btn-sm" href="#/fotos">Tirar fotos</a>
          <button type="button" class="btn btn-ghost btn-sm" data-action="snooze-photos">Hoje não</button>
        </div>
      </div>
    </section>`;
}

function dermCard() {
  return `
    <section class="card notice notice-danger">
      <div class="notice-icon">${icons.alert}</div>
      <div class="notice-body">
        <p class="notice-title">A irritação voltou logo depois da pausa</p>
        <p class="notice-text">Vale marcar uma consulta com um dermatologista antes de retomar os ativos.</p>
      </div>
    </section>`;
}

function pauseCard(state, date, area, pause) {
  const names = pausableProducts(state, area.id).map((p) => p.name);
  const until = pause.to === date ? 'último dia hoje' : `até ${formatShort(pause.to)}`;
  return `
    <section class="card notice notice-warn">
      <div class="notice-icon">${icons.pause}</div>
      <div class="notice-body">
        <p class="notice-title">Pausa ${area.inLabel} · ${until}</p>
        <ul class="notice-list">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        <div class="notice-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="end-pause" data-area="${area.id}">Encerrar pausa</button>
        </div>
      </div>
    </section>`;
}

function periodSection(period, plan, entry) {
  const items = plan.items.filter((i) => i.step.period === period.id);
  const supplement = plan.supplement?.period === period.id ? plan.supplement : null;
  if (!items.length && !supplement) return '';

  const ids = items.filter((i) => !i.skip).map((i) => i.step.id);
  const { done, total } = progress(ids, entry);
  const complete = total > 0 && done === total;

  const groups = AREAS.map((area) => {
    const list = items.filter((i) => i.step.area === area.id);
    if (!list.length) return '';
    return `
      <div class="group">
        <h3 class="group-title">${area.label}</h3>
        <ul class="checklist">${list.map((item) => itemRow(item, entry?.done?.includes(item.step.id) ?? false)).join('')}</ul>
      </div>`;
  }).join('');

  return `
    <section class="period">
      <header class="period-head">
        <h2>${period.label}</h2>
        <span class="period-count ${complete ? 'is-complete' : ''}">${complete ? `${icons.check}Concluída` : `${done}/${total}`}</span>
      </header>
      ${groups}
      ${supplement ? `
        <div class="group">
          <h3 class="group-title">Suplemento</h3>
          <ul class="checklist">${supplementRow(supplement, Boolean(entry?.supplement))}</ul>
        </div>` : ''}
    </section>`;
}

// ---------- Folha "Registrar irritação" ----------

function irritationSheet(app) {
  const { state } = app;
  const date = act.todayKey(state, app.now());
  const areas = AREA_CHOICES.find((c) => c.id === form.choice)?.areas ?? [];
  const recurrence = areas.some((a) => isRecurrence(state, date, a));
  const ready = areas.length > 0;

  const effect = areas.map((id) => {
    const names = pausableProducts(state, id).map((p) => p.name);
    return `<li><strong>${areaInfo(id).label}:</strong> ${esc(joinList(names))}</li>`;
  }).join('');

  return `
    <div class="sheet-head">
      <h2>Registrar irritação</h2>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fechar">${icons.close}</button>
    </div>

    <p class="field-label">Onde?</p>
    <div class="segmented" role="radiogroup" aria-label="Área">
      ${AREA_CHOICES.map((c) => `
        <button type="button" role="radio" aria-checked="${form.choice === c.id}" data-action="irr-area" data-value="${c.id}">${c.label}</button>`).join('')}
    </div>

    <p class="field-label">O que você sentiu?</p>
    <div class="toggle-group">
      ${SYMPTOMS.map((s) => `
        <button type="button" class="toggle" aria-pressed="${form.symptoms.includes(s.id)}" data-action="irr-symptom" data-value="${s.id}">${s.label}</button>`).join('')}
    </div>

    <p class="field-label">Pausar os ativos por</p>
    <div class="segmented" role="radiogroup" aria-label="Duração da pausa">
      ${[2, 3].map((d) => `
        <button type="button" role="radio" aria-checked="${form.days === d}" data-action="irr-days" data-value="${d}">${d} dias</button>`).join('')}
    </div>

    ${ready ? `
      <div class="sheet-info">
        <p>Saem do checklist:</p>
        <ul>${effect}</ul>
        <p class="muted small">De hoje até ${formatShort(addDays(date, form.days - 1))}. Dá para encerrar antes.</p>
      </div>` : ''}

    ${recurrence ? `
      <div class="sheet-alert">
        ${icons.alert}
        <p>A irritação voltou pouco depois da última pausa. Vale marcar uma consulta com um dermatologista.</p>
      </div>` : ''}

    <div class="sheet-actions">
      <button type="button" class="btn btn-primary btn-block" data-action="irr-submit" data-pause="yes" ${ready ? '' : 'disabled'}>Registrar e pausar</button>
      <button type="button" class="btn btn-ghost btn-block" data-action="irr-submit" data-pause="no" ${ready ? '' : 'disabled'}>Só registrar, sem pausar</button>
    </div>`;
}

const refreshSheet = (app) => app.openSheet(irritationSheet(app));

// ---------- Ações (data-action) ----------

export const actions = {
  start(app) {
    app.update((s) => act.startRoutine(s, act.todayKey(s, app.now())));
    app.toast('Rotina iniciada. Bom começo!');
  },

  toggle(app, el) {
    const now = app.now();
    app.update((s) => act.toggleStep(s, act.todayKey(s, now), el.dataset.step, now));
  },

  'toggle-supplement'(app) {
    app.update((s) => act.toggleSupplement(s, act.todayKey(s, app.now())));
  },

  leave(app) {
    app.update((s) => act.leaveHome(s, app.now()));
    const sun = sunscreenStatus(app.state, app.now());
    app.toast(`Lembrete às ${formatTime(sun.dueAt)}`);
  },

  reapply(app) {
    app.update((s) => act.reapplySunscreen(s, app.now()));
    const sun = sunscreenStatus(app.state, app.now());
    app.toast(`Próxima reaplicação às ${formatTime(sun.dueAt)}`);
  },

  'snooze-photos'(app) {
    const now = app.now();
    app.update((s) => act.updateSettings(s, { photoSnoozeDate: act.todayKey(s, now) }, now));
  },

  'back-home'(app) {
    app.update((s) => act.backHome(s));
  },

  'add-calendar'(app) {
    const sun = sunscreenStatus(app.state, app.now());
    if (!sun) return;
    const names = activeProducts(app.state).filter((p) => p.sunscreen).map((p) => p.name);
    const ics = buildEvent({
      uid: `protetor-${sun.dueAt.getTime()}@skincare`,
      title: 'Reaplicar protetor solar',
      description: `Rosto e corpo: ${joinList(names)}.`,
      start: sun.dueAt,
      now: app.now(),
    });
    openEvent(ics, 'reaplicar-protetor.ics');
  },

  'end-pause'(app, el) {
    const area = el.dataset.area;
    app.update((s) => act.endPause(s, { now: app.now(), area }));
    app.toast(`Pausa ${areaInfo(area).inLabel} encerrada`);
  },

  'open-irritation'(app) {
    form = { choice: null, symptoms: [], days: app.state.settings.pauseDefaultDays };
    refreshSheet(app);
  },

  'irr-area'(app, el) {
    form.choice = el.dataset.value;
    refreshSheet(app);
  },

  'irr-symptom'(app, el) {
    const id = el.dataset.value;
    form.symptoms = form.symptoms.includes(id) ? form.symptoms.filter((s) => s !== id) : [...form.symptoms, id];
    refreshSheet(app);
  },

  'irr-days'(app, el) {
    form.days = Number(el.dataset.value);
    refreshSheet(app);
  },

  'irr-submit'(app, el) {
    const areas = AREA_CHOICES.find((c) => c.id === form.choice)?.areas;
    if (!areas) return;
    const pauseDays = el.dataset.pause === 'yes' ? form.days : 0;
    app.update((s) => act.registerIrritation(s, { now: app.now(), areas, symptoms: form.symptoms, pauseDays }));
    app.closeSheet();
    const date = act.todayKey(app.state, app.now());
    app.toast(pauseDays
      ? `Pausa até ${formatShort(addDays(date, pauseDays - 1))}`
      : 'Irritação registrada');
  },

  'close-sheet'(app) {
    app.closeSheet();
  },
};

/** Chamado a cada poucos segundos: atualiza a contagem ou redesenha se algo mudou. */
export function tick(app) {
  const now = app.now();
  const sun = sunscreenStatus(app.state, now);
  if (act.todayKey(app.state, now) !== rendered.day || (sun ? sun.due : null) !== rendered.due) {
    app.render();
    return;
  }
  const countdown = document.querySelector('[data-countdown]');
  if (countdown && sun) countdown.textContent = formatDuration(sun.remainingMs);
}
