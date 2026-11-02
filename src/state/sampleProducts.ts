import type { CreditProduct } from '../domain';

/**
 * Стартовые карточки банков из исследования docs/research/minsk-mortgage-2026-11-verified.md (проверка 02.11.2026).
 * verified: true — условия сверены со страницей продукта на сайте банка; false — новость или агрегатор.
 * Важно: калькулятор пока считает аннуитет; у карточек с дифференцированным графиком в банке переплата будет меньше
 * (это сказано в оговорках карточки).
 */

/** Названия, по которым демо находит нужные карточки. */
export const SAMPLE = {
  belarusbankExpress: 'Беларусбанк — «Ипотека Экспресс» (вторичка, самый простой)',
  belarusbankPartners: 'Беларусбанк — «Ипотека с нами» от 1% (новостройки партнёров)',
  sber: 'Сбер Банк — промо 0,99% (вторичка)',
} as const;

const CHECKED = '2026-11-02';

export function sampleProducts(newId: () => string): CreditProduct[] {
  return [
    {
      id: newId(),
      name: SAMPLE.belarusbankExpress,
      ratePeriods: [
        { fromMonth: 1, rate: { kind: 'refinancing', marginPct: 2.75 } },
        { fromMonth: 25, rate: { kind: 'refinancing', marginPct: 5.15 } },
      ],
      interestOnlyMonths: 12,
      prepaymentBanMonths: 0,
      maxTermMonths: 240,
      minDownPct: 0,
      maxLoan: null,
      notes:
        'В банке график ДИФФЕРЕНЦИРОВАННЫЙ (долг равными частями) — переплата заметно меньше, чем считает калькулятор (аннуитет). ' +
        'До 100% стоимости, только залог покупаемого жилья, без поручителей и комиссий, решение за 1 рабочий день, ' +
        'без справки о доходах для получающих зарплату в Беларусбанке. Досрочка в любой момент без комиссий. Право на кредит — один раз. ' +
        'У застройщика после льготы СР + 4,95.',
      source: 'https://belarusbank.by/fizicheskim_licam/kredit/financing/kredit-ipoteka-ekspress-na-priobretenie-zhilogo-pomeshcheniya/',
      checkedAt: CHECKED,
      verified: true,
    },
    {
      id: newId(),
      name: 'Белагропромбанк — онлайн, вторичка, аннуитет',
      ratePeriods: [{ fromMonth: 1, rate: { kind: 'refinancing', marginPct: 5.25 } }],
      interestOnlyMonths: 0,
      prepaymentBanMonths: 0,
      maxTermMonths: 360,
      minDownPct: 10,
      maxLoan: 200_000,
      notes:
        'Только залог жилья, без поручителей. До 30 лет. Есть вариант с дифференцированным графиком: 10,9% первые 730 дней, ' +
        'затем СР + 5,75 — по переплате он дешевле (калькулятор пока считает только аннуитет).',
      source: 'https://www.belapb.by/chastnomu-klientu/kredity/kredit-na-priobretenie-zhilykh-pomeshcheniy-onlayn/',
      checkedAt: CHECKED,
      verified: true,
    },
    {
      id: newId(),
      name: 'Приорбанк — под залог жилья',
      ratePeriods: [
        { fromMonth: 1, rate: { kind: 'fixed', ratePct: 10.9 } },
        { fromMonth: 19, rate: { kind: 'fixed', ratePct: 14.9 } },
      ],
      interestOnlyMonths: 0,
      prepaymentBanMonths: 0,
      maxTermMonths: 240,
      minDownPct: 10,
      maxLoan: 700_000,
      notes:
        'Платежи на выбор: аннуитет или дифференцированные (дифференцированные дешевле по переплате). Досрочка в любой момент ' +
        'без комиссий. Первый взнос и тип ставки после льготы (фиксированная или от СР) на сайте не указаны — стоит условно 10% и «фикс.», уточнить.',
      source: 'https://www.priorbank.by/offers/credits/realty-credit',
      checkedAt: CHECKED,
      verified: true,
    },
    {
      id: newId(),
      name: 'Белинвестбанк — вторичка',
      ratePeriods: [
        { fromMonth: 1, rate: { kind: 'fixed', ratePct: 10.9 } },
        { fromMonth: 25, rate: { kind: 'fixed', ratePct: 14.9 } },
      ],
      interestOnlyMonths: 0,
      prepaymentBanMonths: 0,
      maxTermMonths: 240,
      minDownPct: 10,
      maxLoan: null,
      notes:
        'Без поручителей при кредите до 150 000 BYN. Платить можно равными или уменьшающимися частями. По новостям ' +
        '(realt.by 09.09.2026, Wikidom 19.08.2026) — сайт банка из облака не открывается, сверить в банке.',
      source: 'https://realt.by/news/view/kredit-belinvestbank/',
      checkedAt: CHECKED,
      verified: false,
    },
    {
      id: newId(),
      name: SAMPLE.belarusbankPartners,
      ratePeriods: [
        { fromMonth: 1, rate: { kind: 'fixed', ratePct: 1 } },
        { fromMonth: 25, rate: { kind: 'refinancing', marginPct: 6.15 } },
      ],
      interestOnlyMonths: 12,
      prepaymentBanMonths: 60,
      maxTermMonths: 240,
      minDownPct: 0,
      maxLoan: null,
      notes:
        'Только новостройки застройщиков-партнёров; ставка «от 1%» зависит от программы застройщика. Первый год — только ' +
        'проценты, досрочное погашение — только через 60 мес. (сайт банка). Ставка после льготы — по пресс-релизу банка.',
      source: 'https://belarusbank.by/fizicheskim_licam/kredit/financing/kredit-ipoteka-s-nami-v-ramkakh-partnerskikh-programm/',
      checkedAt: CHECKED,
      verified: false,
    },
    {
      id: newId(),
      name: 'БНБ-Банк — 1% на год (новостройки партнёров)',
      ratePeriods: [
        { fromMonth: 1, rate: { kind: 'fixed', ratePct: 1 } },
        { fromMonth: 13, rate: { kind: 'fixed', ratePct: 16 } },
      ],
      interestOnlyMonths: 0,
      prepaymentBanMonths: 0,
      maxTermMonths: 240,
      minDownPct: 10,
      maxLoan: 300_000,
      notes:
        'Только новостройки застройщиков-партнёров (А-100, Зелёная Гавань и др.). Ставки фиксированные. Сроки 10, 15 или 20 лет. ' +
        'Есть и другие варианты: 5% на 5 мес. → 15,3%; 7% на 12–18 мес. → 15,4%; 6% на 24 мес. → 16,7%.',
      source: 'https://bnb.by/o-lichnom/kreditovanie-i-lizing/ipoteka/',
      checkedAt: CHECKED,
      verified: true,
    },
    {
      id: newId(),
      name: SAMPLE.sber,
      ratePeriods: [
        { fromMonth: 1, rate: { kind: 'fixed', ratePct: 0.99 } },
        { fromMonth: 25, rate: { kind: 'fixed', ratePct: 16.9 } },
      ],
      interestOnlyMonths: 0,
      prepaymentBanMonths: 0,
      maxTermMonths: 240,
      minDownPct: 0,
      maxLoan: 300_000,
      notes: 'По агрегатору (myfin.by): взнос не обязателен, до 300 000 BYN, залог. Условия промо не раскрыты — сверить в банке.',
      source: 'https://myfin.by/kredity/na-vtorichnoe-zhile',
      checkedAt: CHECKED,
      verified: false,
    },
    {
      id: newId(),
      name: 'Белгазпромбанк — 14,75% на полгода',
      ratePeriods: [
        { fromMonth: 1, rate: { kind: 'fixed', ratePct: 14.75 } },
        { fromMonth: 7, rate: { kind: 'fixed', ratePct: 16.75 } },
      ],
      interestOnlyMonths: 0,
      prepaymentBanMonths: 0,
      maxTermMonths: 240,
      minDownPct: 10,
      maxLoan: 160_000,
      notes: 'По агрегатору (myfin.by); есть вариант 6,25% на 6 мес. → 17,75%. Сайт банка из облака не открывается — сверить.',
      source: 'https://myfin.by/bank/belgazprombank/kredity/na-vtorichnoe-zhile',
      checkedAt: CHECKED,
      verified: false,
    },
  ];
}

/** Карточки из исследования, которых ещё нет в списке (по названию), — для кнопки «Добавить карточки из исследования». */
export function missingSampleProducts(existing: CreditProduct[], newId: () => string): CreditProduct[] {
  const names = new Set(existing.map((p) => p.name));
  return sampleProducts(newId).filter((p) => !names.has(p.name));
}
