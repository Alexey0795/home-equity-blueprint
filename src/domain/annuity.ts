import type { LoanParams, PaymentSchedule, ScheduleRow } from './types';

/** Месячная ставка как доля: 12% годовых -> 0.01. */
export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12;
}

function validate({ principal, annualRatePct, termMonths }: LoanParams): void {
  if (!Number.isFinite(principal) || principal < 0) {
    throw new RangeError('Сумма кредита должна быть неотрицательным числом');
  }
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0) {
    throw new RangeError('Ставка должна быть неотрицательным числом');
  }
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new RangeError('Срок должен быть целым числом месяцев >= 1');
  }
}

/**
 * Аннуитетный платёж: P = L * r / (1 - (1 + r)^-n).
 * При нулевой ставке — просто L / n.
 * Без округления: копейки как в выписке конкретного банка — не задача v1.
 */
export function annuityPayment(params: LoanParams): number {
  validate(params);
  const { principal, annualRatePct, termMonths } = params;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

/** Помесячный аннуитетный график с итогами по процентам и телу долга. */
export function buildAnnuitySchedule(params: LoanParams): PaymentSchedule {
  const payment = annuityPayment(params);
  const r = monthlyRate(params.annualRatePct);
  const rows: ScheduleRow[] = [];
  let balance = params.principal;
  let totalInterest = 0;

  for (let month = 1; month <= params.termMonths; month++) {
    const interest = balance * r;
    const isLast = month === params.termMonths;
    // В последнем месяце гасим весь остаток, чтобы погрешность float не оставила «хвост» долга.
    const principalPart = isLast ? balance : payment - interest;
    balance = isLast ? 0 : balance - principalPart;
    totalInterest += interest;
    rows.push({
      month,
      payment: interest + principalPart,
      interest,
      principal: principalPart,
      balance,
    });
  }

  return {
    rows,
    monthlyPayment: payment,
    totalPaid: params.principal + totalInterest,
    totalInterest,
    totalPrincipal: params.principal,
  };
}
