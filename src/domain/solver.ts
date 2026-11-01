import { buildSchedule } from './annuity';
import { productRateSteps, type CreditProduct } from './products';
import type { PaymentSchedule, RateStep } from './types';

/**
 * Режим «зафиксировать всё, кроме одного»: одна величина свободна, остальные заданы, свободная вычисляется.
 * - payment — ежемесячный платёж (обычный расчёт);
 * - downPayment — какой нужен первый взнос при желаемом платеже;
 * - price — квартиру какой цены можно взять;
 * - term — за какой срок (целых месяцев) платёж уложится в желаемый;
 * - rate — при какой ставке сделка сходится: ставка рефинансирования для карточки банка или ставка для ручного режима.
 *
 * «Желаемый платёж» сравнивается с МАКСИМАЛЬНЫМ платежом графика: у льготных программ платёж растёт,
 * и важно, потянешь ли самый большой.
 */
export const FREE_VARIABLES = ['payment', 'downPayment', 'price', 'term', 'rate'] as const;
export type FreeVariable = (typeof FREE_VARIABLES)[number];

export type RateSource =
  | { kind: 'manual'; annualRatePct: number }
  | { kind: 'product'; product: CreditProduct; refinancingRatePct: number };

export interface DealInput {
  price: number;
  downPayment: number;
  termMonths: number;
  rate: RateSource;
  /** Желаемый (максимальный) ежемесячный платёж — вход для всех режимов, кроме payment. */
  targetPayment: number;
}

export interface Solution {
  /** Входные данные, где свободная величина заменена вычисленной. */
  deal: DealInput;
  schedule: PaymentSchedule;
}

/** Самый большой платёж графика. */
export function maxPayment(schedule: PaymentSchedule): number {
  return schedule.rows.reduce((max, row) => Math.max(max, row.payment), 0);
}

function rateSteps(rate: RateSource): RateStep[] {
  return rate.kind === 'manual'
    ? [{ fromMonth: 1, annualRatePct: rate.annualRatePct }]
    : productRateSteps(rate.product, rate.refinancingRatePct);
}

/** График для сделки как есть, без решателя. */
export function scheduleForDeal(deal: DealInput, principal = Math.max(0, deal.price - deal.downPayment)): PaymentSchedule {
  return buildSchedule({
    principal,
    termMonths: deal.termMonths,
    rateSteps: rateSteps(deal.rate),
    interestOnlyMonths: deal.rate.kind === 'product' ? deal.rate.product.interestOnlyMonths : 0,
  });
}

const unsolvable = (why: string) => new RangeError(`Не сходится: ${why}`);

function requireTarget(target: number): void {
  if (!Number.isFinite(target) || target <= 0) throw new RangeError('Укажите желаемый платёж — положительное число');
}

/** Платёж пропорционален сумме кредита, поэтому нужный кредит = желаемый платёж / платёж на 1 единицу кредита. */
function loanForTarget(deal: DealInput): number {
  const perUnit = maxPayment(scheduleForDeal(deal, 1));
  return deal.targetPayment / perUnit;
}

function solveTerm(deal: DealInput): DealInput {
  const loan = Math.max(0, deal.price - deal.downPayment);
  const minTerm = (deal.rate.kind === 'product' ? deal.rate.product.interestOnlyMonths : 0) + 1;
  const maxTerm = 1200; // 100 лет — дальше смысла нет
  const paymentAt = (termMonths: number) => maxPayment(scheduleForDeal({ ...deal, termMonths }, loan));
  if (paymentAt(maxTerm) > deal.targetPayment) {
    throw unsolvable('даже за 100 лет платёж выше желаемого — желаемый платёж не покрывает проценты');
  }
  // Платёж убывает с ростом срока: ищем минимальный срок, при котором он не выше желаемого.
  let lo = minTerm;
  let hi = maxTerm;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (paymentAt(mid) <= deal.targetPayment) hi = mid;
    else lo = mid + 1;
  }
  return { ...deal, termMonths: lo };
}

function solveRate(deal: DealInput): DealInput {
  const { rate } = deal;
  if (rate.kind === 'product' && !rate.product.ratePeriods.some((p) => p.rate.kind === 'refinancing')) {
    throw unsolvable('в карточке банка нет ставок, зависящих от ставки рефинансирования — подбирать нечего');
  }
  const withRate = (value: number): DealInput => ({
    ...deal,
    rate: rate.kind === 'manual' ? { kind: 'manual', annualRatePct: value } : { ...rate, refinancingRatePct: value },
  });
  const paymentAt = (value: number) => maxPayment(scheduleForDeal(withRate(value)));
  const what = rate.kind === 'manual' ? 'ставке 0%' : 'ставке рефинансирования 0%';
  let lo = 0;
  let hi = 100;
  if (paymentAt(lo) > deal.targetPayment) throw unsolvable(`даже при ${what} платёж выше желаемого`);
  if (paymentAt(hi) < deal.targetPayment) throw unsolvable('желаемый платёж выше, чем при ставке 100%');
  // Платёж растёт со ставкой — делим отрезок пополам до точности ~1e-9 п.п.
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (paymentAt(mid) <= deal.targetPayment) lo = mid;
    else hi = mid;
  }
  return withRate(lo);
}

/** Вычисляет свободную величину. Бросает RangeError с понятным текстом, если сделка не сходится. */
export function solveDeal(free: FreeVariable, deal: DealInput): Solution {
  let solved: DealInput;
  switch (free) {
    case 'payment':
      solved = deal;
      break;
    case 'downPayment': {
      requireTarget(deal.targetPayment);
      const downPayment = deal.price - loanForTarget(deal);
      if (downPayment < 0) {
        throw unsolvable('желаемый платёж больше нужного даже без первого взноса — можно взять квартиру дороже или срок короче');
      }
      solved = { ...deal, downPayment };
      break;
    }
    case 'price':
      requireTarget(deal.targetPayment);
      solved = { ...deal, price: deal.downPayment + loanForTarget(deal) };
      break;
    case 'term':
      requireTarget(deal.targetPayment);
      solved = solveTerm(deal);
      break;
    case 'rate':
      requireTarget(deal.targetPayment);
      solved = solveRate(deal);
      break;
  }
  return { deal: solved, schedule: scheduleForDeal(solved) };
}
