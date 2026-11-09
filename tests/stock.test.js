import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../js/seed.js';
import { addDays } from '../js/dates.js';
import { migrate } from '../js/store.js';
import {
  attentionCount, daysOpen, openedText, previousDurations, productsInUse, shoppingList, stockChecksDue,
} from '../js/stock.js';
import * as act from '../js/actions.js';

const START = '2026-11-16';
const noon = (key) => new Date(`${key}T12:00:00`);
const ids = (list) => list.map((p) => p.id).sort();

function started() {
  const state = createInitialState();
  act.startRoutine(state, START);
  return state;
}

test('começar a rotina abre os produtos e marca a primeira pergunta para 45 dias depois', () => {
  const state = started();
  for (const p of state.products) {
    assert.equal(p.openedAt, START);
    assert.deepEqual(p.openings, [START]);
    assert.equal(p.nextCheck, addDays(START, 45));
  }
  assert.equal(daysOpen(state.products[0], addDays(START, 10)), 10);
});

test('nada a perguntar antes dos 45 dias; no 45º dia, pergunta de todos em uso', () => {
  const state = started();
  assert.deepEqual(stockChecksDue(state, addDays(START, 44)), []);
  assert.deepEqual(ids(stockChecksDue(state, addDays(START, 45))), ids(productsInUse(state)));
  assert.equal(attentionCount(state, addDays(START, 45)), 8);
});

test('"tenho, sim" pergunta de novo em 15 dias, e assim sucessivamente', () => {
  const state = started();
  let day = addDays(START, 45);
  act.answerStock(state, 'VC-10', true, noon(day));
  const vc = state.products.find((p) => p.id === 'VC-10');
  assert.equal(vc.nextCheck, addDays(day, 15));
  assert.equal(stockChecksDue(state, addDays(day, 14)).some((p) => p.id === 'VC-10'), false);
  day = addDays(day, 15);
  assert.equal(stockChecksDue(state, day).some((p) => p.id === 'VC-10'), true);
  act.answerStock(state, 'VC-10', true, noon(day));
  assert.equal(vc.nextCheck, addDays(START, 75));
});

test('responder atrasado conta 15 dias a partir da resposta', () => {
  const state = started();
  const late = addDays(START, 50);
  act.answerStock(state, 'GL-02', true, noon(late));
  assert.equal(state.products.find((p) => p.id === 'GL-02').nextCheck, addDays(late, 15));
});

test('"está acabando" vai para a lista de compras e para de perguntar', () => {
  const state = started();
  const day = addDays(START, 45);
  act.answerStock(state, 'AL-10', false, noon(day));
  assert.deepEqual(ids(shoppingList(state)), ['AL-10']);
  assert.equal(stockChecksDue(state, addDays(day, 30)).some((p) => p.id === 'AL-10'), false);
  assert.deepEqual(state.products.find((p) => p.id === 'AL-10').restock, { status: 'low', since: day });
});

test('comprei → continua na lista até abrir; abrir o novo zera a contagem', () => {
  const state = started();
  const day = addDays(START, 45);
  act.answerStock(state, 'AL-10', false, noon(day));
  assert.equal(attentionCount(state, day), 8); // 7 perguntas + 1 para comprar
  act.markBought(state, 'AL-10', noon(addDays(day, 2)));
  const al = state.products.find((p) => p.id === 'AL-10');
  assert.equal(al.restock.status, 'bought');
  assert.equal(attentionCount(state, day), 7); // comprado não conta como pendência
  const opened = addDays(START, 52);
  act.openProduct(state, 'AL-10', opened);
  assert.equal(al.restock, null);
  assert.equal(al.openedAt, opened);
  assert.equal(al.nextCheck, addDays(opened, 45));
  assert.deepEqual(previousDurations(al), [{ from: START, to: opened, days: 52 }]);
});

test('"ainda tenho" tira da lista e volta a perguntar em 15 dias', () => {
  const state = started();
  const day = addDays(START, 45);
  act.answerStock(state, 'CH-01', false, noon(day));
  act.clearRestock(state, 'CH-01', noon(addDays(day, 1)));
  const ch = state.products.find((p) => p.id === 'CH-01');
  assert.equal(ch.restock, null);
  assert.equal(ch.nextCheck, addDays(day, 16));
});

