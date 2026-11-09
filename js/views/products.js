// Tela "Produtos": tempo de uso de cada produto, pergunta "ainda tem?" e lista de compras.

import * as act from '../actions.js';
import { addDays, formatShort } from '../dates.js';
import { activeProducts, activeSteps } from '../routine.js';
import {
  attentionCount, daysOpen, openedText, previousDurations, productsInUse, shoppingList, stockChecksDue,
  USAGE_SCALE_DAYS,
} from '../stock.js';
import { esc, icons, switchRow } from '../ui.js';

let draft = null; // produto sendo editado na folha

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------- Pedaços usados também na tela Hoje ----------

/**
 * Card "Ainda tem produto suficiente?" com os produtos cuja pergunta venceu.
 * `compact` (tela Hoje): com mais de 2 produtos, mostra só o resumo e um atalho,
 * para o checklist do dia não ficar lá embaixo.
 */
export function stockCard(app, today, { compact = false } = {}) {
  const due = stockChecksDue(app.state, today);
  if (!due.length) return '';
  const recheck = app.state.settings.productRecheckDays;
  if (compact && due.length > 2) {
    return `
      <section class="card notice notice-accent">
        <div class="notice-icon">${icons.bottle}</div>
        <div class="notice-body">
          <p class="notice-title">Ainda tem produto suficiente?</p>
          <p class="notice-text">Hora de conferir ${due.length} produtos. Se ainda tiver de todos, é só um toque.</p>
          <div class="notice-actions">
            <button type="button" class="btn btn-primary btn-sm" data-action="stock-all-ok">Tenho de todos</button>
            <a class="btn btn-ghost btn-sm" href="#/produtos">Ver um por um</a>
          </div>
        </div>
      </section>`;
  }
  return `
    <section class="card notice notice-accent">
      <div class="notice-icon">${icons.bottle}</div>
      <div class="notice-body">
        <p class="notice-title">Ainda tem produto suficiente?</p>
        ${due.length > 1 ? '<div class="notice-actions"><button type="button" class="btn btn-soft btn-sm" data-action="stock-all-ok">Tenho de todos</button></div>' : ''}
        <ul class="stock-list">
          ${due.map((p) => `
            <li>
              <span class="stock-name">${esc(p.name)}</span>
              <span class="stock-sub">${openedText(daysOpen(p, today))}</span>
              <span class="notice-actions">
                <button type="button" class="btn btn-primary btn-sm" data-action="stock-ok" data-id="${esc(p.id)}">Tenho, sim</button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="stock-low" data-id="${esc(p.id)}">Está acabando</button>
              </span>
            </li>`).join('')}
        </ul>
        <p class="notice-text small">Se ainda tiver, pergunto de novo em ${recheck} dias.</p>
      </div>
    </section>`;
}

/** Ações dos botões do estoque (usadas aqui e na tela Hoje). */
export const stockActions = {
  'stock-ok'(app, el) {
    const now = app.now();
    app.update((s) => act.answerStock(s, el.dataset.id, true, now));
    const next = addDays(act.todayKey(app.state, now), app.state.settings.productRecheckDays);
    app.toast(`Pergunto de novo ${formatShort(next)}`);
  },

  'stock-low'(app, el) {
    app.update((s) => act.answerStock(s, el.dataset.id, false, app.now()));
    app.toast('Foi para a lista de compras');
  },

  'stock-all-ok'(app) {
    const now = app.now();
    const ids = stockChecksDue(app.state, act.todayKey(app.state, now)).map((p) => p.id);
    app.update((s) => ids.forEach((id) => act.answerStock(s, id, true, now)));
    app.toast(`Pergunto de novo em ${app.state.settings.productRecheckDays} dias`);
  },

  'stock-bought'(app, el) {
    app.update((s) => act.markBought(s, el.dataset.id, app.now()));
    app.toast('Marcado como comprado');
  },

  'stock-open'(app, el) {
    const now = app.now();
    app.update((s) => act.openProduct(s, el.dataset.id, act.todayKey(s, now)));
    app.toast(`Novo aberto hoje. Pergunto em ${app.state.settings.productCheckDays} dias.`);
  },

  'stock-clear'(app, el) {
    app.update((s) => act.clearRestock(s, el.dataset.id, app.now()));
    app.toast('Saiu da lista de compras');
  },
};

