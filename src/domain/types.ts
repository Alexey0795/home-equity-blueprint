/** Параметры кредита для построения графика. */
export interface LoanParams {
  /** Сумма кредита (тело долга) в валюте сделки. */
  principal: number;
  /** Ставка, % годовых (например, 12 для 12%). */
  annualRatePct: number;
  /** Срок в месяцах, целое число >= 1. */
  termMonths: number;
}

/** Ставка, действующая с указанного месяца (включительно) до начала следующего периода. */
export interface RateStep {
  /** Номер месяца, с которого действует ставка; у первого шага — 1. */
  fromMonth: number;
  /** % годовых. */
  annualRatePct: number;
}

/** Кредит со ставкой по периодам и, возможно, периодом «только проценты». */
export interface VariableLoanParams {
  principal: number;
  termMonths: number;
  rateSteps: RateStep[];
  /** Первые N месяцев платятся только проценты, тело долга не гасится. 0 — нет такого периода. */
  interestOnlyMonths: number;
  /** Досрочные взносы; по умолчанию нет. */
  prepayments?: PrepaymentPlan[];
}

/**
 * Что делать после досрочного взноса:
 * - reduceTerm — платёж тот же, кредит закрывается раньше (переплата меньше сильнее);
 * - reducePayment — срок тот же, платёж становится меньше.
 */
export type PrepaymentMode = 'reduceTerm' | 'reducePayment';

/** Досрочный взнос: вносится в указанном месяце сверх обычного платежа и целиком идёт в тело долга. */
export interface PrepaymentPlan {
  month: number;
  amount: number;
  mode: PrepaymentMode;
}

/** Одна строка графика платежей. Месяцы нумеруются с 1, без календарных дат. */
export interface ScheduleRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  /** Остаток долга после этого платежа. */
  balance: number;
  /** Проценты, выплаченные с 1-го месяца по этот включительно («гора переплаты»). */
  cumulativeInterest: number;
  /** Досрочный взнос в этом месяце (сверх payment), 0 — не было. */
  prepayment: number;
}

/** Суммы за год кредита: год 1 = месяцы 1–12 и т. д. */
export interface YearTotals {
  year: number;
  payment: number;
  interest: number;
  principal: number;
  /** Досрочные взносы за год. */
  prepayment: number;
  /** Остаток долга на конец года. */
  balance: number;
}

export interface PaymentSchedule {
  rows: ScheduleRow[];
  /** Платёж первого месяца. Если ставка или режим меняются, дальше платёж другой — см. paymentPhases. */
  monthlyPayment: number;
  totalPaid: number;
  totalInterest: number;
  totalPrincipal: number;
}

/** Отрезок графика с одинаковым платежом: «месяцы 1–24 — 2 500». */
export interface PaymentPhase {
  fromMonth: number;
  toMonth: number;
  payment: number;
}
