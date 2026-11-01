const money = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

/** 1 234 567,89 или, с валютой, 1 234 567,89 BYN. */
export const formatMoney = (n: number, currency?: string): string =>
  currency ? `${money.format(n)} ${currency}` : money.format(n);

/** Короткая запись для подписей осей: 1,2 млн, 300 тыс. */
export const formatCompact = (n: number): string => compact.format(n);

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** 241 → «20 лет 1 мес.», 24 → «2 года», 5 → «5 мес.». */
export function formatTerm(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${plural(years, 'год', 'года', 'лет')}`);
  if (rest > 0 || years === 0) parts.push(`${rest} мес.`);
  return parts.join(' ');
}
