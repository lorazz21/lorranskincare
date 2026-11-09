import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../js/seed.js';
import { addDays, dayKey, formatDuration, weekday } from '../js/dates.js';
import { dayStatus, isRecurrence, phaseOn, planFor, sunscreenStatus } from '../js/routine.js';
import * as act from '../js/actions.js';

// 2026-11-16 é uma segunda-feira.
const START = '2026-11-16';

function started(startDate = START) {
  const state = createInitialState();
  act.startRoutine(state, startDate);
  return state;
}

/** Ids de produto que contam no dia, por período e área. */
function todo(state, date, period, area) {
  return planFor(state, date).items
    .filter((i) => !i.skip && i.step.period === period && i.step.area === area)
    .map((i) => i.product.id);
}

/** Meio-dia local do dia, para usar como "agora". */
const noon = (key) => new Date(`${key}T12:00:00`);

test('o dia vira às 4h da manhã', () => {
  assert.equal(dayKey(new Date(2026, 10, 10, 2, 30), 4), '2026-11-09');
  assert.equal(dayKey(new Date(2026, 10, 10, 4, 0), 4), '2026-11-10');
});

test('sem data de início, o checklist fica vazio', () => {
  const state = createInitialState();
  assert.equal(phaseOn(state.settings, START).kind, 'none');
  assert.deepEqual(planFor(state, START).items, []);
});

test('antes da data de início não há checklist', () => {
  const state = started();
  assert.equal(phaseOn(state.settings, addDays(START, -1)).kind, 'before');
  assert.deepEqual(planFor(state, addDays(START, -1)).expected, []);
});

test('fase de adaptação dura 7 dias', () => {
  const state = started();
  assert.deepEqual(phaseOn(state.settings, START), { kind: 'adaptation', day: 1, of: 7 });
  assert.equal(phaseOn(state.settings, addDays(START, 6)).day, 7);
  assert.equal(phaseOn(state.settings, addDays(START, 7)).kind, 'full');
});

test('manhã: limpeza, vitamina C e protetor; corpo com protetor', () => {
  const state = started();
  assert.deepEqual(todo(state, START, 'manha', 'rosto'), ['GL-02', 'VC-10', 'PS-05']);
  assert.deepEqual(todo(state, START, 'manha', 'corpo'), ['PS-03']);
});

test('adaptação: AL-10 só seg e sex, quarta sem sérum, AA-2 ter/qui/sáb', () => {
  const state = started();
  const mon = START;
  const tue = addDays(START, 1);
  const wed = addDays(START, 2);
  const fri = addDays(START, 4);
  const sat = addDays(START, 5);
  const sun = addDays(START, 6);
  assert.equal(weekday(wed), 3);

  assert.deepEqual(todo(state, mon, 'noite', 'rosto'), ['GL-02', 'AL-10', 'CH-01']);
  assert.deepEqual(todo(state, tue, 'noite', 'rosto'), ['GL-02', 'AA-2', 'CH-01']);
  assert.deepEqual(todo(state, wed, 'noite', 'rosto'), ['GL-02', 'CH-01']);
  assert.deepEqual(todo(state, fri, 'noite', 'rosto'), ['GL-02', 'AL-10', 'CH-01']);
  assert.deepEqual(todo(state, sat, 'noite', 'rosto'), ['GL-02', 'AA-2', 'CH-01']);
  assert.deepEqual(todo(state, sun, 'noite', 'rosto'), ['GL-02', 'CH-01']);

  // O AL-10 da quarta aparece como "hoje não (adaptação)".
  const al10 = planFor(state, wed).items.find((i) => i.product.id === 'AL-10');
  assert.equal(al10.skip, 'adaptacao');
});

test('adaptação: EC-01 em noites alternadas a partir do dia 1', () => {
  const state = started();
  const nights = [0, 1, 2, 3, 4, 5, 6].map((i) => todo(state, addDays(START, i), 'noite', 'corpo'));
  assert.deepEqual(nights, [['EC-01'], [], ['EC-01'], [], ['EC-01'], [], ['EC-01']]);
});

