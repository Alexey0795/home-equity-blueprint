/**
 * Состояние приложения — один JSON. Хранится в localStorage и выгружается в файл.
 * Формат сразу под список сценариев (этап 6), хотя на экране пока один активный.
 * Счета и курсы — общие для всех сценариев.
 * При несовместимом изменении формата — поднять STATE_VERSION и дописать миграцию в parseState.
 *
 * История версий:
 * 1 — сценарии (цена, взнос, ставка, срок).
 * 2 — счета, ручные курсы, валюта сделки в сценарии.
 * 3 — карточки банков, ставка рефинансирования, выбор карточки в сценарии.
 * 4 — режим «зафиксировать всё, кроме одного»: свободная величина и желаемый платёж в сценарии.
 * 5 — досрочные взносы в сценарии.
 * 6 — список сценариев для сравнения на одном графике.
 */

import {
  CURRENCIES,
  FREE_VARIABLES,
  type Account,
  type CreditProduct,
  type Currency,
  type FreeVariable,
  type FxRates,
  type PrepaymentPlan,
  type RatePeriod,
} from '../domain';
import { sampleProducts } from './sampleProducts';

export const STATE_VERSION = 6;

export interface Scenario {
  id: string;
  name: string;
  /** Валюта сделки: в ней цена, взнос и весь график. */
  currency: Currency;
  /** Цена объекта. */
  price: number;
  downPayment: number;
  /** Карточка банка; null — ставка вводится вручную (annualRatePct). */
  productId: string | null;
  /** % годовых — для ручного режима. */
  annualRatePct: number;
  termMonths: number;
  /** Какая величина вычисляется; остальные зафиксированы. */
  freeVariable: FreeVariable;
  /** Желаемый (максимальный) ежемесячный платёж — используется, когда свободен не платёж. */
  targetPayment: number;
  /** Досрочные взносы этого сценария. */
  prepayments: Prepayment[];
}

export interface Prepayment extends PrepaymentPlan {
  id: string;
}

export interface AppState {
  version: typeof STATE_VERSION;
  activeScenarioId: string;
  scenarios: Scenario[];
  accounts: Account[];
  fxRates: FxRates;
  products: CreditProduct[];
  /** Ставка рефинансирования Нацбанка, % годовых — общая для всех карточек «СР + надбавка». */
  refinancingRatePct: number;
  /** id сценариев, которые показываются на графике сравнения. */
  comparedScenarioIds: string[];
}

/** Ориентировочные курсы для первого запуска; пользователь вводит актуальные сам. */
export const DEFAULT_FX_RATES: FxRates = { USD: 3.0, EUR: 3.4 };

/** Ставка рефинансирования НБ РБ с 01.06.2026. */
export const DEFAULT_REFINANCING_RATE_PCT = 9.25;

export const DEFAULT_TARGET_PAYMENT = 3_000;

export function newId(): string {
  return crypto.randomUUID();
}

export function defaultScenario(): Scenario {
  return {
    id: newId(),
    name: 'Основной сценарий',
    currency: 'BYN',
    price: 300_000,
    downPayment: 60_000,
    productId: null,
    annualRatePct: 12,
    termMonths: 240,
    freeVariable: 'payment',
    targetPayment: DEFAULT_TARGET_PAYMENT,
    prepayments: [],
  };
}

export function newAccount(): Account {
  return { id: newId(), name: '', currency: 'BYN', amount: 0, useForDownPayment: true };
}

export function newPrepayment(month: number): Prepayment {
  return { id: newId(), month, amount: 10_000, mode: 'reduceTerm' };
}

export function newProduct(): CreditProduct {
  return {
    id: newId(),
    name: 'Новая карточка',
    ratePeriods: [{ fromMonth: 1, rate: { kind: 'refinancing', marginPct: 5 } }],
    interestOnlyMonths: 0,
    prepaymentBanMonths: 0,
    maxTermMonths: 240,
    minDownPct: 10,
    maxLoan: null,
    notes: '',
    source: '',
    checkedAt: new Date().toISOString().slice(0, 10),
    verified: false,
  };
}

