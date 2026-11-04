import { describe, expect, it } from 'vitest';
import { buildAnnuitySchedule, buildSchedule } from './annuity';
import { costPerDay, helpAfterPayment, helpDelayCurve, interestAtDay, type HelpTimingInput } from './helpTiming';
import type { VariableLoanParams } from './types';

const loan = (principal: number, ratePct: number, termMonths: number, extra: Partial<VariableLoanParams> = {}): VariableLoanParams => ({
  principal, termMonths, rateSteps: [{ fromMonth: 1, annualRatePct: ratePct }], interestOnlyMonths: 0, ...extra,
});

describe('helpAfterPayment', () => {
  it('в день выдачи, «уменьшить платёж» — это просто кредит меньше: 100 000 под 12% на год — 6 618,55 процентов', () => {
    // Учебный пример: платёж 8 884,88 × 12 − 100 000 = 6 618,55.
    const r = helpAfterPayment({ loan: loan(150_000, 12, 12), amount: 50_000, mode: 'reducePayment' }, 0);
    expect(r.totalInterest).toBeCloseTo(6618.55, 1);
    expect(r.months).toBe(12);
  });

  it('в день выдачи, «сократить срок» — платёж как у большего кредита, срок по формуле с логарифмом', () => {
    const input: HelpTimingInput = { loan: loan(120_000, 12, 240), amount: 20_000, mode: 'reduceTerm' };
    const payment = (120_000 * 0.01) / (1 - 1.01 ** -240); // ≈ 1 321,30
    const months = Math.ceil(-Math.log(1 - (100_000 * 0.01) / payment) / Math.log(1.01));
    const r = helpAfterPayment(input, 0);
    expect(payment).toBeCloseTo(1321.30, 2);
    expect(months).toBe(143);
    expect(r.months).toBe(months);
    expect(r.schedule.rows[0]!.payment).toBeCloseTo(payment, 6);
    // Без помощи: 1 321,30 × 240 − 120 000 ≈ 197 114 процентов; с помощью 20 000 в день выдачи — на 97 месяцев меньше.
    const without = buildAnnuitySchedule({ principal: 120_000, annualRatePct: 12, termMonths: 240 });
    expect(without.totalInterest).toBeCloseTo(payment * 240 - 120_000, 4);
    // Сложный процент: экономия процентов во много раз больше самой помощи.
    expect(without.totalInterest - r.totalInterest).toBeGreaterThan(5 * 20_000);
    // А «уменьшить платёж» экономит ровно проценты на 20 000 как на отдельный кредит.
    const reducePayment = helpAfterPayment({ ...input, mode: 'reducePayment' }, 0);
    const own20k = buildAnnuitySchedule({ principal: 20_000, annualRatePct: 12, termMonths: 240 }).totalInterest;
    expect(without.totalInterest - reducePayment.totalInterest).toBeCloseTo(own20k, 4);
  });

  it('после платежа k — то же, что досрочный взнос в месяце k', () => {
    const input: HelpTimingInput = { loan: loan(120_000, 12, 240), amount: 20_000, mode: 'reduceTerm' };
    const r = helpAfterPayment(input, 6);
    const direct = buildSchedule({ ...input.loan, prepayments: [{ month: 6, amount: 20_000, mode: 'reduceTerm' }] });
    expect(r.totalInterest).toBeCloseTo(direct.totalInterest, 8);
  });

  it('промедление на месяц при «уменьшить платёж»: проценты на сумму за месяц минус то, что больший платёж успел погасить', () => {
    const input: HelpTimingInput = { loan: loan(120_000, 12, 240), amount: 20_000, mode: 'reducePayment' };
    const delay = helpAfterPayment(input, 1).totalInterest - helpAfterPayment(input, 0).totalInterest;
    // Месяц процентов на 20 000 — 200. Но в первый месяц платёж был за 120 000, а не за 100 000: лишние
    // 220,22 − 200 = 20,22 ушли в долг и сэкономят проценты на 239 оставшихся месяцах (≈ 1,65 на рубль).
    const extraPrincipal = (20_000 * 0.01) / (1 - 1.01 ** -240) - 200;
    const perUnit = (239 * 0.01) / (1 - 1.01 ** -239) - 1;
    expect(delay).toBeCloseTo(200 - extraPrincipal * perUnit, 0);
  });

  it('чем позже помощь, тем больше переплата — в обоих режимах', () => {
    for (const mode of ['reduceTerm', 'reducePayment'] as const) {
      const curve = helpDelayCurve({ loan: loan(120_000, 12, 240), amount: 20_000, mode }, 24, (k) => k * 30);
      for (let i = 1; i < curve.length; i++) expect(curve[i]!.totalInterest).toBeGreaterThan(curve[i - 1]!.totalInterest);
    }
  });

  it('помощь больше кредита — процентов нет; кредит уже закрыт — помощь ничего не меняет', () => {
    expect(helpAfterPayment({ loan: loan(10_000, 12, 12), amount: 20_000, mode: 'reduceTerm' }, 0).totalInterest).toBe(0);
    const late = helpAfterPayment({ loan: loan(10_000, 12, 12), amount: 5_000, mode: 'reduceTerm' }, 20);
    expect(late.totalInterest).toBeCloseTo(buildAnnuitySchedule({ principal: 10_000, annualRatePct: 12, termMonths: 12 }).totalInterest, 8);
  });

  it('дифференцированный, «сократить срок» в день выдачи: доля долга прежняя, срок короче', () => {
    // 120 000 на 120 мес. → 1 000 в месяц; без 30 000 остаётся 90 000 → 90 месяцев.
    const r = helpAfterPayment({ loan: loan(120_000, 12, 120, { repayment: 'differentiated' }), amount: 30_000, mode: 'reduceTerm' }, 0);
    expect(r.months).toBe(90);
    expect(r.schedule.rows[0]!.principal).toBeCloseTo(1000, 8);
  });

  it('некорректный ввод — RangeError по-русски', () => {
    expect(() => helpAfterPayment({ loan: loan(10_000, 12, 12), amount: -1, mode: 'reduceTerm' }, 0)).toThrow(/Сумма помощи/);
    expect(() => helpAfterPayment({ loan: loan(10_000, 12, 12), amount: 1, mode: 'reduceTerm' }, 1.5)).toThrow(RangeError);
  });
});

describe('interestAtDay и costPerDay', () => {
  const curve = [
    { payment: 0, day: 0, totalInterest: 1000, months: 10 },
    { payment: 1, day: 31, totalInterest: 1310, months: 10 },
    { payment: 2, day: 59, totalInterest: 1590, months: 10 },
  ];
  it('между датами платежей — пропорционально дням', () => {
    expect(interestAtDay(curve, 0)).toBe(1000);
    expect(interestAtDay(curve, 10)).toBeCloseTo(1100, 8);
    expect(interestAtDay(curve, 45)).toBeCloseTo(1450, 8);
    expect(interestAtDay(curve, 100)).toBe(1590);
  });
  it('цена дня — наклон своего периода', () => {
    expect(costPerDay(curve, 0)).toBeCloseTo(10, 8);
    expect(costPerDay(curve, 31)).toBeCloseTo(10, 8);
    expect(costPerDay(curve, 58)).toBeCloseTo(10, 8);
  });
});
