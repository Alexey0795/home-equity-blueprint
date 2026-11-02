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

  it('показывает главное: у «льготных» самый большой платёж не меньше, чем у простого', () => {
    const maxPayments = results.map((r) => ('error' in r ? 0 : Math.max(...r.baseline.rows.map((x) => x.payment))));
    const [simple, onePct, promo] = maxPayments as [number, number, number];
    expect(onePct).toBeGreaterThan(simple * 0.95);
    expect(promo).toBeGreaterThan(simple);
  });

  it('переживает сохранение', () => {
    expect(parseState(serializeState(state))).toEqual(state);
  });
});