export function defaultState(): AppState {
  const scenario = defaultScenario();
  return {
    version: STATE_VERSION,
    activeScenarioId: scenario.id,
    scenarios: [scenario],
    accounts: [],
    fxRates: { ...DEFAULT_FX_RATES },
    products: sampleProducts(newId),
    refinancingRatePct: DEFAULT_REFINANCING_RATE_PCT,
    comparedScenarioIds: [],
  };
}

/** Сколько сценариев можно показать на графике сравнения одновременно. */
export const MAX_COMPARED = 6;

/** Новый сценарий с настройками по умолчанию становится активным. */
export function addScenario(state: AppState): AppState {
  const scenario = { ...defaultScenario(), name: `Сценарий ${state.scenarios.length + 1}` };
  return { ...state, scenarios: [...state.scenarios, scenario], activeScenarioId: scenario.id };
}

/** Копия сценария (с новыми id у досрочных взносов) встаёт сразу после оригинала и становится активной. */
export function duplicateScenario(state: AppState, id: string): AppState {
  const index = state.scenarios.findIndex((s) => s.id === id);
  const source = state.scenarios[index];
  if (!source) return state;
  const copy: Scenario = {
    ...structuredClone(source),
    id: newId(),
    name: `${source.name} (копия)`,
    prepayments: source.prepayments.map((p) => ({ ...p, id: newId() })),
  };
  const scenarios = [...state.scenarios];
  scenarios.splice(index + 1, 0, copy);
  return { ...state, scenarios, activeScenarioId: copy.id };
}

/** Удаление сценария. Последний не удаляется. Если удалён активный — активным становится соседний. */
export function deleteScenario(state: AppState, id: string): AppState {
  if (state.scenarios.length <= 1) return state;
  const index = state.scenarios.findIndex((s) => s.id === id);
  if (index < 0) return state;
  const scenarios = state.scenarios.filter((s) => s.id !== id);
  const activeScenarioId =
    state.activeScenarioId === id ? scenarios[Math.min(index, scenarios.length - 1)]!.id : state.activeScenarioId;
  return {
    ...state,
    scenarios,
    activeScenarioId,
    comparedScenarioIds: state.comparedScenarioIds.filter((x) => x !== id),
  };
}

/** Включить или выключить сценарий на графике сравнения (не больше MAX_COMPARED). */
export function toggleCompared(state: AppState, id: string): AppState {
  const ids = state.comparedScenarioIds;
  if (ids.includes(id)) return { ...state, comparedScenarioIds: ids.filter((x) => x !== id) };
  if (ids.length >= MAX_COMPARED) return state;
  return { ...state, comparedScenarioIds: [...ids, id] };
}

export function findProduct(state: AppState, id: string | null): CreditProduct | undefined {
  return id === null ? undefined : state.products.find((p) => p.id === id);
}

export function activeScenario(state: AppState): Scenario {
  return state.scenarios.find((s) => s.id === state.activeScenarioId) ?? state.scenarios[0]!;
}

export function serializeState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

type Raw = Record<string, unknown>;

function asObject(raw: unknown, where: string): Raw {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new RangeError(`${where}: ожидался объект`);
  return raw as Raw;
}

/** Пустое поле ввода хранится как NaN, а в JSON становится null — читаем null обратно как NaN. */
function readNumber(raw: Raw, key: string, where: string): number {
  const value = raw[key];
  if (value === null) return Number.NaN;
  if (typeof value !== 'number') throw new RangeError(`${where}: поле «${key}» должно быть числом`);
  return value;
}

function readId(raw: Raw, where: string): string {
  if (typeof raw.id !== 'string' || raw.id === '') throw new RangeError(`${where}: нет поля «id»`);
  return raw.id;
}

