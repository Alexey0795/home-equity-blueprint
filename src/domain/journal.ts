import { buildSchedule, levelPayment, monthlyRate, monthsToRepay } from './annuity';
import { paymentDate, parseIsoDate, toIsoDate, type CalendarDate } from './calendar';
import type { PaymentSchedule, PrepaymentMode } from './types';

/**
 * Хроника реального кредита: фактические события и точная переплата.
 *
 * Отличия от прогноза-сценария:
 * - проценты начисляются по фактическим дням между событиями (как в банке), а не «ставка / 12»;
 * - проценты округляются до копеек при каждом начислении — как в выписке;
 * - платёж сначала гасит начисленные проценты, остаток — основной долг;
 * - если в платёж вписана разбивка из выписки банка, верна она; расхождение с нашим расчётом показывается.
 */

/** Как банк считает дни: делит на 365 всегда или на число дней в году (366 в високосном). Смотреть в договоре. */
export type DayCount = 'actual365' | 'actualActual';

export type LoanEventInput =
  | { kind: 'payment'; date: string; amount: number; statement?: { interest: number; principal: number } | null }
  | { kind: 'prepayment'; date: string; amount: number; mode: PrepaymentMode }
  | { kind: 'rate'; date: string; annualRatePct: number };

export interface LoanTerms {
  issueDate: string;
  principal: number;
  annualRatePct: number;
  termMonths: number;
  dayCount: DayCount;
}

export interface JournalRow {
  /** Индекс события во входном списке — чтобы UI сопоставил строку с полем ввода. */
  index: number;
  date: string;
  kind: LoanEventInput['kind'];
  amount: number;
  /** Проценты, начисленные с прошлого события до этого (по нашему расчёту). */
  accrued: number;
  interestPaid: number;
  principalPaid: number;
  balance: number;
  /** Начисленные, но ещё не уплаченные проценты после события. */
  unpaidInterest: number;
  cumulativeInterestPaid: number;
  /** Ставка после события, % годовых. */
  ratePct: number;
  /** Плановый платёж после события (меняется при смене ставки и досрочке «уменьшить платёж»). */
  scheduledPayment: number;
  /** Выписка банка минус наш расчёт процентов (только для платежей с разбивкой из выписки). */
  discrepancy: number | null;
}

export interface JournalResult {
  rows: JournalRow[];
  totalPaid: number;
  interestPaid: number;
  principalPaid: number;
  balance: number;
  unpaidInterest: number;
  ratePct: number;
  scheduledPayment: number;
  /** Последнее событие (или дата выдачи, если событий нет). */
  lastDate: string;
  /** Прогноз оставшихся платежей от последнего события (ставка / 12, без будущих досрочек); null — кредит погашен. */
  forecast: PaymentSchedule | null;
  /** Номер платежа (от выдачи), с которого начинается прогноз. */
  forecastFromMonth: number;
  /** Договор как есть: та же сумма, ставка и срок, без досрочки и смен ставки. */
  contract: PaymentSchedule;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const dayNumber = (d: CalendarDate) => Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Доля года между датами по выбранному способу счёта дней. Дни — со следующего дня после from по to включительно
 * (так обычно пишут в договорах: «со дня, следующего за днём выдачи, по день погашения включительно»).
 */
export function yearFraction(from: CalendarDate, to: CalendarDate, dayCount: DayCount): number {
  const days = dayNumber(to) - dayNumber(from);
  if (dayCount === 'actual365') return days / 365;
  // Фактические дни: каждый кусок периода делим на длину своего года.
  let fraction = 0;
  for (let year = from.year; year <= to.year; year++) {
    const start = Math.max(dayNumber(from), dayNumber({ year, month: 1, day: 1 }) - 1);
    const end = Math.min(dayNumber(to), dayNumber({ year, month: 12, day: 31 }));
    if (end > start) fraction += (end - start) / (isLeap(year) ? 366 : 365);
  }
  return fraction;
}

const ORDER: Record<LoanEventInput['kind'], number> = { rate: 0, payment: 1, prepayment: 2 };

function validate(terms: LoanTerms, events: LoanEventInput[]): void {
  parseIsoDate(terms.issueDate);
  if (!Number.isFinite(terms.principal) || terms.principal <= 0) throw new RangeError('Сумма кредита должна быть положительным числом');
  if (!Number.isFinite(terms.annualRatePct) || terms.annualRatePct < 0) throw new RangeError('Ставка должна быть неотрицательным числом');
  if (!Number.isInteger(terms.termMonths) || terms.termMonths < 1) throw new RangeError('Срок должен быть целым числом месяцев >= 1');
  events.forEach((e, i) => {
    const where = `Событие №${i + 1}`;
    const date = parseIsoDate(e.date);
    if (dayNumber(date) <= dayNumber(parseIsoDate(terms.issueDate))) throw new RangeError(`${where}: дата должна быть позже даты выдачи`);
    if (e.kind === 'rate') {
      if (!Number.isFinite(e.annualRatePct) || e.annualRatePct < 0) throw new RangeError(`${where}: ставка — неотрицательное число`);
    } else if (!Number.isFinite(e.amount) || e.amount < 0) {
      throw new RangeError(`${where}: сумма — неотрицательное число`);
    }
  });
}

/** Прогон журнала: фактические проценты, долг и прогноз оставшейся части. */
export function runJournal(terms: LoanTerms, events: LoanEventInput[]): JournalResult {
  validate(terms, events);
  const issue = parseIsoDate(terms.issueDate);
  const sorted = events
    .map((e, index) => ({ e, index }))
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || ORDER[a.e.kind] - ORDER[b.e.kind] || a.index - b.index);

