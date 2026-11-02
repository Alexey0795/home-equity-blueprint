import { describe, expect, it } from 'vitest';
import { checkDealAgainstProduct, prepaymentBanProblems, productRateSteps, resolveRate, type CreditProduct } from './products';

const product = (patch: Partial<CreditProduct> = {}): CreditProduct => ({
  id: 'p',
  name: 'Тест',
  ratePeriods: [
    { fromMonth: 1, rate: { kind: 'fixed', ratePct: 1 } },
    { fromMonth: 25, rate: { kind: 'refinancing', marginPct: 6.15 } },
  ],
  repayment: 'annuity',
  interestOnlyMonths: 12,
  prepaymentBanMonths: 60,
  maxTermMonths: 240,
  minDownPct: 10,
  maxLoan: 200_000,
  notes: '',
  source: '',
  checkedAt: '2026-11-01',
  verified: false,
  ...patch,
});

describe('resolveRate', () => {
  it('СР 9,25 + 6,15 п.п. = 15,4% (Беларусбанк «Ипотека с нами» после льготы)', () => {
    expect(resolveRate({ kind: 'refinancing', marginPct: 6.15 }, 9.25)).toBeCloseTo(15.4, 10);
  });
  it('фиксированная не зависит от СР', () => {
    expect(resolveRate({ kind: 'fixed', ratePct: 14.9 }, Number.NaN)).toBe(14.9);
  });
  it('без СР «плавающую» не посчитать', () => {
    expect(() => resolveRate({ kind: 'refinancing', marginPct: 4 }, Number.NaN)).toThrow('ставка рефинансирования');
  });
});

describe('productRateSteps', () => {
  it('1% с 1-го месяца, СР+6,15 с 25-го', () => {
    const steps = productRateSteps(product(), 9.25);
    expect(steps[0]).toEqual({ fromMonth: 1, annualRatePct: 1 });
    expect(steps[1]!.fromMonth).toBe(25);
    expect(steps[1]!.annualRatePct).toBeCloseTo(15.4, 10);
  });
});

describe('checkDealAgainstProduct', () => {
  const ok = { price: 200_000, downPayment: 20_000, termMonths: 240 };

  it('всё в рамках — нет замечаний', () => {
    expect(checkDealAgainstProduct(product(), ok)).toEqual([]);
  });
  it('взнос ровно на минимуме — допустим', () => {
    expect(checkDealAgainstProduct(product(), { ...ok, downPayment: 20_000 })).toEqual([]);
  });
  it('каждое нарушение — отдельное замечание', () => {
    const problems = checkDealAgainstProduct(product(), { price: 300_000, downPayment: 10_000, termMonths: 300 });
    expect(problems.map((p) => p.field)).toEqual(['downPayment', 'term', 'loan']);
    expect(problems[0]!.message).toContain('10%');
    expect(problems[1]!.message).toContain('20 лет');
    expect(problems[2]!.message).toContain('лимита');
  });
  it('лимит не указан — сумма не проверяется', () => {
    expect(checkDealAgainstProduct(product({ maxLoan: null }), { ...ok, price: 10_000_000, downPayment: 1_000_000 }))
      .toEqual([]);
  });
});

describe('prepaymentBanProblems', () => {
  it('запрет 60 мес.: взнос в 60-м — нарушение, в 61-м — можно', () => {
    const problems = prepaymentBanProblems(product(), [
      { month: 60, amount: 10_000, mode: 'reduceTerm' },
      { month: 61, amount: 10_000, mode: 'reduceTerm' },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ field: 'prepayments' });
    expect(problems[0]!.message).toContain('60-м мес.');
  });
  it('без запрета — без замечаний', () => {
    expect(prepaymentBanProblems(product({ prepaymentBanMonths: 0 }), [{ month: 1, amount: 1, mode: 'reduceTerm' }])).toEqual([]);
  });
});
