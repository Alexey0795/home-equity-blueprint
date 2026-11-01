/** Параметры кредита для построения графика. */
export interface LoanParams {
  /** Сумма кредита (тело долга) в валюте сделки. */
  principal: number;
  /** Ставка, % годовых (например, 12 для 12%). */
  annualRatePct: number;
  /** Срок в месяцах, целое число >= 1. */
  termMonths: number;
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
}

/** Суммы за год кредита: год 1 = месяцы 1–12 и т. д. */
export interface YearTotals {
  year: number;
  payment: number;
  interest: number;
  principal: number;
  /** Остаток долга на конец года. */
  balance: number;
}

export interface PaymentSchedule {
  rows: ScheduleRow[];
  /** Регулярный ежемесячный платёж. */
  monthlyPayment: number;
  totalPaid: number;
  totalInterest: number;
  totalPrincipal: number;
}