  let balance = terms.principal;
  let rate = terms.annualRatePct;
  let unpaid = 0;
  let interestPaid = 0;
  let principalPaid = 0;
  let totalPaid = 0;
  let last = issue;
  let payment = levelPayment(balance, monthlyRate(rate), terms.termMonths);
  /** Номер последнего планового платежа: сдвигается раньше после досрочки «сократить срок». */
  let endMonth = terms.termMonths;
  const rows: JournalRow[] = [];

  /** Сколько плановых платежей осталось после даты (до конца срока). */
  const remainingAfter = (date: CalendarDate) => {
    let k = 1;
    while (k <= endMonth && dayNumber(paymentDate(issue, k)) <= dayNumber(date)) k++;
    return { firstMonth: k, count: Math.max(0, endMonth - k + 1) };
  };

  for (const { e, index } of sorted) {
    const date = parseIsoDate(e.date);
    const accrued = round2(balance * (rate / 100) * yearFraction(last, date, terms.dayCount));
    unpaid = round2(unpaid + accrued);
    last = date;

    let interestNow = 0;
    let principalNow = 0;
    let discrepancy: number | null = null;

    if (e.kind === 'rate') {
      rate = e.annualRatePct;
      const { count } = remainingAfter(date);
      if (count > 0 && balance > 0) payment = levelPayment(balance, monthlyRate(rate), count);
    } else if (e.kind === 'payment') {
      totalPaid += e.amount;
      const st = e.statement;
      if (st && Number.isFinite(st.interest) && Number.isFinite(st.principal)) {
        // Выписка банка — истина: проценты и долг как в ней, наш остаток процентов обнуляется.
        discrepancy = round2(st.interest - unpaid);
        interestNow = st.interest;
        principalNow = Math.min(st.principal, balance);
        unpaid = 0;
      } else {
        interestNow = Math.min(e.amount, unpaid);
        principalNow = Math.min(round2(e.amount - interestNow), balance);
        unpaid = round2(unpaid - interestNow);
      }
    } else {
      // Досрочный взнос целиком в основной долг; начисленные проценты ждут ближайшего платежа.
      totalPaid += e.amount;
      principalNow = Math.min(e.amount, balance);
    }

    interestPaid = round2(interestPaid + interestNow);
    principalPaid = round2(principalPaid + principalNow);
    balance = round2(balance - principalNow);

    if (e.kind === 'prepayment' && balance > 0) {
      const { firstMonth, count } = remainingAfter(date);
      if (e.mode === 'reducePayment' && count > 0) {
        payment = levelPayment(balance, monthlyRate(rate), count);
      } else if (e.mode === 'reduceTerm') {
        endMonth = Math.min(endMonth, firstMonth - 1 + monthsToRepay(balance, monthlyRate(rate), payment));
      }
    }

    rows.push({
      index,
      date: e.date,
      kind: e.kind,
      amount: e.kind === 'rate' ? 0 : e.amount,
      accrued,
      interestPaid: interestNow,
      principalPaid: principalNow,
      balance,
      unpaidInterest: unpaid,
      cumulativeInterestPaid: interestPaid,
      ratePct: rate,
      scheduledPayment: payment,
      discrepancy,
    });
  }

  const { firstMonth, count } = remainingAfter(last);
  const forecast =
    balance > 0
      ? buildSchedule({
          principal: balance,
          // Если плановые даты кончились, а долг остался (недоплата) — хотя бы один платёж.
          termMonths: Math.max(1, count),
          rateSteps: [{ fromMonth: 1, annualRatePct: rate }],
          interestOnlyMonths: 0,
        })
      : null;

  return {
    rows,
    totalPaid: round2(totalPaid),
    interestPaid,
    principalPaid,
    balance,
    unpaidInterest: unpaid,
    ratePct: rate,
    scheduledPayment: payment,
    lastDate: toIsoDate(last),
    forecast,
    forecastFromMonth: firstMonth,
    contract: buildSchedule({
      principal: terms.principal,
      termMonths: terms.termMonths,
      rateSteps: [{ fromMonth: 1, annualRatePct: terms.annualRatePct }],
      interestOnlyMonths: 0,
    }),
  };
}

/** Плановые платежи с даты выдачи по указанную дату включительно — чтобы быстро заполнить журнал. */
export function scheduledPaymentDates(issueDate: string, termMonths: number, untilDate: string): string[] {
  const issue = parseIsoDate(issueDate);
  const until = dayNumber(parseIsoDate(untilDate));
  const dates: string[] = [];
  for (let k = 1; k <= termMonths; k++) {
    const d = paymentDate(issue, k);
    if (dayNumber(d) > until) break;
    dates.push(toIsoDate(d));
  }
  return dates;
}
