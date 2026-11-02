import { describe, expect, it } from 'vitest';
import { parseIsoDate } from './calendar';
import { runJournal, scheduledPaymentDates, yearFraction, type LoanTerms } from './journal';

// Эталоны посчитаны отдельно (Python, округление до копеек при каждом начислении):
// 100 000 под 12%, «365 дней»: 31 день → 1 019,18; затем 28 дней на 98 019,18 → 902,31.
const terms: LoanTerms = { issueDate: '2027-01-15', principal: 100_000, annualRatePct: 12, termMonths: 36, dayCount: 'actual365' };

describe('yearFraction', () => {
  // Дни считаются со следующего дня после события по день следующего события включительно:
  // 15.12.2027 → 15.01.2028 = 16 дней 2027 года (16–31 дек) + 15 дней високосного 2028-го (1–15 янв).
  it('365: 31 день = 31/365; фактические дни через Новый год в високосный: 16/365 + 15/366', () => {
    expect(yearFraction(parseIsoDate('2027-01-15'), parseIsoDate('2027-02-15'), 'actual365')).toBeCloseTo(31 / 365, 12);
    expect(yearFraction(parseIsoDate('2027-12-15'), parseIsoDate('2028-01-15'), 'actualActual')).toBeCloseTo(16 / 365 + 15 / 366, 12);
  });
});

describe('runJournal: платежи', () => {
  const result = runJournal(terms, [
    { kind: 'payment', date: '2027-02-15', amount: 3_000 },
    { kind: 'payment', date: '2027-03-15', amount: 3_000 },
  ]);

  it('проценты по дням: 1 019,18 и 902,31; долг 98 019,18 → 95 921,49', () => {
    expect(result.rows.map((r) => r.interestPaid)).toEqual([1_019.18, 902.31]);
    expect(result.rows.map((r) => r.balance)).toEqual([98_019.18, 95_921.49]);
    expect(result.interestPaid).toBe(1_921.49);
    expect(result.totalPaid).toBe(6_000);
    expect(result.principalPaid).toBe(4_078.51);
  });

  it('прогноз с ближайшего непройденного платежа (3-й) на оставшиеся 34 мес.', () => {
    expect(result.forecastFromMonth).toBe(3);
    expect(result.forecast!.rows).toHaveLength(34);
    expect(result.contract.rows).toHaveLength(36);
  });
});

describe('runJournal: досрочка, смена ставки, выписка', () => {
  it('досрочка 20 000 первого марта: проценты до неё ждут платежа (451,16 + 359,10 = 810,26), долг 75 829,44', () => {
    const r = runJournal(terms, [
      { kind: 'payment', date: '2027-02-15', amount: 3_000 },
      { kind: 'prepayment', date: '2027-03-01', amount: 20_000, mode: 'reduceTerm' },
      { kind: 'payment', date: '2027-03-15', amount: 3_000 },
    ]);
    expect(r.rows[1]).toMatchObject({ accrued: 451.16, interestPaid: 0, principalPaid: 20_000, unpaidInterest: 451.16 });
    expect(r.rows[2]).toMatchObject({ interestPaid: 810.26, balance: 75_829.44, unpaidInterest: 0 });
  });

  it('«сократить срок» — платёж прежний, «уменьшить платёж» — меньше', () => {
    const base = [{ kind: 'payment' as const, date: '2027-02-15', amount: 3_000 }];
    const term = runJournal(terms, [...base, { kind: 'prepayment', date: '2027-03-01', amount: 20_000, mode: 'reduceTerm' }]);
    const pay = runJournal(terms, [...base, { kind: 'prepayment', date: '2027-03-01', amount: 20_000, mode: 'reducePayment' }]);
    expect(term.scheduledPayment).toBeCloseTo(term.rows[0]!.scheduledPayment, 6);
    expect(pay.scheduledPayment).toBeLessThan(term.scheduledPayment);
    expect(term.forecast!.rows.length).toBeLessThan(pay.forecast!.rows.length);
  });

  it('смена ставки 1 февраля на 15%: 17 дней по 12% (558,90) + 14 дней по 15% (575,34) = 1 134,24', () => {
    const r = runJournal(terms, [
      { kind: 'rate', date: '2027-02-01', annualRatePct: 15 },
      { kind: 'payment', date: '2027-02-15', amount: 3_000 },
    ]);
    expect(r.rows[0]!.accrued).toBe(558.9);
    expect(r.rows[1]!.interestPaid).toBe(1_134.24);
    expect(r.ratePct).toBe(15);
  });

  it('выписка банка — истина; расхождение с нашим расчётом видно', () => {
    const r = runJournal(terms, [
      { kind: 'payment', date: '2027-02-15', amount: 3_000, statement: { interest: 1_019.2, principal: 1_980.8 } },
    ]);
    expect(r.rows[0]).toMatchObject({ interestPaid: 1_019.2, principalPaid: 1_980.8, balance: 98_019.2, discrepancy: 0.02 });
  });

  it('полное погашение → долг 0, прогноза нет', () => {
    const r = runJournal(terms, [{ kind: 'prepayment', date: '2027-02-01', amount: 200_000, mode: 'reduceTerm' }]);
    expect(r.balance).toBe(0);
    expect(r.rows[0]!.principalPaid).toBe(100_000);
    expect(r.forecast).toBeNull();
  });

  it('события в любом порядке ввода сортируются по дате', () => {
    const r = runJournal(terms, [
      { kind: 'payment', date: '2027-03-15', amount: 3_000 },
      { kind: 'payment', date: '2027-02-15', amount: 3_000 },
    ]);
    expect(r.rows.map((x) => x.index)).toEqual([1, 0]);
    expect(r.rows[1]!.balance).toBe(95_921.49);
  });

  it('понятные ошибки', () => {
    expect(() => runJournal(terms, [{ kind: 'payment', date: '2027-01-10', amount: 1 }])).toThrow('позже даты выдачи');
    expect(() => runJournal({ ...terms, principal: 0 }, [])).toThrow('Сумма кредита');
    expect(() => runJournal(terms, [{ kind: 'payment', date: '2027-02-30', amount: 1 }])).toThrow('Такой даты нет');
  });
});

describe('scheduledPaymentDates', () => {
  it('плановые даты с выдачи по указанную дату', () => {
    expect(scheduledPaymentDates('2027-01-31', 36, '2027-05-01')).toEqual(['2027-02-28', '2027-03-31', '2027-04-30']);
  });
});
