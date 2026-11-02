import {
  DEFAULT_FX_RATES,
  DEFAULT_REFINANCING_RATE_PCT,
  STATE_VERSION,
  newId,
  newSavingsPlan,
  type AppState,
  type Profile,
  type Scenario,
} from './appState';
import { SAMPLE, sampleProducts } from './sampleProducts';

/**
 * Демо для первого запуска и для гостя по ссылке: одна квартира, одни сбережения, три банка.
 * Показывает главное: «0,99%», «1%» и «12%» на глаз не сравнить — сравнивать надо горы переплаты и самый большой платёж.
 * Все суммы вымышленные; условия банков — из исследования (карточки sampleProducts).
 */
export function demoState(): AppState {
  const products = sampleProducts(newId);
  const byName = (name: string) => products.find((p) => p.name === name)!;
  const express = byName(SAMPLE.belarusbankExpress);
  const partners = byName(SAMPLE.belarusbankPartners);
  const sber = byName(SAMPLE.sber);
  const apartment = { id: newId(), name: 'Двушка в Минске (пример)', currency: 'BYN' as const, price: 250_000 };
  const allIn = newSavingsPlan('Все сбережения на взнос');
  const reserve = { ...newSavingsPlan('Резерв 5 000 USD на чёрный день'), reserve: 5_000, reserveCurrency: 'USD' as const };
  const gradual = {
    id: newId(),
    name: 'Раз в год по 3 000 USD',
    currency: 'USD' as const,
    oneOff: [],
    recurring: [{ id: newId(), fromMonth: 12, toMonth: 120, everyMonths: 12, amount: 3_000, mode: 'reduceTerm' as const }],
  };
  const scenario = (name: string, productId: string, patch: Partial<Scenario> = {}): Scenario => ({
    id: newId(),
    name,
    apartmentId: apartment.id,
    productId,
    annualRatePct: 12,
    termMonths: 240,
    downPayment: { kind: 'savings', planId: allIn.id },
    prepaymentPlanId: null,
    freeVariable: 'payment',
    targetPayment: 3_000,
    issueDate: '2027-01-15',
    repayment: null,
    ...patch,
  });
  const scenarios = [
    scenario('Простой: «Ипотека Экспресс»', express.id),
    scenario('«1%» на два года', partners.id),
    scenario('Промо 0,99%', sber.id),
    scenario('Простой + резерв и досрочка', express.id, {
      downPayment: { kind: 'savings', planId: reserve.id },
      prepaymentPlanId: gradual.id,
    }),
  ];
  const profile: Profile = {
    id: newId(),
    name: 'Гость (пример)',
    accounts: [
      { id: newId(), name: 'Карта (пример)', currency: 'BYN', amount: 25_000, useForDownPayment: true },
      { id: newId(), name: 'Наличные доллары (пример)', currency: 'USD', amount: 12_000, useForDownPayment: true },
    ],
    apartments: [apartment],
    savingsPlans: [allIn, reserve],
    prepaymentPlans: [gradual],
    scenarios,
    activeScenarioId: scenarios[0]!.id,
    comparedScenarioIds: scenarios.map((s) => s.id),
    loans: [],
  };
  return {
    version: STATE_VERSION,
    profiles: [profile],
    activeProfileId: profile.id,
    products,
    fxRates: { ...DEFAULT_FX_RATES },
    refinancingRatePct: DEFAULT_REFINANCING_RATE_PCT,
  };
}
