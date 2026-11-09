import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../js/seed.js';
import { addDays } from '../js/dates.js';
import {
  describeAdaptation, describeWeekdays, planFor, sortSteps, streaks, pausableProducts,
} from '../js/routine.js';
import { exportBackup, migrate, parseBackup } from '../js/store.js';
import * as act from '../js/actions.js';

const START = '2026-11-16'; // segunda-feira
const noon = (key) => new Date(`${key}T12:00:00`);

function started() {
  const state = createInitialState();
  act.startRoutine(state, START);
  return state;
}

/** Marca todos os passos do dia. */
function completeDay(state, date, now = noon(date)) {
  for (const id of planFor(state, date).expected) act.toggleStep(state, date, id, now);
}

test('sequência atual conta até ontem enquanto hoje está em andamento', () => {
  const state = started();
  const today = addDays(START, 4);
  for (let i = 1; i <= 3; i++) completeDay(state, addDays(START, i), noon(today));
  assert.deepEqual(streaks(state, today), { current: 3, best: 3 });
  completeDay(state, today);
  assert.deepEqual(streaks(state, today), { current: 4, best: 4 });
});

test('dia incompleto quebra a sequência, mas o recorde fica', () => {
  const state = started();
  const today = addDays(START, 9);
  for (const i of [0, 1, 2, 3, 4]) completeDay(state, addDays(START, i), noon(today));
  // dia 5 parcial
  act.toggleStep(state, addDays(START, 5), planFor(state, addDays(START, 5)).expected[0], noon(today));
  for (const i of [6, 7]) completeDay(state, addDays(START, i), noon(today));
  // ontem (dia 8) vazio
  assert.deepEqual(streaks(state, today), { current: 0, best: 5 });
});

test('sequência ignora dias antes da data de início', () => {
  const state = started();
  completeDay(state, START);
  // Mudar o início para terça faz terça virar o dia 1 (que inclui o EC-01).
  act.setStartDate(state, addDays(START, 1), noon(addDays(START, 1)));
  completeDay(state, addDays(START, 1));
  assert.deepEqual(streaks(state, addDays(START, 1)), { current: 1, best: 1 });
  assert.deepEqual(streaks(createInitialState(), START), { current: 0, best: 0 });
});

test('corrigir um dia passado não reescreve a lista daquele dia', () => {
  const state = started();
  const past = addDays(START, 1); // terça: AA-2
  act.toggleStep(state, past, 'manha-rosto-gl02', noon(past));
  const before = [...state.log[past].expected];
  // Depois, a rotina muda: novo passo todo dia.
  const today = addDays(START, 3);
  act.saveStep(state, { productId: 'CH-01', period: 'manha', area: 'rosto', weekdays: null, adaptation: null, note: '' }, noon(today));
  act.toggleStep(state, past, 'manha-rosto-vc10', noon(today));
  assert.deepEqual(state.log[past].expected, before);
  // Já o dia de hoje acompanha a rotina nova.
  act.toggleStep(state, today, 'manha-rosto-gl02', noon(today));
  assert.equal(state.log[today].expected.length, planFor(state, today).expected.length);
  assert.ok(planFor(state, today).items.some((i) => i.step.period === 'manha' && i.product.id === 'CH-01'));
});

test('dia passado sem registro usa as regras ao ser marcado', () => {
  const state = started();
  const past = addDays(START, 2);
  act.toggleStep(state, past, 'manha-rosto-gl02', noon(addDays(START, 5)));
  assert.deepEqual(state.log[past].expected, planFor(state, past).expected);
});

test('novo passo entra no fim do grupo; mudar de área move para o fim do novo grupo', () => {
  const state = started();
  const now = noon(START);
  const step = act.saveStep(state, {
    productId: 'CH-01', period: 'noite', area: 'corpo', weekdays: [0, 6], adaptation: null, note: 'Pés',
  }, now);
  const nightBody = sortSteps(state.steps.filter((s) => s.period === 'noite' && s.area === 'corpo'));
  assert.equal(nightBody[nightBody.length - 1].id, step.id);
  assert.deepEqual(step.weekdays, [0, 6]);

  act.saveStep(state, { ...step, area: 'rosto' }, now);
  const nightFace = sortSteps(state.steps.filter((s) => s.period === 'noite' && s.area === 'rosto'));
  assert.equal(nightFace[nightFace.length - 1].id, step.id);
});

test('reordenar troca a posição dentro do grupo', () => {
  const state = started();
  act.moveStep(state, 'manha-rosto-ps05', -1);
  const ids = sortSteps(state.steps.filter((s) => s.period === 'manha' && s.area === 'rosto')).map((s) => s.id);
  assert.deepEqual(ids, ['manha-rosto-gl02', 'manha-rosto-ps05', 'manha-rosto-vc10']);
  act.moveStep(state, 'manha-rosto-gl02', -1); // já é o primeiro: nada muda
  assert.equal(sortSteps(state.steps.filter((s) => s.period === 'manha' && s.area === 'rosto'))[0].id, 'manha-rosto-gl02');
});

