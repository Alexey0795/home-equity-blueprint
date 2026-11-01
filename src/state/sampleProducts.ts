import type { CreditProduct } from '../domain';

/**
 * Стартовые карточки из исследования docs/research/minsk-mortgage-2026-11.md.
 * Все — ориентиры с агрегаторов (verified: false). Перед расчётом «по-настоящему» сверить с банком.
 */
export function sampleProducts(newId: () => string): CreditProduct[] {
  return [
    {
      id: newId(),
      name: 'Белинвестбанк — вторичное жильё (простой)',
      ratePeriods: [{ fromMonth: 1, rate: { kind: 'fixed', ratePct: 14.9 } }],
      interestOnlyMonths: 0,
      prepaymentBanMonths: 0,
      maxTermMonths: 240,
      minDownPct: 10,
      maxLoan: null,
      notes: 'Без поручителей до 150 000 BYN. Фиксированная ли ставка или «СР + надбавка» — уточнить в банке.',
      source: 'https://wikidom.by/blog/uzhe-smotreli-kreditnye-programmy-belinvestbanka-vyglyadyat-vpolne-privlekatelno-113989-p',
      checkedAt: '2026-11-01',
      verified: false,
    },
    {
      id: newId(),
      name: 'Беларусбанк — «Ипотека с нами от 1%» (жёсткий)',
      ratePeriods: [
        { fromMonth: 1, rate: { kind: 'fixed', ratePct: 1 } },
        { fromMonth: 25, rate: { kind: 'refinancing', marginPct: 6.15 } },
      ],
      interestOnlyMonths: 12,
      prepaymentBanMonths: 60,
      maxTermMonths: 240,
      minDownPct: 0,
      maxLoan: null,
      notes: 'Только новостройки застройщиков-партнёров. Максимальный срок в источниках не найден — стоит условный.',
      source: 'https://belarusbank.by/o-banke/press/news/chastnym-klientam/belarusbank-rasshiryaet-usloviya-kredita-ipoteka-s-nami-c-partnerami-zastroyshchikami/',
      checkedAt: '2026-11-01',
      verified: false,
    },
    {
      id: newId(),
      name: 'Сбер Банк — вторичное жильё, промо 0,99%',
      ratePeriods: [
        { fromMonth: 1, rate: { kind: 'fixed', ratePct: 0.99 } },
        { fromMonth: 25, rate: { kind: 'fixed', ratePct: 16.9 } },
      ],
      interestOnlyMonths: 0,
      prepaymentBanMonths: 0,
      maxTermMonths: 240,
      minDownPct: 0,
      maxLoan: null,
      notes: 'Условия промо не раскрыты. Срок и первый взнос в источнике не указаны — стоят условные.',
      source: 'https://myfin.by/bank/bps-sberbank/kredity/na-vtorichnoe-zhile',
      checkedAt: '2026-11-01',
      verified: false,
    },
  ];
}
