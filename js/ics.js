// Gera um evento de calendário (.ics) com alarme. É o jeito de o lembrete tocar
// com o app fechado: sem servidor, o iOS não deixa um app web agendar notificações.

const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261109T170500Z

const escapeText = (text) => text
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/([,;])/g, '\\$1');

/** Quebra linhas longas como pede o formato (continuação começa com espaço). */
function fold(line) {
  const parts = [];
  for (let i = 0; i < line.length; i += 70) parts.push(line.slice(i, i + 70));
  return parts.join('\r\n ');
}

export function buildEvent({ uid, title, description, start, minutes = 10, now = new Date() }) {
  const end = new Date(start.getTime() + minutes * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Skincare//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(title)}`,
    'TRIGGER:PT0S',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(fold).join('\r\n');
}

/** Entrega o .ics ao sistema; no iPhone ele oferece adicionar ao Calendário. */
export function openEvent(ics, filename = 'lembrete.ics') {
  const file = new File([ics], filename, { type: 'text/calendar' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
