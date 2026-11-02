import { describe, expect, it } from 'vitest';
import { defaultState } from './appState';
import { evaluateScenario } from './evaluate';

const kopecks = (n: number) => Math.round(n * 100) / 100;

describe('evaluateScenario', () => {
  it('сценарий по умолчанию: 240 000 под 12% на 20 лет → 2 642,61 в месяц', () => {
    const state = defaultState();
    const result = evaluateScenario(state, state.scenarios[0]!);
    if ('error' in result) throw new Error(result.error);
    expect(kopecks(result.schedule.monthlyPayment)).toBe(2_642.61);
  });

  it('не сходится → { error } с причиной, без исключения', () => {
    const state = defaultState();
    const scenario = { ...state.scenarios[0]!, freeVariable: 'term' as const, targetPayment: 100 };
    const result = evaluateScenario(state, scenario);
    expect('error' in result && result.error).toContain('Не сходится');
  });
});
