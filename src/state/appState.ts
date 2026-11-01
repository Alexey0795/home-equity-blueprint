/**
 * Состояние приложения — один JSON. Хранится в localStorage и выгружается в файл.
 * Формат сразу под список сценариев (этап 6), хотя на экране пока один активный.
 * Счета и курсы — общие для всех сценариев.
 * При несовместимом изменении формата — поднять STATE_VERSION и дописать миграцию в parseState.
 *
 * История версий:
 * 1 — сценарии (цена, взнос, ставка, срок).
 * 2 — счета, ручные курсы, валюта сделки в сценарии.
 */

import { CURRENCIES, type Account, type Currency, type FxRates } from '../domain';

export const STATE_VERSION = 2;

export interface Scenario {
  id: string;
  name: string;
  /** Валюта сделки: в ней цена, взнос и весь график. */
  currency: Currency;
  /** Цена объекта. */
  price: number;
  downPayment: number;
  /** % годовых. */
  annualRatePct: number;
  termMonths: number;
}

export interface AppState {
  version: typeof STATE_VERSION;
  activeScenarioId: string;
  scenarios: Scenario[];
  accounts: Account[];
  fxRates: FxRates;
}

/** Ориентировочные курсы для первого запуска; пользователь вводит актуальные сам. */
export const DEFAULT_FX_RATES: FxRates = { USD: 3.0, EUR: 3.4 };

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
    annualRatePct: 12,
    termMonths: 240,
  };
}

export function newAccount(): Account {
  return { id: newId(), name: '', currency: 'BYN', amount: 0, useForDownPayment: true };
}

export function defaultState(): AppState {
  const scenario = defaultScenario();
  return {
    version: STATE_VERSION,
    activeScenarioId: scenario.id,
    scenarios: [scenario],
    accounts: [],
    fxRates: { ...DEFAULT_FX_RATES },
  };
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
    annualRatePct: readNumber(r, 'annualRatePct', where),
    termMonths: readNumber(r, 'termMonths', where),
  };
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
  if (version !== 1 && version !== 2) {
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

  const activeScenarioId =
    typeof r.activeScenarioId === 'string' && scenarioIds.has(r.activeScenarioId) ? r.activeScenarioId : scenarios[0]!.id;
  return { version: STATE_VERSION, activeScenarioId, scenarios, accounts, fxRates };
}
