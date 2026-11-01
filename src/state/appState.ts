/**
 * Состояние приложения — один JSON. Хранится в localStorage и выгружается в файл.
 * Формат сразу под список сценариев (этап 6), хотя на экране пока один активный.
 * При несовместимом изменении формата — поднять STATE_VERSION и дописать миграцию в parseState.
 */

export const STATE_VERSION = 1;

export interface Scenario {
  id: string;
  name: string;
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
}

export function newId(): string {
  return crypto.randomUUID();
}

export function defaultScenario(): Scenario {
  return {
    id: newId(),
    name: 'Основной сценарий',
    price: 300_000,
    downPayment: 60_000,
    annualRatePct: 12,
    termMonths: 240,
  };
}

export function defaultState(): AppState {
  const scenario = defaultScenario();
  return { version: STATE_VERSION, activeScenarioId: scenario.id, scenarios: [scenario] };
}

export function activeScenario(state: AppState): Scenario {
  return state.scenarios.find((s) => s.id === state.activeScenarioId) ?? state.scenarios[0]!;
}

export function serializeState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** Пустое поле ввода хранится как NaN, а в JSON становится null — читаем null обратно как NaN. */
function readNumber(raw: Record<string, unknown>, key: string, where: string): number {
  const value = raw[key];
  if (value === null) return Number.NaN;
  if (typeof value !== 'number') throw new RangeError(`${where}: поле «${key}» должно быть числом`);
  return value;
}

function parseScenario(raw: unknown, index: number): Scenario {
  const where = `Сценарий №${index + 1}`;
  if (typeof raw !== 'object' || raw === null) throw new RangeError(`${where}: ожидался объект`);
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') throw new RangeError(`${where}: нет поля «id»`);
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    price: readNumber(r, 'price', where),
    downPayment: readNumber(r, 'downPayment', where),
    annualRatePct: readNumber(r, 'annualRatePct', where),
    termMonths: readNumber(r, 'termMonths', where),
  };
}

/** Разбирает JSON из localStorage или из файла. Бросает RangeError с понятным текстом. */
export function parseState(json: string): AppState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new RangeError('Файл не похож на JSON');
  }
  if (typeof raw !== 'object' || raw === null) throw new RangeError('Ожидался объект с данными калькулятора');
  const r = raw as Record<string, unknown>;
  if (r.version !== STATE_VERSION) {
    throw new RangeError(`Неизвестная версия данных: ${String(r.version)} (ожидалась ${STATE_VERSION})`);
  }
  if (!Array.isArray(r.scenarios) || r.scenarios.length === 0) {
    throw new RangeError('В данных нет ни одного сценария');
  }
  const scenarios = r.scenarios.map(parseScenario);
  const ids = new Set(scenarios.map((s) => s.id));
  if (ids.size !== scenarios.length) throw new RangeError('У сценариев повторяются id');
  const activeScenarioId =
    typeof r.activeScenarioId === 'string' && ids.has(r.activeScenarioId) ? r.activeScenarioId : scenarios[0]!.id;
  return { version: STATE_VERSION, activeScenarioId, scenarios };
}
