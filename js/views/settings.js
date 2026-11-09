// Tela "Ajustes": data de início, passos, produtos, suplemento, lembretes e backup.

import * as act from '../actions.js';
import { formatDuration, formatShort, formatTime, toKey } from '../dates.js';
import { shareOrDownload } from '../files.js';
import {
  activeProducts, activeSteps, AREAS, describeAdaptation, describeWeekdays, PERIODS, phaseOn, sortSteps,
} from '../routine.js';
import { createInitialState } from '../seed.js';
import { exportBackup, parseBackup } from '../store.js';
import { esc, icons, segmented, switchRow, weekdayPicker } from '../ui.js';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const INTERVALS = [60, 90, 120, 150, 180];
const PAUSE_OPTIONS = [{ id: '2', label: '2 dias' }, { id: '3', label: '3 dias' }];

let reorder = false;     // modo "Reordenar" na lista de passos
let stepDraft = null;    // passo sendo editado na folha
let productDraft = null; // produto sendo editado na folha

// ---------- Tela ----------

export function render(app) {
  const { state } = app;
  const today = act.todayKey(state, app.now());
  return `
    <header class="page-header"><h1>Ajustes</h1></header>
    ${routineSection(state, today)}
    ${stepsSection(state)}
    ${productsSection(state)}
    ${supplementSection(state)}
    ${remindersSection(state)}
    ${backupSection(state)}
    <button type="button" class="btn btn-ghost btn-block btn-danger-ghost" data-action="reset">Apagar todos os dados</button>`;
}

function routineSection(state, today) {
  const { startDate, adaptationDays } = state.settings;
  const phase = phaseOn(state.settings, today);
  const phaseText = {
    none: 'A rotina ainda não começou.',
    before: `A rotina começa ${startDate ? formatShort(startDate) : ''}.`,
    adaptation: `Hoje: adaptação, dia ${phase.day} de ${phase.of}.`,
    full: `Hoje: rotina completa, dia ${phase.day}.`,
  }[phase.kind];

  const dayOptions = Array.from({ length: 15 }, (_, n) =>
    `<option value="${n}" ${n === adaptationDays ? 'selected' : ''}>${n === 0 ? 'Sem adaptação' : `${n} ${n === 1 ? 'dia' : 'dias'}`}</option>`).join('');

  return `
    <section class="card settings">
      <h2 class="section-title">Rotina</h2>
      <label class="field-row">
        <span>Data de início</span>
        <input class="input" type="date" value="${startDate ?? ''}" data-change="start-date">
      </label>
      <label class="field-row">
        <span>Fase de adaptação</span>
        <select class="input" data-change="adaptation-days">${dayOptions}</select>
      </label>
      <p class="muted small">${phaseText}</p>
    </section>`;
}

function stepsSection(state) {
  const steps = sortSteps(activeSteps(state));
  const products = new Map(state.products.map((p) => [p.id, p]));

  const periods = PERIODS.map((period) => {
    const groups = AREAS.map((area) => {
      const group = steps.filter((s) => s.period === period.id && s.area === area.id);
      if (!group.length) return '';
      return `
        <p class="group-title">${area.label}</p>
        <ul class="rows">${group.map((s, i) => stepRow(s, products, i, group.length)).join('')}</ul>`;
    }).join('');
    return groups ? `<h3 class="sub-title">${period.label}</h3>${groups}` : '';
  }).join('');

  return `
    <section class="card settings">
      <div class="section-head">
        <h2 class="section-title">Passos da rotina</h2>
        <button type="button" class="link-btn" data-action="toggle-reorder">${reorder ? 'Concluir' : 'Reordenar'}</button>
      </div>
      ${periods || '<p class="muted">Nenhum passo cadastrado.</p>'}
      ${reorder ? '' : `<button type="button" class="btn btn-soft btn-block" data-action="new-step">${icons.plus}Adicionar passo</button>`}
    </section>`;
}

