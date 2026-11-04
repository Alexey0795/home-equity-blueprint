import { describe, expect, it } from 'vitest';
import { buildSchedule, paymentPhases, prepaymentEffect } from './annuity';
import type { PrepaymentPlan, VariableLoanParams } from './types';

const kopecks = (n: number) => Math.round(n * 100) / 100;

// 1 000 000 под 12% на 12 мес. (табличный платёж 88 848,79, переплата 66 185,46).
// В 1-м месяце после платежа остаток 921 151,21; досрочно вносим 300 000 → остаток 621 151,21.
const base: VariableLoanParams = {
  principal: 1_000_000,
  termMonths: 12,
  rateSteps: [{ fromMonth: 1, annualRatePct: 12 }],
  interestOnlyMonths: 0,
};
const prepay = (mode: PrepaymentPlan['mode'], month = 1, amount = 300_000): PrepaymentPlan[] => [{ month, amount, mode }];

describe('сократить срок', () => {
  const s = buildSchedule({ ...base, prepayments: prepay('reduceTerm') });

  it('остаток после взноса 621 151,21, платёж прежний 88 848,79', () => {
    expect(s.rows[0]!.prepayment).toBe(300_000);
    expect(kopecks(s.rows[0]!.balance)).toBe(621_151.21);
    expect(kopecks(s.rows[1]!.payment)).toBe(88_848.79);
  });

  it('кредит закрыт за 9 мес. вместо 12, переплата 36 085,06 вместо 66 185,46', () => {
    expect(s.rows).toHaveLength(9);
    expect(s.rows.at(-1)!.balance).toBe(0);
    expect(kopecks(s.totalInterest)).toBe(36_085.06);
    const effect = prepaymentEffect(buildSchedule(base), s);
    expect(effect.monthsSaved).toBe(3);
    expect(kopecks(effect.interestSaved)).toBe(30_100.4);
  });

  it('тело долга + досрочка = сумма кредита', () => {
    const repaid = s.rows.reduce((sum, r) => sum + r.principal + r.prepayment, 0);
    expect(repaid).toBeCloseTo(1_000_000, 6);
  });
});

describe('уменьшить платёж', () => {
  const s = buildSchedule({ ...base, prepayments: prepay('reducePayment') });

  it('срок прежний, платёж падает до 59 912,57 (аннуитет на 621 151,21 на 11 мес.)', () => {
    expect(s.rows).toHaveLength(12);
    expect(kopecks(s.rows[1]!.payment)).toBe(59_912.57);
    expect(paymentPhases(s)).toHaveLength(2);
  });

  it('переплата 47 887,01 — меньше, чем без досрочки, но больше, чем при «сократить срок»', () => {
    expect(kopecks(s.totalInterest)).toBe(47_887.01);
  });
});

describe('нулевая ставка — цифры видно в уме', () => {
  const zero: VariableLoanParams = { principal: 120_000, termMonths: 12, rateSteps: [{ fromMonth: 1, annualRatePct: 0 }], interestOnlyMonths: 0 };

  it('платёж 10 000; в 6-м мес. взнос 60 000 «сократить срок» закрывает кредит', () => {
    const s = buildSchedule({ ...zero, prepayments: [{ month: 6, amount: 60_000, mode: 'reduceTerm' }] });
    expect(s.rows).toHaveLength(6);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });

  it('в 3-м мес. 30 000 «уменьшить платёж» → 60 000 на 9 мес. = 6 666,67', () => {
    const s = buildSchedule({ ...zero, prepayments: [{ month: 3, amount: 30_000, mode: 'reducePayment' }] });
    expect(kopecks(s.rows[3]!.payment)).toBe(6_666.67);
    expect(s.rows).toHaveLength(12);
  });

  it('взнос больше остатка — берётся только остаток', () => {
    const s = buildSchedule({ ...zero, prepayments: [{ month: 2, amount: 1_000_000, mode: 'reduceTerm' }] });
    expect(s.rows[1]!.prepayment).toBe(100_000);
    expect(s.rows).toHaveLength(2);
  });

  it('взнос после конца кредита не учитывается', () => {
    const s = buildSchedule({ ...zero, prepayments: [{ month: 50, amount: 1_000, mode: 'reduceTerm' }] });
    expect(s.rows).toHaveLength(12);
  });
});

