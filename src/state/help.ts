import {
  bankScheduleWithHelp,
  convert,
  loanParamsForDeal,
  placementAlternatives,
  privateLoanRealValue,
  privateLoanRepayment,
  reinvestedSavings,
  rentWithoutSum,
  todayValue,
  type Currency,
  type FxRates,
  type PaymentSchedule,
  type PrivateLoanRepayment,
  type Tranche,
  type VariableLoanParams,
} from '../domain';
import type { HelpPlan } from './appState';
import type { ScenarioResult } from './evaluate';

/** Дополнительная сумма в сценарии; все суммы — в валюте сделки (пересчёт по ручным курсам). */
export interface HelpEvaluation {
  currency: Currency;
  loan: VariableLoanParams;
  tranches: Tranche[];
  totalHelp: number;
  /** График банка без суммы и с ней. */
  noHelp: PaymentSchedule;
  withHelp: PaymentSchedule;
  /** Возврат частного займа; null — сумму возвращать не нужно. */
  privateLoan: PrivateLoanRepayment | null;
  /** Дано и возвращено по займу — в сегодняшних деньгах при инфляции из плана; null — без займа. */
  real: { given: number; returned: number } | null;
  /** «Досрочка или вклад»: сумма наличными и на вкладе к месяцу compareMonth. */
  alternatives: ReturnType<typeof placementAlternatives>;
  /** Вариант «в ипотеку»: освободившиеся платежи (и аренда) на том же вкладе к месяцу compareMonth. */
  mortgage: { nominal: number; today: number };
  /** Дата сравнения — конец кредита без суммы. */
  compareMonth: number;
  /** Аренда, которой не будет: без суммы на взнос покупка откладывается на months. null — не задано. */
  rent: { months: number; rent: number } | null;
  /** Эквиваленты в валюте сделки. */
  equivalents: { name: string; price: number }[];
  /** Самая большая нагрузка в месяц: платёж банку + возврат займа. */
  maxOutflow: number;
  /** Что даёт каждый транш по порядку: насколько меньше процентов и короче кредит по сравнению с траншами до него. */
  perTranche: { month: number; amount: number; interestSaved: number; monthsSaved: number }[];
}

/** Разовые и повторяющиеся транши плана — одним списком по месяцам. */
export function planTranches(plan: HelpPlan): Tranche[] {
  const list: Tranche[] = plan.tranches.map((t) => ({ month: t.month, amount: t.amount }));
  plan.recurring.forEach((r, i) => {
    const where = `Повторяющийся транш №${i + 1}`;
    if (!Number.isInteger(r.everyMonths) || r.everyMonths < 1) throw new RangeError(`${where}: «каждые» — целое число месяцев >= 1`);
    if (!Number.isInteger(r.fromMonth) || r.fromMonth < 0 || !Number.isInteger(r.toMonth) || r.toMonth < r.fromMonth) {
      throw new RangeError(`${where}: месяцы «с» и «по» — целые, «по» не раньше «с»`);
    }
    for (let m = r.fromMonth; m <= r.toMonth; m += r.everyMonths) list.push({ month: m, amount: r.amount });
  });
  return list.filter((t) => Number.isFinite(t.amount) && t.amount > 0).sort((a, b) => a.month - b.month);
}

/** Дополнительная сумма в сценарии. null — траншей нет; { error } — что-то не посчитать (нет курса, платёж по займу мал). */
export function evaluateHelp(
  plan: HelpPlan,
  result: ScenarioResult,
  currency: Currency,
  fxRates: FxRates,
): HelpEvaluation | { error: string } | null {
  try {
    const active = planTranches(plan);
    if (active.length === 0) return null;
    const conv = (n: number) => convert(n, plan.currency, currency, fxRates);
    const tranches = active.map((t) => ({ month: t.month, amount: conv(t.amount) }));
    const loan = loanParamsForDeal(result.deal);
    const withHelp = bankScheduleWithHelp(loan, tranches, plan.mode);
    const privateLoan = plan.repay
      ? privateLoanRepayment({ tranches, ratePct: plan.ratePct, graceMonths: plan.graceMonths, monthlyPayment: conv(plan.monthlyPayment) })
      : null;
    const months = Math.max(withHelp.rows.length, privateLoan?.rows.length ?? 0);
    let maxOutflow = 0;
    for (let i = 0; i < months; i++) {
      maxOutflow = Math.max(maxOutflow, (withHelp.rows[i]?.payment ?? 0) + (privateLoan?.rows[i]?.payment ?? 0));
    }
    const compareMonth = result.schedule.rows.length;
    const atStart = tranches.filter((t) => t.month === 0).reduce((sum, t) => sum + t.amount, 0);
    const rent = rentWithoutSum(atStart, conv(plan.savingPerMonth), conv(plan.rentPerMonth));
    const mortgage = reinvestedSavings(result.schedule, withHelp, tranches, plan.depositRatePct, compareMonth,
      rent ? { months: rent.months, perMonth: conv(plan.rentPerMonth) } : null);
    let previous = result.schedule;
    const perTranche = tranches.map((t, i) => {
      const next = bankScheduleWithHelp(loan, tranches.slice(0, i + 1), plan.mode);
      const item = {
        month: t.month,
        amount: t.amount,
        interestSaved: previous.totalInterest - next.totalInterest,
        monthsSaved: previous.rows.length - next.rows.length,
      };
      previous = next;
      return item;
    });
    return {
      perTranche,
      currency,
      loan,
      tranches,
      totalHelp: tranches.reduce((sum, t) => sum + t.amount, 0),
      noHelp: result.schedule,
      withHelp,
      privateLoan,
      real: privateLoan ? privateLoanRealValue(privateLoan, tranches, plan.inflationPct) : null,
      alternatives: placementAlternatives(tranches, plan.depositRatePct, plan.inflationPct, compareMonth),
      mortgage: { nominal: mortgage, today: todayValue(mortgage, compareMonth, plan.inflationPct) },
      compareMonth,
      rent,
      equivalents: plan.equivalents
        .filter((e) => e.name.trim() !== '' && Number.isFinite(e.price) && e.price > 0)
        .map((e) => ({ name: e.name, price: conv(e.price) })),
      maxOutflow,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
