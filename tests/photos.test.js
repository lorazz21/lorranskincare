import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../js/seed.js';
import { photoReminder } from '../js/routine.js';
import { planPhotoImport } from '../js/photos.js';
import { parseBackup } from '../js/store.js';
import { formatBytes } from '../js/ui.js';

const settings = (patch = {}) => ({ ...createInitialState().settings, startDate: '2026-11-16', ...patch });

test('fotos de antes: pedidas desde o início, enquanto não houver fotos', () => {
  assert.equal(photoReminder(settings({ startDate: null }), null, '2026-11-16').due, false);
  assert.equal(photoReminder(settings(), null, '2026-11-15').due, false); // antes do início
  const r = photoReminder(settings(), null, '2026-11-16');
  assert.deepEqual(r, { first: true, next: '2026-11-16', due: true, snoozed: false, daysSince: null });
});

test('depois, a cada 14 dias desde as últimas fotos', () => {
  let r = photoReminder(settings(), '2026-11-16', '2026-11-29');
  assert.equal(r.due, false);
  assert.equal(r.next, '2026-11-30');
  r = photoReminder(settings(), '2026-11-16', '2026-11-30');
  assert.equal(r.due, true);
  assert.equal(r.daysSince, 14);
  // Se atrasar, continua pedindo até tirar.
  assert.equal(photoReminder(settings(), '2026-11-16', '2026-12-10').due, true);
});

test('"Hoje não" adia só até amanhã; intervalo configurável; desligado', () => {
  const s = settings({ photoSnoozeDate: '2026-11-30' });
  assert.equal(photoReminder(s, '2026-11-16', '2026-11-30').snoozed, true);
  assert.equal(photoReminder(s, '2026-11-16', '2026-12-01').snoozed, false);
  assert.equal(photoReminder(settings({ photoIntervalDays: 7 }), '2026-11-16', '2026-11-23').due, true);
  assert.equal(photoReminder(settings({ photoIntervalDays: 0 }), null, '2026-11-16'), null);
});

const photo = { data: 'data:image/jpeg;base64,AAAA', width: 10, height: 10 };

test('importar fotos: dias novos entram inteiros, dias existentes só completam ângulos', () => {
  const existing = [{ id: 'a', date: '2026-11-16', photos: { frente: {} } }];
  const incoming = [
    { date: '2026-11-16', photos: { frente: photo, esquerdo: photo } },
    { date: '2026-11-30', photos: { frente: photo, direito: photo } },
  ];
  const plan = planPhotoImport(existing, incoming);
  assert.deepEqual(plan.map((p) => [p.date, p.targetId, p.angles]), [
    ['2026-11-16', 'a', ['esquerdo']],
    ['2026-11-30', null, ['frente', 'direito']],
  ]);
});

test('importar fotos: ignora o que já existe e dados estranhos', () => {
  const existing = [{ id: 'a', date: '2026-11-16', photos: { frente: {}, esquerdo: {}, direito: {} } }];
  const incoming = [
    { date: '2026-11-16', photos: { frente: photo } },     // já tem
    { date: 'ontem', photos: { frente: photo } },          // data inválida
    { date: '2026-12-01', photos: { nuca: photo } },       // ângulo desconhecido
    { date: '2026-12-02', photos: { frente: { data: 'javascript:alert(1)' } } }, // não é imagem
    null,
  ];
  assert.deepEqual(planPhotoImport(existing, incoming), []);
});

test('backups trocados dão mensagem clara', () => {
  assert.throws(() => parseBackup(JSON.stringify({ app: 'skincare-photos', sessions: [] })), /backup das fotos/);
});

test('tamanho em KB e MB', () => {
  assert.equal(formatBytes(300), '1 KB');
  assert.equal(formatBytes(512 * 1024), '512 KB');
  assert.equal(formatBytes(4.2 * 1024 * 1024), '4,2 MB');
});
