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

/** Номер сценария римскими цифрами: 1 → I, 4 → IV, 14 → XIV. */
export function toRoman(n: number): string {
  const table: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let rest = Math.floor(n);
  let out = '';
  for (const [value, sign] of table) {
    while (rest >= value) {
      out += sign;
      rest -= value;
    }
  }
  return out;
}

const inputFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6, useGrouping: true });

/** Число для поля ввода: 300000 → «300 000», 9.25 → «9,25», NaN → пусто. */
export function formatNumberInput(n: number): string {
  // Intl ставит неразрывные пробелы — в поле ввода удобнее обычные.
  return Number.isFinite(n) ? inputFormat.format(n).replace(/[  ]/g, ' ') : '';
}

/** Разбор того, что ввёл человек: пробелы между разрядами, запятая или точка как дробный разделитель. Пусто → NaN. */
export function parseNumberInput(text: string): number {
  const cleaned = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-' || !/^-?\d*\.?\d*$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}
