// Tela "Fotos": sessões de fotos de progresso e comparação antes e depois.

import * as act from '../actions.js';
import { diffDays, formatLong, formatShort } from '../dates.js';
import { shareOrDownload } from '../files.js';
import { ANGLES } from '../photos.js';
import { photoReminder } from '../routine.js';
import { esc, formatBytes, icons, segmented } from '../ui.js';

const MODES = [{ id: 'lado', label: 'Lado a lado' }, { id: 'deslizar', label: 'Deslizar' }];
const TIPS = 'Mesma luz e mesmo lugar toda vez, rosto limpo, cabelo preso e sem filtro. Assim a comparação fica justa.';

let editing = null;   // sessão aberta na folha: { id, date } (id é null até a primeira foto)
let busyAngle = null; // ângulo cuja foto está sendo processada
let viewer = null;    // foto ampliada: { id, angle, from: 'session' | 'compare' }
const compare = { before: null, after: null, angle: 'frente', mode: 'lado', pos: 50 };

const angleLabel = (id) => ANGLES.find((a) => a.id === id)?.label ?? id;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function dayLabel(state, date) {
  const start = state.settings.startDate;
  if (!start) return '';
  const n = diffDays(start, date);
  return n < 0 ? 'Antes do início' : `Dia ${n + 1}`;
}

// ---------- Tela ----------

export function render(app) {
  const { state, photos } = app;
  const header = '<header class="page-header"><h1>Fotos</h1></header>';
  if (photos.status === 'loading') return `${header}<p class="muted">Carregando…</p>`;
  if (photos.status === 'error') {
    return `${header}
      <section class="card empty-state">
        <p>Não foi possível abrir o armazenamento de fotos neste navegador.</p>
      </section>`;
  }
  const today = act.todayKey(state, app.now());
  return `
    ${header}
    ${statusCard(state, photos, today)}
    <button type="button" class="btn btn-primary btn-block btn-lg" data-action="open-today">
      ${icons.camera}${photos.byDate(today) ? 'Continuar fotos de hoje' : 'Tirar fotos de hoje'}
    </button>
    ${compareSection(app)}
    ${sessionsSection(app)}`;
}

function statusCard(state, photos, today) {
  const r = photoReminder(state.settings, photos.lastDate(), today);
  if (!r) return '';
  let title;
  let text;
  if (r.first) {
    title = 'Fotos de antes';
    text = 'Tire fotos de frente e dos dois lados antes de começar ou logo no início. Elas são a base da comparação.';
  } else if (r.due) {
    title = 'Hora das fotos de progresso';
    text = `Já faz ${plural(r.daysSince, 'dia', 'dias')} desde as últimas.`;
  } else {
    title = `Próximas fotos: ${formatShort(r.next)}`;
    text = `Daqui a ${plural(diffDays(today, r.next), 'dia', 'dias')}. O lembrete é a cada ${state.settings.photoIntervalDays} dias.`;
  }
  return `
    <section class="card notice ${r.first || r.due ? 'notice-accent' : 'notice-quiet'}">
      <div class="notice-icon">${icons.camera}</div>
      <div class="notice-body">
        <p class="notice-title">${title}</p>
        <p class="notice-text">${text}</p>
      </div>
    </section>`;
}

