const money = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

export const formatMoney = (n: number): string => money.format(n);

/** Короткая запись для подписей осей: 1,2 млн, 300 тыс. */
export const formatCompact = (n: number): string => compact.format(n);
