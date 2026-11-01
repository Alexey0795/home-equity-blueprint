const money = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

/** 1 234 567,89 или, с валютой, 1 234 567,89 BYN. */
export const formatMoney = (n: number, currency?: string): string =>
  currency ? `${money.format(n)} ${currency}` : money.format(n);

/** Короткая запись для подписей осей: 1,2 млн, 300 тыс. */
export const formatCompact = (n: number): string => compact.format(n);
