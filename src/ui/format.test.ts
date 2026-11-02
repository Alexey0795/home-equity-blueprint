import { describe, expect, it } from 'vitest';
import { formatTerm, toRoman } from './format';

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