function readCurrency(raw: Raw, where: string): Currency {
  const value = raw.currency;
  if (!CURRENCIES.includes(value as Currency)) {
    throw new RangeError(`${where}: неизвестная валюта «${String(value)}» (допустимы ${CURRENCIES.join(', ')})`);
  }
  return value as Currency;
}

function parseScenario(raw: unknown, index: number, version: number): Scenario {
  const where = `Сценарий №${index + 1}`;
  const r = asObject(raw, where);
  return {
    id: readId(r, where),
    name: typeof r.name === 'string' ? r.name : '',
    // В версии 1 валюты не было — всё считалось в BYN.
    currency: version >= 2 ? readCurrency(r, where) : 'BYN',
    price: readNumber(r, 'price', where),
    downPayment: readNumber(r, 'downPayment', where),
    productId: version >= 3 && typeof r.productId === 'string' ? r.productId : null,
    annualRatePct: readNumber(r, 'annualRatePct', where),
    termMonths: readNumber(r, 'termMonths', where),
    // До версии 4 решателя не было — платёж вычислялся, остальное было задано.
    freeVariable: version >= 4 ? readFreeVariable(r, where) : 'payment',
    targetPayment: version >= 4 ? readNumber(r, 'targetPayment', where) : DEFAULT_TARGET_PAYMENT,
    prepayments: version >= 5 ? readPrepayments(r, where) : [],
  };
}

function readPrepayments(raw: Raw, where: string): Prepayment[] {
  if (!Array.isArray(raw.prepayments)) throw new RangeError(`${where}: нет списка досрочных взносов («prepayments»)`);
  const items = raw.prepayments.map((item, i): Prepayment => {
    const w = `${where}, досрочный взнос №${i + 1}`;
    const r = asObject(item, w);
    if (r.mode !== 'reduceTerm' && r.mode !== 'reducePayment') throw new RangeError(`${w}: неизвестный режим «${String(r.mode)}»`);
    return { id: readId(r, w), month: readNumber(r, 'month', w), amount: readNumber(r, 'amount', w), mode: r.mode };
  });
  uniqueIds(items, 'досрочных взносов');
  return items;
}

function readFreeVariable(raw: Raw, where: string): FreeVariable {
  const value = raw.freeVariable;
  if (!FREE_VARIABLES.includes(value as FreeVariable)) {
    throw new RangeError(`${where}: неизвестная вычисляемая величина «${String(value)}»`);
  }
  return value as FreeVariable;
}

function parseAccount(raw: unknown, index: number): Account {
  const where = `Счёт №${index + 1}`;
  const r = asObject(raw, where);
  return {
    id: readId(r, where),
    name: typeof r.name === 'string' ? r.name : '',
    currency: readCurrency(r, where),
    amount: readNumber(r, 'amount', where),
    useForDownPayment: r.useForDownPayment !== false,
  };
}

function readString(raw: Raw, key: string): string {
  return typeof raw[key] === 'string' ? (raw[key] as string) : '';
}

function parseRatePeriod(raw: unknown, index: number, where: string): RatePeriod {
  const w = `${where}, период ставки №${index + 1}`;
  const r = asObject(raw, w);
  const rate = asObject(r.rate, w);
  const fromMonth = readNumber(r, 'fromMonth', w);
  if (rate.kind === 'fixed') return { fromMonth, rate: { kind: 'fixed', ratePct: readNumber(rate, 'ratePct', w) } };
  if (rate.kind === 'refinancing') {
    return { fromMonth, rate: { kind: 'refinancing', marginPct: readNumber(rate, 'marginPct', w) } };
  }
  throw new RangeError(`${w}: неизвестный тип ставки «${String(rate.kind)}»`);
}

