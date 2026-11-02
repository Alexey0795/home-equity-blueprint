/**
 * Состояние приложения — один JSON. Хранится в localStorage и выгружается в файл.
 *
 * Вложенность «матрёшкой» (версия 7):
 * - общее для всех: карточки банков, курсы валют, ставка рефинансирования;
 * - профиль (человек): счета, компоненты (квартиры, распределения сбережений, планы досрочки) и сценарии;
 * - сценарий ссылается на компоненты по id; правка компонента меняет все сценарии, где он используется.
 *
 * Версии 1–6 читаются в legacy.ts и переносятся в профиль «Я» (migrateLegacy).
 * 7 — профили и компоненты; 8 — дата выдачи кредита у сценария (календарь платежей), в v7 её нет → null;
 * 9 — реальные кредиты с журналом событий у профиля (`loans`), в v7–8 их нет → [];
 * 10 — тип графика (аннуитет / дифференцированный) у карточки банка, сценария и реального кредита.
 * При несовместимом изменении формата — поднять STATE_VERSION и дописать миграцию.
 */

import { convert, parseIsoDate, type Account, type Repayment, type CreditProduct, type Currency, type FreeVariable, type FxRates, type PrepaymentPlan, type RecurringPrepayment } from '../domain';
import { LEGACY_VERSION, parseLegacy, type LegacyState } from './legacy';
import {
  asArray,
  asObject,
  readCurrency,
  readFreeVariable,
  readId,
  readMode,
  readNumber,
  readString,
  uniqueIds,
  type Raw,
} from './parse';
import { parseLoan, type RealLoan } from './loans';
import { parseAccount, parseProduct } from './parseShared';
import { sampleProducts } from './sampleProducts';

export const STATE_VERSION = 10;

/** Квартира — компонент: цена в своей валюте (она же валюта сделки). */
export interface Apartment {
  id: string;
  name: string;
  currency: Currency;
  price: number;
}

/** Распределение сбережений — компонент: сколько оставить в резерве, остальное (с флагом «на взнос») — в первый взнос. */
export interface SavingsPlan {
  id: string;
  name: string;
  reserve: number;
  reserveCurrency: Currency;
}

export interface Prepayment extends PrepaymentPlan {
  id: string;
}

export interface Recurring extends RecurringPrepayment {
  id: string;
}

/** План досрочки — компонент: разовые и повторяющиеся взносы; суммы — в валюте плана. */
export interface PrepaymentPlanComponent {
  id: string;
  name: string;
  currency: Currency;
  oneOff: Prepayment[];
  recurring: Recurring[];
}

/** Откуда первый взнос: из сбережений по распределению или своей суммой (в валюте сделки). */
export type DownPaymentSource = { kind: 'savings'; planId: string } | { kind: 'manual'; amount: number };

export interface Scenario {
  id: string;
  name: string;
  apartmentId: string;
  /** Карточка банка; null — своя ставка (annualRatePct). */
  productId: string | null;
  annualRatePct: number;
  termMonths: number;
  downPayment: DownPaymentSource;
  /** План досрочки; null — без досрочки. */
  prepaymentPlanId: string | null;
  freeVariable: FreeVariable;
  /** «Платёж не больше», в валюте сделки. */
  targetPayment: number;
  /** Дата выдачи кредита «ГГГГ-ММ-ДД»; null — без дат, платежи «месяц 1…n». */
  issueDate: string | null;
  /** Тип графика; null — как в карточке банка (для своей ставки — аннуитет). */
  repayment: Repayment | null;
}

export interface Profile {
  id: string;
  name: string;
  accounts: Account[];
  apartments: Apartment[];
  savingsPlans: SavingsPlan[];
  prepaymentPlans: PrepaymentPlanComponent[];
  scenarios: Scenario[];
  activeScenarioId: string;
  /** id сценариев на графике сравнения. */
  comparedScenarioIds: string[];
  /** Реальные (взятые) кредиты с хроникой событий. */
  loans: RealLoan[];
}

