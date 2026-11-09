// Datas da rotina são chaves 'AAAA-MM-DD' no fuso do aparelho.
// As contas entre chaves usam UTC para não sofrer com horário de verão.

const DAY_MS = 86_400_000;

export const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export const pad = (n) => String(n).padStart(2, '0');

/** Chave do dia local de um Date. */
export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Dia da rotina: antes de `startsAtHour` (ex.: 4h) ainda conta como o dia anterior. */
export function dayKey(now = new Date(), startsAtHour = 0) {
  return toKey(new Date(now.getTime() - startsAtHour * 3_600_000));
}

function utcMs(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const addDays = (key, n) => fromUtcMs(utcMs(key) + n * DAY_MS);
export const diffDays = (from, to) => Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
/** 0 = domingo … 6 = sábado */
export const weekday = (key) => new Date(utcMs(key)).getUTCDay();

/** "Segunda, 9 de novembro" */
export function formatLong(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${WEEKDAY_NAMES[weekday(key)]}, ${d} de ${MONTH_NAMES[m - 1]}`;
}

/** "qua, 11/11" */
export function formatShort(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${WEEKDAY_SHORT[weekday(key)]}, ${pad(d)}/${pad(m)}`;
}

/** "14:35" */
export const formatTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** "1h 07min", "2h", "12 min" */
export function formatDuration(ms) {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${pad(m)}min`;
}

/** ['a', 'b', 'c'] → "a, b e c" */
export function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** "2026-11" → "Novembro de 2026" */
export function formatMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const name = MONTH_NAMES[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
}

/** "2026-11" + 1 → "2026-12" */
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
