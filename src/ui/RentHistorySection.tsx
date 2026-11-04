import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CURRENCIES, convert, monthText, rentFlows, rentSummary, type Currency, type FxRates } from '../domain';
import { newId, type RentPeriodItem, type RentPlan } from '../state/appState';
import { useChartColors } from './charts/colors';
import { CurrencySelect } from './CurrencySelect';
import { formatPct } from './describeProduct';
import { formatCompact, formatMoney, formatTerm } from './format';
import { BigMoney, Money } from './Money';
import { NumberField } from './NumberField';

interface Props {
  plan: RentPlan;
  onChange: (plan: RentPlan) => void;
  fxRates: FxRates;
  /** Ставка выбранного сценария — по умолчанию для эквивалентного кредита. */
  scenarioRatePct: number;
  /** Цена квартиры из сценария — «хватило бы на N %». */
  price: number;
  priceCurrency: Currency;
}

/** Текущий месяц «ГГГГ-ММ» по часам браузера. */
function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const monthTitle = (n: number) => `${MONTHS[n % 12]} ${Math.floor(n / 12)}`;

/**
 * Ракурс «Аренда»: сколько ушло на аренду за все годы и какой кредит выплатили бы теми же платежами к сегодняшнему дню.
 * Суммы разных валют пересчитываются по сегодняшнему ручному курсу (исторических курсов в калькуляторе нет).
 */
export function RentHistorySection({ plan, onChange, fxRates, scenarioRatePct, price, priceCurrency }: Props) {
  const colors = useChartColors();
  const set = (patch: Partial<RentPlan>) => onChange({ ...plan, ...patch });
  const setPeriod = (id: string, patch: Partial<RentPeriodItem>) =>
    set({ periods: plan.periods.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const rate = Number.isFinite(plan.loanRatePct) ? plan.loanRatePct : scenarioRatePct;
  const asOf = thisMonth();
  const lastTo = plan.periods.reduce<string | null>((m, p) => (p.to && (!m || p.to > m) ? p.to : m), null);

  let body = null;
  if (plan.periods.length > 0) {
    try {
      const flows = rentFlows(plan.periods, asOf, (a, from) => convert(a, from, plan.currency, fxRates));
      const summary = rentSummary(flows, rate);
      const byCurrency = CURRENCIES.map((c) => ({
        c,
        total: rentFlows(plan.periods.filter((p) => p.currency === c), asOf, (a) => a).reduce((s, f) => s + f.amount, 0),
      })).filter((x) => x.total > 0);
      const share = (summary.equivalentLoan / convert(price, priceCurrency, plan.currency, fxRates)) * 100;
      let cumulative = 0;
      const data = flows.map((f) => {
        cumulative += f.amount;
        return { month: f.month, rent: f.amount, total: cumulative };
      });
      body = (
        <>
          <div className="summary help-summary">
            <div>
              <span>Всего на аренду</span>
              <strong className="interest"><BigMoney value={summary.total} currency={plan.currency} /></strong>
              <span className="chip neutral">за {formatTerm(summary.months)}</span>
              {byCurrency.length > 1 || (byCurrency[0] && byCurrency[0].c !== plan.currency)
                ? <span className="chip neutral">{byCurrency.map((x) => formatMoney(x.total, x.c)).join(' + ')}</span>
                : null}
            </div>
            <div>
              <span>Тот же платёж выплатил бы кредит</span>
              <strong><BigMoney value={summary.equivalentLoan} currency={plan.currency} /></strong>
              <span className="chip neutral">взятый в {summary.firstMonth !== null ? monthTitle(summary.firstMonth) : '—'} под {formatPct(rate)}</span>
            </div>
            {Number.isFinite(share) && (
              <div>
                <span>Это от цены квартиры из сценария</span>
                <strong>{Math.round(share)}%</strong>
                <span className="chip neutral"><Money value={price} currency={priceCurrency} /></span>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" type="number" domain={['dataMin', 'dataMax']} tickLine={false}
                tickFormatter={(m: number) => String(Math.floor(m / 12))} />
              <YAxis yAxisId="left" tickFormatter={formatCompact} width={60} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={formatCompact} width={70} />
              <Tooltip formatter={(v) => formatMoney(Number(v), plan.currency)} labelFormatter={(m) => monthTitle(Number(m))} />
              <Legend itemSorter={null} />
              <Bar yAxisId="left" dataKey="rent" name="Аренда в месяц" fill={colors.interest} fillOpacity={0.55} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="total" name="Всего нарастающим итогом" stroke={colors.balance}
                strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="hint">
            Эквивалентный кредит — сумма, которую можно было взять в первый месяц аренды, чтобы ровно эти платежи (со всеми
            переездами и сменой цены) погасили её к {monthTitle(flows.at(-1)!.month)}. Разные валюты — по сегодняшнему курсу.
          </p>
        </>
      );
    } catch (e) {
      body = <p className="error">{e instanceof Error ? e.message : String(e)}</p>;
    }
  }

  return (
    <section className="card">
      <h2>Аренда за прошлые годы</h2>
      <p className="hint">Периоды аренды: комната, квартиры, смены цены. Пустое «по» — по сей день.</p>
      <div className="fields">
        <label className="field">
          <span>Считать в валюте</span>
          <CurrencySelect label="Валюта итога" value={plan.currency} onChange={(c) => set({ currency: c })} />
        </label>
        <NumberField label="Ставка кредита для сравнения, %" value={plan.loanRatePct} step={0.5}
          placeholder={`как в сценарии: ${formatPct(scenarioRatePct)}`} onChange={(loanRatePct) => set({ loanRatePct })} />
      </div>
      <h3>Периоды</h3>
      <div className="tranches">
        {plan.periods.map((p, i) => (
          <div className="tranche rent-period" key={p.id}>
            <label className="field">
              <span>С</span>
              <input type="month" value={p.from} onChange={(e) => e.target.value && setPeriod(p.id, { from: e.target.value })} />
            </label>
            <label className="field">
              <span>По</span>
              <input type="month" value={p.to ?? ''} onChange={(e) => setPeriod(p.id, { to: e.target.value || null })} />
            </label>
            <NumberField label="В месяц" value={p.amount} step={10} currency={p.currency} onChange={(amount) => setPeriod(p.id, { amount })} />
            <label className="field">
              <span>Валюта</span>
              <CurrencySelect label={`Валюта периода ${i + 1}`} value={p.currency} onChange={(currency) => setPeriod(p.id, { currency })} />
            </label>
            <button type="button" className="icon" aria-label={`Удалить период ${i + 1}`}
              onClick={() => set({ periods: plan.periods.filter((x) => x.id !== p.id) })}>✕</button>
          </div>
        ))}
        <button type="button" onClick={() => {
          const start = lastTo ? monthText(Number(lastTo.slice(0, 4)) * 12 + Number(lastTo.slice(5))) : asOf;
          const last = plan.periods.at(-1);
          set({ periods: [...plan.periods, { id: newId(), from: start, to: null, amount: last?.amount ?? 300, currency: last?.currency ?? 'USD' }] });
        }}>
          + Добавить период
        </button>
      </div>
      {body}
    </section>
  );
}
