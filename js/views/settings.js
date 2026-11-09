// Tela "Ajustes" (etapa 2): produtos, rotina, data de início e backup.

import { formatShort } from '../dates.js';

export function render(app) {
  const { startDate } = app.state.settings;
  return `
    <header class="page-header"><h1>Ajustes</h1></header>
    <section class="card empty-state">
      <p>Início da rotina: <strong>${startDate ? formatShort(startDate) : 'ainda não começou'}</strong></p>
      <p class="muted small">Editar produtos e passos, mudar a data de início e fazer backup chegam na etapa 2.</p>
    </section>`;
}
