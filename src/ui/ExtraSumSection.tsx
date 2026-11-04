import { Area, ComposedChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { paymentDate, type CalendarDate, type Currency, type PrepaymentMode } from '../domain';
import { newId, type HelpPlan, type HelpTranche } from '../state/appState';
import type { HelpEvaluation } from '../state/help';
import { useChartColors } from './charts/colors';
import { CurrencySelect } from './CurrencySelect';
import { formatCompact, formatDate, formatMoney, formatMonthYear, formatTerm } from './format';
import { BigMoney, Money } from './Money';
import { NumberField } from './NumberField';

interface Props {
  plan: HelpPlan;
  onChange: (plan: HelpPlan) => void;
  /** Расчёт в текущем сценарии: null — траншей нет. */
  evaluation: HelpEvaluation | { error: string } | null;
  issueDate: CalendarDate | undefined;
  targetPayment: number;
}

/** «в первый взнос», «янв 2028, после 12-го платежа». */
export function trancheWhen(month: number, issueDate: CalendarDate | undefined): string {
  if (month === 0) return 'в первый взнос';
  return issueDate ? `${formatMonthYear(paymentDate(issueDate, month))}, после ${month}-го платежа` : `после ${month}-го платежа`;
}

/** Подпись месяца: «фев 2028» или «мес. 14». */
export const monthLabel = (m: number, issueDate: CalendarDate | undefined) =>
  issueDate ? formatMonthYear(paymentDate(issueDate, m)) : `мес. ${m}`;

/** Месячная нагрузка: платёж банку с суммой (+ возврат займа), пунктир — банк без суммы. */
function OutflowChart({ evaluation, issueDate }: { evaluation: HelpEvaluation; issueDate: CalendarDate | undefined }) {
  const colors = useChartColors();
  const { withHelp, privateLoan, noHelp } = evaluation;
  const months = Math.max(noHelp.rows.length, withHelp.rows.length, privateLoan?.rows.length ?? 0);
  const data = Array.from({ length: months }, (_, i) => ({
    month: i + 1,
    bank: withHelp.rows[i]?.payment ?? 0,
    loan: privateLoan?.rows[i]?.payment ?? 0,
    noHelp: noHelp.rows[i]?.payment ?? 0,
  }));
  const every = months > 240 ? 60 : 24;
  const ticks = data.filter((p) => p.month % every === 0).map((p) => p.month);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" ticks={ticks} tickLine={false}
          tickFormatter={(m: number) => (issueDate ? String(paymentDate(issueDate, m).year) : `${m / 12} г.`)} />
        <YAxis tickFormatter={formatCompact} width={76} />
        <Tooltip formatter={(v) => formatMoney(Number(v))}
          labelFormatter={(m) => (issueDate ? formatDate(paymentDate(issueDate, Number(m))) : `Месяц ${String(m)}`)} />
        <Legend itemSorter={null} />
        <Area type="stepAfter" dataKey="bank" name="Банку — с суммой" stackId="out" stroke={colors.principal}
          fill={colors.principal} fillOpacity={0.35} isAnimationActive={false} />
        {privateLoan && (
          <Area type="stepAfter" dataKey="loan" name="Возврат займа" stackId="out" stroke={colors.prepayment}
            fill={colors.prepayment} fillOpacity={0.45} isAnimationActive={false} />
        )}
        <Line type="stepAfter" dataKey="noHelp" name="Банку — без суммы" stroke={colors.balance} strokeDasharray="6 4"
          dot={false} strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Возврат займа по годам кредита. */
function LoanByYear({ evaluation, currency }: { evaluation: HelpEvaluation; currency: Currency }) {
  const loan = evaluation.privateLoan;
  if (!loan) return null;
  const years: { year: number; lent: number; paid: number; balance: number }[] = [];
  const lent0 = evaluation.tranches.filter((t) => t.month === 0).reduce((s, t) => s + t.amount, 0);
  for (const row of loan.rows) {
    const year = Math.ceil(row.month / 12);
    let y = years.at(-1);
    if (!y || y.year !== year) {
      y = { year, lent: year === 1 ? lent0 : 0, paid: 0, balance: 0 };
      years.push(y);
    }
    y.lent += row.lent;
    y.paid += row.payment;
    y.balance = row.balance;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Год кредита</th><th>Получено</th><th>Возвращено</th><th>Остаток займа</th></tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y.year}>
              <td>{y.year}</td>
              <td>{y.lent > 0 ? <Money value={y.lent} currency={currency} showCode={false} /> : '—'}</td>
              <td>{y.paid > 0 ? <Money value={y.paid} currency={currency} showCode={false} /> : 'отсрочка'}</td>
              <td><Money value={y.balance} currency={currency} showCode={false} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * «Досрочка или вклад»: та же сумма наличными, на вкладе и в ипотеке — на дату конца кредита, номинально и в сегодняшних
 * деньгах. Для ипотеки освободившиеся платежи (и аренда) кладутся на тот же вклад — так сравнение честное.
 */
export function PlacementTable({ evaluation, plan, issueDate }: { evaluation: HelpEvaluation; plan: HelpPlan; issueDate: CalendarDate | undefined }) {
  const { alternatives, mortgage, currency, compareMonth, rent } = evaluation;
  const saved = evaluation.noHelp.totalInterest - evaluation.withHelp.totalInterest;
  const effect = saved + (rent?.rent ?? 0);
  const ratio = effect / (evaluation.totalHelp || 1);
  const times = mortgage.nominal / (alternatives.deposit.nominal || 1);
  const n = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  return (
    <>
      <div className="table-wrap">
        <table className="placement">
          <thead>
            <tr>
              <th>Куда направить сумму</th>
              <th>Будет к {monthLabel(compareMonth, issueDate)}</th>
              <th>В сегодняшних деньгах</th>
              <th>Как считается</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Держать наличными</td>
              <td><Money value={alternatives.home.nominal} currency={currency} showCode={false} /></td>
              <td><Money value={alternatives.home.today} currency={currency} showCode={false} /></td>
              <td>сумма как есть; обесценивается инфляцией</td>
            </tr>
            <tr>
              <td>Вклад под {plan.depositRatePct.toLocaleString('ru-RU')}%</td>
              <td><Money value={alternatives.deposit.nominal} currency={currency} showCode={false} /></td>
              <td><Money value={alternatives.deposit.today} currency={currency} showCode={false} /></td>
              <td>проценты каждый месяц; доход зависит от ставки, банка и курса валют</td>
            </tr>
            <tr className="placement-mortgage">
              <td>В ипотеку: взнос и досрочка</td>
              <td><Money value={mortgage.nominal} currency={currency} showCode={false} /></td>
              <td><Money value={mortgage.today} currency={currency} showCode={false} /></td>
              <td>
                освободившиеся платежи{rent ? ' и аренда' : ''} — на тот же вклад; процентов банку меньше на{' '}
                <Money value={saved} currency={currency} />{rent && <>, аренды — на <Money value={rent.rent} currency={currency} /></>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="extra-note">
        К {monthLabel(compareMonth, issueDate)} вариант «в ипотеку» даёт в <strong>{n.format(times)} раза</strong>{' '}
        {times >= 1 ? 'больше' : 'меньше'}, чем вклад. Каждый 1 {currency} в ипотеке убирает{' '}
        <strong>{n.format(ratio)} {currency}</strong> расходов{rent ? ' (проценты банку и аренда)' : ' процентов банку'}.
        Инфляция ({plan.inflationPct.toLocaleString('ru-RU')}% в год) — одна для всех строк.
      </p>
    </>
  );
}

/**
 * «Дополнительная сумма к взносу»: транши (в первый взнос и досрочно), сравнение с вкладом, аренда, которой не будет.
 * По желанию сумма — частный заём: ставка, бесплатная отсрочка, возврат в месяц.
 */
export function ExtraSumSection({ plan, onChange, evaluation, issueDate, targetPayment }: Props) {
  const set = (patch: Partial<HelpPlan>) => onChange({ ...plan, ...patch });
  const setTranche = (id: string, patch: Partial<HelpTranche>) =>
    set({ tranches: plan.tranches.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const nextMonth = plan.tranches.length === 0 ? 0 : Math.max(...plan.tranches.map((t) => t.month)) + 12;

  const ok = evaluation && !('error' in evaluation) ? evaluation : null;
  const currency = ok?.currency ?? plan.currency;
  const saved = ok ? ok.noHelp.totalInterest - ok.withHelp.totalInterest : 0;
  const shorter = ok ? ok.noHelp.rows.length - ok.withHelp.rows.length : 0;
  const over = ok && Number.isFinite(targetPayment) ? ok.maxOutflow - targetPayment : Number.NaN;

  return (
    <section className="card extra-sum">
      <h2>Дополнительная сумма к взносу</h2>
      <p className="hint">
        Что изменится, если добавить сумму: сразу — к первому взносу, или частями позже — досрочными взносами.
        И куда выгоднее направить эти деньги: держать, положить на вклад или вложить в ипотеку.
      </p>

      <div className="fields">
        <label className="field">
          <span>Валюта суммы</span>
          <CurrencySelect label="Валюта суммы" value={plan.currency} onChange={(c) => set({ currency: c })} />
        </label>
        <label className="field">
          <span>Суммы после выдачи кредита</span>
          <select value={plan.mode} onChange={(e) => set({ mode: e.target.value as PrepaymentMode })}
            title="Сократить срок — платёж банку прежний, кредит закроется раньше. Уменьшить платёж — срок тот же, платёж меньше.">
            <option value="reduceTerm">сокращают срок</option>
            <option value="reducePayment">уменьшают платёж</option>
          </select>
        </label>
        <NumberField label="Вклад для сравнения, % годовых" value={plan.depositRatePct} step={0.5}
          onChange={(depositRatePct) => set({ depositRatePct })} />
        <NumberField label="Инфляция, % в год" value={plan.inflationPct} step={1} min={-99}
          onChange={(inflationPct) => set({ inflationPct })} />
        <NumberField label={`Аренда сейчас, ${plan.currency} в мес.`} value={plan.rentPerMonth} step={50} currency={plan.currency}
          placeholder="не задано" onChange={(rentPerMonth) => set({ rentPerMonth })} />
        <NumberField label={`Откладываю в месяц, ${plan.currency}`} value={plan.savingPerMonth} step={100} currency={plan.currency}
          placeholder="не задано" onChange={(savingPerMonth) => set({ savingPerMonth })} />
      </div>

      <h3>Транши</h3>
      <div className="tranches">
        {plan.tranches.map((t, i) => (
          <div className="tranche" key={t.id}>
            <NumberField label={`Транш ${i + 1}: после платежа №`} value={t.month} step={1}
              onChange={(v) => setTranche(t.id, { month: Math.max(0, Math.round(v)) })} />
            <NumberField label={`Сумма, ${plan.currency}`} value={t.amount} step={1000} currency={plan.currency}
              onChange={(amount) => setTranche(t.id, { amount })} />
            <small className="muted">{trancheWhen(t.month, issueDate)}</small>
            <button type="button" className="icon" aria-label={`Удалить транш ${i + 1}`}
              onClick={() => set({ tranches: plan.tranches.filter((x) => x.id !== t.id) })}>✕</button>
          </div>
        ))}
        <button type="button" onClick={() => set({ tranches: [...plan.tranches, { id: newId(), month: nextMonth, amount: 5_000 }] })}>
          + Добавить транш
        </button>
        <small className="muted">0 — в первый взнос, до сделки; 12 — после 12-го платежа банку (через год).</small>
      </div>

      <label className="field checkbox repay-toggle">
        <input type="checkbox" checked={plan.repay} onChange={(e) => set({ repay: e.target.checked })} />
        <span>Сумма — частный заём, её нужно вернуть</span>
      </label>
      {plan.repay && (
        <div className="fields">
          <NumberField label="Ставка займа, % годовых" value={plan.ratePct} step={0.5} onChange={(ratePct) => set({ ratePct })} />
          <NumberField label="Отсрочка, мес." value={plan.graceMonths} step={1}
            onChange={(v) => set({ graceMonths: Math.max(0, Math.round(v)) })} />
          <NumberField label={`Возврат в месяц, ${plan.currency}`} value={plan.monthlyPayment} step={50} currency={plan.currency}
            onChange={(monthlyPayment) => set({ monthlyPayment })} />
        </div>
      )}

      {evaluation && 'error' in evaluation && <p className="error">{evaluation.error}</p>}
      {!evaluation && <p className="hint">Добавьте транш — появятся экономия, сравнение с вкладом и гонка долгов.</p>}

      {ok && (
        <>
          <div className="summary help-summary">
            <div>
              <span>Процентов банку меньше на</span>
              <strong className="ok"><BigMoney value={saved} currency={currency} /></strong>
              {shorter > 0 && <span className="chip good">кредит короче на {formatTerm(shorter)}</span>}
            </div>
            {ok.rent && (
              <div>
                <span>Аренды не будет на</span>
                <strong className="ok"><BigMoney value={ok.rent.rent} currency={currency} /></strong>
                <span className="chip neutral">без суммы покупка позже на {formatTerm(ok.rent.months)}</span>
              </div>
            )}
            {ok.privateLoan && (
              <div>
                <span>Возврат займа</span>
                <strong><BigMoney value={ok.privateLoan.totalReturned} currency={currency} /></strong>
                <span className="chip neutral">
                  {ok.privateLoan.totalInterest > 0.005
                    ? <>проценты <Money value={ok.privateLoan.totalInterest} currency={currency} /></>
                    : 'без процентов'}
                  {ok.privateLoan.lastPaymentMonth !== null && <> · до {monthLabel(ok.privateLoan.lastPaymentMonth, issueDate)}</>}
                </span>
              </div>
            )}
            <div className={over > 0 ? 'over' : ''}>
              <span>Самая большая нагрузка в месяц</span>
              <strong><BigMoney value={ok.maxOutflow} currency={currency} /></strong>
              {Number.isFinite(over) && (
                <span className={`chip ${over > 0 ? 'bad' : 'good'}`}>
                  {over > 0 ? 'выше желаемого на ' : 'запас до желаемого '}<Money value={Math.abs(over)} currency={currency} />
                </span>
              )}
            </div>
          </div>

          <h3>Досрочка или вклад</h3>
          <PlacementTable evaluation={ok} plan={plan} issueDate={issueDate} />

          <h3>Платежи в месяц</h3>
          <OutflowChart evaluation={ok} issueDate={issueDate} />
          <p className="hint">
            Синее — платёж банку с суммой{ok.privateLoan ? ', зелёное — возврат займа' : ''}, пунктир — платёж банку без суммы.
          </p>

          {ok.privateLoan && (
            <>
              <h3>Возврат займа по годам</h3>
              <LoanByYear evaluation={ok} currency={currency} />
            </>
          )}
        </>
      )}

      <h3>Эквиваленты</h3>
      <p className="hint">Понятные вещи для сравнения сумм: «день — это полчашки кофе». Цены — в валюте суммы.</p>
      <div className="tranches">
        {plan.equivalents.map((e) => (
          <div className="tranche" key={e.id}>
            <label className="field">
              <span>Что</span>
              <input type="text" value={e.name}
                onChange={(ev) => set({ equivalents: plan.equivalents.map((x) => (x.id === e.id ? { ...x, name: ev.target.value } : x)) })} />
            </label>
            <NumberField label={`Цена, ${plan.currency}`} value={e.price} step={1} currency={plan.currency}
              onChange={(price) => set({ equivalents: plan.equivalents.map((x) => (x.id === e.id ? { ...x, price } : x)) })} />
            <span />
            <button type="button" className="icon" aria-label={`Удалить «${e.name}»`}
              onClick={() => set({ equivalents: plan.equivalents.filter((x) => x.id !== e.id) })}>✕</button>
          </div>
        ))}
        <button type="button" onClick={() => set({ equivalents: [...plan.equivalents, { id: newId(), name: '', price: Number.NaN }] })}>
          + Добавить
        </button>
      </div>
    </section>
  );
}
