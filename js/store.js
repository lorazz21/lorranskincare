// Salva e carrega o estado no próprio aparelho (localStorage), e monta o backup em JSON.
// As fotos (etapa 3) vão para o IndexedDB, porque não cabem aqui.

import { addDays } from './dates.js';
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

/** Completa dados de versões anteriores (ou de um backup) com os campos novos. */
export function migrate(saved) {
  const base = createInitialState();
  const settings = {
    ...base.settings,
    ...saved.settings,
    supplement: { ...base.settings.supplement, ...saved.settings?.supplement },
  };
  const fromV1 = (saved.version ?? 1) < 2;
  const products = (saved.products ?? base.products).map((p) => {
    const product = { nextCheck: null, restock: null, openings: [], ...p };
    delete product.durationDays;
    // Versão 1 não tinha estoque: quem já começou a rotina abriu os produtos no início.
    if (fromV1 && !product.openedAt && settings.startDate) product.openedAt = settings.startDate;
    if (product.openedAt && !product.openings.length) product.openings = [product.openedAt];
    if (product.openedAt && !product.nextCheck) product.nextCheck = addDays(product.openedAt, settings.productCheckDays);
    return product;
  });
  return {
    ...base,
    ...saved,
    settings,
    products,
    log: saved.log ?? {},
    pauses: saved.pauses ?? [],
    version: SCHEMA_VERSION,
  };
}

// ---------- Backup ----------

export function exportBackup(state, now = new Date()) {
  return JSON.stringify({ app: 'skincare', exportedAt: now.toISOString(), state }, null, 2);
}

/** Lê o texto de um backup. Lança um erro com mensagem em português se não servir. */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (data?.app === 'skincare-photos') throw new Error('Esse é o backup das fotos. Use "Importar fotos".');
  const state = data?.app === 'skincare' ? data.state : data;
  const valid = state && typeof state === 'object'
    && state.settings && typeof state.settings === 'object'
    && Array.isArray(state.products) && Array.isArray(state.steps)
    && state.log && typeof state.log === 'object';
  if (!valid) throw new Error('Esse arquivo não parece um backup deste app.');
  return { state: migrate(state), exportedAt: data.exportedAt ?? null };
}

/** Pede ao navegador para não apagar os dados quando faltar espaço. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* não suportado: tudo bem */ }
}
