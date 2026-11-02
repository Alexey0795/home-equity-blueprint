import { describe, expect, it } from 'vitest';
import { buildSchedule } from './annuity';
import { runJournal } from './journal';
import { maxPayment, solveDeal } from './solver';
import type { VariableLoanParams } from './types';

const kopecks = (n: number) => Math.round(n * 100) / 100;
const base: VariableLoanParams = {
  principal: 120_000, termMonths: 12, rateSteps: [{ fromMonth: 1, annualRatePct: 12 }], interestOnlyMonths: 0, repayment: 'differentiated',
};

describe('дифференцированный график — классика', () => {
  // 120 000 под 12% на 12 мес.: долг по 10 000; проценты 1 200, 1 100, …, 100 → платежи 11 200 … 10 100, переплата 7 800.
  const s = buildSchedule(base);

  it('платежи 11 200 → 10 100, долг равными частями по 10 000', () => {
    expect(s.rows.map((r) => kopecks(r.payment))).toEqual([11_200, 11_100, 11_000, 10_900, 10_800, 10_700, 10_600, 10_500, 10_400, 10_300, 10_200, 10_100]);
    expect(s.rows.every((r) => kopecks(r.principal) === 10_000)).toBe(true);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });

  it('переплата 7 800 — меньше аннуитета (66 185,46 на 1 млн → 7 942,25 на 120 000)', () => {
    expect(kopecks(s.totalInterest)).toBe(7_800);
    const annuity = buildSchedule({ ...base, repayment: 'annuity' });
    expect(kopecks(annuity.totalInterest)).toBe(7_942.26);
  });

  it('«только проценты» 12 мес. на 24 мес.: 12 × 1 200 + 7 800 = 22 200', () => {
    const io = buildSchedule({ ...base, termMonths: 24, interestOnlyMonths: 12 });
    expect(io.rows[11]!.payment).toBe(1_200);
    expect(kopecks(io.rows[12]!.payment)).toBe(11_200);
    expect(kopecks(io.totalInterest)).toBe(22_200);
  });

  it('смена ставки меняет только проценты: доля долга та же', () => {
    const r = buildSchedule({ ...base, rateSteps: [{ fromMonth: 1, annualRatePct: 12 }, { fromMonth: 7, annualRatePct: 24 }] });
    expect(r.rows.every((x) => kopecks(x.principal) === 10_000)).toBe(true);
    expect(kopecks(r.rows[6]!.interest)).toBe(1_200); // 60 000 × 2%
  });
});

describe('дифференцированный + досрочка', () => {
  const zero = { ...base, rateSteps: [{ fromMonth: 1, annualRatePct: 0 }] };

  it('«сократить срок»: в 2-м мес. 30 000 → остаток 70 000 по 10 000 → кредит закрыт в 9-м мес.', () => {
    const s = buildSchedule({ ...zero, prepayments: [{ month: 2, amount: 30_000, mode: 'reduceTerm' }] });
    expect(s.rows).toHaveLength(9);
    expect(s.rows.slice(2).every((x) => kopecks(x.principal) === 10_000)).toBe(true);
  });

  it('«уменьшить платёж»: остаток 70 000 на 10 мес. → по 7 000', () => {
    const s = buildSchedule({ ...zero, prepayments: [{ month: 2, amount: 30_000, mode: 'reducePayment' }] });
    expect(s.rows).toHaveLength(12);
    expect(kopecks(s.rows[2]!.principal)).toBe(7_000);
  });
});

describe('сверка с независимым расчётом из исследования', () => {
  it('«Ипотека Экспресс»: 150 000 на 20 лет, 12% 24 мес. → 14,4%, долг с 13-го мес. → переплата ≈ 220 587', () => {
    const s = buildSchedule({
      principal: 150_000, termMonths: 240, interestOnlyMonths: 12, repayment: 'differentiated',
      rateSteps: [{ fromMonth: 1, annualRatePct: 12 }, { fromMonth: 25, annualRatePct: 14.4 }],
    });
    expect(Math.round(s.totalInterest)).toBe(220_587);
    expect(Math.round(maxPayment(s))).toBe(2_363);
  });
});

describe('решатель с дифференцированным графиком', () => {
  it('платёж пропорционален сумме: «платёж не больше» 93 333,33 при 12% на 12 мес. → кредит 1 000 000 (взнос = цена − 1 млн)', () => {
    const { deal } = solveDeal('downPayment', {
      price: 1_500_000, downPayment: 0, termMonths: 12, targetPayment: 1_000_000 / 12 + 10_000,
      rate: { kind: 'manual', annualRatePct: 12 }, repayment: 'differentiated',
    });
    expect(kopecks(deal.downPayment)).toBe(500_000);
  });
});

describe('хроника с дифференцированным графиком', () => {
  const terms = {
    issueDate: '2027-01-15', principal: 120_000, annualRatePct: 12, termMonths: 12, dayCount: 'actual365' as const,
    repayment: 'differentiated' as const,
  };

  it('плановый платёж = доля долга 10 000 + проценты на остаток; прогноз и договор — дифференцированные', () => {
    const r = runJournal(terms, []);
    expect(kopecks(r.scheduledPayment)).toBe(11_200);
    expect(kopecks(r.contract.totalInterest)).toBe(7_800);
    expect(kopecks(r.forecast!.rows[0]!.principal)).toBe(10_000);
  });

  it('«только проценты» 3 мес.: первый плановый — только проценты 1 200, потом доля 120 000 / 9', () => {
    const r = runJournal({ ...terms, interestOnlyMonths: 3 }, []);
    expect(kopecks(r.scheduledPayment)).toBe(1_200);
    expect(kopecks(r.forecast!.rows[3]!.principal)).toBe(kopecks(120_000 / 9));
    expect(() => runJournal({ ...terms, interestOnlyMonths: 12 }, [])).toThrow('«только проценты»');
  });
});
