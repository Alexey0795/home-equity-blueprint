import { describe, expect, it } from 'vitest';
import {
  activeProfile,
  activeScenario,
  addProfile,
  addScenario,
  changeApartmentCurrency,
  componentInUse,
  copyComponent,
  defaultState,
  deleteProfile,
  deleteScenario,
  duplicateScenario,
  MAX_COMPARED,
  newAccount,
  newPrepayment,
  newPrepaymentPlan,
  newRecurring,
  parseState,
  scenariosUsing,
  serializeState,
  toggleCompared,
  type AppState,
} from './appState';
import { newLoan, newLoanEvent } from './loans';

const roundTrip = (state: AppState) => parseState(serializeState(state));

describe('сохранение и загрузка (версия 7)', () => {
  it('состояние по умолчанию переживает сохранение', () => {
    const state = defaultState();
    expect(roundTrip(state)).toEqual(state);
  });

  it('профили, счета, компоненты и пустые поля (NaN) переживают сохранение', () => {
    let state = addProfile(defaultState(), 'Брат');
    const profile = activeProfile(state);
    profile.accounts.push({ ...newAccount(), name: 'Наличные', currency: 'USD', amount: 5_000 });
    const plan = { ...newPrepaymentPlan('Досрочка'), oneOff: [newPrepayment(12)], recurring: [newRecurring()] };
    profile.prepaymentPlans.push(plan);
    profile.scenarios[0]!.prepaymentPlanId = plan.id;
    profile.scenarios[0]!.downPayment = { kind: 'savings', planId: profile.savingsPlans[0]!.id };
    profile.apartments[0]!.price = Number.NaN;
    state = { ...state, fxRates: { USD: 3.25, EUR: Number.NaN } };
    const loaded = roundTrip(state);
    expect(loaded.profiles).toHaveLength(2);
    expect(activeProfile(loaded).name).toBe('Брат');
    expect(activeProfile(loaded).apartments[0]!.price).toBeNaN();
    expect(loaded.fxRates.EUR).toBeNaN();
    expect(activeProfile(loaded).prepaymentPlans[0]!.recurring).toHaveLength(1);
    expect(activeScenario(activeProfile(loaded)).downPayment.kind).toBe('savings');
  });

  it('битые ссылки не ломают загрузку', () => {
    const raw = JSON.parse(serializeState(defaultState()));
    const s = raw.profiles[0].scenarios[0];
    s.apartmentId = 'нет';
    s.productId = 'нет';
    s.prepaymentPlanId = 'нет';
    s.downPayment = { kind: 'savings', planId: 'нет' };
    const scenario = activeScenario(activeProfile(parseState(JSON.stringify(raw))));
    expect(scenario.apartmentId).toBe(raw.profiles[0].apartments[0].id);
    expect(scenario.productId).toBeNull();
    expect(scenario.prepaymentPlanId).toBeNull();
    expect(scenario.downPayment).toEqual({ kind: 'manual', amount: 0 });
  });

  it('понятные ошибки на испорченных данных', () => {
    expect(() => parseState('не json')).toThrow('Файл не похож на JSON');
    expect(() => parseState('{"version": 99}')).toThrow('Неизвестная версия');
    const raw = JSON.parse(serializeState(defaultState()));
    raw.profiles[0].apartments[0].currency = 'RUB';
    expect(() => parseState(JSON.stringify(raw))).toThrow('«RUB»');
  });
});

