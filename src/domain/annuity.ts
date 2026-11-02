import type {
  LoanParams,
  PaymentPhase,
  PaymentSchedule,
  PrepaymentPlan,
  RateStep,
  ScheduleRow,
  VariableLoanParams,
} from './types';

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
export function levelPayment(balance: number, r: number, months: number): number {
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

function validatePrepayments(prepayments: PrepaymentPlan[]): void {
  for (const p of prepayments) {
    if (!Number.isInteger(p.month) || p.month < 1) {
      throw new RangeError('Месяц досрочного взноса должен быть целым числом >= 1');
    }
    if (!Number.isFinite(p.amount) || p.amount < 0) {
      throw new RangeError(`Досрочный взнос в месяце ${p.month}: сумма должна быть неотрицательным числом`);
    }
  }
}

/** Сколько месяцев нужно, чтобы погасить balance платежом payment при месячной ставке r (вверх до целого). */
export function monthsToRepay(balance: number, r: number, payment: number): number {
  if (r === 0) return Math.ceil(balance / payment - 1e-9);
  return Math.ceil(-Math.log(1 - (balance * r) / payment) / Math.log(1 + r) - 1e-9);
}

/** Остаток меньше этого (доли копейки из-за float) считаем погашенным. */
const PAID_OFF = 1e-6;

/**
 * График платежей: ставка меняется по периодам, первые месяцы могут быть «только проценты»,
 * в отдельные месяцы вносятся досрочные взносы. Тип графика — аннуитет (по умолчанию) или дифференцированный.
 *
 * Дифференцированный: доля основного долга = остаток / оставшиеся месяцы, считается при начале погашения
 * и после досрочки «уменьшить платёж»; смена ставки долю не меняет (меняются только проценты). После досрочки
 * «сократить срок» доля прежняя, последний месяц переносится ближе.
 *
 * Аннуитет: платёж пересчитывается на остаток долга и оставшийся срок, когда меняется ставка, заканчивается период
 * «только проценты» или был досрочный взнос с режимом «уменьшить платёж». После взноса «сократить срок»
 * платёж остаётся прежним, а плановый последний месяц переносится ближе — и дальнейшие пересчёты
 * (например, при смене ставки) идут уже на сокращённый срок.
 */
export function buildSchedule(params: VariableLoanParams): PaymentSchedule {
  const { principal, termMonths, rateSteps, interestOnlyMonths, prepayments = [], repayment = 'annuity' } = params;
  const differentiated = repayment === 'differentiated';
  validatePrincipalAndTerm(principal, termMonths);
  validateSteps(rateSteps);
  if (!Number.isInteger(interestOnlyMonths) || interestOnlyMonths < 0 || interestOnlyMonths >= termMonths) {
    throw new RangeError('Период «только проценты» должен быть целым числом месяцев, меньше срока кредита');
  }
  validatePrepayments(prepayments);

  const rows: ScheduleRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let payment = 0;
  /** Доля основного долга в месяц (дифференцированный график). */
  let part = 0;
  let prevRate = Number.NaN;
  /** Плановый последний месяц: сдвигается раньше после взносов «сократить срок». */
  let endMonth = termMonths;
  let recalc = false;

  for (let month = 1; month <= endMonth; month++) {
    const annualRatePct = rateForMonth(rateSteps, month);
    const r = monthlyRate(annualRatePct);
    const interest = balance * r;
    const interestOnly = month <= interestOnlyMonths;
    const isLast = month === endMonth;

    let principalPart: number;
    if (interestOnly) {
      principalPart = 0;
    } else if (isLast) {
      // В последнем месяце гасим весь остаток, чтобы погрешность float не оставила «хвост» долга.
      principalPart = balance;
    } else if (differentiated) {
      if (month === interestOnlyMonths + 1 || recalc) {
        part = balance / (endMonth - month + 1);
        recalc = false;
      }
      principalPart = Math.min(part, balance);
    } else {
      const amortizationStarts = month === interestOnlyMonths + 1;
      if (amortizationStarts || annualRatePct !== prevRate || recalc) {
        payment = levelPayment(balance, r, endMonth - month + 1);
        recalc = false;
      }
      // После «сократить срок» в предпоследний месяц платёж может оказаться больше остатка.
      principalPart = Math.min(payment - interest, balance);
    }
    prevRate = annualRatePct;
    balance -= principalPart;

    let prepayment = 0;
    for (const plan of prepayments) {
      if (plan.month !== month || balance <= PAID_OFF) continue;
      const amount = Math.min(plan.amount, balance);
      balance -= amount;
      prepayment += amount;
      if (balance <= PAID_OFF) break;
      if (plan.mode === 'reducePayment' || interestOnly) {
        // В период «только проценты» сокращать нечего — взнос уменьшит платёж, когда начнётся погашение.
        recalc = !interestOnly;
      } else {
        endMonth = Math.min(
          endMonth,
          month + (differentiated ? Math.ceil(balance / part - 1e-9) : monthsToRepay(balance, r, payment)),
        );
      }
    }

    if (balance <= PAID_OFF) balance = 0;
    totalInterest += interest;
    rows.push({
      month,
      payment: interest + principalPart,
      interest,
      principal: principalPart,
      balance,
      cumulativeInterest: totalInterest,
      prepayment,
    });
    if (balance === 0) break;
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

export interface PrepaymentEffect {
  /** Насколько меньше переплата по процентам. */
  interestSaved: number;
  /** На сколько месяцев раньше закрыт кредит. */
  monthsSaved: number;
}

/** Сравнение графика с досрочными взносами и без них. */
export function prepaymentEffect(without: PaymentSchedule, withPrepayments: PaymentSchedule): PrepaymentEffect {
  return {
    interestSaved: without.totalInterest - withPrepayments.totalInterest,
    monthsSaved: without.rows.length - withPrepayments.rows.length,
  };
}