function stepRow(step, products, index, total) {
  const name = products.get(step.productId)?.name ?? 'Produto removido';
  const parts = [describeWeekdays(step.weekdays)];
  const adaptation = describeAdaptation(step);
  if (adaptation) parts.push(`adaptação: ${adaptation}`);
  if (step.note) parts.push(step.note);
  const text = `
    <span class="row-main">
      <span class="row-title">${esc(name)}</span>
      <span class="row-sub">${esc(parts.join(' · '))}</span>
    </span>`;

  if (reorder) {
    return `
      <li class="row">
        ${text}
        <span class="row-tools">
          <button type="button" class="icon-btn" data-action="step-up" data-id="${esc(step.id)}" aria-label="Subir" ${index === 0 ? 'disabled' : ''}>${icons.up}</button>
          <button type="button" class="icon-btn" data-action="step-down" data-id="${esc(step.id)}" aria-label="Descer" ${index === total - 1 ? 'disabled' : ''}>${icons.down}</button>
        </span>
      </li>`;
  }
  return `
    <li>
      <button type="button" class="row" data-action="edit-step" data-id="${esc(step.id)}">${text}${icons.chevron}</button>
    </li>`;
}

function productsSection(state) {
  const steps = activeSteps(state);
  const rows = activeProducts(state).map((p) => {
    const uses = steps.filter((s) => s.productId === p.id).length;
    const tags = [
      p.pausable && 'Ativo (pausa na irritação)',
      p.sunscreen && 'Protetor solar',
      uses ? `${uses} ${uses === 1 ? 'passo' : 'passos'}` : 'Fora da rotina',
    ].filter(Boolean);
    return `
      <li>
        <button type="button" class="row" data-action="edit-product" data-id="${esc(p.id)}">
          <span class="row-main">
            <span class="row-title">${esc(p.name)}</span>
            <span class="row-sub">${esc(tags.join(' · '))}</span>
          </span>
          ${icons.chevron}
        </button>
      </li>`;
  }).join('');

  return `
    <section class="card settings">
      <h2 class="section-title">Produtos</h2>
      <ul class="rows">${rows}</ul>
      <button type="button" class="btn btn-soft btn-block" data-action="new-product">${icons.plus}Adicionar produto</button>
    </section>`;
}

function supplementSection(state) {
  const sup = state.settings.supplement;
  return `
    <section class="card settings">
      <h2 class="section-title">Suplemento</h2>
      ${switchRow({ action: 'sup-enabled', checked: sup.enabled, title: 'Mostrar no checklist', sub: 'Aparece como opcional e não conta no progresso' })}
      <label class="field">
        <span class="field-label">Nome</span>
        <input class="input" type="text" value="${esc(sup.name)}" data-change="sup-name" autocomplete="off">
      </label>
      <p class="field-label">Quando</p>
      ${segmented('sup-period', PERIODS, sup.period, 'Período do suplemento')}
      <label class="field">
        <span class="field-label">Observação</span>
        <input class="input" type="text" value="${esc(sup.note)}" data-change="sup-note" autocomplete="off">
      </label>
    </section>`;
}

function remindersSection(state) {
  const { sunscreenIntervalMin, pauseDefaultDays } = state.settings;
  const options = INTERVALS.map((m) =>
    `<option value="${m}" ${m === sunscreenIntervalMin ? 'selected' : ''}>${formatDuration(m * 60_000)}</option>`).join('');
  return `
    <section class="card settings">
      <h2 class="section-title">Lembretes e pausa</h2>
      <label class="field-row">
        <span>Reaplicar protetor a cada</span>
        <select class="input" data-change="sun-interval">${options}</select>
      </label>
      <p class="field-label">Pausa sugerida ao registrar irritação</p>
      ${segmented('pause-default', PAUSE_OPTIONS, String(pauseDefaultDays), 'Pausa sugerida')}
    </section>`;
}

function backupSection(state) {
  const last = state.settings.lastBackupAt;
  const hasData = Object.keys(state.log).length > 0;
  const lastText = last
    ? `Último backup: ${formatShort(toKey(new Date(last)))} às ${formatTime(new Date(last))}`
    : 'Nenhum backup feito ainda';
  return `
    <section class="card settings">
      <h2 class="section-title">Backup</h2>
      <p class="small">Seus dados ficam só neste aparelho. Exporte um backup de vez em quando e sempre antes de apagar o app.</p>
      <p class="small ${!last && hasData ? 'text-warn' : 'muted'}">${lastText}</p>
      <div class="button-row">
        <button type="button" class="btn btn-primary" data-action="export">Exportar</button>
        <button type="button" class="btn btn-soft" data-action="import">Importar</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" data-change="import-file" hidden>
    </section>`;
}

