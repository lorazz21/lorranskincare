// Salva e carrega o estado no próprio aparelho (localStorage).
// As fotos (etapa 3) vão para o IndexedDB, porque não cabem aqui.

import { createInitialState, SCHEMA_VERSION } from './seed.js';

const KEY = 'skincare.state';

export function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (err) {
    console.error('Falha ao ler os dados salvos', err);
    // Guarda uma cópia do que estava salvo antes de recomeçar, para não perder nada.
    if (raw) {
      try { localStorage.setItem(`${KEY}.corrompido.${Date.now()}`, raw); } catch { /* sem espaço */ }
    }
  }
  return createInitialState();
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Falha ao salvar', err);
    return false;
  }
}

/** Completa dados salvos por versões anteriores com os campos novos. */
function migrate(saved) {
  const base = createInitialState();
  return {
    ...base,
    ...saved,
    settings: {
      ...base.settings,
      ...saved.settings,
      supplement: { ...base.settings.supplement, ...saved.settings?.supplement },
    },
    version: SCHEMA_VERSION,
  };
}

/** Pede ao navegador para não apagar os dados quando faltar espaço. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* não suportado: tudo bem */ }
}
