import type { PaymentSchedule, YearTotals } from './types';

/** Сворачивает помесячный график в суммы по годам кредита. Последний год может быть неполным. */
export function yearlyTotals(schedule: PaymentSchedule): YearTotals[] {
  const years: YearTotals[] = [];
  for (const row of schedule.rows) {
    const year = Math.ceil(row.month / 12);
    let current = years[year - 1];
    if (!current) {
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