test('remover passo: apaga se nunca foi usado, arquiva se está no histórico', () => {
  const state = started();
  const now = noon(START);
  const fresh = act.saveStep(state, { productId: 'CH-01', period: 'manha', area: 'rosto', weekdays: null, adaptation: null, note: '' }, now);
  act.removeStep(state, fresh.id, now);
  assert.equal(state.steps.some((s) => s.id === fresh.id), false);

  act.toggleStep(state, START, 'manha-rosto-vc10', now);
  act.removeStep(state, 'manha-rosto-vc10', noon(addDays(START, 1)));
  const vc = state.steps.find((s) => s.id === 'manha-rosto-vc10');
  assert.equal(vc.archived, true);
  assert.equal(planFor(state, addDays(START, 1)).items.some((i) => i.step.id === vc.id), false);
  assert.ok(state.log[START].expected.includes(vc.id)); // o histórico continua com ele
  // Pausa no rosto já não lista a vitamina C.
  assert.equal(pausableProducts(state, 'rosto').some((p) => p.id === 'VC-10'), false);
});

test('remover produto: bloqueia se está na rotina; arquiva se só o histórico usa', () => {
  const state = started();
  const now = noon(START);
  assert.deepEqual(act.removeProduct(state, 'GL-02'), { ok: false, reason: 'in-use' });

  const product = act.saveProduct(state, { name: '  Tônico  ', pausable: false, sunscreen: false }, now);
  assert.equal(product.name, 'Tônico');
  assert.deepEqual(act.removeProduct(state, product.id), { ok: true });
  assert.equal(state.products.some((p) => p.id === product.id), false);

  act.toggleStep(state, START, 'noite-corpo-ec01', now);
  act.removeStep(state, 'noite-corpo-ec01', now);
  assert.deepEqual(act.removeProduct(state, 'EC-01'), { ok: true });
  assert.equal(state.products.find((p) => p.id === 'EC-01').archived, true);
});

test('produto que vira "ativo" entra na pausa', () => {
  const state = started();
  act.saveProduct(state, { id: 'CH-01', name: 'Creme Hidratante Facial', pausable: true, sunscreen: false }, noon(START));
  assert.ok(pausableProducts(state, 'rosto').some((p) => p.id === 'CH-01'));
});

test('mudar a duração da adaptação muda a fase', () => {
  const state = started();
  act.updateSettings(state, { adaptationDays: 0 }, noon(START));
  assert.equal(planFor(state, START).phase.kind, 'full');
});

test('backup: exportar e importar devolve os mesmos dados', () => {
  const state = started();
  completeDay(state, START);
  act.registerIrritation(state, { now: noon(addDays(START, 1)), areas: ['rosto'], pauseDays: 2 });
  const text = exportBackup(state, new Date('2026-11-20T10:00:00Z'));
  const { state: restored, exportedAt } = parseBackup(text);
  assert.deepEqual(restored, state);
  assert.equal(exportedAt, '2026-11-20T10:00:00.000Z');
});

test('backup: aceita o estado puro e completa campos novos', () => {
  const old = createInitialState();
  delete old.settings.lastBackupAt;
  delete old.pauses;
  const { state } = parseBackup(JSON.stringify(old));
  assert.equal(state.settings.lastBackupAt, null);
  assert.deepEqual(state.pauses, []);
  assert.deepEqual(migrate({ ...old, settings: { startDate: START } }).settings.supplement.name, 'Glutationa oral');
});

test('backup: recusa arquivos inválidos com mensagem clara', () => {
  assert.throws(() => parseBackup('não é json'), /não é um JSON válido/);
  assert.throws(() => parseBackup('{"foo": 1}'), /não parece um backup/);
  assert.throws(() => parseBackup('null'), /não parece um backup/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'skincare', state: { settings: {} } })), /não parece um backup/);
});

test('textos dos dias e da adaptação', () => {
  assert.equal(describeWeekdays(null), 'Todo dia');
  assert.equal(describeWeekdays([0, 1, 2, 3, 4, 5, 6]), 'Todo dia');
  assert.equal(describeWeekdays([5, 1, 3]), 'seg, qua e sex');
  assert.equal(describeWeekdays([0, 6]), 'sáb e dom');
  assert.equal(describeAdaptation({ period: 'noite', adaptation: { alternate: true } }), 'noites alternadas');
  assert.equal(describeAdaptation({ period: 'noite', adaptation: { weekdays: [5, 1] } }), 'só seg e sex');
  assert.equal(describeAdaptation({ period: 'manha', adaptation: { skip: true } }), 'fica de fora');
  assert.equal(describeAdaptation({ period: 'manha', adaptation: null }), null);
});
