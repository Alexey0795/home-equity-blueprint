import type { LoanParams, PaymentPhase, PaymentSchedule, RateStep, ScheduleRow, VariableLoanParams } from './types';

/** Месячная ставка как доля: 12% годовых -> 0.01. */
export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12;
}

function validatePrincipalAndTerm(principal: number, termMonths: number): void {
  if (!Number.isFinite(principal) || principal < 0) {
    throw new RangeError('Сумма кредита должна быть неотрицательным числом');
  }
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new RangeError('Срок должен быть целым числом месяцев >= 1');
  }
}

function validateRate(annualRatePct: number): void {
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0) {
    throw new RangeError('Ставка должна быть неотрицательным числом');
  }
}

/** Платёж, который погасит balance ровно за months месяцев при месячной ставке r. */
function levelPayment(balance: number, r: number, months: number): number {
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * Аннуитетный платёж: P = L * r / (1 - (1 + r)^-n).
 * При нулевой ставке — просто L / n.
 * Без округления: копейки как в выписке конкретного банка — не задача v1.
 */
export function annuityPayment({ principal, annualRatePct, termMonths }: LoanParams): number {
  validatePrincipalAndTerm(principal, termMonths);
  validateRate(annualRatePct);
  return levelPayment(principal, monthlyRate(annualRatePct), termMonths);
}

function validateSteps(steps: RateStep[]): void {
  if (steps.length === 0) throw new RangeError('Не задано ни одной ставки');
  if (steps[0]!.fromMonth !== 1) throw new RangeError('Первая ставка должна действовать с 1-го месяца');
  steps.forEach((step, i) => {
    validateRate(step.annualRatePct);
    if (!Number.isInteger(step.fromMonth) || step.fromMonth < 1) {
      throw new RangeError('Месяц начала ставки должен быть целым числом >= 1');
    }
    if (i > 0 && step.fromMonth <= steps[i - 1]!.fromMonth) {
      throw new RangeError('Периоды ставок должны идти по порядку, без повторов месяцев');
    }
  });
}

/** Ставка (% годовых), действующая в указанном месяце. */
export function rateForMonth(steps: RateStep[], month: number): number {
  let rate = steps[0]!.annualRatePct;
  for (const step of steps) {
    if (step.fromMonth <= month) rate = step.annualRatePct;
  }
  return rate;
}

/**
 * Аннуитетный график, в котором ставка меняется по периодам и первые месяцы могут быть «только проценты».
 * Когда меняется ставка или заканчивается период «только проценты», платёж пересчитывается
 * на остаток долга и оставшийся срок — так обычно делают банки.
 */
export function buildSchedule(params: VariableLoanParams): PaymentSchedule {
  const { principal, termMonths, rateSteps, interestOnlyMonths } = params;
  validatePrincipalAndTerm(principal, termMonths);
  validateSteps(rateSteps);
  if (!Number.isInteger(interestOnlyMonths) || interestOnlyMonths < 0 || interestOnlyMonths >= termMonths) {
    throw new RangeError('Период «только проценты» должен быть целым числом месяцев, меньше срока кредита');
  }

  const rows: ScheduleRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let payment = 0;
  let prevRate = Number.NaN;

  for (let month = 1; month <= termMonths; month++) {
    const annualRatePct = rateForMonth(rateSteps, month);
    const r = monthlyRate(annualRatePct);
    const interest = balance * r;
    const interestOnly = month <= interestOnlyMonths;
    const isLast = month === termMonths;

    let principalPart: number;
    if (interestOnly) {
      principalPart = 0;
    } else if (isLast) {
      // В последнем месяце гасим весь остаток, чтобы погрешность float не оставила «хвост» долга.
      principalPart = balance;
    } else {
      const amortizationStarts = month === interestOnlyMonths + 1;
      if (amortizationStarts || annualRatePct !== prevRate) {
        payment = levelPayment(balance, r, termMonths - month + 1);
      }
      principalPart = payment - interest;
    }
    prevRate = annualRatePct;

    balance = isLast ? 0 : balance - principalPart;
    totalInterest += interest;
    rows.push({
      month,
      payment: interest + principalPart,
      interest,
      principal: principalPart,
      balance,
      cumulativeInterest: totalInterest,
    });
  }

  return {
    rows,
    monthlyPayment: rows[0]!.payment,
    totalPaid: principal + totalInterest,
    totalInterest,
    totalPrincipal: principal,
  };
}

/** Помесячный аннуитетный график с одной ставкой на весь срок. */
export function buildAnnuitySchedule(params: LoanParams): PaymentSchedule {
  validateRate(params.annualRatePct);
  const schedule = buildSchedule({
    principal: params.principal,
    termMonths: params.termMonths,
    rateSteps: [{ fromMonth: 1, annualRatePct: params.annualRatePct }],
    interestOnlyMonths: 0,
  });
  return { ...schedule, monthlyPayment: annuityPayment(params) };
}

/** Делит график на отрезки с одинаковым платежом (погрешность float меньше 0,01 копейки не считается сменой). */
export function paymentPhases(schedule: PaymentSchedule): PaymentPhase[] {
  const phases: PaymentPhase[] = [];
  for (const row of schedule.rows) {
    const last = phases.at(-1);
    if (last && Math.abs(last.payment - row.payment) < 1e-4) {
      last.toMonth = row.month;
    } else {
      phases.push({ fromMonth: row.month, toMonth: row.month, payment: row.payment });
    }
  }
  return phases;
}
