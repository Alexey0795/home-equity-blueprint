import { buildSchedule } from './annuity';
import type { PaymentSchedule, PrepaymentMode, VariableLoanParams } from './types';

/**
 * Заём от родных на первый взнос и досрочные взносы.
 *
 * Деньги приходят траншами: месяц 0 — до сделки (идут в первый взнос), месяц k — после k-го платежа банку
 * (идут досрочным взносом). Возврат родным: первые graceMonths месяцев после выдачи ипотеки — бесплатная отсрочка
 * (ни платежей, ни процентов), потом каждый месяц monthlyPayment, проценты — ставка / 12 на остаток долга родным.
 */
export interface Tranche {
  /** 0 — в первый взнос (до сделки), k ≥ 1 — после k-го платежа банку. */
  month: number;
  amount: number;
}

export interface FamilyLoanTerms {
  tranches: Tranche[];
  /** % годовых; 0 — беспроцентный. */
  ratePct: number;
  /** Сколько месяцев от выдачи ипотеки ничего не платить родным (и проценты не идут). */
  graceMonths: number;
  /** Сколько возвращать в месяц после отсрочки. */
  monthlyPayment: number;
}

export interface FamilyRow {
  month: number;
  /** Сколько родные дали в этом месяце. */
  lent: number;
  interest: number;
  payment: number;
  /** Долг родным на конец месяца. */
  balance: number;
}

export interface FamilyRepayment {
  rows: FamilyRow[];
  totalLent: number;
  totalInterest: number;
  totalReturned: number;
  /** Месяц первого платежа родным; null — платить нечего. */
  firstPaymentMonth: number | null;
  /** Месяц последнего платежа родным; null — платить нечего. */
  lastPaymentMonth: number | null;
}

const MAX_MONTHS = 1200;
const PAID_OFF = 1e-6;

function validateTranches(tranches: Tranche[]): void {
  for (const t of tranches) {
    if (!Number.isInteger(t.month) || t.month < 0) throw new RangeError('Месяц транша должен быть целым числом >= 0');
    if (!Number.isFinite(t.amount) || t.amount < 0) throw new RangeError(`Транш в месяце ${t.month}: сумма — неотрицательное число`);
  }
}

/** График возврата займа родным. */
export function familyRepayment(terms: FamilyLoanTerms): FamilyRepayment {
  const { tranches, ratePct, graceMonths, monthlyPayment } = terms;
  validateTranches(tranches);
  if (!Number.isFinite(ratePct) || ratePct < 0) throw new RangeError('Ставка займа должна быть неотрицательным числом');
  if (!Number.isInteger(graceMonths) || graceMonths < 0) throw new RangeError('Отсрочка — целое число месяцев >= 0');
  const totalLent = tranches.reduce((s, t) => s + t.amount, 0);
  const empty = { rows: [], totalLent, totalInterest: 0, totalReturned: 0, firstPaymentMonth: null, lastPaymentMonth: null };
  if (totalLent <= PAID_OFF) return empty;
  if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) throw new RangeError('Укажите, сколько возвращать родным в месяц');
  const r = ratePct / 100 / 12;
  const lastTranche = Math.max(...tranches.map((t) => t.month));
  const lentIn = (m: number) => tranches.filter((t) => t.month === m).reduce((s, t) => s + t.amount, 0);

  const rows: FamilyRow[] = [];
  let balance = lentIn(0);
  let totalInterest = 0;
  let totalReturned = 0;
  let first: number | null = null;
  let last: number | null = null;
  for (let month = 1; month <= MAX_MONTHS; month++) {
    let interest = 0;
    let payment = 0;
    if (month > graceMonths && balance > PAID_OFF) {
      interest = balance * r;
      if (monthlyPayment <= interest + 1e-9) {
        throw new RangeError('Платёж родным не покрывает проценты по займу — долг не уменьшается');
      }
      payment = Math.min(monthlyPayment, balance + interest);
      balance += interest - payment;
      if (balance <= PAID_OFF) balance = 0;
      first ??= month;
      last = month;
    }
    const lent = lentIn(month);
    balance += lent;
    totalInterest += interest;
    totalReturned += payment;
    rows.push({ month, lent, interest, payment, balance });
    if (balance === 0 && month >= lastTranche) break;
  }
  if (balance > PAID_OFF) throw new RangeError('Заём родным не возвращается и за 100 лет — увеличьте платёж');
  return { rows, totalLent, totalInterest, totalReturned, firstPaymentMonth: first, lastPaymentMonth: last };
}

/** График банка, если транши помощи идут в первый взнос (месяц 0) и досрочными взносами (месяц k). */
export function bankScheduleWithHelp(loan: VariableLoanParams, tranches: Tranche[], mode: PrepaymentMode): PaymentSchedule {
  validateTranches(tranches);
  const atStart = tranches.filter((t) => t.month === 0).reduce((s, t) => s + t.amount, 0);
  const later = tranches.filter((t) => t.month > 0).map((t) => ({ month: t.month, amount: t.amount, mode }));
  return buildSchedule({
    ...loan,
    atIssue: atStart > 0 ? { amount: atStart, mode } : undefined,
    prepayments: [...(loan.prepayments ?? []), ...later],
  });
}

/**
 * Сколько стоят деньги месяца month в сегодняшних деньгах при инфляции inflationPct % в год:
 * сумма / (1 + инфляция)^(месяцев / 12).
 */
export function todayValue(amount: number, month: number, inflationPct: number): number {
  return amount / (1 + inflationPct / 100) ** (month / 12);
}

/** Для помогающих: сколько они дали и сколько им вернётся — в сегодняшних деньгах. */
export function familyRealValue(repayment: FamilyRepayment, tranches: Tranche[], inflationPct: number): { given: number; returned: number } {
  if (!Number.isFinite(inflationPct) || inflationPct <= -100) throw new RangeError('Инфляция должна быть числом больше −100%');
  const given = tranches.reduce((s, t) => s + todayValue(t.amount, t.month, inflationPct), 0);
  const returned = repayment.rows.reduce((s, row) => s + todayValue(row.payment, row.month, inflationPct), 0);
  return { given, returned };
}
