// Ponto de entrada: carrega os dados, desenha a aba atual e liga os eventos.

import { loadState, requestPersistence, saveState } from './store.js';
import * as history from './views/history.js';
import * as settings from './views/settings.js';
import * as today from './views/today.js';

const views = { hoje: today, historico: history, ajustes: settings };

const viewEl = document.getElementById('view');
const sheetEl = document.getElementById('sheet');
const toastEl = document.getElementById('toast');
let toastTimer = null;
let currentRoute = null;

const app = {
  state: loadState(),
  now: () => new Date(),

  /** Altera o estado, salva no aparelho e redesenha. */
  update(mutate) {
    mutate(app.state);
    if (!saveState(app.state)) app.toast('Não foi possível salvar no aparelho.');
    render();
  },

  render: () => render(),

  toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2600);
  },

  openSheet(html) {
    sheetEl.innerHTML = `<div class="sheet-inner">${html}</div>`;
    if (!sheetEl.open) sheetEl.showModal();
  },

  closeSheet() {
    if (sheetEl.open) sheetEl.close();
  },
};

function routeName() {
  const name = location.hash.replace(/^#\/?/, '');
  return views[name] ? name : 'hoje';
}

function render() {
  const name = routeName();
  viewEl.innerHTML = views[name].render(app);
  if (name !== currentRoute) {
    currentRoute = name;
    window.scrollTo(0, 0);
    for (const link of document.querySelectorAll('.tabbar a')) {
      if (link.dataset.tab === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }
}

// Um único ouvinte de cliques: elementos com data-action chamam a ação da tela atual.
document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const handler = views[routeName()].actions?.[el.dataset.action];
  if (!handler) return;
  event.preventDefault();
  handler(app, el, event);
});

// Tocar fora da folha fecha a folha.
sheetEl.addEventListener('click', (event) => {
  if (event.target === sheetEl) app.closeSheet();
});

window.addEventListener('hashchange', () => {
  app.closeSheet();
  render();
});

// Ao voltar para o app (ou a cada 15 s), atualiza a contagem e a virada do dia.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});
setInterval(() => {
  if (document.visibilityState === 'visible') views[routeName()].tick?.(app);
}, 15_000);

render();
requestPersistence();

// Service worker: guarda os arquivos para o app abrir offline.
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js').catch((err) => console.error('Service worker', err));
  // Quando uma versão nova assume, recarrega uma vez para usá-la.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
}
