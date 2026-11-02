/** Валюты v1. BYN — базовая: курсы задаются как «сколько BYN за 1 единицу валюты», как у Нацбанка. */
export const CURRENCIES = ['BYN', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Ручные курсы: сколько BYN стоит 1 USD и 1 EUR. */
export interface FxRates {
  USD: number;
  EUR: number;
}

export interface Account {
  id: string;
  /** «Карта Беларусбанка», «Наличные дома» и т. п. */
  name: string;
  currency: Currency;
  amount: number;
  /** false — «эту кубышку не трогаем»: в общем итоге видна, на первый взнос не идёт. */
  useForDownPayment: boolean;
}

function bynPerUnit(currency: Currency, rates: FxRates): number {
  if (currency === 'BYN') return 1;
  const rate = rates[currency];
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError(`Курс ${currency} должен быть положительным числом`);
  }
  return rate;
}

/** Пересчёт суммы из одной валюты в другую через BYN. */
export function convert(amount: number, from: Currency, to: Currency, rates: FxRates): number {
  if (from === to) return amount;
  return (amount * bynPerUnit(from, rates)) / bynPerUnit(to, rates);
}

export interface SavingsSummary {
  /** Все счета в валюте сделки. */
  total: number;
  /** Только счета с флагом «на взнос». */
  availableForDown: number;
}

export function summarizeSavings(accounts: Account[], dealCurrency: Currency, rates: FxRates): SavingsSummary {
  let total = 0;
  let availableForDown = 0;
  for (const account of accounts) {
    if (!Number.isFinite(account.amount) || account.amount < 0) {
      throw new RangeError(`Счёт «${account.name || 'без названия'}»: сумма должна быть неотрицательным числом`);
    }
    const value = convert(account.amount, account.currency, dealCurrency, rates);
    total += value;
    if (account.useForDownPayment) availableForDown += value;
  }
  return { total, availableForDown };
}

/** Разрыв до первого взноса: > 0 — столько не хватает, < 0 — столько остаётся сверху. */
export function gapToDownPayment(downPayment: number, availableForDown: number): number {
  return downPayment - availableForDown;
}

/** Первый взнос из сбережений: всё, что можно направить на взнос, минус резерв «на чёрный день» (не меньше 0). */
export function downPaymentFromSavings(availableForDown: number, reserve: number): number {
  if (!Number.isFinite(reserve) || reserve < 0) throw new RangeError('Резерв должен быть неотрицательным числом');
  return Math.max(0, availableForDown - reserve);
}