// ---------- Folha: passo ----------

function draftFromStep(step) {
  const rule = step.adaptation;
  return {
    id: step.id,
    productId: step.productId,
    period: step.period,
    area: step.area,
    weekdays: step.weekdays?.length ? [...step.weekdays] : [...ALL_DAYS],
    adaptMode: !rule ? 'same' : rule.skip ? 'skip' : rule.alternate ? 'alternate' : 'weekdays',
    adaptDays: rule?.weekdays ? [...rule.weekdays] : [],
    note: step.note ?? '',
  };
}

function newStepDraft(state) {
  return {
    id: null,
    productId: activeProducts(state)[0]?.id ?? '',
    period: 'manha',
    area: 'rosto',
    weekdays: [...ALL_DAYS],
    adaptMode: 'same',
    adaptDays: [],
    note: '',
  };
}

/** Converte o rascunho no formato salvo, ou devolve uma mensagem de erro. */
function stepFields(state, d) {
  if (!activeProducts(state).some((p) => p.id === d.productId)) return { error: 'Escolha um produto.' };
  if (!d.weekdays.length) return { error: 'Escolha pelo menos um dia da semana.' };
  if (d.adaptMode === 'weekdays' && !d.adaptDays.length) return { error: 'Escolha os dias da fase de adaptação.' };
  const adaptation = {
    same: null,
    skip: { skip: true },
    alternate: { alternate: true },
    weekdays: { weekdays: [...d.adaptDays].sort() },
  }[d.adaptMode];
  return {
    fields: {
      id: d.id,
      productId: d.productId,
      period: d.period,
      area: d.area,
      weekdays: d.weekdays.length === 7 ? null : [...d.weekdays].sort(),
      adaptation,
      note: d.note.trim(),
    },
  };
}

