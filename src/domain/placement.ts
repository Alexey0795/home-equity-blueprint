import { todayValue, type Tranche } from './privateLoan';
import type { PaymentSchedule } from './types';

/**
 * «Куда пристроить сумму»: те же деньги (транши в те же месяцы) — дома, на вкладе или в заём на квартиру.
 * Сравнение на одну дату (месяц untilMonth от выдачи ипотеки) и в сегодняшних деньгах при одной инфляции для всех.
 */

/** Сколько будет на вкладе к месяцу untilMonth: ставка % годовых, проценты причисляются каждый месяц. */
export function depositValue(tranches: Tranche[], ratePct: number, untilMonth: number): number {
  if (!Number.isFinite(ratePct) || ratePct < 0) throw new RangeError('Ставка вклада должна быть неотрицательным числом');
  if (!Number.isInteger(untilMonth) || untilMonth < 0) throw new RangeError('Месяц сравнения — целое число >= 0');
  const r = ratePct / 100 / 12;
  return tranches.reduce((s, t) => s + (t.month <= untilMonth ? t.amount * (1 + r) ** (untilMonth - t.month) : t.amount), 0);
}

/** Сумма «дома» и на вкладе к месяцу untilMonth — номинально и в сегодняшних деньгах. */
export function placementAlternatives(
  tranches: Tranche[],
  depositRatePct: number,
  inflationPct: number,
  untilMonth: number,
): { home: { nominal: number; today: number }; deposit: { nominal: number; today: number } } {
  const home = tranches.reduce((s, t) => s + t.amount, 0);
  const deposit = depositValue(tranches, depositRatePct, untilMonth);
  return {
    home: { nominal: home, today: todayValue(home, untilMonth, inflationPct) },
    deposit: { nominal: deposit, today: todayValue(deposit, untilMonth, inflationPct) },
  };
}

/**
 * Аренда, которой не будет: без этой суммы на первый взнос покупка откладывается, пока я не накоплю её сам
 * (откладывая savingPerMonth в месяц), — и всё это время я плачу аренду. null — откладывать нечего или не задано.
 */
export function rentWithoutSum(amountAtStart: number, savingPerMonth: number, rentPerMonth: number): { months: number; rent: number } | null {
  if (!(amountAtStart > 0) || !(savingPerMonth > 0) || !(rentPerMonth > 0)) return null;
  const months = Math.ceil(amountAtStart / savingPerMonth - 1e-9);
  return { months, rent: months * rentPerMonth };
}

/**
 * Вариант «в ипотеку», посчитанный честно против вклада: каждый месяц сумма освобождает часть расходов (платёж банку
 * меньше или его нет совсем, аренды нет) — и эти освободившиеся деньги кладутся на тот же вклад. Возвращает, сколько
 * будет на этом вкладе к месяцу untilMonth. Если ставка вклада равна ставке кредита, результат равен варианту «вклад».
 *
 * Сами транши в обоих вариантах уходят одинаково (на вклад или в долг), поэтому в расчёте их нет: из досрочных взносов
 * графика «с суммой» вычитаются транши, остаются только свои досрочки сценария.
 */
export function reinvestedSavings(
  noSum: PaymentSchedule,
  withSum: PaymentSchedule,
  tranches: Tranche[],
  depositRatePct: number,
  untilMonth: number,
  rent: { months: number; perMonth: number } | null = null,
): number {
  if (!Number.isFinite(depositRatePct) || depositRatePct < 0) throw new RangeError('Ставка вклада должна быть неотрицательным числом');
  const r = depositRatePct / 100 / 12;
  let total = 0;
  for (let m = 1; m <= untilMonth; m++) {
    const a = noSum.rows[m - 1];
    const b = withSum.rows[m - 1];
    const trancheNow = tranches.filter((t) => t.month === m).reduce((s, t) => s + t.amount, 0);
    const outNo = a ? a.payment + a.prepayment : 0;
    const outWith = b ? b.payment + Math.max(0, b.prepayment - trancheNow) : 0;
    const rentSaved = rent && m <= rent.months ? rent.perMonth : 0;
    total = total * (1 + r) + (outNo - outWith + rentSaved);
  }
  return total;
}
