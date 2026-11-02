/** Помощники разбора JSON: понятные русские ошибки вместо падений. */
import { CURRENCIES, FREE_VARIABLES, type Currency, type FreeVariable, type PrepaymentMode } from '../domain';

export type Raw = Record<string, unknown>;

export function asObject(raw: unknown, where: string): Raw {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new RangeError(`${where}: ожидался объект`);
  return raw as Raw;
}

export function asArray(raw: Raw, key: string, where: string): unknown[] {
  const value = raw[key];
  if (!Array.isArray(value)) throw new RangeError(`${where}: нет списка «${key}»`);
  return value;
}

/** Пустое поле ввода хранится как NaN, а в JSON становится null — читаем null обратно как NaN. */
export function readNumber(raw: Raw, key: string, where: string): number {
  const value = raw[key];
  if (value === null) return Number.NaN;
  if (typeof value !== 'number') throw new RangeError(`${where}: поле «${key}» должно быть числом`);
  return value;
}

export function readId(raw: Raw, where: string): string {
  if (typeof raw.id !== 'string' || raw.id === '') throw new RangeError(`${where}: нет поля «id»`);
  return raw.id;
}

export function readString(raw: Raw, key: string): string {
  return typeof raw[key] === 'string' ? (raw[key] as string) : '';
}

export function readCurrency(raw: Raw, where: string, key = 'currency'): Currency {
  const value = raw[key];
  if (!CURRENCIES.includes(value as Currency)) {
    throw new RangeError(`${where}: неизвестная валюта «${String(value)}» (допустимы ${CURRENCIES.join(', ')})`);
  }
  return value as Currency;
}

export function readFreeVariable(raw: Raw, where: string): FreeVariable {
  const value = raw.freeVariable;
  if (!FREE_VARIABLES.includes(value as FreeVariable)) {
    throw new RangeError(`${where}: неизвестная вычисляемая величина «${String(value)}»`);
  }
  return value as FreeVariable;
}

export function readMode(raw: Raw, where: string): PrepaymentMode {
  if (raw.mode !== 'reduceTerm' && raw.mode !== 'reducePayment') throw new RangeError(`${where}: неизвестный режим «${String(raw.mode)}»`);
  return raw.mode;
}

export function uniqueIds(items: { id: string }[], what: string): Set<string> {
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) throw new RangeError(`У ${what} повторяются id`);
  return ids;
}
