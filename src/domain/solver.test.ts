import { describe, expect, it } from 'vitest';
import type { CreditProduct } from './products';
import { maxPayment, scheduleForDeal, solveDeal, type DealInput } from './solver';

const kopecks = (n: number) => Math.round(n * 100) / 100;
const exactPayment = 88_848.7886783416; // 1 000 000 под 12% на 12 мес.

const manual = (patch: Partial<DealInput> = {}): DealInput => ({
  price: 1_500_000,
  downPayment: 500_000,
  termMonths: 12,
  rate: { kind: 'manual', annualRatePct: 12 },
  targetPayment: exactPayment,
  ...patch,
});

describe('payment — обычный расчёт', () => {
  it('платёж 88 848,79, желаемый платёж не нужен', () => {
    const { schedule } = solveDeal('payment', manual({ targetPayment: Number.NaN }));
    expect(kopecks(schedule.monthlyPayment)).toBe(88_848.79);
  });
});

describe('downPayment — какой нужен взнос', () => {
  it('цена 1 500 000, платёж 88 848,79 → кредит 1 000 000, взнос 500 000', () => {
    const { deal } = solveDeal('downPayment', manual({ downPayment: 0 }));
    expect(kopecks(deal.downPayment)).toBe(500_000);
  });
  it('платёж больше нужного даже без взноса → понятная ошибка', () => {
    expect(() => solveDeal('downPayment', manual({ targetPayment: 200_000 }))).toThrow('даже без первого взноса');
  });
  it('без желаемого платежа — просьба его указать', () => {
    expect(() => solveDeal('downPayment', manual({ targetPayment: Number.NaN }))).toThrow('желаемый платёж');
  });
});

describe('price — квартира какой цены по карману', () => {
  it('взнос 200 000, платёж 88 848,79 → цена 1 200 000', () => {
    const { deal } = solveDeal('price', manual({ downPayment: 200_000, price: 0 }));
    expect(kopecks(deal.price)).toBe(1_200_000);
  });
});

describe('term — за какой срок', () => {
  // 100 000 под 6%: 359 мес. → 600,15; 360 мес. → 599,55 (табличное); 361 мес. → 598,96.
  const base = manual({ price: 100_000, downPayment: 0, rate: { kind: 'manual', annualRatePct: 6 } });

  it('желаемый 600 → 360 мес. (30 лет)', () => {
    expect(solveDeal('term', { ...base, targetPayment: 600 }).deal.termMonths).toBe(360);
  });
  it('желаемый 599,55 → 361 мес.: срок округляется вверх, чтобы платёж не превысил желаемый', () => {
    const { deal, schedule } = solveDeal('term', { ...base, targetPayment: 599.55 });
    expect(deal.termMonths).toBe(361);
    expect(maxPayment(schedule)).toBeLessThanOrEqual(599.55);
  });
  it('платёж не покрывает проценты (500 в месяц) → не сходится', () => {
    expect(() => solveDeal('term', { ...base, targetPayment: 500 })).toThrow('не покрывает проценты');
  });
});

describe('rate — при какой ставке сходится', () => {
  it('ручной режим: 1 000 000 на 12 мес. при платеже 88 848,79 → 12%', () => {
    const { deal } = solveDeal('rate', manual({ rate: { kind: 'manual', annualRatePct: 0 } }));
    expect(deal.rate.kind === 'manual' && deal.rate.annualRatePct).toBeCloseTo(12, 6);
  });

  const product: CreditProduct = {
    id: 'p', name: 'Льгота 1%, потом СР + 6,15',
    ratePeriods: [
      { fromMonth: 1, rate: { kind: 'fixed', ratePct: 1 } },
      { fromMonth: 25, rate: { kind: 'refinancing', marginPct: 6.15 } },
    ],
    interestOnlyMonths: 12, prepaymentBanMonths: 60, maxTermMonths: 240, minDownPct: 0, maxLoan: null,
    notes: '', source: '', checkedAt: '', verified: false,
  };

  it('карточка банка: туда-обратно — платёж при СР 9,25% → решатель возвращает СР 9,25%', () => {
    const deal: DealInput = {
      price: 300_000, downPayment: 20_000, termMonths: 240,
      rate: { kind: 'product', product, refinancingRatePct: 9.25 }, targetPayment: 0,
    };
    const target = maxPayment(scheduleForDeal(deal));
    const solved = solveDeal('rate', { ...deal, targetPayment: target, rate: { kind: 'product', product, refinancingRatePct: 0 } });
    expect(solved.deal.rate.kind === 'product' && solved.deal.rate.refinancingRatePct).toBeCloseTo(9.25, 6);
  });

  it('карточка без «СР + надбавка» → подбирать нечего', () => {
    const fixed = { ...product, ratePeriods: [{ fromMonth: 1, rate: { kind: 'fixed' as const, ratePct: 14.9 } }] };
    expect(() => solveDeal('rate', {
      price: 300_000, downPayment: 20_000, termMonths: 240,
      rate: { kind: 'product', product: fixed, refinancingRatePct: 9.25 }, targetPayment: 3_000,
    })).toThrow('подбирать нечего');
  });

  it('желаемый платёж меньше, чем при 0% → не сходится', () => {
    expect(() => solveDeal('rate', manual({ targetPayment: 50_000 }))).toThrow('даже при ставке 0%');
  });
});
