import type { Currency, FxRates } from './money';

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
 * Помесячные платежи в одной валюте (toTarget пересчитывает сумму периода — можно по курсу того месяца)
 * с первого месяца аренды по asOf включительно. Пересекающиеся периоды складываются.
 */
export function rentFlows(
  periods: RentPeriod[],
  asOf: string,
  toTarget: (amount: number, from: Currency, month: number) => number,
): RentFlow[] {
  const end = monthNumber(asOf);
  const byMonth = new Map<number, number>();
  periods.forEach((p, i) => {
    const where = `Период аренды №${i + 1}`;
    if (!Number.isFinite(p.amount) || p.amount < 0) throw new RangeError(`${where}: сумма — неотрицательное число`);
    const from = monthNumber(p.from);
    const to = Math.min(p.to === null ? end : monthNumber(p.to), end);
    if (p.to !== null && monthNumber(p.to) < from) throw new RangeError(`${where}: «по» раньше, чем «с»`);
    for (let m = from; m <= to; m++) byMonth.set(m, (byMonth.get(m) ?? 0) + toTarget(p.amount, p.currency, m));
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

/** Ставка кредита с месяца from («ГГГГ-ММ») до следующего периода. */
export interface RentRatePeriod {
  from: string;
  ratePct: number;
}

/** Ставка в месяце month: последний период, начавшийся не позже; раньше первого периода (или без периодов) — fallback. */
export function rateAt(periods: RentRatePeriod[], month: number, fallbackPct: number): number {
  let rate = fallbackPct;
  let start = -Infinity;
  for (const p of periods) {
    const m = monthNumber(p.from);
    if (m <= month && m >= start) {
      rate = p.ratePct;
      start = m;
    }
  }
  return rate;
}

/**
 * Эквивалентный кредит: сумма = Σ платёж_k / Π(1 + r_j/12), j — месяцы с первого по k-й, r_j — ставка месяца j.
 * Ставка — число или функция месяца (ставка по периодам). При постоянных ставке и платеже это формула аннуитета.
 */
export function rentSummary(flows: RentFlow[], rate: number | ((month: number) => number)): RentSummary {
  const rateOf = typeof rate === 'number' ? () => rate : rate;
  if (flows.length === 0) return { months: 0, firstMonth: null, total: 0, equivalentLoan: 0 };
  const first = flows[0]!.month;
  const last = flows.at(-1)!.month;
  const amounts = new Map(flows.map((f) => [f.month, f.amount]));
  let total = 0;
  let loan = 0;
  let discount = 1;
  for (let m = first; m <= last; m++) {
    const r = rateOf(m);
    if (!Number.isFinite(r) || r < 0) throw new RangeError(`Ставка кредита в ${monthText(m)} должна быть неотрицательным числом`);
    discount *= 1 + r / 100 / 12;
    const pay = amounts.get(m) ?? 0;
    total += pay;
    loan += pay / discount;
  }
  return { months: last - first + 1, firstMonth: first, total, equivalentLoan: loan };
}

/** Периоды ставки «ставка рефинансирования + надбавка» по истории изменений («ГГГГ-ММ-ДД» → месяц изменения). */
export function ratePeriodsFromHistory(history: { from: string; ratePct: number }[], marginPct: number): RentRatePeriod[] {
  if (!Number.isFinite(marginPct)) throw new RangeError('Надбавка должна быть числом');
  const byMonth = new Map<string, number>();
  for (const h of history) byMonth.set(h.from.slice(0, 7), h.ratePct + marginPct);
  return [...byMonth.entries()].map(([from, ratePct]) => ({ from, ratePct }));
}

/** Курсы на месяц month по истории (последняя точка не позже; раньше первой — первая). null — истории нет. */
export function fxAt(history: { month: string; usd: number; eur: number }[], month: number): FxRates | null {
  if (history.length === 0) return null;
  let found = history[0]!;
  for (const h of history) if (monthNumber(h.month) <= month) found = h;
  return { USD: found.usd, EUR: found.eur };
}
