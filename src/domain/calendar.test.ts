import { describe, expect, it } from 'vitest';
import { buildSchedule } from './annuity';
import { addMonths, calendarYearTotals, monthIndexFor, parseIsoDate, paymentDate, toIsoDate } from './calendar';

const d = parseIsoDate;
const iso = (x: ReturnType<typeof d>) => toIsoDate(x);

describe('даты платежей', () => {
  it('тот же день следующего месяца; первый платёж — через месяц после выдачи', () => {
    expect(iso(paymentDate(d('2027-01-15'), 1))).toBe('2027-02-15');
    expect(iso(paymentDate(d('2027-01-15'), 12))).toBe('2028-01-15');
    expect(iso(paymentDate(d('2027-01-15'), 240))).toBe('2047-01-15');
  });

  it('нет такого числа — последний день месяца (високосный год учитывается), дальше снова 31-е', () => {
    expect(iso(addMonths(d('2027-01-31'), 1))).toBe('2027-02-28');
    expect(iso(addMonths(d('2028-01-31'), 1))).toBe('2028-02-29');
    expect(iso(addMonths(d('2027-01-31'), 3))).toBe('2027-04-30');
    expect(iso(addMonths(d('2027-01-31'), 2))).toBe('2027-03-31');
  });

  it('переход через год и декабрь', () => {
    expect(iso(addMonths(d('2026-11-30'), 1))).toBe('2026-12-30');
    expect(iso(addMonths(d('2026-12-15'), 1))).toBe('2027-01-15');
  });

  it('проверка ввода', () => {
    expect(() => d('2027-02-30')).toThrow('Такой даты нет');
    expect(() => d('15.03.2027')).toThrow('ГГГГ-ММ-ДД');
  });

  it('месяц по дате: выдача 15.01.2027, март 2028 → 14-й платёж; раньше первого → 1', () => {
    expect(monthIndexFor(d('2027-01-15'), d('2028-03-01'))).toBe(14);
    expect(iso(paymentDate(d('2027-01-15'), 14))).toBe('2028-03-15');
    expect(monthIndexFor(d('2027-01-15'), d('2026-05-01'))).toBe(1);
  });
});

describe('calendarYearTotals', () => {
  // 120 000 под 0% на 12 мес. — платёж 10 000. Выдача 15.10.2027: платежи ноябрь 2027 … октябрь 2028.
  const s = buildSchedule({ principal: 120_000, termMonths: 12, rateSteps: [{ fromMonth: 1, annualRatePct: 0 }], interestOnlyMonths: 0 });

  it('2027 — 2 платежа (ноябрь, декабрь), 2028 — 10', () => {
    const years = calendarYearTotals(s, d('2027-10-15'));
    expect(years.map((y) => [y.year, y.payment])).toEqual([[2027, 20_000], [2028, 100_000]]);
    expect(years.at(-1)!.balance).toBe(0);
  });

  it('выдача в декабре: все 12 платежей — в следующем году', () => {
    expect(calendarYearTotals(s, d('2027-12-01')).map((y) => y.year)).toEqual([2028]);
  });
});
