import { describe, expect, it } from 'vitest';
import {
  activeScenario,
  addScenario,
  deleteScenario,
  duplicateScenario,
  MAX_COMPARED,
  toggleCompared,
  DEFAULT_REFINANCING_RATE_PCT,
  DEFAULT_FX_RATES,
  defaultState,
  newAccount,
  newPrepayment,
  parseState,
  serializeState,
  type AppState,
} from './appState';

describe('serializeState / parseState', () => {
  it('карточки банков и ставка рефинансирования переживают сохранение', () => {
    const state = defaultState();
    state.products[0]!.maxLoan = 150_000;
    state.refinancingRatePct = 10;
    state.scenarios[0]!.productId = state.products[1]!.id;
    expect(parseState(serializeState(state))).toEqual(state);
  });

  it('ссылка на несуществующую карточку → ручная ставка', () => {
    const state = defaultState();
    state.scenarios[0]!.productId = 'удалена';
    expect(parseState(serializeState(state)).scenarios[0]!.productId).toBeNull();
  });

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

  it('сценарии сохраняются, валюта — BYN, счетов нет, курсы по умолчанию, ставка ручная', () => {
    const state = parseState(v1);
    expect(state.version).toBe(6);
    expect(state.scenarios[0]).toEqual({
      id: 's1', name: 'Старый', currency: 'BYN', price: 300_000, downPayment: 60_000,
      productId: null, annualRatePct: 12, termMonths: 240, freeVariable: 'payment', targetPayment: 3_000,
      prepayments: [],
    });
    expect(state.products.length).toBeGreaterThan(0);
    expect(state.refinancingRatePct).toBe(9.25);
    expect(state.accounts).toEqual([]);
    expect(state.fxRates).toEqual(DEFAULT_FX_RATES);
  });
});

describe('миграция с версии 2', () => {
  it('счета и курсы сохраняются, появляются примеры карточек и СР 9,25', () => {
    const v3 = JSON.parse(serializeState(defaultState()));
    const v2 = { ...v3, version: 2, accounts: [{ id: 'a', name: 'Карта', currency: 'USD', amount: 100, useForDownPayment: true }] };
    delete v2.products;
    delete v2.refinancingRatePct;
    v2.scenarios = v2.scenarios.map(({ productId: _, ...rest }: Record<string, unknown>) => rest);
    const state = parseState(JSON.stringify(v2));
    expect(state.accounts[0]!.name).toBe('Карта');
    expect(state.products.every((p) => !p.verified)).toBe(true);
    expect(state.refinancingRatePct).toBe(DEFAULT_REFINANCING_RATE_PCT);
    expect(state.scenarios[0]!.productId).toBeNull();
  });
});

describe('версия 4: режим «зафиксировать всё, кроме одного»', () => {
  it('свободная величина и желаемый платёж переживают сохранение', () => {
    const state = defaultState();
    state.scenarios[0]!.freeVariable = 'rate';
    state.scenarios[0]!.targetPayment = 2_500;
    expect(parseState(serializeState(state)).scenarios[0]).toMatchObject({ freeVariable: 'rate', targetPayment: 2_500 });
  });
  it('неизвестная свободная величина → понятная ошибка', () => {
    const raw = JSON.parse(serializeState(defaultState()));
    raw.scenarios[0].freeVariable = 'inflation';
    expect(() => parseState(JSON.stringify(raw))).toThrow('«inflation»');
  });
});

describe('версия 5: досрочные взносы', () => {
  it('переживают сохранение', () => {
    const state = defaultState();
    state.scenarios[0]!.prepayments = [{ ...newPrepayment(24), amount: 50_000, mode: 'reducePayment' }];
    expect(parseState(serializeState(state))).toEqual(state);
  });
  it('неизвестный режим → понятная ошибка', () => {
    const raw = JSON.parse(serializeState(defaultState()));
    raw.scenarios[0].prepayments = [{ id: 'x', month: 1, amount: 1, mode: 'magic' }];
    expect(() => parseState(JSON.stringify(raw))).toThrow('«magic»');
  });
});

describe('версия 6: несколько сценариев', () => {
  it('добавление: новый сценарий в конце и становится активным', () => {
    const state = addScenario(defaultState());
    expect(state.scenarios).toHaveLength(2);
    expect(state.activeScenarioId).toBe(state.scenarios[1]!.id);
    expect(state.scenarios[1]!.name).toBe('Сценарий 2');
  });

  it('копия: сразу после оригинала, свои id у сценария и досрочных взносов, правка копии не трогает оригинал', () => {
    let state = defaultState();
    state.scenarios[0]!.prepayments = [newPrepayment(12)];
    state = addScenario(state);
    const original = state.scenarios[0]!;
    state = duplicateScenario(state, original.id);
    const copy = state.scenarios[1]!;
    expect(copy.name).toBe(`${original.name} (копия)`);
    expect(copy.id).not.toBe(original.id);
    expect(copy.prepayments[0]!.id).not.toBe(original.prepayments[0]!.id);
    expect(state.activeScenarioId).toBe(copy.id);
    copy.prepayments[0]!.amount = 999;
    expect(original.prepayments[0]!.amount).toBe(10_000);
  });

  it('удаление: активным становится соседний, сценарий уходит из сравнения, последний не удаляется', () => {
    let state = addScenario(addScenario(defaultState()));
    const [a, b, c] = state.scenarios.map((s) => s.id) as [string, string, string];
    state = toggleCompared({ ...state, activeScenarioId: b }, b);
    state = deleteScenario(state, b);
    expect(state.scenarios.map((s) => s.id)).toEqual([a, c]);
    expect(state.activeScenarioId).toBe(c);
    expect(state.comparedScenarioIds).toEqual([]);
    state = deleteScenario(deleteScenario(state, c), a);
    expect(state.scenarios).toHaveLength(1);
  });

  it('сравнение: включить/выключить, не больше MAX_COMPARED', () => {
    let state = defaultState();
    for (let i = 0; i < MAX_COMPARED + 1; i++) state = addScenario(state);
    for (const s of state.scenarios) state = toggleCompared(state, s.id);
    expect(state.comparedScenarioIds).toHaveLength(MAX_COMPARED);
    const first = state.comparedScenarioIds[0]!;
    expect(toggleCompared(state, first).comparedScenarioIds).not.toContain(first);
  });

  it('сравнение переживает сохранение; несуществующие id отбрасываются', () => {
    let state = addScenario(defaultState());
    state = toggleCompared(state, state.scenarios[0]!.id);
    const raw = JSON.parse(serializeState(state));
    raw.comparedScenarioIds.push('удалён');
    expect(parseState(JSON.stringify(raw)).comparedScenarioIds).toEqual([state.scenarios[0]!.id]);
  });
});
