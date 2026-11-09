// Fotos de progresso, guardadas no IndexedDB do aparelho (não cabem no localStorage).
// Cada sessão é um dia com até três ângulos. As fotos têm um backup próprio,
// separado do backup da rotina, porque o arquivo fica grande.

import { makeThumb, prepareImage } from './images.js';

export const ANGLES = [
  { id: 'frente', label: 'Frente', short: 'Frente' },
  { id: 'esquerdo', label: 'Lado esquerdo', short: 'Esquerdo' },
  { id: 'direito', label: 'Lado direito', short: 'Direito' },
];

const DB_NAME = 'skincare-photos';
const STORE = 'sessions';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- IndexedDB ----------

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/** Roda uma operação numa transação e devolve o resultado quando ela termina. */
async function run(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Operação cancelada'));
  });
}

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

// ---------- Importação (regra pura, testável) ----------

/**
 * Decide o que entra de um backup de fotos sem apagar nada do aparelho:
 * sessões de dias novos entram inteiras; em dias que já existem, entram só os ângulos que faltam.
 */
export function planPhotoImport(existing, incoming) {
  const byDate = new Map(existing.map((s) => [s.date, s]));
  const plan = [];
  for (const session of incoming) {
    if (!DATE_RE.test(session?.date ?? '')) continue;
    const current = byDate.get(session.date);
    const angles = ANGLES.map((a) => a.id)
      .filter((id) => session.photos?.[id]?.data?.startsWith?.('data:image/') && !current?.photos?.[id]);
    if (angles.length) plan.push({ date: session.date, targetId: current?.id ?? null, angles, source: session });
  }
  return plan;
}

// ---------- Loja de fotos ----------

export function createPhotoStore() {
  let sessions = []; // da mais recente para a mais antiga
  let status = 'loading'; // 'loading' | 'ready' | 'error'
  const urls = new WeakMap(); // Blob → endereço para mostrar na tela

  const sort = () => sessions.sort((a, b) => b.date.localeCompare(a.date));
  const byId = (id) => sessions.find((s) => s.id === id) ?? null;
  const byDate = (date) => sessions.find((s) => s.date === date) ?? null;
  const save = (session) => run('readwrite', (store) => store.put(session));

  function remember(session) {
    sessions = byId(session.id) ? sessions.map((s) => (s.id === session.id ? session : s)) : [...sessions, session];
    sort();
  }

  function forget(photo) {
    for (const blob of [photo?.blob, photo?.thumb]) {
      const url = blob && urls.get(blob);
      if (url) {
        URL.revokeObjectURL(url);
        urls.delete(blob);
      }
    }
  }

  async function removeSession(id) {
    const session = byId(id);
    if (!session) return;
    await run('readwrite', (store) => store.delete(id));
    Object.values(session.photos).forEach(forget);
    sessions = sessions.filter((s) => s.id !== id);
  }

  return {
    get status() { return status; },
    get sessions() { return sessions; },
    byId,
    byDate,
    lastDate: () => sessions[0]?.date ?? null,
    photoCount: () => sessions.reduce((n, s) => n + Object.keys(s.photos).length, 0),
    totalBytes: () => sessions.reduce((n, s) => n
      + Object.values(s.photos).reduce((m, p) => m + p.blob.size + p.thumb.size, 0), 0),

    url(blob) {
      let url = urls.get(blob);
      if (!url) {
        url = URL.createObjectURL(blob);
        urls.set(blob, url);
      }
      return url;
    },

    async load() {
      try {
        sessions = (await run('readonly', (store) => store.getAll())) ?? [];
        sort();
        status = 'ready';
      } catch (err) {
        status = 'error';
        throw err;
      }
    },

    /** Guarda a foto de um ângulo na sessão do dia (cria a sessão na primeira foto). */
    async savePhoto({ date, angle, file, now = new Date() }) {
      const image = await prepareImage(file);
      const existing = byDate(date);
      const session = existing
        ? { ...existing, photos: { ...existing.photos } }
        : { id: newId(), date, note: '', createdAt: now.toISOString(), photos: {} };
      const replaced = session.photos[angle];
      session.photos[angle] = { ...image, takenAt: now.toISOString() };
      await save(session);
      forget(replaced);
      remember(session);
      return session;
    },

    /** Apaga uma foto. Se a sessão ficar vazia, apaga a sessão. Retorna a sessão ou null. */
    async removePhoto(sessionId, angle) {
      const existing = byId(sessionId);
      if (!existing?.photos[angle]) return existing;
      const photos = { ...existing.photos };
      const removed = photos[angle];
      delete photos[angle];
      if (!Object.keys(photos).length) {
        await removeSession(sessionId);
        return null;
      }
      const session = { ...existing, photos };
      await save(session);
      forget(removed);
      remember(session);
      return session;
    },

    /** Muda a data ou a anotação de uma sessão. */
    async update(sessionId, patch) {
      const existing = byId(sessionId);
      if (!existing) return null;
      if (patch.date && patch.date !== existing.date) {
        if (!DATE_RE.test(patch.date)) throw new Error('Data inválida.');
        if (byDate(patch.date)) throw new Error('Já existe uma sessão de fotos nesse dia.');
      }
      const session = { ...existing, ...patch };
      await save(session);
      remember(session);
      return session;
    },

    removeSession,

    async clearAll() {
      await run('readwrite', (store) => store.clear());
      sessions.forEach((s) => Object.values(s.photos).forEach(forget));
      sessions = [];
    },

    /** Backup das fotos: JSON com as imagens em base64, da sessão mais antiga para a mais nova. */
    async exportJson(now = new Date()) {
      const out = [];
      for (const s of [...sessions].reverse()) {
        const photos = {};
        for (const [angle, p] of Object.entries(s.photos)) {
          photos[angle] = { data: await toDataUrl(p.blob), width: p.width, height: p.height, takenAt: p.takenAt };
        }
        out.push({ id: s.id, date: s.date, note: s.note, createdAt: s.createdAt, photos });
      }
      return JSON.stringify({ app: 'skincare-photos', version: 1, exportedAt: now.toISOString(), sessions: out });
    },

    /** Importa um backup de fotos, somando ao que já está no aparelho. */
    async importJson(text) {
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('O arquivo não é um JSON válido.');
      }
      if (data?.app === 'skincare') throw new Error('Esse é o backup da rotina. Use "Importar", acima.');
      if (data?.app !== 'skincare-photos' || !Array.isArray(data.sessions)) {
        throw new Error('Esse arquivo não é um backup de fotos deste app.');
      }
      let added = 0;
      for (const item of planPhotoImport(sessions, data.sessions)) {
        const target = item.targetId ? byId(item.targetId) : null;
        const session = target
          ? { ...target, photos: { ...target.photos } }
          : {
            id: newId(),
            date: item.date,
            note: String(item.source.note ?? ''),
            createdAt: item.source.createdAt ?? new Date().toISOString(),
            photos: {},
          };
        for (const angle of item.angles) {
          const p = item.source.photos[angle];
          const blob = await (await fetch(p.data)).blob();
          session.photos[angle] = {
            blob,
            thumb: await makeThumb(blob),
            width: p.width,
            height: p.height,
            takenAt: p.takenAt ?? null,
          };
          added += 1;
        }
        await save(session);
        remember(session);
      }
      return { added };
    },
  };
}
