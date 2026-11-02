import { describe, expect, it } from 'vitest';
import { activeProfile, defaultState, newAccount, newPrepaymentPlan, type AppState, type Profile } from './appState';
import { evaluateScenario } from './evaluate';

const kopecks = (n: number) => Math.round(n * 100) / 100;

function setup(patch: (p: Profile) => void): { state: AppState; profile: Profile } {
  const state = defaultState();
  state.fxRates = { USD: 3.25, EUR: 3.5 };
  const profile = activeProfile(state);
  patch(profile);
  return { state, profile };
}

describe('evaluateScenario', () => {
  it('по умолчанию: 300 000 − 60 000 под 12% на 20 лет → 2 642,61 в месяц', () => {
    const { state, profile } = setup(() => {});
    const { result } = evaluateScenario(state, profile, profile.scenarios[0]!);
    if ('error' in result) throw new Error(result.error);
    expect(kopecks(result.schedule.monthlyPayment)).toBe(2_642.61);
  });

  it('взнос из сбережений: 10 000 BYN + 2 000 USD (×3,25) = 16 500, резерв 1 000 USD (3 250) → взнос 13 250', () => {
    const { state, profile } = setup((p) => {
      p.accounts = [
        { ...newAccount(), amount: 10_000 },
        { ...newAccount(), currency: 'USD', amount: 2_000 },
        { ...newAccount(), currency: 'EUR', amount: 1_000, useForDownPayment: false },
      ];
      p.savingsPlans[0]!.reserve = 1_000;
      p.savingsPlans[0]!.reserveCurrency = 'USD';
      p.scenarios[0]!.downPayment = { kind: 'savings', planId: p.savingsPlans[0]!.id };
    });
    const { inputs, result } = evaluateScenario(state, profile, profile.scenarios[0]!);
    expect(inputs.reserve).toBe(3_250);
    expect(inputs.downPayment).toBe(13_250);
    if ('error' in result) throw new Error(result.error);
    expect(result.deal.downPayment).toBe(13_250);
  });

  it('план досрочки в USD пересчитывается в валюту сделки (BYN); повторяющиеся разворачиваются', () => {
    const { state, profile } = setup((p) => {
      const plan = newPrepaymentPlan('План', 'USD');
      plan.recurring = [{ id: 'r', fromMonth: 12, toMonth: 36, everyMonths: 12, amount: 1_000, mode: 'reduceTerm' }];
      p.prepaymentPlans = [plan];
      p.scenarios[0]!.prepaymentPlanId = plan.id;
    });
    const { inputs, result } = evaluateScenario(state, profile, profile.scenarios[0]!);
    expect(inputs.prepayments.map((x) => [x.month, x.amount])).toEqual([[12, 3_250], [24, 3_250], [36, 3_250]]);
    if ('error' in result) throw new Error(result.error);
    expect(result.effect.interestSaved).toBeGreaterThan(0);
  });

  it('пустая сумма на счёте при взносе из сбережений → понятная ошибка, без исключения', () => {
    const { state, profile } = setup((p) => {
      p.accounts = [{ ...newAccount(), name: 'Копилка', amount: Number.NaN }];
      p.scenarios[0]!.downPayment = { kind: 'savings', planId: p.savingsPlans[0]!.id };
    });
    const { result } = evaluateScenario(state, profile, profile.scenarios[0]!);
    expect('error' in result && result.error).toContain('«Копилка»');
  });

  it('не сходится → { error } с причиной', () => {
    const { state, profile } = setup((p) => {
      p.scenarios[0]!.freeVariable = 'term';
      p.scenarios[0]!.targetPayment = 100;
    });
    const { result } = evaluateScenario(state, profile, profile.scenarios[0]!);
    expect('error' in result && result.error).toContain('Не сходится');
  });
});

describe('evaluateScenario с датой выдачи', () => {
  it('выдача 15.10.2027 на 20 лет: по годам — календарные годы 2027…2047, без даты — 1…20', () => {
    const { state, profile } = setup((p) => {
      p.scenarios[0]!.issueDate = '2027-10-15';
    });
    const withDate = evaluateScenario(state, profile, profile.scenarios[0]!);
    if ('error' in withDate.result) throw new Error(withDate.result.error);
    expect(withDate.inputs.issueDate).toEqual({ year: 2027, month: 10, day: 15 });
    const years = withDate.result.years.map((y) => y.year);
    expect(years[0]).toBe(2027);
    expect(years.at(-1)).toBe(2047);

    const plain = evaluateScenario(state, profile, { ...profile.scenarios[0]!, issueDate: null });
    if ('error' in plain.result) throw new Error(plain.result.error);
    expect(plain.result.years.map((y) => y.year)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

describe('тип графика в сценарии', () => {
  it('своя ставка: по умолчанию аннуитет; выбор сценария «дифференцированный» снижает переплату', () => {
    const { state, profile } = setup(() => {});
    const annuity = evaluateScenario(state, profile, profile.scenarios[0]!);
    const diff = evaluateScenario(state, profile, { ...profile.scenarios[0]!, repayment: 'differentiated' });
    expect(annuity.inputs.repayment).toBe('annuity');
    expect(diff.inputs.repayment).toBe('differentiated');
    if ('error' in annuity.result || 'error' in diff.result) throw new Error('не посчиталось');
    // 240 000 под 12% на 20 лет: дифференцированный — 240 000 × 1% × (240 + 1) / 2 = 289 200.
    expect(Math.round(diff.result.schedule.totalInterest)).toBe(289_200);
    expect(diff.result.schedule.totalInterest).toBeLessThan(annuity.result.schedule.totalInterest);
  });

  it('карточка банка задаёт график, если сценарий не выбрал свой', () => {
    const { state, profile } = setup(() => {});
    const express = state.products.find((p) => p.repayment === 'differentiated')!;
    const ev = evaluateScenario(state, profile, { ...profile.scenarios[0]!, productId: express.id });
    expect(ev.inputs.repayment).toBe('differentiated');
    const forced = evaluateScenario(state, profile, { ...profile.scenarios[0]!, productId: express.id, repayment: 'annuity' });
    expect(forced.inputs.repayment).toBe('annuity');
  });
});
