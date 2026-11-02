/**
 * Разбор старых форматов данных (версии 1–6, до профилей и компонентов) в «плоскую» форму версии 6.
 * Дальше appState.ts переносит её в профиль (версия 7). Этот файл не меняется — только читает старые сохранения.
 *
 * История версий:
 * 1 — сценарии (цена, взнос, ставка, срок).
 * 2 — счета, ручные курсы, валюта сделки в сценарии.
 * 3 — карточки банков, ставка рефинансирования, выбор карточки в сценарии.
 * 4 — режим «зафиксировать всё, кроме одного»: свободная величина и желаемый платёж в сценарии.
 * 5 — досрочные взносы в сценарии.
 * 6 — список сценариев для сравнения на одном графике.
 */

import type { Account, CreditProduct, Currency, FreeVariable, FxRates, PrepaymentPlan } from '../domain';
import { asObject, readCurrency, readFreeVariable, readId, readMode, readNumber, uniqueIds, type Raw } from './parse';
import { parseAccount, parseProduct } from './parseShared';

export const LEGACY_VERSION = 6;

/** Значение по умолчанию для версий до 4 (задаётся в parseLegacy). */
let targetPaymentDefault = 0;


export interface LegacyScenario {
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
  prepayments: LegacyPrepayment[];
}

export interface LegacyPrepayment extends PrepaymentPlan {
  id: string;
}

export interface LegacyState {
  activeScenarioId: string;
  scenarios: LegacyScenario[];
  accounts: Account[];
  fxRates: FxRates;
  products: CreditProduct[];
  /** Ставка рефинансирования Нацбанка, % годовых — общая для всех карточек «СР + надбавка». */
  refinancingRatePct: number;
  /** id сценариев, которые показываются на графике сравнения. */
  comparedScenarioIds: string[];
}






function parseScenario(raw: unknown, index: number, version: number): LegacyScenario {
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
    targetPayment: version >= 4 ? readNumber(r, 'targetPayment', where) : targetPaymentDefault,
    prepayments: version >= 5 ? readPrepayments(r, where) : [],
  };
}

function readPrepayments(raw: Raw, where: string): LegacyPrepayment[] {
  if (!Array.isArray(raw.prepayments)) throw new RangeError(`${where}: нет списка досрочных взносов («prepayments»)`);
  const items = raw.prepayments.map((item, i): LegacyPrepayment => {
    const w = `${where}, досрочный взнос №${i + 1}`;
    const r = asObject(item, w);
    return { id: readId(r, w), month: readNumber(r, 'month', w), amount: readNumber(r, 'amount', w), mode: readMode(r, w) };
  });
  uniqueIds(items, 'досрочных взносов');
  return items;
}







export interface LegacyDefaults {
  fxRates: FxRates;
  refinancingRatePct: number;
  targetPayment: number;
  maxCompared: number;
  sampleProducts: () => CreditProduct[];
}

/** Разбирает данные версий 1–6. Бросает RangeError с понятным текстом. */
export function parseLegacy(r: Raw, version: number, defaults: LegacyDefaults): LegacyState {
  if (!Array.isArray(r.scenarios) || r.scenarios.length === 0) {
    throw new RangeError('В данных нет ни одного сценария');
  }
  targetPaymentDefault = defaults.targetPayment;
  const scenarios = r.scenarios.map((s, i) => parseScenario(s, i, version));
  const scenarioIds = uniqueIds(scenarios, 'сценариев');

  let accounts: Account[] = [];
  let fxRates: FxRates = { ...defaults.fxRates };
  if (version >= 2) {
    if (!Array.isArray(r.accounts)) throw new RangeError('Нет списка счетов («accounts»)');
    accounts = r.accounts.map(parseAccount);
    uniqueIds(accounts, 'счетов');
    const rates = asObject(r.fxRates, 'Курсы валют');
    fxRates = { USD: readNumber(rates, 'USD', 'Курсы валют'), EUR: readNumber(rates, 'EUR', 'Курсы валют') };
  }

  let products: CreditProduct[];
  let refinancingRatePct = defaults.refinancingRatePct;
  if (version >= 3) {
    if (!Array.isArray(r.products)) throw new RangeError('Нет списка карточек банков («products»)');
    products = r.products.map(parseProduct);
    uniqueIds(products, 'карточек банков');
    refinancingRatePct = readNumber(r, 'refinancingRatePct', 'Данные калькулятора');
  } else {
    // До версии 3 карточек не было — даём стартовые примеры из исследования.
    products = defaults.sampleProducts();
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
      ? r.comparedScenarioIds.filter((x): x is string => typeof x === 'string' && scenarioIds.has(x)).slice(0, defaults.maxCompared)
      : [];
  return {
    activeScenarioId,
    scenarios,
    accounts,
    fxRates,
    products,
    refinancingRatePct,
    comparedScenarioIds,
  };
}