function compareSection(app) {
  const { photos, state } = app;
  const { sessions } = photos;
  if (sessions.length === 0) return '';
  if (sessions.length === 1) {
    return `
      <section class="card empty-state">
        <h2 class="section-title">Antes e depois</h2>
        <p class="muted small">Depois da próxima sessão de fotos, a comparação aparece aqui.</p>
      </section>`;
  }

  if (!photos.byId(compare.before)) compare.before = sessions[sessions.length - 1].id;
  if (!photos.byId(compare.after)) compare.after = sessions[0].id;
  const before = photos.byId(compare.before);
  const after = photos.byId(compare.after);
  const gap = Math.abs(diffDays(before.date, after.date));

  const options = (selected) => [...sessions].reverse().map((s) => {
    const day = dayLabel(state, s.date);
    const label = day.startsWith('Dia') ? `${formatShort(s.date)} · ${day}` : formatShort(s.date);
    return `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${label}</option>`;
  }).join('');

  const pb = before.photos[compare.angle];
  const pa = after.photos[compare.angle];
  let body;
  if (compare.mode === 'lado') {
    body = `
      <div class="compare-grid">
        ${figure(photos, before, 'Antes')}
        ${figure(photos, after, 'Depois')}
      </div>`;
  } else if (pb && pa) {
    body = `
      <div class="compare-slider" style="--pos: ${compare.pos}%" data-pointerdown="cmp-drag">
        <img src="${photos.url(pb.blob)}" alt="Antes: ${angleLabel(compare.angle)}, ${formatShort(before.date)}">
        <img class="compare-top" src="${photos.url(pa.blob)}" alt="Depois: ${angleLabel(compare.angle)}, ${formatShort(after.date)}">
        <span class="compare-handle" aria-hidden="true"></span>
        <span class="compare-tag compare-tag-before">Antes</span>
        <span class="compare-tag compare-tag-after">Depois</span>
      </div>
      <p class="muted small center">Arraste sobre a foto para comparar.</p>`;
  } else {
    body = '<p class="muted small">Esse ângulo não tem foto nas duas sessões.</p>';
  }

  return `
    <section class="card compare">
      <h2 class="section-title">Antes e depois</h2>
      <div class="compare-pickers">
        <label class="field-row">
          <span>Antes</span>
          <select class="input" data-change="cmp-before">${options(before.id)}</select>
        </label>
        <label class="field-row">
          <span>Depois</span>
          <select class="input" data-change="cmp-after">${options(after.id)}</select>
        </label>
      </div>
      ${segmented('cmp-angle', ANGLES.map((a) => ({ id: a.id, label: a.short })), compare.angle, 'Ângulo')}
      ${body}
      <p class="muted small center">${gap === 0 ? 'Mesmo dia' : `${plural(gap, 'dia', 'dias')} entre as fotos`}</p>
      ${segmented('cmp-mode', MODES, compare.mode, 'Modo de comparação')}
    </section>`;
}

function figure(photos, session, caption) {
  const photo = session.photos[compare.angle];
  const image = photo
    ? `<button type="button" class="photo-btn" data-action="view-photo" data-id="${session.id}" data-angle="${compare.angle}" data-from="compare">
         <img src="${photos.url(photo.blob)}" alt="${caption}: ${angleLabel(compare.angle)}, ${formatShort(session.date)}">
       </button>`
    : '<div class="photo-empty">Sem foto</div>';
  return `
    <figure class="compare-fig">
      ${image}
      <figcaption><strong>${caption}</strong> · ${formatShort(session.date)}</figcaption>
    </figure>`;
}

function sessionsSection(app) {
  const { photos, state } = app;
  if (!photos.sessions.length) {
    return `
      <section class="card empty-state">
        <p>Nenhuma foto ainda.</p>
        <p class="muted small">${TIPS}</p>
      </section>`;
  }
  const items = photos.sessions.map((s) => {
    const sub = [dayLabel(state, s.date), s.note].filter(Boolean).map(esc).join(' · ');
    const thumbs = ANGLES.map((a) => (s.photos[a.id]
      ? `<img src="${photos.url(s.photos[a.id].thumb)}" alt="${a.label}" loading="lazy">`
      : '<span class="thumb-empty"></span>')).join('');
    return `
      <li>
        <button type="button" class="session" data-action="open-session" data-id="${s.id}">
          <span class="session-head">
            <span class="row-title">${formatLong(s.date)}</span>
            ${sub ? `<span class="row-sub">${sub}</span>` : ''}
          </span>
          <span class="session-thumbs">${thumbs}</span>
        </button>
      </li>`;
  }).join('');
  return `
    <section class="card settings">
      <h2 class="section-title">Sessões</h2>
      <ul class="session-list">${items}</ul>
      <p class="muted small">${plural(photos.photoCount(), 'foto', 'fotos')} · ${formatBytes(photos.totalBytes())} neste aparelho. O backup das fotos fica em Ajustes.</p>
    </section>`;
}