export interface AppState {
  version: typeof STATE_VERSION;
  profiles: Profile[];
  activeProfileId: string;
  products: CreditProduct[];
  fxRates: FxRates;
  /** Ставка рефинансирования Нацбанка, % годовых — общая для всех карточек «СР + надбавка». */
  refinancingRatePct: number;
}

/** Ориентировочные курсы для первого запуска; пользователь вводит актуальные сам. */
export const DEFAULT_FX_RATES: FxRates = { USD: 3.0, EUR: 3.4 };

/** Ставка рефинансирования НБ РБ с 01.06.2026. */
export const DEFAULT_REFINANCING_RATE_PCT = 9.25;

export const DEFAULT_TARGET_PAYMENT = 3_000;

/** Сколько сценариев можно показать на графике сравнения одновременно. */
export const MAX_COMPARED = 6;

export function newId(): string {
  return crypto.randomUUID();
}

// ---------- Конструкторы ----------

export function newAccount(): Account {
  return { id: newId(), name: '', currency: 'BYN', amount: 0, useForDownPayment: true };
}

export function newApartment(name = 'Квартира'): Apartment {
  return { id: newId(), name, currency: 'BYN', price: 300_000 };
}

export function newSavingsPlan(name = 'Все сбережения на взнос'): SavingsPlan {
  return { id: newId(), name, reserve: 0, reserveCurrency: 'BYN' };
}

export function newPrepaymentPlan(name = 'План досрочки', currency: Currency = 'BYN'): PrepaymentPlanComponent {
  return { id: newId(), name, currency, oneOff: [], recurring: [] };
}

export function newPrepayment(month: number): Prepayment {
  return { id: newId(), month, amount: 10_000, mode: 'reduceTerm' };
}

export function newRecurring(): Recurring {
  return { id: newId(), fromMonth: 12, toMonth: 60, everyMonths: 12, amount: 5_000, mode: 'reduceTerm' };
}