function parseProduct(raw: unknown, index: number): CreditProduct {
  const where = `Карточка банка №${index + 1}`;
  const r = asObject(raw, where);
  if (!Array.isArray(r.ratePeriods)) throw new RangeError(`${where}: нет списка ставок («ratePeriods»)`);
  return {
    id: readId(r, where),
    name: readString(r, 'name'),
    ratePeriods: r.ratePeriods.map((p, i) => parseRatePeriod(p, i, where)),
    interestOnlyMonths: readNumber(r, 'interestOnlyMonths', where),
    prepaymentBanMonths: readNumber(r, 'prepaymentBanMonths', where),
    maxTermMonths: readNumber(r, 'maxTermMonths', where),
    minDownPct: readNumber(r, 'minDownPct', where),
    maxLoan: r.maxLoan === null || r.maxLoan === undefined ? null : readNumber(r, 'maxLoan', where),
    notes: readString(r, 'notes'),
    source: readString(r, 'source'),
    checkedAt: readString(r, 'checkedAt'),
    verified: r.verified === true,
  };
}

function uniqueIds(items: { id: string }[], what: string): Set<string> {
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) throw new RangeError(`У ${what} повторяются id`);
  return ids;
}

/** Разбирает JSON из localStorage или из файла, поднимая старые версии до текущей. Бросает RangeError с понятным текстом. */
export function parseState(json: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new RangeError('Файл не похож на JSON');
  }
  const r = asObject(parsed, 'Данные калькулятора');
  const version = r.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > STATE_VERSION) {
    throw new RangeError(`Неизвестная версия данных: ${String(version)} (поддерживаются 1–${STATE_VERSION})`);
  }
  if (!Array.isArray(r.scenarios) || r.scenarios.length === 0) {
    throw new RangeError('В данных нет ни одного сценария');
  }
  const scenarios = r.scenarios.map((s, i) => parseScenario(s, i, version));
  const scenarioIds = uniqueIds(scenarios, 'сценариев');

  let accounts: Account[] = [];
  let fxRates: FxRates = { ...DEFAULT_FX_RATES };
  if (version >= 2) {
    if (!Array.isArray(r.accounts)) throw new RangeError('Нет списка счетов («accounts»)');
    accounts = r.accounts.map(parseAccount);
    uniqueIds(accounts, 'счетов');
    const rates = asObject(r.fxRates, 'Курсы валют');
    fxRates = { USD: readNumber(rates, 'USD', 'Курсы валют'), EUR: readNumber(rates, 'EUR', 'Курсы валют') };
  }

  let products: CreditProduct[];
  let refinancingRatePct = DEFAULT_REFINANCING_RATE_PCT;
  if (version >= 3) {
    if (!Array.isArray(r.products)) throw new RangeError('Нет списка карточек банков («products»)');
    products = r.products.map(parseProduct);
    uniqueIds(products, 'карточек банков');
    refinancingRatePct = readNumber(r, 'refinancingRatePct', 'Данные калькулятора');
  } else {
    // До версии 3 карточек не было — даём стартовые примеры из исследования.
    products = sampleProducts(newId);
  }
  const productIds = new Set(products.map((p) => p.id));
  // Ссылка на удалённую карточку → ручной режим, а не ошибка.
  for (const scenario of scenarios) {
    if (scenario.productId !== null && !productIds.has(scenario.productId)) scenario.productId = null;
  }

  const activeScenarioId =
    typeof r.activeScenarioId === 'string' && scenarioIds.has(r.activeScenarioId) ? r.activeScenarioId : scenarios[0]!.id;
  // Несуществующие сценарии в сравнении просто отбрасываем.
  const comparedScenarioIds =
    version >= 6 && Array.isArray(r.comparedScenarioIds)
      ? r.comparedScenarioIds.filter((x): x is string => typeof x === 'string' && scenarioIds.has(x)).slice(0, MAX_COMPARED)
      : [];
  return {
    version: STATE_VERSION,
    activeScenarioId,
    scenarios,
    accounts,
    fxRates,
    products,
    refinancingRatePct,
    comparedScenarioIds,
  };
}
