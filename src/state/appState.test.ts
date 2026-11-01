import { describe, expect, it } from 'vitest';
import { activeScenario, defaultState, parseState, serializeState, type AppState } from './appState';

describe('serializeState / parseState', () => {
  it('сохранение и загрузка дают то же состояние', () => {
    const state = defaultState();
    expect(parseState(serializeState(state))).toEqual(state);
  });

  it('пустое поле (NaN) переживает сохранение', () => {
    const state = defaultState();
    state.scenarios[0]!.price = Number.NaN;
    expect(parseState(serializeState(state)).scenarios[0]!.price).toBeNaN();
  });

  it('неизвестный activeScenarioId → первый сценарий', () => {
    const state: AppState = { ...defaultState(), activeScenarioId: 'нет такого' };
    const parsed = parseState(serializeState(state));
    expect(activeScenario(parsed).id).toBe(state.scenarios[0]!.id);
  });

  it('понятные ошибки на испорченных данных', () => {
    expect(() => parseState('не json')).toThrow('Файл не похож на JSON');
    expect(() => parseState('{"version": 99, "scenarios": []}')).toThrow('Неизвестная версия');
    expect(() => parseState('{"version": 1, "scenarios": []}')).toThrow('нет ни одного сценария');
    expect(() => parseState('{"version": 1, "scenarios": [{"id": "a", "price": "много"}]}')).toThrow('«price»');
  });
});