/** Número para o selo da aba Produtos. */
export const badge = (app) => attentionCount(app.state, act.todayKey(app.state, app.now()));

// ---------- Tela ----------

export function render(app) {
  const { state } = app;
  const today = act.todayKey(state, app.now());
  const inUse = productsInUse(state);
  const inUseIds = new Set(inUse.map((p) => p.id));
  const others = activeProducts(state).filter((p) => !inUseIds.has(p.id));
  const { productCheckDays, productRecheckDays } = state.settings;

  return `
    <header class="page-header"><h1>Produtos</h1></header>
    ${stockCard(app, today)}
    ${shoppingSection(state)}
    <section class="card settings">
      <h2 class="section-title">Em uso</h2>
      ${inUse.length
    ? `<ul class="rows">${inUse.map((p) => productRow(state, p, today)).join('')}</ul>`
    : '<p class="muted">Nenhum produto na rotina.</p>'}
    </section>
    ${others.length ? `
      <section class="card settings">
        <h2 class="section-title">Fora da rotina</h2>
        <ul class="rows">${others.map((p) => productRow(state, p, today)).join('')}</ul>
      </section>` : ''}
    <button type="button" class="btn btn-soft btn-block" data-action="new-product">${icons.plus}Adicionar produto</button>
    <p class="muted small center">Com ${productCheckDays} dias de uso, o app pergunta se ainda tem produto. Se tiver, pergunta de novo a cada ${productRecheckDays} dias.</p>`;
}

function shoppingSection(state) {
  const list = shoppingList(state);
  if (!list.length) return '';
  const rows = list.map((p) => {
    const bought = p.restock.status === 'bought';
    const sub = bought ? `Comprado em ${formatShort(p.restock.since)} · esperando abrir` : `Acabando desde ${formatShort(p.restock.since)}`;
    const buttons = bought
      ? `<button type="button" class="btn btn-primary btn-sm" data-action="stock-open" data-id="${esc(p.id)}">Abri o novo</button>`
      : `<button type="button" class="btn btn-primary btn-sm" data-action="stock-bought" data-id="${esc(p.id)}">Comprei</button>
         <button type="button" class="btn btn-ghost btn-sm" data-action="stock-open" data-id="${esc(p.id)}">Abri um novo</button>
         <button type="button" class="btn btn-ghost btn-sm" data-action="stock-clear" data-id="${esc(p.id)}">Ainda tenho</button>`;
    return `
      <li>
        <span class="stock-name">${esc(p.name)}</span>
        <span class="stock-sub">${sub}</span>
        <span class="notice-actions">${buttons}</span>
      </li>`;
  }).join('');
  return `
    <section class="card notice notice-warn">
      <div class="notice-icon">${icons.bag}</div>
      <div class="notice-body">
        <p class="notice-title">Para comprar</p>
        <ul class="stock-list">${rows}</ul>
      </div>
    </section>`;
}

function productRow(state, p, today) {
  const days = daysOpen(p, today);
  const late = days !== null && days >= state.settings.productCheckDays;
  let sub;
  if (p.restock?.status === 'low') sub = 'Acabando · na lista de compras';
  else if (p.restock?.status === 'bought') sub = 'Novo já comprado · esperando abrir';
  else if (days === null) sub = 'Ainda não aberto';
  else sub = `${openedText(days)} · ${p.nextCheck <= today ? 'pergunta pendente' : `pergunto ${formatShort(p.nextCheck)}`}`;
  const bar = days === null ? '' : `
    <span class="usage" aria-hidden="true">
      <span class="usage-fill ${late ? 'is-late' : ''}" style="width: ${Math.min(100, Math.max(2, (days / USAGE_SCALE_DAYS) * 100))}%"></span>
    </span>`;
  return `
    <li>
      <button type="button" class="row" data-action="edit-product" data-id="${esc(p.id)}">
        <span class="row-main">
          <span class="row-title">${esc(p.name)}</span>
          <span class="row-sub">${esc(sub)}</span>
          ${bar}
        </span>
        ${icons.chevron}
      </button>
    </li>`;
}

