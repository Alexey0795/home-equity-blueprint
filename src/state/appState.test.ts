import { describe, expect, it } from 'vitest';
import {
  activeScenario,
  DEFAULT_FX_RATES,
  defaultState,
  newAccount,
  parseState,
  serializeState,
  type AppState,
} from './appState';

describe('serializeState / parseState', () => {
  it('сохранение и загрузка дают то же состояние (со счетами и курсами)', () => {
    const state = defaultState();
    state.accounts = [{ ...newAccount(), name: 'Наличные', currency: 'USD', amount: 5_000, useForDownPayment: false }];
    state.fxRates = { USD: 3.25, EUR: 3.5 };
    state.scenarios[0]!.currency = 'EUR';
    expect(parseState(serializeState(state))).toEqual(state);
  });

  it('пустое поле (NaN) переживает сохранение', () => {
    const state = defaultState();
    state.scenarios[0]!.price = Number.NaN;
    state.fxRates.USD = Number.NaN;
    const parsed = parseState(serializeState(state));
    expect(parsed.scenarios[0]!.price).toBeNaN();
    expect(parsed.fxRates.USD).toBeNaN();
  });

  it('неизвестный activeScenarioId → первый сценарий', () => {
    const state: AppState = { ...defaultState(), activeScenarioId: 'нет такого' };
    const parsed = parseState(serializeState(state));
    expect(activeScenario(parsed).id).toBe(state.scenarios[0]!.id);
  });

  it('понятные ошибки на испорченных данных', () => {
    expect(() => parseState('не json')).toThrow('Файл не похож на JSON');
    expect(() => parseState('{"version": 99, "scenarios": []}')).toThrow('Неизвестная версия');
    expect(() => parseState('{"version": 2, "scenarios": []}')).toThrow('нет ни одного сценария');
    expect(() => parseState('{"version": 1, "scenarios": [{"id": "a", "price": "много"}]}')).toThrow('«price»');
    const state = JSON.parse(serializeState(defaultState()));
    state.accounts = [{ id: 'x', name: 'Счёт', currency: 'RUB', amount: 1 }];
    expect(() => parseState(JSON.stringify(state))).toThrow('неизвестная валюта «RUB»');
  });
});

describe('миграция с версии 1', () => {
  const v1 = JSON.stringify({
    version: 1,
    activeScenarioId: 's1',
    scenarios: [{ id: 's1', name: 'Старый', price: 300_000, downPayment: 60_000, annualRatePct: 12, termMonths: 240 }],
  });

  it('сценарии сохраняются, валюта — BYN, счетов нет, курсы по умолчанию', () => {
    const state = parseState(v1);
    expect(state.version).toBe(2);
    expect(state.scenarios[0]).toEqual({
      id: 's1', name: 'Старый', currency: 'BYN', price: 300_000, downPayment: 60_000, annualRatePct: 12, termMonths: 240,
    });
    expect(state.accounts).toEqual([]);
    expect(state.fxRates).toEqual(DEFAULT_FX_RATES);
  });
});