// ---------- Folhas ----------

const currentSession = (app) => (editing.id ? app.photos.byId(editing.id) : app.photos.byDate(editing.date));

function sessionSheet(app) {
  const { photos, state } = app;
  const session = currentSession(app);
  if (session) editing = { id: session.id, date: session.date };
  const date = session?.date ?? editing.date;
  const label = dayLabel(state, date);

  const slots = ANGLES.map((angle) => {
    const photo = session?.photos[angle.id];
    let inner = `${icons.camera}<span>Adicionar</span>`;
    if (busyAngle === angle.id) inner = '<span class="spinner" role="status" aria-label="Processando"></span>';
    else if (photo) inner = `<img src="${photos.url(photo.thumb)}" alt="${angle.label}">`;
    return `
      <div class="angle-slot">
        <button type="button" class="angle-photo ${photo ? 'has-photo' : ''}" data-action="${photo ? 'view-photo' : 'pick-photo'}"
          data-angle="${angle.id}" data-id="${session?.id ?? ''}" data-from="session" ${busyAngle ? 'disabled' : ''}>${inner}</button>
        <span class="angle-label">${angle.label}</span>
      </div>`;
  }).join('');

  return `
    <div class="sheet-head">
      <div class="sheet-title">
        <h2>${formatLong(date)}</h2>
        ${label ? `<span class="chip">${label}</span>` : ''}
      </div>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fechar">${icons.close}</button>
    </div>
    <p class="muted small">${TIPS}</p>
    <div class="angle-grid">${slots}</div>
    ${session ? `
      <label class="field-row">
        <span>Data</span>
        <input class="input" type="date" value="${session.date}" data-change="session-date">
      </label>
      <label class="field">
        <span class="field-label">Anotação</span>
        <input class="input" type="text" value="${esc(session.note)}" placeholder="Ex.: manchas da testa mais claras" data-change="session-note" autocomplete="off">
      </label>` : ''}
    <div class="sheet-actions">
      <button type="button" class="btn btn-primary btn-block" data-action="close-sheet">Pronto</button>
      ${session ? '<button type="button" class="btn btn-ghost btn-block btn-danger-ghost" data-action="delete-session">Apagar sessão</button>' : ''}
    </div>`;
}

function viewerSheet(app) {
  const session = app.photos.byId(viewer.id);
  const photo = session?.photos[viewer.angle];
  if (!photo) return null;
  const fromSession = viewer.from === 'session';
  return `
    <div class="sheet-head">
      <div class="sheet-title">
        <h2>${angleLabel(viewer.angle)}</h2>
        <span class="muted small">${formatLong(session.date)}</span>
      </div>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fechar">${icons.close}</button>
    </div>
    <img class="viewer-img" src="${app.photos.url(photo.blob)}" alt="${angleLabel(viewer.angle)}, ${formatShort(session.date)}">
    <div class="sheet-actions">
      <button type="button" class="btn btn-soft btn-block" data-action="share-photo">Salvar no iPhone</button>
      ${fromSession ? `
        <div class="button-row">
          <button type="button" class="btn btn-ghost" data-action="pick-photo" data-angle="${viewer.angle}" data-id="${session.id}">Trocar foto</button>
          <button type="button" class="btn btn-ghost btn-danger-ghost" data-action="delete-photo">Apagar foto</button>
        </div>
        <button type="button" class="btn btn-primary btn-block" data-action="back-to-session">Voltar</button>` : ''}
    </div>`;
}

function showSession(app) {
  viewer = null;
  app.openSheet(sessionSheet(app));
}

function showViewer(app) {
  const html = viewerSheet(app);
  if (html) app.openSheet(html);
  else if (editing) showSession(app);
  else app.closeSheet();
}