// ---------- Folha: produto ----------

function productSheet(app) {
  const d = draft;
  const product = d.id ? app.state.products.find((p) => p.id === d.id) : null;
  const history = product ? previousDurations(product) : [];
  const uses = d.id ? activeSteps(app.state).filter((s) => s.productId === d.id).length : 0;
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
    <label class="field-row">
      <span>Aberto em</span>
      <input class="input" type="date" value="${d.openedAt ?? ''}" data-input="pdraft-opened">
    </label>
    <p class="muted small">Deixe vazio se ainda não abriu. ${d.id && !uses ? 'Este produto não está em nenhum passo da rotina.' : ''}</p>
    ${history.length ? `
      <p class="field-label">Embalagens anteriores</p>
      <ul class="records">${history.map((h) => `<li>${formatShort(h.from)} → ${formatShort(h.to)} · durou ${plural(h.days, 'dia', 'dias')}</li>`).join('')}</ul>` : ''}
    <div class="sheet-actions">
      <button type="button" class="btn btn-primary btn-block" data-action="save-product">Salvar</button>
      ${product?.openedAt ? `<button type="button" class="btn btn-soft btn-block" data-action="open-new">Abri um novo hoje</button>` : ''}
      ${d.id ? '<button type="button" class="btn btn-ghost btn-block btn-danger-ghost" data-action="remove-product">Remover produto</button>' : ''}
    </div>`;
}

const showProductSheet = (app) => app.openSheet(productSheet(app));

// ---------- Ações ----------

export const actions = {
  ...stockActions,

  'new-product'(app) {
    draft = { id: null, name: '', pausable: false, sunscreen: false, openedAt: act.todayKey(app.state, app.now()) };
    showProductSheet(app);
  },

  'edit-product'(app, el) {
    const p = app.state.products.find((x) => x.id === el.dataset.id);
    if (!p) return;
    draft = { id: p.id, name: p.name, pausable: p.pausable, sunscreen: p.sunscreen, openedAt: p.openedAt };
    showProductSheet(app);
  },

  'pdraft-name'(app, el) { draft.name = el.value; },
  'pdraft-opened'(app, el) { draft.openedAt = el.value || null; },

  'pdraft-pausable'(app) {
    draft.pausable = !draft.pausable;
    showProductSheet(app);
  },

  'pdraft-sunscreen'(app) {
    draft.sunscreen = !draft.sunscreen;
    showProductSheet(app);
  },

  'save-product'(app) {
    if (!draft.name.trim()) {
      app.toast('Dê um nome ao produto.');
      return;
    }
    const { openedAt } = draft;
    app.update((s) => {
      const before = draft.id ? s.products.find((p) => p.id === draft.id)?.openedAt ?? null : null;
      const product = act.saveProduct(s, draft, app.now());
      if (openedAt !== before) {
        if (openedAt && !before) act.openProduct(s, product.id, openedAt);
        else act.setOpenedAt(s, product.id, openedAt);
      }
    });
    app.closeSheet();
    app.toast(draft.id ? 'Produto atualizado' : 'Produto adicionado');
  },

  'open-new'(app) {
    const now = app.now();
    app.update((s) => act.openProduct(s, draft.id, act.todayKey(s, now)));
    app.closeSheet();
    app.toast(`Novo aberto hoje. Pergunto em ${app.state.settings.productCheckDays} dias.`);
  },

  async 'remove-product'(app) {
    if (activeSteps(app.state).some((s) => s.productId === draft.id)) {
      app.toast('Esse produto está na rotina. Remova os passos que usam ele primeiro (em Ajustes).');
      return;
    }
    const ok = await app.confirm({
      title: 'Remover produto?',
      message: `"${draft.name}" sai da lista de produtos.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (ok === false) showProductSheet(app);
    if (!ok) return;
    app.update((s) => act.removeProduct(s, draft.id));
    app.toast('Produto removido');
  },

  'close-sheet'(app) {
    app.closeSheet();
  },
};