test('adaptação alternada conta do dia de início, não do dia da semana', () => {
  const wednesday = '2026-11-18';
  const state = started(wednesday);
  assert.deepEqual(todo(state, wednesday, 'noite', 'corpo'), ['EC-01']);
  assert.deepEqual(todo(state, addDays(wednesday, 1), 'noite', 'corpo'), []);
  // Começando numa quarta, a primeira quarta fica sem sérum.
  assert.deepEqual(todo(state, wednesday, 'noite', 'rosto'), ['GL-02', 'CH-01']);
});

test('rotina completa: AL-10 seg/qua/sex, AA-2 ter/qui/sáb, domingo sem sérum, EC-01 toda noite', () => {
  const state = started();
  const week2 = (i) => addDays(START, 7 + i); // segunda da semana 2 + i
  const serums = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    todo(state, week2(i), 'noite', 'rosto').filter((id) => id === 'AL-10' || id === 'AA-2'));
  assert.deepEqual(serums, [['AL-10'], ['AA-2'], ['AL-10'], ['AA-2'], ['AL-10'], ['AA-2'], []]);
  for (let i = 0; i < 7; i++) assert.deepEqual(todo(state, week2(i), 'noite', 'corpo'), ['EC-01']);
  assert.equal(planFor(state, week2(0)).expected.length, 8);
});

test('suplemento aparece de manhã, mas não conta no progresso', () => {
  const state = started();
  const plan = planFor(state, START);
  assert.equal(plan.supplement.period, 'manha');
  assert.equal(plan.expected.length, 8);
  state.settings.supplement.enabled = false;
  assert.equal(planFor(state, START).supplement, null);
});

test('pausa no rosto: saem VC-10, AL-10 e AA-2; ficam limpeza, hidratante e protetor', () => {
  const state = started();
  const day = addDays(START, 9); // quarta da semana 2
  act.registerIrritation(state, { now: noon(day), areas: ['rosto'], symptoms: ['ardencia'], pauseDays: 3 });

  for (const d of [day, addDays(day, 1), addDays(day, 2)]) {
    assert.deepEqual(todo(state, d, 'manha', 'rosto'), ['GL-02', 'PS-05']);
    assert.deepEqual(todo(state, d, 'noite', 'rosto'), ['GL-02', 'CH-01']);
    // O corpo não é afetado.
    assert.deepEqual(todo(state, d, 'manha', 'corpo'), ['PS-03']);
    assert.deepEqual(todo(state, d, 'noite', 'corpo'), ['EC-01']);
  }
  // No 4º dia volta ao normal (sábado: AA-2).
  assert.deepEqual(todo(state, addDays(day, 3), 'noite', 'rosto'), ['GL-02', 'AA-2', 'CH-01']);
  // Os pausados aparecem marcados como pausa.
  const vc = planFor(state, day).items.find((i) => i.product.id === 'VC-10');
  assert.equal(vc.skip, 'pausa');
});

test('pausa no corpo: sai o EC-01, o protetor continua', () => {
  const state = started();
  const day = addDays(START, 8);
  act.registerIrritation(state, { now: noon(day), areas: ['corpo'], pauseDays: 2 });
  assert.deepEqual(todo(state, day, 'noite', 'corpo'), []);
  assert.deepEqual(todo(state, day, 'manha', 'corpo'), ['PS-03']);
  assert.deepEqual(todo(state, day, 'manha', 'rosto'), ['GL-02', 'VC-10', 'PS-05']);
  assert.deepEqual(todo(state, addDays(day, 1), 'noite', 'corpo'), []);
  assert.deepEqual(todo(state, addDays(day, 2), 'noite', 'corpo'), ['EC-01']);
});

test('os dois: pausa rosto e corpo', () => {
  const state = started();
  const day = addDays(START, 8);
  act.registerIrritation(state, { now: noon(day), areas: ['rosto', 'corpo'], pauseDays: 3 });
  assert.equal(state.pauses.length, 2);
  assert.equal(planFor(state, day).expected.length, 5); // GL-02, PS-05, PS-03, GL-02, CH-01
});

test('registrar sem pausar não muda o checklist', () => {
  const state = started();
  const day = addDays(START, 8);
  act.registerIrritation(state, { now: noon(day), areas: ['rosto'], symptoms: ['vermelhidao'] });
  assert.equal(state.pauses.length, 0);
  assert.equal(state.log[day].irritations.length, 1);
  assert.equal(planFor(state, day).expected.length, 8);
});