test('produtos fora da rotina ou arquivados não entram nas perguntas', () => {
  const state = started();
  const now = noon(START);
  const extra = act.saveProduct(state, { name: 'Máscara', pausable: false, sunscreen: false }, now);
  act.openProduct(state, extra.id, START);
  act.toggleStep(state, START, 'noite-corpo-ec01', now);
  act.removeStep(state, 'noite-corpo-ec01', now); // EC-01 sai da rotina (arquivado)
  const due = ids(stockChecksDue(state, addDays(START, 45)));
  assert.equal(due.includes(extra.id), false);
  assert.equal(due.includes('EC-01'), false);
  assert.equal(due.length, 7);
});

test('produto novo começa sem abrir; corrigir a data de abertura recalcula a pergunta', () => {
  const state = started();
  const p = act.saveProduct(state, { name: 'Tônico', pausable: false, sunscreen: false }, noon(START));
  assert.equal(p.openedAt, null);
  assert.equal(openedText(daysOpen(p, START)), 'Ainda não aberto');
  act.setOpenedAt(state, 'GL-02', '2026-11-20');
  const gl = state.products.find((x) => x.id === 'GL-02');
  assert.deepEqual(gl.openings, ['2026-11-20']);
  assert.equal(gl.nextCheck, addDays('2026-11-20', 45));
  act.setOpenedAt(state, 'GL-02', '');
  assert.equal(gl.openedAt, null);
  assert.deepEqual(gl.openings, []);
});

test('mudar a data de início leva junto os produtos abertos no início', () => {
  const state = started();
  act.openProduct(state, 'GL-02', addDays(START, 1)); // já trocou de embalagem: não acompanha
  act.setStartDate(state, '2026-11-18', noon('2026-11-18'));
  assert.equal(state.products.find((p) => p.id === 'VC-10').openedAt, '2026-11-18');
  assert.equal(state.products.find((p) => p.id === 'VC-10').nextCheck, addDays('2026-11-18', 45));
  assert.equal(state.products.find((p) => p.id === 'GL-02').openedAt, addDays(START, 1));
});

test('definir a data de início pelos Ajustes (sem ter tocado em Começar) abre os produtos', () => {
  const state = createInitialState();
  act.setStartDate(state, START, noon(START));
  assert.ok(state.products.every((p) => p.openedAt === START));
});

test('migração da versão 1: quem já começou a rotina tem os produtos abertos no início', () => {
  const v1 = createInitialState();
  v1.version = 1;
  v1.settings.startDate = START;
  for (const p of v1.products) {
    p.durationDays = null;
    delete p.nextCheck; delete p.restock; delete p.openings;
  }
  const state = migrate(v1);
  const vc = state.products.find((p) => p.id === 'VC-10');
  assert.equal(vc.openedAt, START);
  assert.deepEqual(vc.openings, [START]);
  assert.equal(vc.nextCheck, addDays(START, 45));
  assert.equal(vc.restock, null);
  assert.equal('durationDays' in vc, false);
  assert.equal(state.version, 2);
  // Sem rotina começada, continuam fechados.
  const fresh = createInitialState();
  fresh.version = 1;
  assert.ok(migrate(fresh).products.every((p) => p.openedAt === null));
});

test('versão 2: produto não aberto continua não aberto ao recarregar', () => {
  const state = started();
  const p = act.saveProduct(state, { name: 'Tônico', pausable: false, sunscreen: false }, noon(START));
  const again = migrate(JSON.parse(JSON.stringify(state)));
  assert.equal(again.products.find((x) => x.id === p.id).openedAt, null);
});

test('textos de tempo de uso', () => {
  assert.equal(openedText(0), 'Aberto hoje');
  assert.equal(openedText(1), 'Aberto há 1 dia');
  assert.equal(openedText(45), 'Aberto há 45 dias');
});