// ---------- Ações ----------

export const actions = {
  'open-today'(app) {
    editing = { id: null, date: act.todayKey(app.state, app.now()) };
    showSession(app);
  },

  'open-session'(app, el) {
    const session = app.photos.byId(el.dataset.id);
    if (!session) return;
    editing = { id: session.id, date: session.date };
    showSession(app);
  },

  async 'pick-photo'(app, el) {
    const { angle } = el.dataset;
    const file = await app.pickFile('image/*'); // abre a câmera ou a galeria
    if (!file || !editing) return;
    const date = currentSession(app)?.date ?? editing.date;
    busyAngle = angle;
    showSession(app);
    try {
      await app.photos.savePhoto({ date, angle, file, now: app.now() });
      app.toast(`${angleLabel(angle)}: foto salva`);
    } catch (err) {
      console.error(err);
      app.toast(err.message || 'Não consegui salvar a foto.');
    } finally {
      busyAngle = null;
      app.render();
      if (app.sheetOpen()) showSession(app);
    }
  },

  'view-photo'(app, el) {
    viewer = { id: el.dataset.id, angle: el.dataset.angle, from: el.dataset.from };
    showViewer(app);
  },

  'back-to-session'(app) {
    showSession(app);
  },

  async 'share-photo'(app) {
    const session = app.photos.byId(viewer.id);
    const photo = session?.photos[viewer.angle];
    if (!photo) return;
    await shareOrDownload(photo.blob, `skincare-${session.date}-${viewer.angle}.jpg`, 'image/jpeg');
  },

  async 'delete-photo'(app) {
    const ok = await app.confirm({
      title: 'Apagar foto?',
      message: `A foto "${angleLabel(viewer.angle)}" desse dia será apagada deste aparelho.`,
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (ok === false) showViewer(app);
    if (!ok) return;
    const session = await app.photos.removePhoto(viewer.id, viewer.angle);
    app.render();
    app.toast('Foto apagada');
    if (session) showSession(app);
    else editing = null;
  },

  async 'delete-session'(app) {
    const session = currentSession(app);
    if (!session) return;
    const count = Object.keys(session.photos).length;
    const ok = await app.confirm({
      title: 'Apagar sessão?',
      message: `${count === 1 ? 'A foto' : `As ${count} fotos`} de ${formatShort(session.date)} ${count === 1 ? 'será apagada' : 'serão apagadas'} deste aparelho.`,
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (ok === false) showSession(app);
    if (!ok) return;
    await app.photos.removeSession(session.id);
    editing = null;
    app.render();
    app.toast('Sessão apagada');
  },

  async 'session-date'(app, el) {
    const session = currentSession(app);
    if (!session || !el.value) return;
    try {
      await app.photos.update(session.id, { date: el.value });
    } catch (err) {
      app.toast(err.message);
    }
    app.render();
    showSession(app);
  },

  async 'session-note'(app, el) {
    const session = currentSession(app);
    if (!session) return;
    await app.photos.update(session.id, { note: el.value.trim() });
    app.render();
  },

  'cmp-before'(app, el) { compare.before = el.value; app.render(); },
  'cmp-after'(app, el) { compare.after = el.value; app.render(); },
  'cmp-angle'(app, el) { compare.angle = el.dataset.value; app.render(); },
  'cmp-mode'(app, el) { compare.mode = el.dataset.value; app.render(); },

  /** Arrastar sobre a foto move a divisória entre "antes" e "depois". */
  'cmp-drag'(app, el, event) {
    const move = (e) => {
      const box = el.getBoundingClientRect();
      compare.pos = Math.round(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)));
      el.style.setProperty('--pos', `${compare.pos}%`);
    };
    const stop = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', stop);
      el.removeEventListener('pointercancel', stop);
    };
    move(event);
    el.setPointerCapture?.(event.pointerId);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
  },

  'close-sheet'(app) {
    app.closeSheet();
  },
};
