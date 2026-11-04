import { describe, expect, it } from 'vitest';
import { buildAnnuitySchedule, buildSchedule } from './annuity';
import { bankScheduleWithHelp, privateLoanRealValue, privateLoanRepayment, todayValue } from './privateLoan';
import type { VariableLoanParams } from './types';

describe('privateLoanRepayment', () => {
  it('беспроцентный: 12 000 по 1 000 в месяц — 12 месяцев, переплаты нет', () => {
    const r = privateLoanRepayment({ tranches: [{ month: 0, amount: 12_000 }], ratePct: 0, graceMonths: 0, monthlyPayment: 1_000 });
    expect(r.lastPaymentMonth).toBe(12);
    expect(r.totalInterest).toBe(0);
    expect(r.totalReturned).toBeCloseTo(12_000, 8);
  });

  it('3% годовых: платёж = аннуитет 12 000 на 12 мес. (1 016,32) — ровно 12 месяцев, проценты = 12 × платёж − 12 000', () => {
    const payment = (12_000 * 0.0025) / (1 - 1.0025 ** -12);
    expect(payment).toBeCloseTo(1016.32, 2);
    const r = privateLoanRepayment({ tranches: [{ month: 0, amount: 12_000 }], ratePct: 3, graceMonths: 0, monthlyPayment: payment });
    expect(r.lastPaymentMonth).toBe(12);
    expect(r.totalInterest).toBeCloseTo(12 * payment - 12_000, 6);
  });

  it('отсрочка 6 месяцев бесплатна: ни платежей, ни процентов, возврат с 7-го по 18-й месяц', () => {
    const r = privateLoanRepayment({ tranches: [{ month: 0, amount: 12_000 }], ratePct: 3, graceMonths: 6, monthlyPayment: (12_000 * 0.0025) / (1 - 1.0025 ** -12) });
    expect(r.rows.slice(0, 6).every((row) => row.payment === 0 && row.interest === 0)).toBe(true);
    expect(r.firstPaymentMonth).toBe(7);
    expect(r.lastPaymentMonth).toBe(18);
  });

  it('транш позже — добавляется к долгу и возвращается после', () => {
    const r = privateLoanRepayment({
      tranches: [{ month: 0, amount: 5_000 }, { month: 12, amount: 5_000 }], ratePct: 0, graceMonths: 0, monthlyPayment: 1_000,
    });
    // Первые 5 000 вернулись к 5-му месяцу, второй транш — после 12-го платежа, возврат в месяцах 13–17.
    expect(r.rows[4]!.balance).toBe(0);
    expect(r.rows[11]!.balance).toBe(5_000);
    expect(r.lastPaymentMonth).toBe(17);
    expect(r.totalReturned).toBeCloseTo(10_000, 8);
  });

  it('без траншей — платить нечего; платёж меньше процентов — понятная ошибка', () => {
    expect(privateLoanRepayment({ tranches: [], ratePct: 3, graceMonths: 0, monthlyPayment: 0 }).lastPaymentMonth).toBeNull();
    expect(() => privateLoanRepayment({ tranches: [{ month: 0, amount: 100_000 }], ratePct: 12, graceMonths: 0, monthlyPayment: 500 }))
      .toThrow('не покрывает проценты');
    expect(() => privateLoanRepayment({ tranches: [{ month: 0, amount: 1_000 }], ratePct: 0, graceMonths: 0, monthlyPayment: 0 }))
      .toThrow(RangeError);
  });
});

describe('bankScheduleWithHelp', () => {
  const loan: VariableLoanParams = { principal: 120_000, termMonths: 240, rateSteps: [{ fromMonth: 1, annualRatePct: 12 }], interestOnlyMonths: 0 };

  it('транш в первый взнос + «уменьшить платёж» = кредит на сумму меньше', () => {
    const s = bankScheduleWithHelp(loan, [{ month: 0, amount: 20_000 }], 'reducePayment');
    expect(s.totalInterest).toBeCloseTo(buildAnnuitySchedule({ principal: 100_000, annualRatePct: 12, termMonths: 240 }).totalInterest, 6);
  });

  it('поздние транши — досрочные взносы в своих месяцах', () => {
    const s = bankScheduleWithHelp(loan, [{ month: 12, amount: 5_000 }, { month: 24, amount: 5_000 }], 'reduceTerm');
    const direct = buildSchedule({
      ...loan,
      prepayments: [{ month: 12, amount: 5_000, mode: 'reduceTerm' }, { month: 24, amount: 5_000, mode: 'reduceTerm' }],
    });
    expect(s.totalInterest).toBeCloseTo(direct.totalInterest, 8);
  });
});

describe('в сегодняшних деньгах', () => {
  it('через год при инфляции 15% 1 150 — это 1 000 сегодня', () => {
    expect(todayValue(1_150, 12, 15)).toBeCloseTo(1_000, 8);
    expect(todayValue(1_000, 0, 15)).toBe(1_000);
  });

  it('беспроцентные 12 000, возврат по 1 000 в месяц, инфляция 15%: вернётся меньше, чем дали (формула суммы прогрессии)', () => {
    const tranches = [{ month: 0, amount: 12_000 }];
    const r = privateLoanRepayment({ tranches, ratePct: 0, graceMonths: 0, monthlyPayment: 1_000 });
    const v = 1.15 ** (-1 / 12);
    const expected = (1_000 * v * (1 - v ** 12)) / (1 - v);
    const real = privateLoanRealValue(r, tranches, 15);
    expect(real.given).toBe(12_000);
    expect(real.returned).toBeCloseTo(expected, 6);
    expect(real.returned).toBeLessThan(12_000);
  });
});
