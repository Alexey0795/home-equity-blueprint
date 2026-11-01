import { describe, expect, it } from 'vitest';
import { formatTerm } from './format';

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
