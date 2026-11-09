// Ponto de entrada: carrega os dados, desenha a aba atual e liga os eventos.

import { createPhotoStore } from './photos.js';
import { loadState, requestPersistence, saveState } from './store.js';
import { esc } from './ui.js';
import * as history from './views/history.js';
import * as photos from './views/photos.js';
import * as settings from './views/settings.js';
import * as today from './views/today.js';

const views = { hoje: today, historico: history, fotos: photos, ajustes: settings };

const viewEl = document.getElementById('view');
const sheetEl = document.getElementById('sheet');
const toastEl = document.getElementById('toast');
const fileInput = document.getElementById('file-input');
let toastTimer = null;
let currentRoute = null;
let pendingConfirm = null;

function persist() {
  if (!saveState(app.state)) app.toast('Não foi possível salvar no aparelho.');
}

const app = {
  state: loadState(),
  photos: createPhotoStore(),
  now: () => new Date(),

  /** Altera o estado, salva no aparelho e redesenha. */
  update(mutate) {
    mutate(app.state);
    persist();
    render();
  },

  /** Altera e salva sem redesenhar (campos de texto, para não perder o foco). */
  save(mutate) {
    mutate(app.state);
    persist();
  },

  /** Troca todos os dados (importar backup, apagar tudo). */
  replaceState(state) {
    app.state = state;
    persist();
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

  sheetOpen: () => sheetEl.open,

  /**
   * Abre o seletor de arquivo (no iPhone: câmera, fotos ou Arquivos) e devolve o
   * arquivo escolhido, ou null. Usa um campo fixo fora da tela: redesenhar a tela
   * enquanto o seletor está aberto não perde a escolha.
   */
  pickFile(accept) {
    return new Promise((resolve) => {
      fileInput.accept = accept;
      fileInput.value = '';
      fileInput.onchange = () => resolve(fileInput.files?.[0] ?? null);
      fileInput.oncancel = () => resolve(null);
      fileInput.click();
    });
  },

  /**
   * Pergunta antes de algo importante. Resolve true (confirmou), false (cancelou)
   * ou null (fechou a folha tocando fora).
   */
  confirm({ title, message, confirmLabel = 'Confirmar', danger = false }) {
    return new Promise((resolve) => {
      pendingConfirm?.(null);
      app.openSheet(`
        <div class="sheet-head"><h2>${esc(title)}</h2></div>
        <p>${esc(message)}</p>
        <div class="sheet-actions">
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" data-confirm="yes">${esc(confirmLabel)}</button>
          <button type="button" class="btn btn-ghost btn-block" data-confirm="no">Cancelar</button>
        </div>`);
      pendingConfirm = resolve;
    });
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

function resolveConfirm(value) {
  const resolve = pendingConfirm;
  pendingConfirm = null;
  app.closeSheet();
  resolve?.(value);
}

// Um único ouvinte por tipo de evento: data-action (clique), data-change e
// data-input (campos) chamam a ação de mesmo nome da tela atual.
document.addEventListener('click', (event) => {
  const confirmEl = event.target.closest('[data-confirm]');
  if (confirmEl) {
    resolveConfirm(confirmEl.dataset.confirm === 'yes');
    return;
  }
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const handler = views[routeName()].actions?.[el.dataset.action];
  if (!handler) return;
  event.preventDefault();
  handler(app, el, event);
});

for (const kind of ['change', 'input', 'pointerdown']) {
  document.addEventListener(kind, (event) => {
    const el = event.target.closest(`[data-${kind}]`);
    if (!el) return;
    views[routeName()].actions?.[el.dataset[kind]]?.(app, el, event);
  });
}

// Tocar fora da folha fecha a folha.
sheetEl.addEventListener('click', (event) => {
  if (event.target === sheetEl) app.closeSheet();
});
sheetEl.addEventListener('close', () => {
  if (pendingConfirm) resolveConfirm(null);
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
app.photos.load()
  .catch((err) => console.error('Fotos', err))
  .finally(render);

// Service worker: guarda os arquivos para o app abrir offline.
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js').catch((err) => console.error('Service worker', err));
  // Quando uma versão nova assume, recarrega uma vez para usá-la.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
}
