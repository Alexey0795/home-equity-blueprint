import {
  paymentPhases,
  prepaymentEffect,
  solveDeal,
  yearlyTotals,
  type DealInput,
  type PaymentPhase,
  type PaymentSchedule,
  type PrepaymentEffect,
  type Solution,
  type YearTotals,
} from '../domain';
import { findProduct, type AppState, type Scenario } from './appState';

export interface ScenarioResult {
  deal: Solution['deal'];
  /** График с досрочными взносами. */
  schedule: PaymentSchedule;
  /** График по договору, без досрочки. */
  baseline: PaymentSchedule;
  effect: PrepaymentEffect;
  phases: PaymentPhase[];
  years: YearTotals[];
}

/** Полный расчёт сценария: решатель + всё, что показывают итоги и графики. Сценарий «не сходится» → { error }. */
export function evaluateScenario(state: AppState, scenario: Scenario): ScenarioResult | { error: string } {
  const product = findProduct(state, scenario.productId);
  const input: DealInput = {
    price: scenario.price,
    downPayment: scenario.downPayment,
    termMonths: scenario.termMonths,
    targetPayment: scenario.targetPayment,
    prepayments: scenario.prepayments,
    rate: product
      ? { kind: 'product', product, refinancingRatePct: state.refinancingRatePct }
      : { kind: 'manual', annualRatePct: scenario.annualRatePct },
  };
  try {
    const { deal, schedule, baseline } = solveDeal(scenario.freeVariable, input);
    return {
      deal,
      schedule,
      baseline,
      effect: prepaymentEffect(baseline, schedule),
      phases: paymentPhases(schedule),
      years: yearlyTotals(schedule),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