describe('миграция старых версий в профиль «Я»', () => {
  it('версия 1: сценарий → квартира + своя сумма взноса, валюта BYN, стартовые карточки', () => {
    const state = parseState(JSON.stringify({
      version: 1,
      activeScenarioId: 's1',
      scenarios: [{ id: 's1', name: 'Старый', price: 300_000, downPayment: 60_000, annualRatePct: 12, termMonths: 240 }],
    }));
    expect(state.version).toBe(11);
    const profile = activeProfile(state);
    expect(profile.name).toBe('Я');
    expect(profile.apartments).toEqual([expect.objectContaining({ currency: 'BYN', price: 300_000 })]);
    expect(activeScenario(profile)).toMatchObject({
      id: 's1', name: 'Старый', downPayment: { kind: 'manual', amount: 60_000 }, freeVariable: 'payment', prepaymentPlanId: null,
    });
    expect(state.products.length).toBeGreaterThan(0);
  });

  it('версия 6: одинаковые квартиры склеиваются, досрочка → план, счета и сравнение сохраняются', () => {
    const scenario = (id: string, price: number, prepayments: unknown[] = []) => ({
      id, name: id, currency: 'BYN', price, downPayment: 20_000, productId: null, annualRatePct: 12, termMonths: 240,
      freeVariable: 'payment', targetPayment: 3_000, prepayments,
    });
    const state = parseState(JSON.stringify({
      version: 6,
      activeScenarioId: 'b',
      scenarios: [
        scenario('a', 300_000),
        scenario('b', 300_000, [{ id: 'p', month: 12, amount: 30_000, mode: 'reduceTerm' }]),
        scenario('c', 250_000),
      ],
      accounts: [{ id: 'acc', name: 'Карта', currency: 'USD', amount: 100, useForDownPayment: true }],
      fxRates: { USD: 3.25, EUR: 3.5 },
      products: [],
      refinancingRatePct: 9.25,
      comparedScenarioIds: ['a', 'c'],
    }));
    const profile = activeProfile(state);
    expect(profile.apartments.map((a) => a.price)).toEqual([300_000, 250_000]);
    expect(profile.scenarios[0]!.apartmentId).toBe(profile.scenarios[1]!.apartmentId);
    expect(profile.prepaymentPlans).toHaveLength(1);
    expect(profile.prepaymentPlans[0]!.oneOff[0]).toMatchObject({ month: 12, amount: 30_000 });
    expect(profile.scenarios[1]!.prepaymentPlanId).toBe(profile.prepaymentPlans[0]!.id);
    expect(profile.accounts[0]!.name).toBe('Карта');
    expect(profile.activeScenarioId).toBe('b');
    expect(profile.comparedScenarioIds).toEqual(['a', 'c']);
    expect(state.fxRates.USD).toBe(3.25);
  });
});

describe('профили', () => {
  it('новый профиль становится активным; последний не удаляется', () => {
    let state = addProfile(defaultState(), 'Брат');
    expect(activeProfile(state).name).toBe('Брат');
    state = deleteProfile(state, state.activeProfileId);
    expect(state.profiles).toHaveLength(1);
    expect(deleteProfile(state, state.activeProfileId).profiles).toHaveLength(1);
  });
});

describe('сценарии', () => {
  it('добавление и копия: копия ссылается на те же компоненты и встаёт после оригинала', () => {
    let profile = activeProfile(defaultState());
    profile = addScenario(profile);
    const original = profile.scenarios[0]!;
    profile = duplicateScenario(profile, original.id);
    const copy = profile.scenarios[1]!;
    expect(copy.name).toBe(`${original.name} (копия)`);
    expect(copy.apartmentId).toBe(original.apartmentId);
    expect(profile.activeScenarioId).toBe(copy.id);
    expect(profile.scenarios).toHaveLength(3);
  });

  it('удаление: соседний становится активным, уходит из сравнения, последний не удаляется', () => {
    let profile = addScenario(addScenario(activeProfile(defaultState())));
    const [a, b, c] = profile.scenarios.map((s) => s.id) as [string, string, string];
    profile = toggleCompared({ ...profile, activeScenarioId: b }, b);
    profile = deleteScenario(profile, b);
    expect(profile.scenarios.map((s) => s.id)).toEqual([a, c]);
    expect(profile.activeScenarioId).toBe(c);
    expect(profile.comparedScenarioIds).toEqual([]);
    profile = deleteScenario(deleteScenario(profile, c), a);
    expect(profile.scenarios).toHaveLength(1);
  });

  it('сравнение: не больше MAX_COMPARED', () => {
    let profile = activeProfile(defaultState());
    for (let i = 0; i < MAX_COMPARED + 1; i++) profile = addScenario(profile);
    for (const s of profile.scenarios) profile = toggleCompared(profile, s.id);
    expect(profile.comparedScenarioIds).toHaveLength(MAX_COMPARED);
  });
});

describe('компоненты', () => {
  it('«используется в»: номера сценариев с компонентом; использованный нельзя удалить', () => {
    let profile = addScenario(addScenario(activeProfile(defaultState())));
    const plan = newPrepaymentPlan();
    profile = { ...profile, prepaymentPlans: [plan] };
    profile.scenarios[0]!.prepaymentPlanId = plan.id;
    profile.scenarios[2]!.prepaymentPlanId = plan.id;
    expect(scenariosUsing(profile, (s) => s.prepaymentPlanId === plan.id)).toEqual([1, 3]);
    expect(componentInUse(profile, 'prepaymentPlans', plan.id)).toBe(true);
    expect(componentInUse(profile, 'apartments', 'нет такой')).toBe(false);
  });

  it('копия компонента: новые id у него и у вложенных взносов', () => {
    const plan = { ...newPrepaymentPlan('План'), oneOff: [newPrepayment(12)], recurring: [newRecurring()] };
    const copy = copyComponent(plan);
    expect(copy.name).toBe('План (копия)');
    expect(copy.id).not.toBe(plan.id);
    expect(copy.oneOff[0]!.id).not.toBe(plan.oneOff[0]!.id);
    expect(copy.recurring[0]!.id).not.toBe(plan.recurring[0]!.id);
  });
});

