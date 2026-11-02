import {
  calendarYearTotals,
  convert,
  downPaymentFromSavings,
  expandPrepayments,
  paymentPhases,
  prepaymentEffect,
  solveDeal,
  summarizeSavings,
  yearlyTotals,
  parseIsoDate,
  type CalendarDate,
  type CreditProduct,
  type Currency,
  type DealInput,
  type PaymentPhase,
  type PaymentSchedule,
  type PrepaymentEffect,
  type PrepaymentPlan,
  type Repayment,
  type SavingsSummary,
  type Solution,
  type YearTotals,
} from '../domain';
import {
  findApartment,
  findProduct,
  type Apartment,
  type AppState,
  type PrepaymentPlanComponent,
  type Profile,
  type Scenario,
  type SavingsPlan,
} from './appState';

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

/** Из каких компонентов собран сценарий и что из них получилось на входе решателя (всё — в валюте сделки). */
export interface ScenarioInputs {
  currency: Currency;
  apartment: Apartment;
  product: CreditProduct | undefined;
  savingsPlan: SavingsPlan | undefined;
  prepaymentPlan: PrepaymentPlanComponent | undefined;
  /** Итоги по счетам профиля в валюте сделки, или ошибка (не заполнена сумма, нет курса). */
  savings: SavingsSummary | { error: string };
  /** Резерв из распределения сбережений в валюте сделки (0 — если взнос задан своей суммой). */
  reserve: number;
  /** Первый взнос до решателя. */
  downPayment: number;
  /** Тип графика: свой у сценария, иначе как в карточке банка, иначе аннуитет. */
  repayment: Repayment;
  /** Дата выдачи кредита; undefined — без дат («месяц 1…n»). */
  issueDate: CalendarDate | undefined;
  prepayments: PrepaymentPlan[];
}

export interface ScenarioEvaluation {
  inputs: ScenarioInputs;
  result: ScenarioResult | { error: string };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Полный расчёт сценария: собрать входные данные из компонентов, решить, посчитать всё для итогов и графиков. */
export function evaluateScenario(state: AppState, profile: Profile, scenario: Scenario): ScenarioEvaluation {
  const apartment = findApartment(profile, scenario.apartmentId);
  const currency = apartment.currency;
  const product = findProduct(state, scenario.productId);
  const savingsPlan =
    scenario.downPayment.kind === 'savings'
      ? profile.savingsPlans.find((p) => p.id === (scenario.downPayment as { planId: string }).planId)
      : undefined;
  const prepaymentPlan = profile.prepaymentPlans.find((p) => p.id === scenario.prepaymentPlanId);

  let savings: ScenarioInputs['savings'];
  try {
    savings = summarizeSavings(profile.accounts, currency, state.fxRates);
  } catch (e) {
    savings = { error: message(e) };
  }

  const inputs: ScenarioInputs = {
    currency, apartment, product, savingsPlan, prepaymentPlan, savings, reserve: 0, downPayment: Number.NaN, prepayments: [],
    issueDate: scenario.issueDate ? parseIsoDate(scenario.issueDate) : undefined,
    repayment: scenario.repayment ?? product?.repayment ?? 'annuity',
  };

  try {
    if (scenario.downPayment.kind === 'manual') {
      inputs.downPayment = scenario.downPayment.amount;
    } else if (savingsPlan) {
      if ('error' in savings) throw new RangeError(`Первый взнос из сбережений не посчитать: ${savings.error}`);
      inputs.reserve = convert(savingsPlan.reserve, savingsPlan.reserveCurrency, currency, state.fxRates);
      inputs.downPayment = downPaymentFromSavings(savings.availableForDown, inputs.reserve);
    }
    if (prepaymentPlan) {
      inputs.prepayments = expandPrepayments(prepaymentPlan.oneOff, prepaymentPlan.recurring).map((p) => ({
        ...p,
        amount: convert(p.amount, prepaymentPlan.currency, currency, state.fxRates),
      }));
    }
  } catch (e) {
    return { inputs, result: { error: message(e) } };
  }

  const dealInput: DealInput = {
    price: apartment.price,
    downPayment: inputs.downPayment,
    termMonths: scenario.termMonths,
    targetPayment: scenario.targetPayment,
    prepayments: inputs.prepayments,
    repayment: inputs.repayment,
    rate: product
      ? { kind: 'product', product, refinancingRatePct: state.refinancingRatePct }
      : { kind: 'manual', annualRatePct: scenario.annualRatePct },
  };
  try {
    const { deal, schedule, baseline } = solveDeal(scenario.freeVariable, dealInput);
    return {
      inputs,
      result: {
        deal,
        schedule,
        baseline,
        effect: prepaymentEffect(baseline, schedule),
        phases: paymentPhases(schedule),
        // С датой — суммы по календарным годам («сколько уйдёт в 2027-м»), без даты — по годам кредита.
        years: inputs.issueDate ? calendarYearTotals(schedule, inputs.issueDate) : yearlyTotals(schedule),
      },
    };
  } catch (e) {
    return { inputs, result: { error: message(e) } };
  }
}

/** Расчёт всех сценариев профиля — для вкладок, сравнения и активного сценария. */
export function evaluateProfile(state: AppState, profile: Profile): Map<string, ScenarioEvaluation> {
  return new Map(profile.scenarios.map((s) => [s.id, evaluateScenario(state, profile, s)]));
}
