import { describe, expect, it } from 'vitest';
import { fxAt, monthNumber, rateAt, ratePeriodsFromHistory, rentFlows, rentSummary } from './rentHistory';

const same = (amount: number) => amount;

describe('rentFlows', () => {
  it('периоды по месяцам включительно; «по сей день» — до asOf; пересечения складываются', () => {
    const flows = rentFlows([
      { from: '2020-01', to: '2020-03', amount: 100, currency: 'USD' },
      { from: '2020-03', to: null, amount: 250, currency: 'USD' },
    ], '2020-05', same);
    expect(flows.map((f) => f.amount)).toEqual([100, 100, 350, 250, 250]);
    expect(flows[0]!.month).toBe(monthNumber('2020-01'));
  });
  it('пересчёт валюты и ошибки', () => {
    const flows = rentFlows([{ from: '2020-01', to: '2020-01', amount: 100, currency: 'USD' }], '2020-12', (a) => a * 3);
    expect(flows[0]!.amount).toBe(300);
    expect(() => rentFlows([{ from: '2020-05', to: '2020-01', amount: 1, currency: 'USD' }], '2021-01', same)).toThrow('раньше');
    expect(() => monthNumber('2020-13')).toThrow(RangeError);
  });
});

describe('rentSummary', () => {
  it('постоянный платёж 1 000 × 12 мес. при 12% — аннуитет: 1 000 × (1 − 1,01^−12) / 0,01 = 11 255,08', () => {
    const flows = rentFlows([{ from: '2020-01', to: '2020-12', amount: 1_000, currency: 'USD' }], '2020-12', same);
    const s = rentSummary(flows, 12);
    expect(s.total).toBe(12_000);
    expect(s.months).toBe(12);
    expect(s.equivalentLoan).toBeCloseTo(11_255.08, 2);
  });
  it('ставка 0 — кредит равен сумме платежей; пусто — нули', () => {
    const flows = rentFlows([{ from: '2020-01', to: '2020-06', amount: 100, currency: 'USD' }], '2021-01', same);
    expect(rentSummary(flows, 0).equivalentLoan).toBeCloseTo(600, 8);
    expect(rentSummary([], 10).equivalentLoan).toBe(0);
  });
});

describe('ставка по периодам', () => {
  it('rateAt: последний начавшийся период; раньше первого — запасная', () => {
    const periods = [{ from: '2020-01', ratePct: 10 }, { from: '2020-07', ratePct: 20 }];
    expect(rateAt(periods, monthNumber('2019-12'), 5)).toBe(5);
    expect(rateAt(periods, monthNumber('2020-03'), 5)).toBe(10);
    expect(rateAt(periods, monthNumber('2021-01'), 5)).toBe(20);
  });

  it('одна ставка через функцию = числом; две ставки — дисконт по месяцам: 1 000 / 1,01 + 1 000 / (1,01 × 1,02)', () => {
    const flows = rentFlows([{ from: '2020-01', to: '2020-12', amount: 1_000, currency: 'USD' }], '2020-12', same);
    expect(rentSummary(flows, () => 12).equivalentLoan).toBeCloseTo(rentSummary(flows, 12).equivalentLoan, 8);
    const two = rentFlows([{ from: '2020-01', to: '2020-02', amount: 1_000, currency: 'USD' }], '2020-02', same);
    const r = rentSummary(two, (m) => (m === monthNumber('2020-01') ? 12 : 24));
    expect(r.equivalentLoan).toBeCloseTo(1_000 / 1.01 + 1_000 / (1.01 * 1.02), 8);
  });

  it('СР + надбавка: месяц изменения и сумма', () => {
    expect(ratePeriodsFromHistory([{ from: '2011-01-01', ratePct: 10.5 }, { from: '2011-04-20', ratePct: 12 }], 3))
      .toEqual([{ from: '2011-01', ratePct: 13.5 }, { from: '2011-04', ratePct: 15 }]);
  });
});

describe('курс того месяца', () => {
  it('fxAt: последняя точка не позже месяца; пересчёт в rentFlows по месяцу', () => {
    const history = [{ month: '2020-01', usd: 2, eur: 2.2 }, { month: '2020-03', usd: 3, eur: 3.3 }];
    expect(fxAt(history, monthNumber('2020-02'))).toEqual({ USD: 2, EUR: 2.2 });
    expect(fxAt([], 0)).toBeNull();
    const flows = rentFlows([{ from: '2020-01', to: '2020-03', amount: 100, currency: 'USD' }], '2020-03',
      (a, _c, m) => a * fxAt(history, m)!.USD);
    expect(flows.map((f) => f.amount)).toEqual([200, 200, 300]);
  });
});
