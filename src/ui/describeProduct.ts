import { resolveRate, type CreditProduct, type RateSpec } from '../domain';

const pct = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });

export const formatPct = (n: number): string => `${pct.format(n)}%`;

/** «СР 9,25% + 6,15 п.п. = 15,4%» или «14,9%». */
export function describeRate(rate: RateSpec, refinancingRatePct: number): string {
  if (rate.kind === 'fixed') return formatPct(rate.ratePct);
  const total = Number.isFinite(refinancingRatePct) ? ` = ${formatPct(resolveRate(rate, refinancingRatePct))}` : '';
  return `СР ${formatPct(refinancingRatePct)} + ${pct.format(rate.marginPct)} п.п.${total}`;
}

/** Строки для краткого описания карточки: ставки по периодам и особые условия. */
export function describeProduct(product: CreditProduct, refinancingRatePct: number): string[] {
  const periods = product.ratePeriods;
  const lines = periods.map((p, i) => {
    const next = periods[i + 1];
    const range = next ? `мес. ${p.fromMonth}–${next.fromMonth - 1}` : periods.length > 1 ? `с ${p.fromMonth}-го мес.` : 'весь срок';
    return `${describeRate(p.rate, refinancingRatePct)} — ${range}`;
  });
  if (product.repayment === 'differentiated') lines.push('Дифференцированный график: долг равными частями, платёж уменьшается');
  if (product.interestOnlyMonths > 0) lines.push(`Первые ${product.interestOnlyMonths} мес. — только проценты`);
  if (product.prepaymentBanMonths > 0) lines.push(`Досрочное погашение запрещено ${product.prepaymentBanMonths} мес.`);
  return lines;
}
