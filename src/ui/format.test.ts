import { describe, expect, it } from 'vitest';
import { formatNumberInput, formatTerm, parseNumberInput, toRoman } from './format';

describe('formatTerm', () => {
  it('годы и месяцы по-русски', () => {
    expect(formatTerm(240)).toBe('20 лет');
    expect(formatTerm(241)).toBe('20 лет 1 мес.');
    expect(formatTerm(12)).toBe('1 год');
    expect(formatTerm(24)).toBe('2 года');
    expect(formatTerm(132)).toBe('11 лет');
    expect(formatTerm(252)).toBe('21 год');
    expect(formatTerm(5)).toBe('5 мес.');
  });
});

describe('toRoman', () => {
  it('номера сценариев', () => {
    expect([1, 2, 3, 4, 5, 9, 10, 14, 40, 1994].map(toRoman)).toEqual(['I', 'II', 'III', 'IV', 'V', 'IX', 'X', 'XIV', 'XL', 'MCMXCIV']);
  });
});

describe('ввод чисел с разрядами', () => {
  it('formatNumberInput', () => {
    expect(formatNumberInput(300_000)).toBe('300 000');
    expect(formatNumberInput(1_234_567.89)).toBe('1 234 567,89');
    expect(formatNumberInput(9.25)).toBe('9,25');
    expect(formatNumberInput(Number.NaN)).toBe('');
  });
  it('parseNumberInput понимает пробелы, запятую и точку', () => {
    expect(parseNumberInput('300 000')).toBe(300_000);
    expect(parseNumberInput('1 234,5')).toBe(1_234.5);
    expect(parseNumberInput('3.25')).toBe(3.25);
    expect(parseNumberInput('')).toBeNaN();
    expect(parseNumberInput('12abc')).toBeNaN();
    expect(parseNumberInput('-5')).toBe(-5);
  });
  it('туда-обратно без потерь', () => {
    for (const n of [0, 1, 15.4, 92_307.69, 1_000_000]) expect(parseNumberInput(formatNumberInput(n))).toBe(n);
  });
});
