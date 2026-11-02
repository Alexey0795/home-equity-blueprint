import type { PaymentSchedule, YearTotals } from './types';

/**
 * Календарь платежей. Дата хранится строкой «ГГГГ-ММ-ДД» и считается без часовых поясов (только год, месяц, день),
 * чтобы 31 января не превратилось в 30-е из-за перевода времени.
 *
 * Правило: платёж N (N = 1, 2, …) — через N месяцев после даты выдачи, в тот же день месяца.
 * Если такого дня нет (31-е в апреле, 29–31 февраля), платёж — в последний день месяца.
 * Проценты при этом считаются как раньше (ставка / 12 за месяц) — даты только подписывают платежи.
 */
export interface CalendarDate {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** «2027-01-31» → {2027, 1, 31}. Некорректная дата → RangeError. */
export function parseIsoDate(text: string): CalendarDate {
  const m = ISO.exec(text);
  if (!m) throw new RangeError(`Дата должна быть в виде ГГГГ-ММ-ДД, а не «${text}»`);
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > daysInMonth(date.year, date.month)) {
    throw new RangeError(`Такой даты нет: «${text}»`);
  }
  return date;
}

export function toIsoDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Дата + N месяцев; день прижимается к концу месяца, если такого числа нет. */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** Дата платежа номер monthIndex (1 — первый платёж, через месяц после выдачи). */
export function paymentDate(issueDate: CalendarDate, monthIndex: number): CalendarDate {
  return addMonths(issueDate, monthIndex);
}

/** Номер платежа, который приходится на месяц указанной даты (для «досрочка в марте 2028»). Раньше первого платежа → 1. */
export function monthIndexFor(issueDate: CalendarDate, date: CalendarDate): number {
  const diff = (date.year - issueDate.year) * 12 + (date.month - issueDate.month);
  return Math.max(1, diff);
}

/** Суммы по календарным годам платежей: первый и последний годы обычно неполные. */
export function calendarYearTotals(schedule: PaymentSchedule, issueDate: CalendarDate): YearTotals[] {
  const years: YearTotals[] = [];
  for (const row of schedule.rows) {
    const year = paymentDate(issueDate, row.month).year;
    let current = years.at(-1);
    if (!current || current.year !== year) {
      current = { year, payment: 0, interest: 0, principal: 0, prepayment: 0, balance: 0 };
      years.push(current);
    }
    current.payment += row.payment;
    current.interest += row.interest;
    current.principal += row.principal;
    current.prepayment += row.prepayment;
    current.balance = row.balance;
  }
  return years;
}
