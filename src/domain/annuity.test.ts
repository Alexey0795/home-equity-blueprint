import { describe, expect, it } from 'vitest';
import { annuityPayment, buildAnnuitySchedule, monthlyRate } from './annuity';
import { loanAmount } from './deal';

/** Сравнение с точностью до копейки. */
const kopecks = (n: number) => Math.round(n * 100) / 100;

describe('monthlyRate', () => {
  it('12% годовых = 1% в месяц', () => {
    expect(monthlyRate(12)).toBeCloseTo(0.01, 12);
  });
});

describe('annuityPayment — известные цифры', () => {
  it('1 000 000 под 12% на 12 мес. → 88 848,79', () => {
    expect(kopecks(annuityPayment({ principal: 1_000_000, annualRatePct: 12, termMonths: 12 }))).toBe(88_848.79);
  });

  it('100 000 под 6% на 30 лет → 599,55 (классический пример из учебников)', () => {
    expect(kopecks(annuityPayment({ principal: 100_000, annualRatePct: 6, termMonths: 360 }))).toBe(599.55);
  });

  it('3 000 000 под 10% на 20 лет → 28 950,65', () => {
    expect(kopecks(annuityPayment({ principal: 3_000_000, annualRatePct: 10, termMonths: 240 }))).toBe(28_950.65);
  });

  it('нулевая ставка: 240 000 на 24 мес. → 10 000', () => {
    expect(annuityPayment({ principal: 240_000, annualRatePct: 0, termMonths: 24 })).toBe(10_000);
  });

  it('отклоняет некорректные входы', () => {
    expect(() => annuityPayment({ principal: -1, annualRatePct: 10, termMonths: 12 })).toThrow(RangeError);
    expect(() => annuityPayment({ principal: 1000, annualRatePct: -1, termMonths: 12 })).toThrow(RangeError);
    expect(() => annuityPayment({ principal: 1000, annualRatePct: 10, termMonths: 0 })).toThrow(RangeError);
    expect(() => annuityPayment({ principal: 1000, annualRatePct: 10, termMonths: 12.5 })).toThrow(RangeError);
    expect(() => annuityPayment({ principal: Number.NaN, annualRatePct: 10, termMonths: 12 })).toThrow(RangeError);
  });
});

describe('buildAnnuitySchedule', () => {
  const schedule = buildAnnuitySchedule({ principal: 1_000_000, annualRatePct: 12, termMonths: 12 });

  it('первый месяц: проценты 10 000, тело 78 848,79, остаток 921 151,21', () => {
    const first = schedule.rows[0]!;
    expect(kopecks(first.interest)).toBe(10_000);
    expect(kopecks(first.principal)).toBe(78_848.79);
    expect(kopecks(first.balance)).toBe(921_151.21);
  });

  it('итоги: переплата 66 185,46, всего выплачено 1 066 185,46', () => {
    expect(kopecks(schedule.totalInterest)).toBe(66_185.46);
    expect(kopecks(schedule.totalPaid)).toBe(1_066_185.46);
    expect(schedule.totalPrincipal).toBe(1_000_000);
  });

  it('100 000 под 6% на 30 лет: переплата 115 838,19', () => {
    const s = buildAnnuitySchedule({ principal: 100_000, annualRatePct: 6, termMonths: 360 });
    expect(kopecks(s.totalInterest)).toBe(115_838.19);
  });

  it('инварианты: n строк, платёж = проценты + тело, долг убывает до нуля', () => {
    const s = buildAnnuitySchedule({ principal: 3_000_000, annualRatePct: 10, termMonths: 240 });
    expect(s.rows).toHaveLength(240);
    let prevBalance = 3_000_000;
    let principalSum = 0;
    for (const row of s.rows) {
      expect(row.payment).toBeCloseTo(row.interest + row.principal, 6);
      expect(row.payment).toBeCloseTo(s.monthlyPayment, 6);
      expect(row.balance).toBeLessThan(prevBalance);
      prevBalance = row.balance;
      principalSum += row.principal;
    }
    expect(s.rows.at(-1)!.balance).toBe(0);
    expect(principalSum).toBeCloseTo(3_000_000, 6);
  });

  it('доля процентов в платеже падает со временем', () => {
    const first = schedule.rows[0]!;
    const last = schedule.rows.at(-1)!;
    expect(first.interest).toBeGreaterThan(last.interest);
    expect(first.principal).toBeLessThan(last.principal);
  });

  it('нулевой кредит: все платежи нулевые', () => {
    const s = buildAnnuitySchedule({ principal: 0, annualRatePct: 10, termMonths: 6 });
    expect(s.monthlyPayment).toBe(0);
    expect(s.totalInterest).toBe(0);
    expect(s.rows.every((r) => r.balance === 0)).toBe(true);
  });
});

describe('loanAmount', () => {
  it('цена минус взнос', () => {
    expect(loanAmount(10_000_000, 2_000_000)).toBe(8_000_000);
  });
  it('взнос больше цены → кредит 0', () => {
    expect(loanAmount(1_000_000, 1_500_000)).toBe(0);
  });
});
