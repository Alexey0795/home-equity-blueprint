import type { PrepaymentPlan, RateStep, Repayment } from './types';

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
  /** Тип графика в банке: аннуитет или дифференцированный. */
  repayment: Repayment;
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

/** Какое поле сделки нарушает условие банка — чтобы подсветить именно его. */
export type DealField = 'downPayment' | 'term' | 'loan' | 'prepayments';

export interface DealIssue {
  field: DealField;
  message: string;
}

/** Нарушения условий банка в сделке — пустой список, если всё в порядке. Не ошибки: посчитать можно, но банк так не даст. */
export function checkDealAgainstProduct(product: CreditProduct, deal: DealTerms): DealIssue[] {
  const issues: DealIssue[] = [];
  const minDown = (deal.price * product.minDownPct) / 100;
  if (deal.downPayment < minDown) {
    issues.push({ field: 'downPayment', message: `Первый взнос меньше минимума банка (${product.minDownPct}% от цены)` });
  }
  if (deal.termMonths > product.maxTermMonths) {
    issues.push({ field: 'term', message: `Срок больше максимального у банка (${product.maxTermMonths / 12} лет)` });
  }
  const loan = deal.price - deal.downPayment;
  if (product.maxLoan !== null && loan > product.maxLoan) {
    issues.push({ field: 'loan', message: 'Сумма кредита больше лимита банка' });
  }
  if (product.interestOnlyMonths >= deal.termMonths) {
    issues.push({ field: 'term', message: 'Срок короче периода «только проценты»' });
  }
  return issues;
}

/** Досрочные взносы, попавшие в период запрета досрочного погашения. Предупреждение, а не ошибка. */
export function prepaymentBanProblems(product: CreditProduct, prepayments: PrepaymentPlan[]): DealIssue[] {
  if (product.prepaymentBanMonths <= 0) return [];
  return prepayments
    .filter((p) => p.amount > 0 && p.month <= product.prepaymentBanMonths)
    .map((p) => ({
      field: 'prepayments' as const,
      message: `Досрочный взнос в ${p.month}-м мес. — банк запрещает досрочное погашение первые ${product.prepaymentBanMonths} мес.`,
    }));
}
