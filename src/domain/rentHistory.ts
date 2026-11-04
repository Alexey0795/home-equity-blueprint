import type { Currency } from './money';

/**
 * Аренда в прошлом: периоды «с месяца по месяц, сумма в месяц, валюта». Месяцы — строкой «ГГГГ-ММ».
 * Платёж за месяц считается в конце месяца (как платёж по кредиту).
 */
export interface RentPeriod {
  from: string;
  /** null — по сей день. */
  to: string | null;
  amount: number;
  currency: Currency;
}

const MONTH = /^(\d{4})-(\d{2})$/;

/** «2019-03» → номер месяца (год × 12 + месяц − 1). */
export function monthNumber(text: string): number {
  const m = MONTH.exec(text);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new RangeError(`Месяц должен быть в виде ГГГГ-ММ, а не «${text}»`);
  return Number(m[1]) * 12 + Number(m[2]) - 1;
}

export function monthText(n: number): string {
  return `${String(Math.floor(n / 12)).padStart(4, '0')}-${String((n % 12) + 1).padStart(2, '0')}`;
}

export interface RentFlow {
  /** Номер месяца (monthNumber). */
  month: number;
  /** Платёж в валюте расчёта. */
  amount: number;
}

/**
 * Помесячные платежи в одной валюте (toTarget пересчитывает сумму периода) с первого месяца аренды по asOf включительно.
 * Пересекающиеся периоды складываются.
 */
export function rentFlows(periods: RentPeriod[], asOf: string, toTarget: (amount: number, from: Currency) => number): RentFlow[] {
  const end = monthNumber(asOf);
  const byMonth = new Map<number, number>();
  periods.forEach((p, i) => {
    const where = `Период аренды №${i + 1}`;
    if (!Number.isFinite(p.amount) || p.amount < 0) throw new RangeError(`${where}: сумма — неотрицательное число`);
    const from = monthNumber(p.from);
    const to = Math.min(p.to === null ? end : monthNumber(p.to), end);
    if (p.to !== null && monthNumber(p.to) < from) throw new RangeError(`${where}: «по» раньше, чем «с»`);
    const value = toTarget(p.amount, p.currency);
    for (let m = from; m <= to; m++) byMonth.set(m, (byMonth.get(m) ?? 0) + value);
  });
  return [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([month, amount]) => ({ month, amount }));
}

export interface RentSummary {
  months: number;
  firstMonth: number | null;
  total: number;
  /** Кредит, выданный в начале первого месяца аренды, который ровно эти платежи погасили бы к asOf. */
  equivalentLoan: number;
}

/**
 * Эквивалентный кредит: сумма = Σ платёж_k / (1 + r/12)^k, k — номер месяца от начала (первый месяц — 1).
 * При постоянном платеже это формула аннуитета.
 */
export function rentSummary(flows: RentFlow[], loanRatePct: number): RentSummary {
  if (!Number.isFinite(loanRatePct) || loanRatePct < 0) throw new RangeError('Ставка кредита должна быть неотрицательным числом');
  if (flows.length === 0) return { months: 0, firstMonth: null, total: 0, equivalentLoan: 0 };
  const first = flows[0]!.month;
  const r = loanRatePct / 100 / 12;
  let total = 0;
  let loan = 0;
  for (const f of flows) {
    total += f.amount;
    loan += f.amount / (1 + r) ** (f.month - first + 1);
  }
  return { months: flows.at(-1)!.month - first + 1, firstMonth: first, total, equivalentLoan: loan };
}
