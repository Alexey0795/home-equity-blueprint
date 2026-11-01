import { describe, expect, it } from 'vitest';
import { convert, gapToDownPayment, summarizeSavings, type Account, type FxRates } from './money';

const rates: FxRates = { USD: 3.25, EUR: 3.5 };

const account = (currency: Account['currency'], amount: number, useForDownPayment = true): Account => ({
  id: `${currency}-${amount}`,
  name: currency,
  currency,
  amount,
  useForDownPayment,
});

describe('convert', () => {
  it('1 000 USD при курсе 3,25 → 3 250 BYN', () => {
    expect(convert(1_000, 'USD', 'BYN', rates)).toBe(3_250);
  });
  it('3 500 BYN при курсе EUR 3,5 → 1 000 EUR', () => {
    expect(convert(3_500, 'BYN', 'EUR', rates)).toBe(1_000);
  });
  it('кросс-курс через BYN: 1 300 EUR → 1 400 USD (1 300 × 3,5 / 3,25)', () => {
    expect(convert(1_300, 'EUR', 'USD', rates)).toBeCloseTo(1_400, 10);
  });
  it('та же валюта — без пересчёта и без проверки курса', () => {
    expect(convert(123, 'USD', 'USD', { USD: Number.NaN, EUR: 0 })).toBe(123);
  });
  it('пустой или нулевой курс → понятная ошибка', () => {
    expect(() => convert(1, 'USD', 'BYN', { USD: Number.NaN, EUR: 3.5 })).toThrow('Курс USD');
    expect(() => convert(1, 'BYN', 'EUR', { USD: 3.25, EUR: 0 })).toThrow('Курс EUR');
  });
});

describe('summarizeSavings', () => {
  const accounts = [account('BYN', 10_000), account('USD', 2_000), account('EUR', 1_000, false)];

  it('в BYN: всего 10 000 + 6 500 + 3 500 = 20 000, на взнос 16 500', () => {
    expect(summarizeSavings(accounts, 'BYN', rates)).toEqual({ total: 20_000, availableForDown: 16_500 });
  });

  it('в USD: всего 20 000 / 3,25 ≈ 6 153,85', () => {
    const s = summarizeSavings(accounts, 'USD', rates);
    expect(s.total).toBeCloseTo(6_153.846, 3);
    expect(s.availableForDown).toBeCloseTo(5_076.923, 3);
  });

  it('нет счетов → нули', () => {
    expect(summarizeSavings([], 'BYN', rates)).toEqual({ total: 0, availableForDown: 0 });
  });

  it('пустая сумма на счёте → ошибка с названием счёта', () => {
    expect(() => summarizeSavings([{ ...account('BYN', 0), name: 'Копилка', amount: Number.NaN }], 'BYN', rates))
      .toThrow('«Копилка»');
  });
});

describe('gapToDownPayment', () => {
  it('нужно 60 000, есть 16 500 → не хватает 43 500', () => {
    expect(gapToDownPayment(60_000, 16_500)).toBe(43_500);
  });
  it('есть больше, чем нужно → отрицательный разрыв (запас)', () => {
    expect(gapToDownPayment(10_000, 16_500)).toBe(-6_500);
  });
});
