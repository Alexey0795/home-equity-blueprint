import { describe, expect, it } from 'vitest';
import { buildSchedule } from './annuity';
import { depositValue, placementAlternatives, reinvestedSavings, rentWithoutSum } from './placement';
import type { VariableLoanParams } from './types';

describe('depositValue', () => {
  it('1 000 под 12% с ежемесячной капитализацией за год — 1 126,83 (1,01^12)', () => {
    expect(depositValue([{ month: 0, amount: 1_000 }], 12, 12)).toBeCloseTo(1_126.825, 3);
  });
  it('транш позже растёт меньше; транш после даты сравнения — как есть', () => {
    expect(depositValue([{ month: 6, amount: 1_000 }], 12, 12)).toBeCloseTo(1_000 * 1.01 ** 6, 6);
    expect(depositValue([{ month: 24, amount: 1_000 }], 12, 12)).toBe(1_000);
  });
  it('отрицательная ставка — ошибка', () => {
    expect(() => depositValue([], -1, 12)).toThrow(RangeError);
  });
});

describe('placementAlternatives', () => {
  it('дома 10 000 через 2 года при инфляции 15% — 10 000 / 1,15² ≈ 7 561,44 сегодняшних', () => {
    const r = placementAlternatives([{ month: 0, amount: 10_000 }], 0, 15, 24);
    expect(r.home.nominal).toBe(10_000);
    expect(r.home.today).toBeCloseTo(10_000 / 1.15 ** 2, 6);
    expect(r.deposit.nominal).toBe(10_000);
  });
});

describe('rentWithoutSum', () => {
  it('20 000, откладываю 1 500 в месяц — 14 месяцев (13,3 вверх) аренды по 1 200 = 16 800', () => {
    expect(rentWithoutSum(20_000, 1_500, 1_200)).toEqual({ months: 14, rent: 16_800 });
  });
  it('не задано — null', () => {
    expect(rentWithoutSum(20_000, Number.NaN, 1_200)).toBeNull();
    expect(rentWithoutSum(0, 1_500, 1_200)).toBeNull();
  });
});

describe('reinvestedSavings', () => {
  const loan: VariableLoanParams = { principal: 120_000, termMonths: 240, rateSteps: [{ fromMonth: 1, annualRatePct: 12 }], interestOnlyMonths: 0 };
  const tranches = [{ month: 0, amount: 20_000 }];

  for (const mode of ['reducePayment', 'reduceTerm'] as const) {
    it(`ставка вклада = ставке кредита (12%) → то же, что вклад: 20 000 × 1,01^240 (${mode})`, () => {
      const noSum = buildSchedule(loan);
      const withSum = buildSchedule({ ...loan, atIssue: { amount: 20_000, mode } });
      expect(reinvestedSavings(noSum, withSum, tranches, 12, 240)).toBeCloseTo(20_000 * 1.01 ** 240, 2);
    });
  }

  it('вклад ниже ставки кредита — ипотека выгоднее; транш позже учитывается так же', () => {
    const t = [{ month: 12, amount: 20_000 }];
    const noSum = buildSchedule(loan);
    const withSum = buildSchedule({ ...loan, prepayments: [{ month: 12, amount: 20_000, mode: 'reduceTerm' }] });
    expect(reinvestedSavings(noSum, withSum, t, 12, 240)).toBeCloseTo(20_000 * 1.01 ** 228, 2);
    expect(reinvestedSavings(noSum, withSum, t, 8, 240)).toBeGreaterThan(depositValue(t, 8, 240));
  });

  it('аренда в первые месяцы тоже освобождается: без кредитного эффекта — просто аренда на вкладе', () => {
    const noSum = buildSchedule(loan);
    expect(reinvestedSavings(noSum, noSum, [], 0, 240, { months: 10, perMonth: 1_000 })).toBeCloseTo(10_000, 8);
  });
});