describe('досрочка + смена ставки', () => {
  // 120 000 на 24 мес.: 0% первый год, 12% со 13-го. Платёж 5 000.
  // В 6-м мес. взнос 30 000 «сократить срок»: остаток 60 000 при платеже 5 000 → плановый конец — 18-й мес.
  // В 13-м мес. ставка 12%, остаток 30 000 — платёж пересчитывается на оставшиеся 6 мес. (а не 12): 5 176,45.
  const s = buildSchedule({
    principal: 120_000,
    termMonths: 24,
    rateSteps: [{ fromMonth: 1, annualRatePct: 0 }, { fromMonth: 13, annualRatePct: 12 }],
    interestOnlyMonths: 0,
    prepayments: [{ month: 6, amount: 30_000, mode: 'reduceTerm' }],
  });

  it('новый платёж 5 176,45, кредит закрыт в 18-м мес.', () => {
    expect(kopecks(s.rows[12]!.payment)).toBe(5_176.45);
    expect(s.rows).toHaveLength(18);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });
});

describe('досрочка в период «только проценты»', () => {
  const io: VariableLoanParams = { ...base, termMonths: 24, interestOnlyMonths: 12 };

  it('«уменьшить платёж»: платёж после льготы — на меньший долг, срок прежний', () => {
    const s = buildSchedule({ ...io, prepayments: prepay('reducePayment', 6, 500_000) });
    expect(s.rows[6]!.payment).toBeCloseTo(5_000, 6); // проценты с 500 000
    expect(kopecks(s.rows[12]!.payment)).toBe(kopecks(88_848.7886783416 / 2));
    expect(s.rows).toHaveLength(24);
  });

  it('«сократить срок»: платёж после льготы — как без взноса, кредит закрывается раньше', () => {
    const s = buildSchedule({ ...io, prepayments: prepay('reduceTerm', 6, 500_000) });
    expect(s.rows[6]!.payment).toBeCloseTo(5_000, 6);
    // Платёж за 1 000 000 на 12 мес. под 1% в месяц — 88 848,79; 500 000 им гасятся за
    // −ln(1 − 5 000 / 88 848,79) / ln(1,01) ≈ 5,8 → 6 месяцев.
    expect(kopecks(s.rows[12]!.payment)).toBe(kopecks(88_848.7886783416));
    expect(s.rows).toHaveLength(18);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });
});

describe('взнос в день выдачи', () => {
  it('«сократить срок»: платёж как у полного кредита, срок короче; «уменьшить платёж» — как кредит меньше', () => {
    const term = buildSchedule({ ...base, atIssue: { amount: 500_000, mode: 'reduceTerm' } });
    expect(kopecks(term.rows[0]!.payment)).toBe(kopecks(88_848.7886783416));
    expect(term.rows).toHaveLength(6);
    const pay = buildSchedule({ ...base, atIssue: { amount: 500_000, mode: 'reducePayment' } });
    expect(kopecks(pay.rows[0]!.payment)).toBe(kopecks(88_848.7886783416 / 2));
    expect(pay.rows).toHaveLength(12);
  });
});

describe('проверки', () => {
  it('понятные ошибки', () => {
    expect(() => buildSchedule({ ...base, prepayments: [{ month: 0, amount: 1, mode: 'reduceTerm' }] })).toThrow('Месяц досрочного');
    expect(() => buildSchedule({ ...base, prepayments: [{ month: 2, amount: Number.NaN, mode: 'reduceTerm' }] })).toThrow('в месяце 2');
  });
});