export function newProduct(): CreditProduct {
  return {
    id: newId(),
    name: 'Новая карточка',
    ratePeriods: [{ fromMonth: 1, rate: { kind: 'refinancing', marginPct: 5 } }],
    repayment: 'annuity',
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

export function newScenario(profile: Profile, name: string): Scenario {
  return {
    id: newId(),
    name,
    apartmentId: profile.apartments[0]!.id,
    productId: null,
    annualRatePct: 12,
    termMonths: 240,
    downPayment: { kind: 'manual', amount: 60_000 },
    prepaymentPlanId: null,
    freeVariable: 'payment',
    targetPayment: DEFAULT_TARGET_PAYMENT,
    issueDate: null,
    repayment: null,
  };
}

/** Новый профиль: одна квартира, распределение «всё на взнос», один сценарий. */
export function newProfile(name: string): Profile {
  const base: Profile = {
    id: newId(),
    name,
    accounts: [],
    apartments: [newApartment()],
    savingsPlans: [newSavingsPlan()],
    prepaymentPlans: [],
    scenarios: [],
    activeScenarioId: '',
    comparedScenarioIds: [],
    loans: [],
  };
  const scenario = newScenario(base, 'Основной');
  return { ...base, scenarios: [scenario], activeScenarioId: scenario.id };
}

export function defaultState(): AppState {
  const profile = newProfile('Я');
  return {
    version: STATE_VERSION,
    profiles: [profile],
    activeProfileId: profile.id,
    products: sampleProducts(newId),
    fxRates: { ...DEFAULT_FX_RATES },
    refinancingRatePct: DEFAULT_REFINANCING_RATE_PCT,
  };
}

// ---------- Поиск ----------

export function activeProfile(state: AppState): Profile {
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0]!;
}

export function activeScenario(profile: Profile): Scenario {
  return profile.scenarios.find((s) => s.id === profile.activeScenarioId) ?? profile.scenarios[0]!;
}

export function findProduct(state: AppState, id: string | null): CreditProduct | undefined {
  return id === null ? undefined : state.products.find((p) => p.id === id);
}

export function findApartment(profile: Profile, id: string): Apartment {
  return profile.apartments.find((a) => a.id === id) ?? profile.apartments[0]!;
}

/** Номера сценариев (I, II, III…) по позиции в списке профиля, через запятую: в каких сценариях используется компонент. */
export function scenariosUsing(profile: Profile, uses: (s: Scenario) => boolean): number[] {
  return profile.scenarios.flatMap((s, i) => (uses(s) ? [i + 1] : []));
}

// ---------- Операции с профилями ----------

/** Изменить активный профиль. */
export function updateProfile(state: AppState, patch: (p: Profile) => Profile): AppState {
  return { ...state, profiles: state.profiles.map((p) => (p.id === state.activeProfileId ? patch(p) : p)) };
}

export function addProfile(state: AppState, name: string): AppState {
  const profile = newProfile(name);
  return { ...state, profiles: [...state.profiles, profile], activeProfileId: profile.id };
}

/** Последний профиль не удаляется. */
export function deleteProfile(state: AppState, id: string): AppState {
  if (state.profiles.length <= 1) return state;
  const profiles = state.profiles.filter((p) => p.id !== id);
  const activeProfileId = state.activeProfileId === id ? profiles[0]!.id : state.activeProfileId;
  return { ...state, profiles, activeProfileId };
}

// ---------- Операции со сценариями (внутри профиля) ----------

export function addScenario(profile: Profile): Profile {
  const scenario = newScenario(profile, `Сценарий ${profile.scenarios.length + 1}`);
  return { ...profile, scenarios: [...profile.scenarios, scenario], activeScenarioId: scenario.id };
}

/** Копия ссылается на те же компоненты (они общие) и встаёт сразу после оригинала. */
export function duplicateScenario(profile: Profile, id: string): Profile {
  const index = profile.scenarios.findIndex((s) => s.id === id);
  const source = profile.scenarios[index];
  if (!source) return profile;
  const copy: Scenario = { ...structuredClone(source), id: newId(), name: `${source.name} (копия)` };
  const scenarios = [...profile.scenarios];
  scenarios.splice(index + 1, 0, copy);
  return { ...profile, scenarios, activeScenarioId: copy.id };
}

/** Последний сценарий не удаляется. Если удалён активный — активным становится соседний. */
export function deleteScenario(profile: Profile, id: string): Profile {
  if (profile.scenarios.length <= 1) return profile;
  const index = profile.scenarios.findIndex((s) => s.id === id);
  if (index < 0) return profile;
  const scenarios = profile.scenarios.filter((s) => s.id !== id);
  const activeScenarioId =
    profile.activeScenarioId === id ? scenarios[Math.min(index, scenarios.length - 1)]!.id : profile.activeScenarioId;
  return { ...profile, scenarios, activeScenarioId, comparedScenarioIds: profile.comparedScenarioIds.filter((x) => x !== id) };
}

export function toggleCompared(profile: Profile, id: string): Profile {
  const ids = profile.comparedScenarioIds;
  if (ids.includes(id)) return { ...profile, comparedScenarioIds: ids.filter((x) => x !== id) };
  if (ids.length >= MAX_COMPARED) return profile;
  return { ...profile, comparedScenarioIds: [...ids, id] };
}

// ---------- Операции с компонентами ----------

type ComponentList = 'apartments' | 'savingsPlans' | 'prepaymentPlans';

/** Компонент, на который ссылается хотя бы один сценарий, удалить нельзя — сначала переключить сценарии. */
export function componentInUse(profile: Profile, list: ComponentList, id: string): boolean {
  return profile.scenarios.some((s) =>
    list === 'apartments'
      ? s.apartmentId === id
      : list === 'savingsPlans'
        ? s.downPayment.kind === 'savings' && s.downPayment.planId === id
        : s.prepaymentPlanId === id,
  );
}

/** Копия компонента с новыми id (в том числе у вложенных взносов). */
export function copyComponent<T extends { id: string; name: string }>(item: T): T {
  const copy = structuredClone(item) as T & { oneOff?: Prepayment[]; recurring?: Recurring[] };
  copy.id = newId();
  copy.name = `${item.name} (копия)`;
  if (copy.oneOff) copy.oneOff = copy.oneOff.map((p) => ({ ...p, id: newId() }));
  if (copy.recurring) copy.recurring = copy.recurring.map((p) => ({ ...p, id: newId() }));
  return copy;
}

// ---------- Сохранение и разбор ----------

export function serializeState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** Перенос «плоских» данных версий 1–6 в профиль «Я»: у каждого сценария появляются свои компоненты. */
export function migrateLegacy(legacy: LegacyState): AppState {
  const apartments: Apartment[] = [];
  const prepaymentPlans: PrepaymentPlanComponent[] = [];
  const scenarios: Scenario[] = legacy.scenarios.map((s, i) => {
    // Одинаковые квартиры (валюта + цена) склеиваем в один компонент.
    let apartment = apartments.find((a) => a.currency === s.currency && a.price === s.price);
    if (!apartment) {
      apartment = { id: newId(), name: `Квартира ${apartments.length + 1}`, currency: s.currency, price: s.price };
      apartments.push(apartment);
    }
    let prepaymentPlanId: string | null = null;
    if (s.prepayments.length > 0) {
      const plan: PrepaymentPlanComponent = {
        ...newPrepaymentPlan(`Досрочка: ${s.name || `сценарий ${i + 1}`}`, s.currency),
        oneOff: s.prepayments.map((p) => ({ ...p })),
      };
      prepaymentPlans.push(plan);
      prepaymentPlanId = plan.id;
    }
    return {
      id: s.id,
      name: s.name,
      apartmentId: apartment.id,
      productId: s.productId,
      annualRatePct: s.annualRatePct,
      termMonths: s.termMonths,
      downPayment: { kind: 'manual', amount: s.downPayment },
      prepaymentPlanId,
      freeVariable: s.freeVariable,
      targetPayment: s.targetPayment,
      issueDate: null,
      repayment: null,
    };
  });
  const profile: Profile = {
    id: newId(),
    name: 'Я',
    accounts: legacy.accounts,
    apartments,
    savingsPlans: [newSavingsPlan()],
    prepaymentPlans,
    scenarios,
    activeScenarioId: legacy.activeScenarioId,
    comparedScenarioIds: legacy.comparedScenarioIds,
    loans: [],
  };
  return {
    version: STATE_VERSION,
    profiles: [profile],
    activeProfileId: profile.id,
    products: legacy.products,
    fxRates: legacy.fxRates,
    refinancingRatePct: legacy.refinancingRatePct,
  };
}

function parseApartment(raw: unknown, index: number, where: string): Apartment {
  const w = `${where}, квартира №${index + 1}`;
  const r = asObject(raw, w);
  return { id: readId(r, w), name: readString(r, 'name'), currency: readCurrency(r, w), price: readNumber(r, 'price', w) };
}

function parseSavingsPlan(raw: unknown, index: number, where: string): SavingsPlan {
  const w = `${where}, распределение сбережений №${index + 1}`;
  const r = asObject(raw, w);
  return {
    id: readId(r, w),
    name: readString(r, 'name'),
    reserve: readNumber(r, 'reserve', w),
    reserveCurrency: readCurrency(r, w, 'reserveCurrency'),
  };
}

function parsePrepaymentPlan(raw: unknown, index: number, where: string): PrepaymentPlanComponent {
  const w = `${where}, план досрочки №${index + 1}`;
  const r = asObject(raw, w);
  const oneOff = asArray(r, 'oneOff', w).map((item, i): Prepayment => {
    const iw = `${w}, взнос №${i + 1}`;
    const x = asObject(item, iw);
    return { id: readId(x, iw), month: readNumber(x, 'month', iw), amount: readNumber(x, 'amount', iw), mode: readMode(x, iw) };
  });
  const recurring = asArray(r, 'recurring', w).map((item, i): Recurring => {
    const iw = `${w}, повторяющийся взнос №${i + 1}`;
    const x = asObject(item, iw);
    return {
      id: readId(x, iw),
      fromMonth: readNumber(x, 'fromMonth', iw),
      toMonth: readNumber(x, 'toMonth', iw),
      everyMonths: readNumber(x, 'everyMonths', iw),
      amount: readNumber(x, 'amount', iw),
      mode: readMode(x, iw),
    };
  });
  uniqueIds([...oneOff, ...recurring], 'досрочных взносов');
  return { id: readId(r, w), name: readString(r, 'name'), currency: readCurrency(r, w), oneOff, recurring };
}

function parseDownPayment(raw: unknown, where: string): DownPaymentSource {
  const r = asObject(raw, `${where}, первый взнос`);
  if (r.kind === 'savings' && typeof r.planId === 'string') return { kind: 'savings', planId: r.planId };
  if (r.kind === 'manual') return { kind: 'manual', amount: readNumber(r, 'amount', where) };
  throw new RangeError(`${where}: неизвестный источник первого взноса`);
}

function parseScenario(raw: unknown, index: number, where: string): Scenario {
  const w = `${where}, сценарий №${index + 1}`;
  const r = asObject(raw, w);
  return {
    id: readId(r, w),
    name: readString(r, 'name'),
    apartmentId: readString(r, 'apartmentId'),
    productId: typeof r.productId === 'string' ? r.productId : null,
    annualRatePct: readNumber(r, 'annualRatePct', w),
    termMonths: readNumber(r, 'termMonths', w),
    downPayment: parseDownPayment(r.downPayment, w),
    prepaymentPlanId: typeof r.prepaymentPlanId === 'string' ? r.prepaymentPlanId : null,
    freeVariable: readFreeVariable(r, w),
    targetPayment: readNumber(r, 'targetPayment', w),
    issueDate: readIssueDate(r),
    repayment: r.repayment === 'annuity' || r.repayment === 'differentiated' ? r.repayment : null,
  };
}

/** Дата выдачи: корректная «ГГГГ-ММ-ДД» или null (в v7 поля нет; битая дата — тоже null, а не ошибка загрузки). */
function readIssueDate(r: Raw): string | null {
  if (typeof r.issueDate !== 'string') return null;
  try {
    parseIsoDate(r.issueDate);
    return r.issueDate;
  } catch {
    return null;
  }
}

function parseProfile(raw: unknown, index: number, productIds: Set<string>): Profile {
  const where = `Профиль №${index + 1}`;
  const r = asObject(raw, where);
  const accounts = asArray(r, 'accounts', where).map(parseAccount);
  uniqueIds(accounts, 'счетов');
  const apartments = asArray(r, 'apartments', where).map((x, i) => parseApartment(x, i, where));
  if (apartments.length === 0) throw new RangeError(`${where}: нет ни одной квартиры`);
  const savingsPlans = asArray(r, 'savingsPlans', where).map((x, i) => parseSavingsPlan(x, i, where));
  const prepaymentPlans = asArray(r, 'prepaymentPlans', where).map((x, i) => parsePrepaymentPlan(x, i, where));
  const scenarios = asArray(r, 'scenarios', where).map((x, i) => parseScenario(x, i, where));
  if (scenarios.length === 0) throw new RangeError(`${where}: нет ни одного сценария`);
  uniqueIds(apartments, 'квартир');
  uniqueIds(savingsPlans, 'распределений сбережений');
  uniqueIds(prepaymentPlans, 'планов досрочки');
  const scenarioIds = uniqueIds(scenarios, 'сценариев');

  // Битые ссылки не ломают загрузку: подставляем безопасные значения.
  const apartmentIds = new Set(apartments.map((a) => a.id));
  const savingsIds = new Set(savingsPlans.map((p) => p.id));
  const planIds = new Set(prepaymentPlans.map((p) => p.id));
  for (const s of scenarios) {
    if (!apartmentIds.has(s.apartmentId)) s.apartmentId = apartments[0]!.id;
    if (s.productId !== null && !productIds.has(s.productId)) s.productId = null;
    if (s.downPayment.kind === 'savings' && !savingsIds.has(s.downPayment.planId)) s.downPayment = { kind: 'manual', amount: 0 };
    if (s.prepaymentPlanId !== null && !planIds.has(s.prepaymentPlanId)) s.prepaymentPlanId = null;
  }
  const activeScenarioId = typeof r.activeScenarioId === 'string' && scenarioIds.has(r.activeScenarioId)
    ? r.activeScenarioId
    : scenarios[0]!.id;
  const comparedScenarioIds = Array.isArray(r.comparedScenarioIds)
    ? r.comparedScenarioIds.filter((x): x is string => typeof x === 'string' && scenarioIds.has(x)).slice(0, MAX_COMPARED)
    : [];
  return {
    id: readId(r, where),
    name: readString(r, 'name'),
    accounts,
    apartments,
    savingsPlans,
    prepaymentPlans,
    scenarios,
    activeScenarioId,
    comparedScenarioIds,
    // До версии 9 реальных кредитов не было.
    loans: Array.isArray(r.loans) ? uniqueLoans(r.loans.map((x, i) => parseLoan(x, i, where))) : [],
  };
}

function uniqueLoans(loans: RealLoan[]): RealLoan[] {
  uniqueIds(loans, 'реальных кредитов');
  return loans;
}

function parseCurrent(r: Raw, version: number): AppState {
  let products = asArray(r, 'products', 'Данные калькулятора').map(parseProduct);
  if (version < 10) {
    // До v10 типа графика не было. Карточкам из исследования (узнаём по названию) ставим график как в банке —
    // иначе «Ипотека Экспресс» и подобные считались бы аннуитетом.
    const fromResearch = new Map(sampleProducts(newId).map((p) => [p.name, p.repayment]));
    products = products.map((p) => ({ ...p, repayment: fromResearch.get(p.name) ?? p.repayment }));
  }
  const productIds = uniqueIds(products, 'карточек банков');
  const profiles = asArray(r, 'profiles', 'Данные калькулятора').map((p, i) => parseProfile(p, i, productIds));
  if (profiles.length === 0) throw new RangeError('В данных нет ни одного профиля');
  const profileIds = uniqueIds(profiles, 'профилей');
  const rates = asObject(r.fxRates, 'Курсы валют');
  return {
    version: STATE_VERSION,
    profiles,
    activeProfileId: typeof r.activeProfileId === 'string' && profileIds.has(r.activeProfileId) ? r.activeProfileId : profiles[0]!.id,
    products,
    fxRates: { USD: readNumber(rates, 'USD', 'Курсы валют'), EUR: readNumber(rates, 'EUR', 'Курсы валют') },
    refinancingRatePct: readNumber(r, 'refinancingRatePct', 'Данные калькулятора'),
  };
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
  if (version <= LEGACY_VERSION) {
    return migrateLegacy(
      parseLegacy(r, version, {
        fxRates: DEFAULT_FX_RATES,
        refinancingRatePct: DEFAULT_REFINANCING_RATE_PCT,
        targetPayment: DEFAULT_TARGET_PAYMENT,
        maxCompared: MAX_COMPARED,
        sampleProducts: () => sampleProducts(newId),
      }),
    );
  }
  return parseCurrent(r, version);
}

/**
 * Смена валюты квартиры: цена пересчитывается по курсу, а в сценариях с этой квартирой — и суммы в валюте сделки
 * («платёж не больше», свой первый взнос). Без курса — валюта меняется без пересчёта.
 */
export function changeApartmentCurrency(state: AppState, apartmentId: string, to: Currency): AppState {
  const profile = activeProfile(state);
  const apartment = profile.apartments.find((a) => a.id === apartmentId);
  if (!apartment || apartment.currency === to) return state;
  const from = apartment.currency;
  let conv: (n: number) => number;
  try {
    convert(1, from, to, state.fxRates);
    conv = (n) => Math.round(convert(n, from, to, state.fxRates) * 100) / 100;
  } catch {
    conv = (n) => n;
  }
  return updateProfile(state, (p) => ({
    ...p,
    apartments: p.apartments.map((a) => (a.id === apartmentId ? { ...a, currency: to, price: conv(a.price) } : a)),
    scenarios: p.scenarios.map((s) =>
      s.apartmentId !== apartmentId
        ? s
        : {
            ...s,
            targetPayment: conv(s.targetPayment),
            downPayment: s.downPayment.kind === 'manual' ? { kind: 'manual', amount: conv(s.downPayment.amount) } : s.downPayment,
          },
    ),
  }));
}
