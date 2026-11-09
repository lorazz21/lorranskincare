// Estoque dos produtos: quando perguntar "ainda tem produto suficiente?" e o que
// está na lista de compras. Funções puras, testáveis no Node.

import { diffDays } from './dates.js';
import { activeProducts, activeSteps } from './routine.js';

/** Escala visual da barra de uso: os produtos duram em torno de 1 a 2 meses. */
export const USAGE_SCALE_DAYS = 60;

/** Produtos usados em algum passo da rotina. */
export function productsInUse(state) {
  const used = new Set(activeSteps(state).map((s) => s.productId));
  return activeProducts(state).filter((p) => used.has(p.id));
}

/** Dias desde que a embalagem atual foi aberta, ou null se ainda não abriu. */
export const daysOpen = (product, today) => (product.openedAt ? diffDays(product.openedAt, today) : null);

/** Produtos em uso, abertos, fora da lista de compras e com a pergunta vencida. */
export function stockChecksDue(state, today) {
  return productsInUse(state).filter((p) => p.openedAt && !p.restock && p.nextCheck && p.nextCheck <= today);
}

/** Lista de compras: acabando ('low') e já comprados esperando abrir ('bought'). */
export function shoppingList(state) {
  return activeProducts(state).filter((p) => p.restock);
}

/** Pendências para o selo da aba: perguntas vencidas + itens ainda não comprados. */
export function attentionCount(state, today) {
  return stockChecksDue(state, today).length
    + shoppingList(state).filter((p) => p.restock.status === 'low').length;
}

/** Quanto durou cada embalagem anterior, da mais recente para a mais antiga. */
export function previousDurations(product) {
  const openings = product.openings ?? [];
  const out = [];
  for (let i = openings.length - 1; i > 0; i--) {
    out.push({ from: openings[i - 1], to: openings[i], days: diffDays(openings[i - 1], openings[i]) });
  }
  return out;
}

/** "Aberto hoje", "Aberto há 1 dia", "Aberto há 12 dias" */
export function openedText(days) {
  if (days === null) return 'Ainda não aberto';
  if (days <= 0) return 'Aberto hoje';
  return `Aberto há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}