test('encerrar a pausa antes: os ativos voltam no mesmo dia', () => {
  const state = started();
  const day = addDays(START, 8);
  act.registerIrritation(state, { now: noon(day), areas: ['rosto'], pauseDays: 3 });
  const nextDay = addDays(day, 1);
  act.endPause(state, { now: noon(nextDay), area: 'rosto' });
  assert.deepEqual(todo(state, nextDay, 'manha', 'rosto'), ['GL-02', 'VC-10', 'PS-05']);
  // O dia anterior continua registrado como pausa.
  assert.equal(state.pauses[0].to, day);

  // Encerrar no mesmo dia em que começou cancela a pausa.
  const other = started();
  act.registerIrritation(other, { now: noon(day), areas: ['corpo'], pauseDays: 3 });
  act.endPause(other, { now: noon(day), area: 'corpo' });
  assert.equal(other.pauses.length, 0);
});

test('nova irritação durante a pausa estende a pausa existente', () => {
  const state = started();
  const day = addDays(START, 8);
  act.registerIrritation(state, { now: noon(day), areas: ['rosto'], pauseDays: 2 });
  act.registerIrritation(state, { now: noon(addDays(day, 1)), areas: ['rosto'], pauseDays: 3 });
  assert.equal(state.pauses.length, 1);
  assert.equal(state.pauses[0].to, addDays(day, 3));
});

test('irritação que volta logo depois da pausa sugere dermatologista', () => {
  const state = started();
  const day = addDays(START, 8);
  act.registerIrritation(state, { now: noon(day), areas: ['rosto'], pauseDays: 3 });
  const afterPause = addDays(day, 4); // pausa terminou ontem
  assert.equal(isRecurrence(state, afterPause, 'rosto'), true);
  assert.equal(isRecurrence(state, afterPause, 'corpo'), false);
  const { recurrence } = act.registerIrritation(state, { now: noon(afterPause), areas: ['rosto'], pauseDays: 3 });
  assert.equal(recurrence, true);
  // Muito tempo depois não é recorrência.
  assert.equal(isRecurrence(state, addDays(day, 30), 'rosto'), false);
});

test('progresso e status do dia', () => {
  const state = started();
  const plan = planFor(state, START);
  const now = noon(START);
  for (const id of plan.expected.slice(0, 3)) act.toggleStep(state, START, id, now);
  assert.equal(dayStatus(state.log[START]), 'partial');
  for (const id of plan.expected.slice(3)) act.toggleStep(state, START, id, now);
  assert.equal(dayStatus(state.log[START]), 'complete');
  act.toggleStep(state, START, plan.expected[0], now);
  assert.equal(dayStatus(state.log[START]), 'partial');
  assert.equal(dayStatus(undefined), 'empty');
});

test('pausa no meio do dia ajusta o total já salvo', () => {
  const state = started();
  const day = addDays(START, 8);
  act.toggleStep(state, day, planFor(state, day).expected[0], noon(day));
  assert.equal(state.log[day].expected.length, 8);
  act.registerIrritation(state, { now: noon(day), areas: ['rosto'], pauseDays: 3 });
  assert.equal(state.log[day].expected.length, 6);
});

test('lembrete do protetor: 2h depois de sair, reinicia ao reaplicar', () => {
  const state = started();
  const out = new Date('2026-11-20T13:00:00');
  act.leaveHome(state, out);
  let s = sunscreenStatus(state, new Date('2026-11-20T14:00:00'));
  assert.equal(s.due, false);
  assert.equal(formatDuration(s.remainingMs), '1h');
  s = sunscreenStatus(state, new Date('2026-11-20T15:01:00'));
  assert.equal(s.due, true);

  act.reapplySunscreen(state, new Date('2026-11-20T15:05:00'));
  s = sunscreenStatus(state, new Date('2026-11-20T15:06:00'));
  assert.equal(s.due, false);
  assert.equal(state.log['2026-11-20'].outings[0], '13:00');
  assert.equal(state.log['2026-11-20'].reapplied[0], '15:05');

  // No dia seguinte o lembrete antigo some.
  assert.equal(sunscreenStatus(state, new Date('2026-11-21T10:00:00')), null);
  act.backHome(state);
  assert.equal(state.sunscreen, null);
});
