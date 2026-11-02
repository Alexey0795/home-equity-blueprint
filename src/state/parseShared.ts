/** Разбор частей, формат которых одинаков в старых и новых версиях: счета и карточки банков. */
import type { Account, CreditProduct, RatePeriod } from '../domain';
import { asObject, readCurrency, readId, readNumber, readString } from './parse';

export function parseAccount(raw: unknown, index: number): Account {
  const where = `Счёт №${index + 1}`;
  const r = asObject(raw, where);
  return {
    id: readId(r, where),
    name: readString(r, 'name'),
    currency: readCurrency(r, where),
    amount: readNumber(r, 'amount', where),
    useForDownPayment: r.useForDownPayment !== false,
  };
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

export function parseProduct(raw: unknown, index: number): CreditProduct {
  const where = `Карточка банка №${index + 1}`;
  const r = asObject(raw, where);
  if (!Array.isArray(r.ratePeriods)) throw new RangeError(`${where}: нет списка ставок («ratePeriods»)`);
  return {
    id: readId(r, where),
    name: readString(r, 'name'),
    ratePeriods: r.ratePeriods.map((p, i) => parseRatePeriod(p, i, where)),
    // До версии 10 типа графика не было — всё считалось аннуитетом.
    repayment: r.repayment === 'differentiated' ? 'differentiated' : 'annuity',
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
