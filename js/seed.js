// Estado inicial do app: sua rotina como ponto de partida (tudo editável depois).

export const SCHEMA_VERSION = 2;

const product = (id, name, extra = {}) => ({
  id,                  // sigla, usada só internamente
  name,                // nome mostrado na interface
  pausable: false,     // true = ativo que sai do checklist no modo pausa
  sunscreen: false,    // true = entra no lembrete de reaplicação
  openedAt: null,      // data em que a embalagem atual foi aberta
  nextCheck: null,     // quando perguntar "ainda tem produto suficiente?"
  restock: null,       // lista de compras: { status: 'low' | 'bought', since }
  openings: [],        // datas de abertura de cada embalagem (inclui a atual)
  archived: false,     // true = removido, mas ainda citado no histórico
  ...extra,
});

const step = (period, area, order, productId, extra = {}) => ({
  id: `${period}-${area}-${productId.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
  period,              // 'manha' | 'noite'
  area,                // 'rosto' | 'corpo'
  order,               // ordem de aplicação dentro da área
  productId,
  weekdays: null,      // [0..6] (0 = domingo); null = todo dia
  adaptation: null,    // regra na fase de adaptação: { weekdays } | { alternate: true } | { skip: true }
  note: '',
  archived: false,     // true = removido, mas ainda citado no histórico
  ...extra,
});

export function createInitialState() {
  return {
    version: SCHEMA_VERSION,
    settings: {
      startDate: null,
      adaptationDays: 7,
      dayStartsAt: 4,
      sunscreenIntervalMin: 120,
      pauseDefaultDays: 3,
      lastBackupAt: null,
      photoIntervalDays: 14,  // lembrete das fotos de progresso (0 = desligado)
      photoSnoozeDate: null,  // "Hoje não" no lembrete das fotos
      productCheckDays: 45,   // primeira pergunta sobre o estoque, em dias de uso
      productRecheckDays: 15, // se ainda tiver, pergunta de novo depois de N dias
      supplement: {
        enabled: true,
        name: 'Glutationa oral',
        period: 'manha',
        note: 'Conforme orientação da farmácia',
      },
    },
    products: [
      product('GL-02', 'Gel de Limpeza Facial Suave'),
      product('VC-10', 'Sérum de Vitamina C 10% + Ácido Ferúlico', { pausable: true }),
      product('PS-05', 'Protetor Solar Facial com Cor FPS 70 (cor 3.0)', { sunscreen: true }),
      product('PS-03', 'Protetor Solar Corporal FPS 60', { sunscreen: true }),
      product('AL-10', 'Sérum de Ácido Lático 10% + Ácido Kójico 5%', { pausable: true }),
      product('AA-2', 'Sérum de Alfa-Arbutin 2% + Gluconolactona 10%', { pausable: true }),
      product('CH-01', 'Creme Hidratante Facial'),
      product('EC-01', 'Emulsão Corporal de Ácido Lático 10%', { pausable: true }),
    ],
    steps: [
      step('manha', 'rosto', 1, 'GL-02'),
      step('manha', 'rosto', 2, 'VC-10'),
      step('manha', 'rosto', 3, 'PS-05'),
      step('manha', 'corpo', 1, 'PS-03', { note: 'Braços, colo, pescoço e mãos' }),

      step('noite', 'rosto', 1, 'GL-02'),
      // Sérum do dia: AL-10 seg/qua/sex, AA-2 ter/qui/sáb, domingo sem sérum.
      step('noite', 'rosto', 2, 'AL-10', { weekdays: [1, 3, 5], adaptation: { weekdays: [1, 5] } }),
      step('noite', 'rosto', 3, 'AA-2', { weekdays: [2, 4, 6] }),
      step('noite', 'rosto', 4, 'CH-01'),
      step('noite', 'corpo', 1, 'EC-01', { note: 'Áreas expostas', adaptation: { alternate: true } }),
    ],
    // Um registro por dia: { expected: [ids], done: [ids], supplement, irritations, outings, reapplied }
    log: {},
    // { id, area, from, to, symptoms } — `to` é inclusivo
    pauses: [],
    // Lembrete de reaplicação em andamento: { dueAt, setAt } (ISO)
    sunscreen: null,
  };
}
