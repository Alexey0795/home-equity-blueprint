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
  /** Расчёт помощи в текущем сценарии: null — траншей нет. */
  evaluation: HelpEvaluation | { error: string } | null;
  issueDate: CalendarDate | undefined;
  targetPayment: number;
  onStory: () => void;
}

/** «в первый взнос», «после 12-го платежа · фев 2028». */
export function trancheWhen(month: number, issueDate: CalendarDate | undefined): string {
  if (month === 0) return 'в первый взнос';
  return issueDate ? `${formatMonthYear(paymentDate(issueDate, month))}, после ${month}-го платежа` : `после ${month}-го платежа`;
}

/** Подпись месяца: «фев 2028» или «мес. 14». */
const monthLabel = (m: number, issueDate: CalendarDate | undefined) =>
  issueDate ? formatMonthYear(paymentDate(issueDate, m)) : `мес. ${m}`;

/** Месячная нагрузка: платёж банку с помощью + платёж родным, пунктир — банк без помощи. */
function OutflowChart({ evaluation, issueDate }: { evaluation: HelpEvaluation; issueDate: CalendarDate | undefined }) {
  const colors = useChartColors();
  const { withHelp, family, noHelp } = evaluation;
  const months = Math.max(noHelp.rows.length, withHelp.rows.length, family.rows.length);
  const data = Array.from({ length: months }, (_, i) => ({
    month: i + 1,
    bank: withHelp.rows[i]?.payment ?? 0,
    family: family.rows[i]?.payment ?? 0,
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
        <Area type="stepAfter" dataKey="bank" name="Банку (с помощью)" stackId="out" stroke={colors.principal}
          fill={colors.principal} fillOpacity={0.35} isAnimationActive={false} />
        <Area type="stepAfter" dataKey="family" name="Родным" stackId="out" stroke={colors.prepayment}
          fill={colors.prepayment} fillOpacity={0.45} isAnimationActive={false} />
        <Line type="stepAfter" dataKey="noHelp" name="Банку без помощи" stroke={colors.balance} strokeDasharray="6 4"
          dot={false} strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Возврат родным по годам кредита. */
function FamilyByYear({ evaluation, currency }: { evaluation: HelpEvaluation; currency: Currency }) {
  const years: { year: number; lent: number; paid: number; balance: number }[] = [];
  const lent0 = evaluation.tranches.filter((t) => t.month === 0).reduce((s, t) => s + t.amount, 0);
  for (const row of evaluation.family.rows) {
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
          <tr><th>Год кредита</th><th>Родные дали</th><th>Я вернул</th><th>Остаток долга родным</th></tr>
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
 * «Помощь родных: заём». Транши (до сделки и по ходу выплат), ставка, бесплатная отсрочка, возврат в месяц.
 * Показывает экономию на процентах банку, сколько и когда вернётся родным и что помощь стоит им при инфляции.
 */
export function FamilyHelpSection({ plan, onChange, evaluation, issueDate, targetPayment, onStory }: Props) {
  const set = (patch: Partial<HelpPlan>) => onChange({ ...plan, ...patch });
  const setTranche = (id: string, patch: Partial<HelpTranche>) =>
    set({ tranches: plan.tranches.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const nextMonth = plan.tranches.length === 0 ? 0 : Math.max(...plan.tranches.map((t) => t.month)) + 12;

  const ok = evaluation && !('error' in evaluation) ? evaluation : null;
  const currency = ok?.currency ?? plan.currency;
  const saved = ok ? ok.noHelp.totalInterest - ok.withHelp.totalInterest : 0;
  const shorter = ok ? ok.noHelp.rows.length - ok.withHelp.rows.length : 0;
  const benefit = ok ? saved - ok.family.totalInterest : 0;
  const lastFamily = ok?.family.lastPaymentMonth ?? null;
  const over = ok && Number.isFinite(targetPayment) ? ok.maxOutflow - targetPayment : Number.NaN;

  return (
    <section className="card family-help">
      <div className="help-head">
        <h2>Помощь родных: заём</h2>
        <button type="button" className="primary" onClick={onStory}>▶ Рассказ по шагам</button>
      </div>
      <p className="hint">
        Родные дают деньги частями: до сделки — в первый взнос, позже — досрочным взносом. Я возвращаю после отсрочки
        равными суммами. Проценты по займу — на остаток, во время отсрочки не начисляются.
      </p>

      <div className="fields">
        <label className="field">
          <span>Валюта займа</span>
          <CurrencySelect label="Валюта займа" value={plan.currency} onChange={(c) => set({ currency: c })} />
        </label>
        <NumberField label="Ставка займа, % годовых" value={plan.ratePct} step={0.5} onChange={(ratePct) => set({ ratePct })} />
        <NumberField label="Бесплатная отсрочка, мес." value={plan.graceMonths} step={1}
          onChange={(v) => set({ graceMonths: Math.max(0, Math.round(v)) })} />
        <NumberField label={`Возвращаю в месяц, ${plan.currency}`} value={plan.monthlyPayment} step={50} currency={plan.currency}
          onChange={(monthlyPayment) => set({ monthlyPayment })} />
        <label className="field">
          <span>Помощь после выдачи кредита</span>
          <select value={plan.mode} onChange={(e) => set({ mode: e.target.value as PrepaymentMode })}
            title="Сократить срок — платёж банку прежний, кредит закроется раньше. Уменьшить платёж — срок тот же, платёж меньше.">
            <option value="reduceTerm">сокращает срок</option>
            <option value="reducePayment">уменьшает платёж</option>
          </select>
        </label>
        <NumberField label="Инфляция, % в год" value={plan.inflationPct} step={1} min={-99}
          onChange={(inflationPct) => set({ inflationPct })} />
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

      {evaluation && 'error' in evaluation && <p className="error">{evaluation.error}</p>}
      {!evaluation && <p className="hint">Добавьте транш — появятся экономия, график возврата и гонка долгов.</p>}

      {ok && (
        <>
          <div className="summary help-summary">
            <div>
              <span>Экономия на процентах банку</span>
              <strong className="ok"><BigMoney value={saved} currency={currency} /></strong>
              {shorter > 0 && <span className="chip good">кредит короче на {formatTerm(shorter)}</span>}
            </div>
            <div>
              <span>Родным вернётся</span>
              <strong><BigMoney value={ok.family.totalReturned} currency={currency} /></strong>
              <span className="chip neutral">
                {ok.family.totalInterest > 0.005
                  ? <>из них проценты <Money value={ok.family.totalInterest} currency={currency} /></>
                  : 'без процентов'}
                {lastFamily !== null && <> · последний платёж {monthLabel(lastFamily, issueDate)}</>}
              </span>
            </div>
            <div>
              <span>Моя выгода</span>
              <strong className={benefit >= 0 ? 'ok' : 'interest'}><BigMoney value={benefit} currency={currency} /></strong>
              <span className="chip neutral">экономия минус проценты родным</span>
            </div>
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

          <p className="family-honest">
            <strong>Честно о цене для помогающих.</strong> При инфляции {plan.inflationPct.toLocaleString('ru-RU')}% в год
            деньги дешевеют. В сегодняшних ценах родные дают <Money value={ok.real.given} currency={currency} />, а вернётся
            им <Money value={ok.real.returned} currency={currency} />.
            {ok.real.given - ok.real.returned > 0.005 && (
              <> Разница — <Money value={ok.real.given - ok.real.returned} currency={currency} /> — и есть их настоящий подарок.</>
            )}
          </p>

          <h3>Сколько я плачу в месяц</h3>
          <OutflowChart evaluation={ok} issueDate={issueDate} />
          <p className="hint">
            Синее — платёж банку с помощью, зелёное — возврат родным, пунктир — платёж банку без помощи.
          </p>

          <h3>Возврат родным по годам</h3>
          <FamilyByYear evaluation={ok} currency={currency} />
        </>
      )}

      <h3>Эквиваленты</h3>
      <p className="hint">Понятные вещи для сравнения: «день промедления — это полчашки кофе». Цены — в валюте займа.</p>
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
