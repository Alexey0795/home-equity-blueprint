import type { PrepaymentPlan, RecurringPrepayment } from './types';

/**
 * Разворачивает повторяющиеся взносы в список разовых и объединяет с разовыми.
 * Месяцы — fromMonth, fromMonth + everyMonths, … пока не больше toMonth.
 */
export function expandPrepayments(oneOff: PrepaymentPlan[], recurring: RecurringPrepayment[]): PrepaymentPlan[] {
  const result = [...oneOff];
  recurring.forEach((rule, i) => {
    const where = `Повторяющийся взнос №${i + 1}`;
    if (!Number.isInteger(rule.fromMonth) || rule.fromMonth < 1) throw new RangeError(`${where}: месяц начала — целое число >= 1`);
    if (!Number.isInteger(rule.toMonth) || rule.toMonth < rule.fromMonth) {
      throw new RangeError(`${where}: месяц окончания — целое число не раньше начала`);
    }
    if (!Number.isInteger(rule.everyMonths) || rule.everyMonths < 1) throw new RangeError(`${where}: периодичность — целое число месяцев >= 1`);
    for (let month = rule.fromMonth; month <= rule.toMonth; month += rule.everyMonths) {
      result.push({ month, amount: rule.amount, mode: rule.mode });
    }
  });
  return result.sort((a, b) => a.month - b.month);
}
