// Linhas do checklist, usadas na tela Hoje e no detalhe do dia (Histórico).

import { formatShort } from '../dates.js';
import { esc, icons } from '../ui.js';

/**
 * Um passo do checklist. Itens com `skip` aparecem riscados, com o motivo.
 * `disabled`: só leitura (dias futuros).
 */
export function itemRow({ step, product, skip, pause }, checked, { action = 'toggle', disabled = false } = {}) {
  if (skip) {
    const reason = skip === 'pausa'
      ? `Em pausa até ${formatShort(pause.to)}`
      : 'Hoje não · fase de adaptação';
    return `
      <li>
        <div class="item is-skipped">
          <span class="box"></span>
          <span class="item-text">
            <span class="item-name">${esc(product.name)}</span>
            <span class="item-note">${reason}</span>
          </span>
        </div>
      </li>`;
  }
  return `
    <li>
      <button type="button" class="item" role="checkbox" aria-checked="${checked}" data-action="${action}" data-step="${esc(step.id)}" ${disabled ? 'disabled' : ''}>
        <span class="box">${icons.check}</span>
        <span class="item-text">
          <span class="item-name">${esc(product.name)}</span>
          ${step.note ? `<span class="item-note">${esc(step.note)}</span>` : ''}
        </span>
      </button>
    </li>`;
}

/** Linha do suplemento (opcional, não conta no progresso). */
export function supplementRow(supplement, checked, { action = 'toggle-supplement', disabled = false } = {}) {
  return `
    <li>
      <button type="button" class="item is-optional" role="checkbox" aria-checked="${checked}" data-action="${action}" ${disabled ? 'disabled' : ''}>
        <span class="box">${icons.check}</span>
        <span class="item-text">
          <span class="item-name">${esc(supplement.name)} <span class="tag">opcional</span></span>
          ${supplement.note ? `<span class="item-note">${esc(supplement.note)}</span>` : ''}
        </span>
      </button>
    </li>`;
}
