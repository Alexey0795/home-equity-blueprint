import {
  bankScheduleWithHelp,
  convert,
  familyRealValue,
  familyRepayment,
  loanParamsForDeal,
  type Currency,
  type FamilyRepayment,
  type FxRates,
  type PaymentSchedule,
  type Tranche,
  type VariableLoanParams,
} from '../domain';
import type { HelpPlan } from './appState';
import type { ScenarioResult } from './evaluate';

/** Помощь родных, применённая к сценарию; все суммы — в валюте сделки (пересчёт по ручным курсам). */
export interface HelpEvaluation {
  currency: Currency;
  loan: VariableLoanParams;
  tranches: Tranche[];
  totalHelp: number;
  noHelp: PaymentSchedule;
  withHelp: PaymentSchedule;
  family: FamilyRepayment;
  /** Для помогающих — в сегодняшних деньгах при инфляции из плана. */
  real: { given: number; returned: number };
  /** Эквиваленты в валюте сделки. */
  equivalents: { name: string; price: number }[];
  /** Самая большая общая нагрузка в месяц: платёж банку + платёж родным. */
  maxOutflow: number;
}

/** Помощь в сценарии. null — траншей нет; { error } — что-то не посчитать (нет курса, платёж родным мал). */
export function evaluateHelp(
  plan: HelpPlan,
  result: ScenarioResult,
  currency: Currency,
  fxRates: FxRates,
): HelpEvaluation | { error: string } | null {
  const active = plan.tranches.filter((t) => Number.isFinite(t.amount) && t.amount > 0);
  if (active.length === 0) return null;
  try {
    const conv = (n: number) => convert(n, plan.currency, currency, fxRates);
    const tranches = active.map((t) => ({ month: t.month, amount: conv(t.amount) }));
    const loan = loanParamsForDeal(result.deal);
    const withHelp = bankScheduleWithHelp(loan, tranches, plan.mode);
    const family = familyRepayment({
      tranches,
      ratePct: plan.ratePct,
      graceMonths: plan.graceMonths,
      monthlyPayment: conv(plan.monthlyPayment),
    });
    const months = Math.max(withHelp.rows.length, family.rows.length);
    let maxOutflow = 0;
    for (let i = 0; i < months; i++) {
      maxOutflow = Math.max(maxOutflow, (withHelp.rows[i]?.payment ?? 0) + (family.rows[i]?.payment ?? 0));
    }
    return {
      currency,
      loan,
      tranches,
      totalHelp: family.totalLent,
      noHelp: result.schedule,
      withHelp,
      family,
      real: familyRealValue(family, tranches, plan.inflationPct),
      equivalents: plan.equivalents
        .filter((e) => e.name.trim() !== '' && Number.isFinite(e.price) && e.price > 0)
        .map((e) => ({ name: e.name, price: conv(e.price) })),
      maxOutflow,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