describe('changeApartmentCurrency', () => {
  it('BYN → USD по курсу 3,25: цена, свой взнос и «платёж не больше» сценариев с этой квартирой', () => {
    let state = defaultState();
    state.fxRates = { USD: 3.25, EUR: 3.5 };
    const profile = activeProfile(state);
    profile.scenarios[0]!.targetPayment = 3_250;
    state = changeApartmentCurrency(state, profile.apartments[0]!.id, 'USD');
    const p = activeProfile(state);
    expect(p.apartments[0]).toMatchObject({ currency: 'USD', price: 92_307.69 });
    expect(p.scenarios[0]!.downPayment).toEqual({ kind: 'manual', amount: 18_461.54 });
    expect(p.scenarios[0]!.targetPayment).toBe(1_000);
  });
});

describe('версия 8: дата выдачи кредита', () => {
  it('данные v7 открываются без даты; дата переживает сохранение; битая дата → без даты', () => {
    const raw = JSON.parse(serializeState(defaultState()));
    raw.version = 7;
    delete raw.profiles[0].scenarios[0].issueDate;
    expect(activeScenario(activeProfile(parseState(JSON.stringify(raw)))).issueDate).toBeNull();

    const state = defaultState();
    activeProfile(state).scenarios[0]!.issueDate = '2027-01-31';
    expect(activeScenario(activeProfile(roundTrip(state))).issueDate).toBe('2027-01-31');

    raw.version = 8;
    raw.profiles[0].scenarios[0].issueDate = '2027-02-30';
    expect(activeScenario(activeProfile(parseState(JSON.stringify(raw)))).issueDate).toBeNull();
  });
});

describe('версия 9: реальные кредиты', () => {
  it('данные v8 открываются без кредитов; кредит с журналом переживает сохранение; битая дата события — понятная ошибка', () => {
    const raw = JSON.parse(serializeState(defaultState()));
    raw.version = 8;
    delete raw.profiles[0].loans;
    expect(activeProfile(parseState(JSON.stringify(raw))).loans).toEqual([]);

    const state = defaultState();
    const loan = newLoan('2027-01-15');
    loan.events = [newLoanEvent('payment', '2027-02-15', 3_000), newLoanEvent('prepayment', '2027-03-01', 20_000), newLoanEvent('rate', '2027-06-01')];
    activeProfile(state).loans = [loan];
    expect(activeProfile(roundTrip(state)).loans).toEqual([loan]);

    const bad = JSON.parse(serializeState(state));
    bad.profiles[0].loans[0].events[0].date = '2027-02-30';
    expect(() => parseState(JSON.stringify(bad))).toThrow('событие №1: Такой даты нет');
  });
});

describe('версия 10: тип графика', () => {
  it('v9: карточки из исследования получают график как в банке, свои — аннуитет; выбор в сценарии сохраняется', () => {
    const state = defaultState();
    const own = { ...state.products[0]!, id: 'own', name: 'Моя карточка' };
    state.products.push(own);
    const raw = JSON.parse(serializeState(state));
    raw.version = 9;
    for (const p of raw.products) delete p.repayment;
    for (const s of raw.profiles[0].scenarios) delete s.repayment;
    const loaded = parseState(JSON.stringify(raw));
    const byName = (n: string) => loaded.products.find((p) => p.name === n)!;
    expect(byName('Беларусбанк — «Ипотека Экспресс» (вторичка, самый простой)').repayment).toBe('differentiated');
    expect(byName('Моя карточка').repayment).toBe('annuity');
    expect(activeScenario(activeProfile(loaded)).repayment).toBeNull();

    activeScenario(activeProfile(state)).repayment = 'differentiated';
    expect(activeScenario(activeProfile(roundTrip(state))).repayment).toBe('differentiated');
  });
});

describe('версия 11: помощь родных', () => {
  it('данные v10 открываются с пустым планом помощи; транши и условия переживают сохранение; битый транш — понятная ошибка', () => {
    const raw = JSON.parse(serializeState(defaultState()));
    raw.version = 10;
    delete raw.profiles[0].help;
    const loaded = activeProfile(parseState(JSON.stringify(raw)));
    expect(loaded.help.tranches).toEqual([]);
    expect(loaded.help.mode).toBe('reduceTerm');

    const state = defaultState();
    const help = activeProfile(state).help;
    help.tranches = [{ id: 't1', month: 0, amount: 20_000 }, { id: 't2', month: 12, amount: 5_000 }];
    help.ratePct = 2.5;
    help.currency = 'USD';
    expect(activeProfile(roundTrip(state)).help).toEqual(help);

    const bad = JSON.parse(serializeState(state));
    bad.profiles[0].help.tranches[1].amount = 'много';
    expect(() => parseState(JSON.stringify(bad))).toThrow('транш №2');
  });
});
