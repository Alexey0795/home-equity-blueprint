import type { PrepaymentPlan, RateStep } from './types';

/** Как задана ставка в периоде: фиксированная или «ставка рефинансирования Нацбанка + надбавка». */
export type RateSpec =
  | { kind: 'fixed'; ratePct: number }
  | { kind: 'refinancing'; marginPct: number };

export interface RatePeriod {
  /** С какого месяца действует (у первого периода — 1). */
  fromMonth: number;
  rate: RateSpec;
}

/** Карточка условий банка. Заполняется руками по договору, сайту банка или исследованию. */
export interface CreditProduct {
  id: string;
  /** «Белинвестбанк — вторичное жильё». */
  name: string;
  ratePeriods: RatePeriod[];
  /** Первые N месяцев — только проценты. */
  interestOnlyMonths: number;
  /** Досрочное погашение запрещено первые N месяцев (учитывается с этапа 5). */
  prepaymentBanMonths: number;
  maxTermMonths: number;
  /** Минимальный первый взнос, % от цены. */
  minDownPct: number;
  /** Максимальная сумма кредита; null — банк лимит не указал. */
  maxLoan: number | null;
  /** Ограничения и оговорки текстом: «только новостройки партнёров», «без поручителей до 150 000». */
  notes: string;
  /** Откуда взяты условия (ссылка или «договор»). */
  source: string;
  /** Когда проверены, ГГГГ-ММ-ДД. */
  checkedAt: string;
  /** true — сверено с банком или договором; false — ориентир с агрегатора. */
  verified: boolean;
}

/** Ставка периода в % годовых при текущей ставке рефинансирования. */
export function resolveRate(rate: RateSpec, refinancingRatePct: number): number {
  if (rate.kind === 'fixed') return rate.ratePct;
  if (!Number.isFinite(refinancingRatePct)) {
    throw new RangeError('Не указана ставка рефинансирования Нацбанка');
  }
  return refinancingRatePct + rate.marginPct;
}

/** Периоды карточки → шаги ставки для графика. */
export function productRateSteps(product: CreditProduct, refinancingRatePct: number): RateStep[] {
  return product.ratePeriods.map((p) => ({
    fromMonth: p.fromMonth,
    annualRatePct: resolveRate(p.rate, refinancingRatePct),
  }));
}

export interface DealTerms {
  price: number;
  downPayment: number;
  termMonths: number;
}

/** Нарушения условий банка в сделке — пустой список, если всё в порядке. Не ошибки: посчитать можно, но банк так не даст. */
export function checkDealAgainstProduct(product: CreditProduct, deal: DealTerms): string[] {
  const problems: string[] = [];
  const minDown = (deal.price * product.minDownPct) / 100;
  if (deal.downPayment < minDown) {
    problems.push(`Первый взнос меньше минимума банка (${product.minDownPct}% от цены)`);
  }
  if (deal.termMonths > product.maxTermMonths) {
    problems.push(`Срок больше максимального у банка (${product.maxTermMonths / 12} лет)`);
  }
  const loan = deal.price - deal.downPayment;
  if (product.maxLoan !== null && loan > product.maxLoan) {
    problems.push('Сумма кредита больше лимита банка');
  }
  if (product.interestOnlyMonths >= deal.termMonths) {
    problems.push('Срок короче периода «только проценты»');
  }
  return problems;
}

/** Досрочные взносы, попавшие в период запрета досрочного погашения. Предупреждение, а не ошибка. */
export function prepaymentBanProblems(product: CreditProduct, prepayments: PrepaymentPlan[]): string[] {
  if (product.prepaymentBanMonths <= 0) return [];
  return prepayments
    .filter((p) => p.amount > 0 && p.month <= product.prepaymentBanMonths)
    .map((p) => `Досрочный взнос в ${p.month}-м мес. — банк запрещает досрочное погашение первые ${product.prepaymentBanMonths} мес.`);
}
