import { describe, expect, it } from 'vitest';
import { buildAnnuitySchedule, buildSchedule, paymentPhases, rateForMonth } from './annuity';

const kopecks = (n: number) => Math.round(n * 100) / 100;

describe('buildSchedule: одна ставка = обычный аннуитет', () => {
  it('совпадает с buildAnnuitySchedule построчно', () => {
    const variable = buildSchedule({
      principal: 1_000_000, termMonths: 12, rateSteps: [{ fromMonth: 1, annualRatePct: 12 }], interestOnlyMonths: 0,
    });
    const plain = buildAnnuitySchedule({ principal: 1_000_000, annualRatePct: 12, termMonths: 12 });
    expect(variable.rows).toEqual(plain.rows);
    expect(paymentPhases(variable)).toHaveLength(1);
  });
});

describe('buildSchedule: смена ставки', () => {
  // 1 000 000 на 24 мес.: первый год 12%, второй — 24%.
  // Платёж 1-го года — табличный 47 073,47 (1 млн, 1%/мес., 24 мес.).
  // Остаток после 12 платежей по формуле L(1+r)^k − P((1+r)^k − 1)/r = 529 815,58,
  // новый платёж на этот остаток при 2%/мес. на 12 мес. = 50 099,15.
  const s = buildSchedule({
    principal: 1_000_000,
    termMonths: 24,
    rateSteps: [{ fromMonth: 1, annualRatePct: 12 }, { fromMonth: 13, annualRatePct: 24 }],
    interestOnlyMonths: 0,
  });

  it('платёж 47 073,47, после смены ставки — 50 099,15', () => {
    expect(kopecks(s.rows[0]!.payment)).toBe(47_073.47);
    expect(kopecks(s.rows[11]!.balance)).toBe(529_815.58);
    expect(kopecks(s.rows[12]!.payment)).toBe(50_099.15);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });

  it('два отрезка платежа: 1–12 и 13–24', () => {
    expect(paymentPhases(s).map((p) => [p.fromMonth, p.toMonth])).toEqual([[1, 12], [13, 24]]);
  });

  it('льгота 0%, затем 12%: 120 000 на 24 мес. → 5 000, потом 5 330,93 (табличный 88 848,79 на млн × 0,06)', () => {
    const promo = buildSchedule({
      principal: 120_000,
      termMonths: 24,
      rateSteps: [{ fromMonth: 1, annualRatePct: 0 }, { fromMonth: 13, annualRatePct: 12 }],
      interestOnlyMonths: 0,
    });
    expect(promo.rows[0]!.payment).toBe(5_000);
    expect(promo.rows[11]!.balance).toBeCloseTo(60_000, 6);
    expect(kopecks(promo.rows[12]!.payment)).toBe(5_330.93);
  });
});

describe('buildSchedule: «только проценты»', () => {
  // 1 000 000 под 12% на 24 мес., первые 12 — только проценты: 12 × 10 000,
  // потом обычный аннуитет на 12 мес. — 88 848,79, его переплата 66 185,46.
  const s = buildSchedule({
    principal: 1_000_000, termMonths: 24, rateSteps: [{ fromMonth: 1, annualRatePct: 12 }], interestOnlyMonths: 12,
  });

  it('первый год платёж 10 000 и долг не уменьшается', () => {
    expect(s.rows[0]!.payment).toBe(10_000);
    expect(s.rows[11]!.balance).toBe(1_000_000);
    expect(s.rows.slice(0, 12).every((r) => r.principal === 0)).toBe(true);
  });

  it('второй год — 88 848,79; переплата 120 000 + 66 185,46 = 186 185,46', () => {
    expect(kopecks(s.rows[12]!.payment)).toBe(88_848.79);
    expect(kopecks(s.totalInterest)).toBe(186_185.46);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });
});

describe('проверки входа', () => {
  const base = { principal: 1000, termMonths: 12, interestOnlyMonths: 0 };
  it('понятные ошибки', () => {
    expect(() => buildSchedule({ ...base, rateSteps: [] })).toThrow('ни одной ставки');
    expect(() => buildSchedule({ ...base, rateSteps: [{ fromMonth: 2, annualRatePct: 10 }] })).toThrow('с 1-го месяца');
    expect(() => buildSchedule({
      ...base, rateSteps: [{ fromMonth: 1, annualRatePct: 10 }, { fromMonth: 1, annualRatePct: 12 }],
    })).toThrow('по порядку');
    expect(() => buildSchedule({ ...base, rateSteps: [{ fromMonth: 1, annualRatePct: 10 }], interestOnlyMonths: 12 }))
      .toThrow('«только проценты»');
  });

  it('период ставки после конца срока просто не наступает', () => {
    const s = buildSchedule({
      ...base, rateSteps: [{ fromMonth: 1, annualRatePct: 12 }, { fromMonth: 100, annualRatePct: 50 }],
    });
    expect(paymentPhases(s)).toHaveLength(1);
  });

  it('rateForMonth', () => {
    const steps = [{ fromMonth: 1, annualRatePct: 1 }, { fromMonth: 25, annualRatePct: 15.4 }];
    expect(rateForMonth(steps, 24)).toBe(1);
    expect(rateForMonth(steps, 25)).toBe(15.4);
  });
});
