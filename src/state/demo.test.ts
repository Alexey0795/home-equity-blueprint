import { describe, expect, it } from 'vitest';
import { activeProfile, parseState, serializeState } from './appState';
import { demoState } from './demo';
import { evaluateProfile } from './evaluate';

describe('демо для гостя', () => {
  const state = demoState();
  const profile = activeProfile(state);
  const results = [...evaluateProfile(state, profile).values()].map((e) => e.result);

  it('все сценарии сходятся и все на графике сравнения', () => {
    for (const r of results) expect('error' in r ? r.error : 'ok').toBe('ok');
    expect(profile.comparedScenarioIds).toHaveLength(profile.scenarios.length);
  });

  it('показывает главное: простой дифференцированный переплачивает меньше «льготных», но самый большой платёж у него выше', () => {
    const ok = results.map((r) => (('error' in r) ? null : r)).filter((r) => r !== null);
    const [simple, onePct, promo] = ok as [NonNullable<(typeof ok)[0]>, NonNullable<(typeof ok)[0]>, NonNullable<(typeof ok)[0]>];
    const maxPay = (r: typeof simple) => Math.max(...r.baseline.rows.map((x) => x.payment));
    expect(simple.schedule.totalInterest).toBeLessThan(onePct.schedule.totalInterest);
    expect(simple.schedule.totalInterest).toBeLessThan(promo.schedule.totalInterest);
    expect(maxPay(simple)).toBeGreaterThan(maxPay(onePct));
  });

  it('переживает сохранение', () => {
    expect(parseState(serializeState(state))).toEqual(state);
  });
});
