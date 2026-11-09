// Pequenos utilitários de interface: escape de texto, ícones e anel de progresso.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const svg = (body) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  calendarPlus: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>'),
  sliders: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  check: svg('<path d="M5 12.5 10 17.5 19 7"/>'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>'),
  pause: svg('<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  camera: svg('<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5Z"/><circle cx="12" cy="13" r="3.5"/>'),
  chevron: svg('<path d="m9 6 6 6-6 6"/>'),
  chevronLeft: svg('<path d="m15 6-6 6 6 6"/>'),
  up: svg('<path d="m6 15 6-6 6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  drop: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6c2.1 2.7 6.6 7.9 6.6 11.9a6.6 6.6 0 0 1-13.2 0c0-4 4.5-9.2 6.6-11.9Z"/></svg>',
};

/** Anel de progresso em SVG. */
export function ring(done, total) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const fraction = total ? done / total : 0;
  const pct = Math.round(fraction * 100);
  const complete = total > 0 && done === total;
  return `
    <div class="ring ${complete ? 'is-complete' : ''}" role="img" aria-label="${pct}% concluído">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle class="ring-track" cx="36" cy="36" r="${r}"/>
        <circle class="ring-value" cx="36" cy="36" r="${r}" transform="rotate(-90 36 36)"
          stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - fraction)).toFixed(2)}"/>
      </svg>
      <span class="ring-label">${complete ? icons.check : `${pct}%`}</span>
    </div>`;
}

/** Botões segmentados (escolha única). `options`: [{ id, label }] */
export function segmented(action, options, value, label = '') {
  return `
    <div class="segmented" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''}>
      ${options.map((o) => `
        <button type="button" role="radio" aria-checked="${o.id === value}" data-action="${action}" data-value="${esc(o.id)}">${esc(o.label)}</button>`).join('')}
    </div>`;
}

/** Linha com interruptor liga/desliga. */
export function switchRow({ action, checked, title, sub = '' }) {
  return `
    <button type="button" class="switch-row" role="switch" aria-checked="${Boolean(checked)}" data-action="${action}">
      <span class="switch-text">
        <span class="switch-title">${esc(title)}</span>
        ${sub ? `<span class="muted small">${esc(sub)}</span>` : ''}
      </span>
      <span class="switch" aria-hidden="true"></span>
    </button>`;
}

const PICKER_DAYS = [
  [1, 'Seg', 'segunda'], [2, 'Ter', 'terça'], [3, 'Qua', 'quarta'], [4, 'Qui', 'quinta'],
  [5, 'Sex', 'sexta'], [6, 'Sáb', 'sábado'], [0, 'Dom', 'domingo'],
];

/** Seletor de dias da semana (vários). `selected`: [0..6] */
export function weekdayPicker(action, selected) {
  return `
    <div class="weekday-picker">
      ${PICKER_DAYS.map(([day, short, name]) => `
        <button type="button" class="toggle" aria-pressed="${selected.includes(day)}" aria-label="${name}" data-action="${action}" data-value="${day}">${short}</button>`).join('')}
    </div>`;
}

/** 4404019 → "4,2 MB" */
export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
