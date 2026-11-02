/**
 * Реальный кредит — хроника: фактические параметры и журнал событий (платежи, досрочка, смены ставки).
 * Расчёт — domain/journal.ts (runJournal). Здесь — формат хранения и разбор.
 */
import { parseIsoDate, type Currency, type DayCount, type LoanEventInput, type LoanTerms, type PrepaymentMode } from '../domain';
import { asArray, asObject, readCurrency, readId, readMode, readNumber, readString, uniqueIds } from './parse';

export type LoanEvent =
  | {
      id: string;
      kind: 'payment';
      date: string;
      amount: number;
      /** Разбивка из выписки банка; null — не вписана, проценты посчитает калькулятор. */
      statementInterest: number | null;
      statementPrincipal: number | null;
    }
  | { id: string; kind: 'prepayment'; date: string; amount: number; mode: PrepaymentMode }
  | { id: string; kind: 'rate'; date: string; annualRatePct: number };

export interface RealLoan {
  id: string;
  name: string;
  currency: Currency;
  issueDate: string;
  principal: number;
  annualRatePct: number;
  termMonths: number;
  dayCount: DayCount;
  events: LoanEvent[];
}

const id = () => crypto.randomUUID();

export function newLoan(today: string): RealLoan {
  return {
    id: id(),
    name: 'Мой кредит',
    currency: 'BYN',
    issueDate: today,
    principal: 200_000,
    annualRatePct: 14.9,
    termMonths: 240,
    dayCount: 'actual365',
    events: [],
  };
}

export function newLoanEvent(kind: LoanEvent['kind'], date: string, amount = 0): LoanEvent {
  if (kind === 'payment') return { id: id(), kind, date, amount, statementInterest: null, statementPrincipal: null };
  if (kind === 'prepayment') return { id: id(), kind, date, amount, mode: 'reduceTerm' };
  return { id: id(), kind, date, annualRatePct: 15 };
}

export function loanTerms(loan: RealLoan): LoanTerms {
  return {
    issueDate: loan.issueDate,
    principal: loan.principal,
    annualRatePct: loan.annualRatePct,
    termMonths: loan.termMonths,
    dayCount: loan.dayCount,
  };
}

/** События хранения → вход расчёта (порядок тот же, индексы совпадают). */
export function journalInputs(loan: RealLoan): LoanEventInput[] {
  return loan.events.map((e): LoanEventInput => {
    if (e.kind === 'payment') {
      const statement =
        e.statementInterest !== null && e.statementPrincipal !== null && Number.isFinite(e.statementInterest) && Number.isFinite(e.statementPrincipal)
          ? { interest: e.statementInterest, principal: e.statementPrincipal }
          : null;
      return { kind: 'payment', date: e.date, amount: e.amount, statement };
    }
    if (e.kind === 'prepayment') return { kind: 'prepayment', date: e.date, amount: e.amount, mode: e.mode };
    return { kind: 'rate', date: e.date, annualRatePct: e.annualRatePct };
  });
}

/** Дата «ГГГГ-ММ-ДД»; parseIsoDate бросает понятную ошибку, вызывающий добавляет к ней, где именно. */
function readDate(raw: Record<string, unknown>, key: string): string {
  const value = readString(raw, key);
  parseIsoDate(value);
  return value;
}

function readOptionalNumber(raw: Record<string, unknown>, key: string): number | null {
  return typeof raw[key] === 'number' ? (raw[key] as number) : null;
}

function parseEvent(raw: unknown, index: number, where: string): LoanEvent {
  const w = `${where}, событие №${index + 1}`;
  const r = asObject(raw, w);
  let date: string;
  try {
    date = readDate(r, 'date');
  } catch (e) {
    throw new RangeError(`${w}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (r.kind === 'payment') {
    return {
      id: readId(r, w), kind: 'payment', date, amount: readNumber(r, 'amount', w),
      statementInterest: readOptionalNumber(r, 'statementInterest'), statementPrincipal: readOptionalNumber(r, 'statementPrincipal'),
    };
  }
  if (r.kind === 'prepayment') return { id: readId(r, w), kind: 'prepayment', date, amount: readNumber(r, 'amount', w), mode: readMode(r, w) };
  if (r.kind === 'rate') return { id: readId(r, w), kind: 'rate', date, annualRatePct: readNumber(r, 'annualRatePct', w) };
  throw new RangeError(`${w}: неизвестный тип события «${String(r.kind)}»`);
}

export function parseLoan(raw: unknown, index: number, where: string): RealLoan {
  const w = `${where}, кредит №${index + 1}`;
  const r = asObject(raw, w);
  const events = asArray(r, 'events', w).map((x, i) => parseEvent(x, i, w));
  uniqueIds(events, 'событий кредита');
  let issueDate: string;
  try {
    issueDate = readDate(r, 'issueDate');
  } catch (e) {
    throw new RangeError(`${w}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    id: readId(r, w),
    name: readString(r, 'name'),
    currency: readCurrency(r, w),
    issueDate,
    principal: readNumber(r, 'principal', w),
    annualRatePct: readNumber(r, 'annualRatePct', w),
    termMonths: readNumber(r, 'termMonths', w),
    dayCount: r.dayCount === 'actualActual' ? 'actualActual' : 'actual365',
    events,
  };
}
