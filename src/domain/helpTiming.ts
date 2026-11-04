import { buildSchedule } from './annuity';
import type { PaymentSchedule, PrepaymentMode, VariableLoanParams } from './types';

/**
 * «Цена промедления»: сколько стоит каждый день, пока дополнительная сумма (помощь на взнос) не дошла до долга.
 *
 * Кредит берётся без этой суммы, а сама сумма вносится в долг после платежа № k (k = 0 — в день выдачи, то есть
 * это просто больший первый взнос). Режим — как у досрочного взноса:
 * - reducePayment — срок прежний, платёж меньше; при k = 0 это ровно «кредит на сумму меньше»;
 * - reduceTerm — платёж прежний, кредит закрывается раньше; при k = 0 — «кредит меньше, но платим как за больший».
 *
 * Почему эффект большой (сложный процент): каждый рубль, внесённый в долг, перестаёт приносить банку проценты, а при
 * «сократить срок» освободившаяся часть платежа гасит долг дальше — уменьшение долга растёт как вклад под ставку кредита
 * с ежемесячной капитализацией и «съедает» последние месяцы платежей.
 */
export interface HelpTimingInput {
  /** Кредит без помощи: сумма, срок, ставки, свои досрочные взносы. */
  loan: VariableLoanParams;
  /** Сумма помощи в валюте кредита. */
  amount: number;
  mode: PrepaymentMode;
}

export interface HelpOutcome {
  schedule: PaymentSchedule;
  totalInterest: number;
  /** Сколько месяцев платежей. */
  months: number;
}

function outcome(schedule: PaymentSchedule): HelpOutcome {
  return { schedule, totalInterest: schedule.totalInterest, months: schedule.rows.length };
}

function validate({ loan, amount }: HelpTimingInput): void {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Сумма помощи должна быть неотрицательным числом');
  if (!Number.isFinite(loan.principal) || loan.principal <= 0) throw new RangeError('Нет кредита — помогать нечему');
}

/** Помощь внесена в долг после платежа № k (0 — в день выдачи). Если кредит к этому времени закрыт — помощь не нужна. */
export function helpAfterPayment(input: HelpTimingInput, k: number): HelpOutcome {
  validate(input);
  const { loan, amount, mode } = input;
  if (!Number.isInteger(k) || k < 0) throw new RangeError('Номер платежа должен быть целым числом >= 0');
  if (k > 0) {
    return outcome(buildSchedule({ ...loan, prepayments: [...(loan.prepayments ?? []), { month: k, amount, mode }] }));
  }
  return outcome(buildSchedule({ ...loan, atIssue: { amount, mode } }));
}

/** Точка кривой: помощь пришла в день day от выдачи (ровно в день платежа № payment, сразу после него). */
export interface DelayPoint {
  payment: number;
  day: number;
  totalInterest: number;
  months: number;
}

/**
 * Кривая «переплата в зависимости от дня, когда пришла помощь»: точки в дни платежей 0…maxPayment.
 * dayOfPayment(k) — номер дня платежа k от выдачи (по календарю или 365/12 на месяц без дат).
 */
export function helpDelayCurve(
  input: HelpTimingInput,
  maxPayment: number,
  dayOfPayment: (k: number) => number,
): DelayPoint[] {
  const points: DelayPoint[] = [];
  for (let k = 0; k <= maxPayment; k++) {
    const { totalInterest, months } = helpAfterPayment(input, k);
    points.push({ payment: k, day: dayOfPayment(k), totalInterest, months });
  }
  return points;
}

/**
 * Переплата, если помощь придёт в день day от выдачи. Между датами платежей — пропорционально дням: банк начисляет
 * проценты на остаток каждый день, и пока помощь не дошла, лишние проценты набегают на неё равномерно.
 * Позже последней точки кривой — переплата последней точки.
 */
export function interestAtDay(curve: DelayPoint[], day: number): number {
  if (curve.length === 0) throw new RangeError('Пустая кривая');
  if (day <= curve[0]!.day) return curve[0]!.totalInterest;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!;
    const b = curve[i]!;
    if (day <= b.day) return a.totalInterest + ((day - a.day) / (b.day - a.day)) * (b.totalInterest - a.totalInterest);
  }
  return curve.at(-1)!.totalInterest;
}

/** Сколько стоит один день промедления около дня day (наклон кривой в этом периоде). */
export function costPerDay(curve: DelayPoint[], day: number): number {
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!;
    const b = curve[i]!;
    if (day < b.day || i === curve.length - 1) return (b.totalInterest - a.totalInterest) / (b.day - a.day);
  }
  return 0;
}
