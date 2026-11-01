import { describe, expect, it } from 'vitest';
import { buildAnnuitySchedule, buildSchedule } from './annuity';
import { yearlyTotals } from './aggregate';

const kopecks = (n: number) => Math.round(n * 100) / 100;

describe('cumulativeInterest («гора переплаты»)', () => {
  const s = buildAnnuitySchedule({ principal: 1_000_000, annualRatePct: 12, termMonths: 12 });

  it('первый месяц = проценты первого месяца, последний = вся переплата', () => {
    expect(s.rows[0]!.cumulativeInterest).toBe(10_000);
    expect(kopecks(s.rows.at(-1)!.cumulativeInterest)).toBe(66_185.46);
  });

  it('никогда не убывает', () => {
    for (let i = 1; i < s.rows.length; i++) {
      expect(s.rows[i]!.cumulativeInterest).toBeGreaterThan(s.rows[i - 1]!.cumulativeInterest);
    }
  });
});

describe('yearlyTotals', () => {
  it('1 000 000 под 12% на 12 мес.: один год, суммы = итогам графика', () => {
    const years = yearlyTotals(buildAnnuitySchedule({ principal: 1_000_000, annualRatePct: 12, termMonths: 12 }));
    expect(years).toHaveLength(1);
    expect(kopecks(years[0]!.interest)).toBe(66_185.46);
    expect(kopecks(years[0]!.principal)).toBe(1_000_000);
    expect(years[0]!.balance).toBe(0);
  });

  it('неполный последний год: 30 мес. → 3 года, в третьем 6 платежей', () => {
    const s = buildAnnuitySchedule({ principal: 300_000, annualRatePct: 0, termMonths: 30 });
    const years = yearlyTotals(s);
    expect(years.map((y) => y.year)).toEqual([1, 2, 3]);
    expect(years.map((y) => y.principal)).toEqual([120_000, 120_000, 60_000]);
    expect(years.map((y) => y.balance)).toEqual([180_000, 60_000, 0]);
  });

  it('суммы по годам совпадают с итогами графика (20 лет)', () => {
    const s = buildAnnuitySchedule({ principal: 3_000_000, annualRatePct: 10, termMonths: 240 });
    const years = yearlyTotals(s);
    expect(years).toHaveLength(20);
    const interest = years.reduce((sum, y) => sum + y.interest, 0);
    expect(interest).toBeCloseTo(s.totalInterest, 6);
    // В аннуитете проценты по годам убывают, тело долга растёт.
    expect(years[0]!.interest).toBeGreaterThan(years[19]!.interest);
    expect(years[0]!.principal).toBeLessThan(years[19]!.principal);
  });
});

describe('yearlyTotals и досрочка', () => {
  it('досрочные взносы суммируются по годам отдельно от планового тела долга', () => {
    const s = buildSchedule({
      principal: 120_000, termMonths: 24, rateSteps: [{ fromMonth: 1, annualRatePct: 0 }], interestOnlyMonths: 0,
      prepayments: [{ month: 3, amount: 10_000, mode: 'reduceTerm' }, { month: 13, amount: 5_000, mode: 'reduceTerm' }],
    });
    const years = yearlyTotals(s);
    expect(years.map((y) => y.prepayment)).toEqual([10_000, 5_000]);
    expect(years.reduce((sum, y) => sum + y.principal + y.prepayment, 0)).toBeCloseTo(120_000, 6);
  });
});