function stepSheet(state) {
  const d = stepDraft;
  const products = activeProducts(state);
  const alternate = d.period === 'noite' ? 'Noites alternadas' : 'Manhãs alternadas';
  const modes = [['same', 'Igual à rotina'], ['weekdays', 'Só em alguns dias'], ['alternate', alternate], ['skip', 'Não usar']];
  return `
    <div class="sheet-head">
      <h2>${d.id ? 'Editar passo' : 'Novo passo'}</h2>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fechar">${icons.close}</button>
    </div>

    <label class="field">
      <span class="field-label">Produto</span>
      <select class="input" data-change="draft-product">
        ${products.map((p) => `<option value="${esc(p.id)}" ${p.id === d.productId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
    </label>

    <p class="field-label">Quando</p>
    ${segmented('draft-period', PERIODS, d.period, 'Período')}

    <p class="field-label">Onde</p>
    ${segmented('draft-area', AREAS, d.area, 'Área')}

    <p class="field-label">Dias da semana</p>
    ${weekdayPicker('draft-day', d.weekdays)}

    <label class="field">
      <span class="field-label">Na fase de adaptação</span>
      <select class="input" data-change="draft-adapt-mode">
        ${modes.map(([id, label]) => `<option value="${id}" ${id === d.adaptMode ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </label>
    ${d.adaptMode === 'weekdays' ? weekdayPicker('draft-adapt-day', d.adaptDays) : ''}

    <label class="field">
      <span class="field-label">Observação</span>
      <input class="input" type="text" value="${esc(d.note)}" placeholder="Ex.: áreas expostas" data-input="draft-note" autocomplete="off">
    </label>

    <div class="sheet-actions">
      <button type="button" class="btn btn-primary btn-block" data-action="save-step">Salvar</button>
      ${d.id ? '<button type="button" class="btn btn-ghost btn-block btn-danger-ghost" data-action="remove-step">Remover passo</button>' : ''}
    </div>`;
}

// ---------- Folha: produto ----------

function productSheet() {
  const d = productDraft;
  return `
    <div class="sheet-head">
      <h2>${d.id ? 'Editar produto' : 'Novo produto'}</h2>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fechar">${icons.close}</button>
    </div>
    <label class="field">
      <span class="field-label">Nome</span>
      <input class="input" type="text" value="${esc(d.name)}" placeholder="Ex.: Tônico calmante" data-input="pdraft-name" autocomplete="off">
    </label>
    ${switchRow({ action: 'pdraft-pausable', checked: d.pausable, title: 'Ativo', sub: 'Sai do checklist no modo pausa' })}
    ${switchRow({ action: 'pdraft-sunscreen', checked: d.sunscreen, title: 'Protetor solar', sub: 'Entra no lembrete de reaplicação' })}
    <div class="sheet-actions">
      <button type="button" class="btn btn-primary btn-block" data-action="save-product">Salvar</button>
      ${d.id ? '<button type="button" class="btn btn-ghost btn-block btn-danger-ghost" data-action="remove-product">Remover produto</button>' : ''}
    </div>`;
}

const showStepSheet = (app) => app.openSheet(stepSheet(app.state));
const showProductSheet = (app) => app.openSheet(productSheet());
const toggleIn = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

// ---------- Ações ----------

export const actions = {
  // Rotina
  'start-date'(app, el) {
    if (!el.value) return;
    app.update((s) => act.setStartDate(s, el.value, app.now()));
    app.toast('Data de início atualizada');
  },

  'adaptation-days'(app, el) {
    app.update((s) => act.updateSettings(s, { adaptationDays: Number(el.value) }, app.now()));
  },

  // Passos
  'toggle-reorder'(app) {
    reorder = !reorder;
    app.render();
  },

  'step-up'(app, el) {
    app.update((s) => act.moveStep(s, el.dataset.id, -1));
  },

  'step-down'(app, el) {
    app.update((s) => act.moveStep(s, el.dataset.id, 1));
  },

  'new-step'(app) {
    if (!activeProducts(app.state).length) {
      app.toast('Cadastre um produto primeiro');
      return;
    }
    stepDraft = newStepDraft(app.state);
    showStepSheet(app);
  },

  'edit-step'(app, el) {
    const step = app.state.steps.find((s) => s.id === el.dataset.id);
    if (!step) return;
    stepDraft = draftFromStep(step);
    showStepSheet(app);
  },

  'draft-product'(app, el) { stepDraft.productId = el.value; },
  'draft-note'(app, el) { stepDraft.note = el.value; },

  'draft-period'(app, el) {
    stepDraft.period = el.dataset.value;
    showStepSheet(app);
  },

  'draft-area'(app, el) {
    stepDraft.area = el.dataset.value;
    showStepSheet(app);
  },

  'draft-day'(app, el) {
    stepDraft.weekdays = toggleIn(stepDraft.weekdays, Number(el.dataset.value));
    showStepSheet(app);
  },

  'draft-adapt-mode'(app, el) {
    stepDraft.adaptMode = el.value;
    showStepSheet(app);
  },

  'draft-adapt-day'(app, el) {
    stepDraft.adaptDays = toggleIn(stepDraft.adaptDays, Number(el.dataset.value));
    showStepSheet(app);
  },

  'save-step'(app) {
    const { fields, error } = stepFields(app.state, stepDraft);
    if (error) {
      app.toast(error);
      return;
    }
    app.update((s) => act.saveStep(s, fields, app.now()));
    app.closeSheet();
    app.toast(fields.id ? 'Passo atualizado' : 'Passo adicionado');
  },

  async 'remove-step'(app) {
    const ok = await app.confirm({
      title: 'Remover passo?',
      message: 'Ele sai da rotina a partir de hoje. O histórico dos dias passados continua igual.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (ok === false) showStepSheet(app);
    if (!ok) return;
    app.update((s) => act.removeStep(s, stepDraft.id, app.now()));
    app.toast('Passo removido');
  },

  // Produtos
  'new-product'(app) {
    productDraft = { id: null, name: '', pausable: false, sunscreen: false };
    showProductSheet(app);
  },

  'edit-product'(app, el) {
    const p = app.state.products.find((x) => x.id === el.dataset.id);
    if (!p) return;
    productDraft = { id: p.id, name: p.name, pausable: p.pausable, sunscreen: p.sunscreen };
    showProductSheet(app);
  },

  'pdraft-name'(app, el) { productDraft.name = el.value; },

  'pdraft-pausable'(app) {
    productDraft.pausable = !productDraft.pausable;
    showProductSheet(app);
  },

  'pdraft-sunscreen'(app) {
    productDraft.sunscreen = !productDraft.sunscreen;
    showProductSheet(app);
  },

  'save-product'(app) {
    if (!productDraft.name.trim()) {
      app.toast('Dê um nome ao produto.');
      return;
    }
    app.update((s) => act.saveProduct(s, productDraft, app.now()));
    app.closeSheet();
    app.toast(productDraft.id ? 'Produto atualizado' : 'Produto adicionado');
  },

  async 'remove-product'(app) {
    if (activeSteps(app.state).some((s) => s.productId === productDraft.id)) {
      app.toast('Esse produto está na rotina. Remova os passos que usam ele primeiro.');
      return;
    }
    const ok = await app.confirm({
      title: 'Remover produto?',
      message: `"${productDraft.name}" sai da lista de produtos.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (ok === false) showProductSheet(app);
    if (!ok) return;
    app.update((s) => act.removeProduct(s, productDraft.id));
    app.toast('Produto removido');
  },

  // Suplemento (campos de texto salvam sem redesenhar, para não fechar o teclado)
  'sup-enabled'(app) {
    app.update((s) => act.updateSupplement(s, { enabled: !s.settings.supplement.enabled }));
  },

  'sup-name'(app, el) {
    app.save((s) => act.updateSupplement(s, { name: el.value.trim() || 'Suplemento' }));
  },

  'sup-note'(app, el) {
    app.save((s) => act.updateSupplement(s, { note: el.value.trim() }));
  },

  'sup-period'(app, el) {
    app.update((s) => act.updateSupplement(s, { period: el.dataset.value }));
  },

  // Lembretes
  'sun-interval'(app, el) {
    app.update((s) => act.updateSettings(s, { sunscreenIntervalMin: Number(el.value) }, app.now()));
  },

  'pause-default'(app, el) {
    app.update((s) => act.updateSettings(s, { pauseDefaultDays: Number(el.dataset.value) }, app.now()));
  },

  // Backup
  async 'export'(app) {
    const now = app.now();
    const text = exportBackup(app.state, now);
    const result = await shareOrDownload(text, `skincare-backup-${toKey(now)}.json`, 'application/json');
    if (result === 'cancelled') return;
    app.update((s) => { s.settings.lastBackupAt = now.toISOString(); });
    app.toast('Backup exportado');
  },

  'import'() {
    document.getElementById('import-file')?.click();
  },

  async 'import-file'(app, el) {
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    let backup;
    try {
      backup = parseBackup(await file.text());
    } catch (err) {
      app.toast(err.message);
      return;
    }
    const days = Object.keys(backup.state.log).length;
    const from = backup.exportedAt ? ` de ${formatShort(toKey(new Date(backup.exportedAt)))}` : '';
    const ok = await app.confirm({
      title: 'Restaurar backup?',
      message: `Os dados deste aparelho serão substituídos pelos do backup${from} (${days} ${days === 1 ? 'dia registrado' : 'dias registrados'}).`,
      confirmLabel: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    app.replaceState(backup.state);
    app.toast('Backup restaurado');
  },

  async reset(app) {
    const ok = await app.confirm({
      title: 'Apagar todos os dados?',
      message: 'Rotina, histórico e registros deste aparelho serão apagados. Se quiser guardar algo, exporte um backup antes.',
      confirmLabel: 'Apagar tudo',
      danger: true,
    });
    if (!ok) return;
    app.replaceState(createInitialState());
    location.hash = '#/hoje';
    app.toast('Dados apagados');
  },

  'close-sheet'(app) {
    app.closeSheet();
  },
};
