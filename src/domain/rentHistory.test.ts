import { describe, expect, it } from 'vitest';
import { monthNumber, rentFlows, rentSummary } from './rentHistory';

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
