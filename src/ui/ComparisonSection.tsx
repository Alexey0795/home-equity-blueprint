import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { convert, maxPayment, type Currency } from '../domain';
import { MAX_COMPARED, type AppState, type Profile } from '../state/appState';
import type { ScenarioEvaluation } from '../state/evaluate';
import { useChartColors } from './charts/colors';
import { formatCompact, formatMoney, formatTerm, toRoman } from './format';
import { Money } from './Money';

interface Props {
  state: AppState;
  profile: Profile;
  evaluations: Map<string, ScenarioEvaluation>;
  /** Валюта активного сценария — в ней сравниваем все. */
  currency: Currency;
  onToggle: (id: string) => void;
  /** Клик по названию — перейти к сценарию. */
  onSelect: (id: string) => void;
}

interface Row {
  id: string;
  roman: string;
  name: string;
  color: string;
  terms: string;
  compared: boolean;
  /** null — сценарий не сходится или нет курса для пересчёта. */
  values: { price: number; loan: number; maxPayment: number; interest: number; months: number; cumulative: number[] } | null;
  note: string;
}

function buildRows(
  state: AppState,
  profile: Profile,
  evaluations: Props['evaluations'],
  currency: Currency,
  scenarioColor: (index: number) => string,
): Row[] {
  // Квартира одна на всех — не повторяем её в каждой строке.
  const sameApartment = new Set(profile.scenarios.map((s) => s.apartmentId)).size === 1;
  return profile.scenarios.map((s, index) => {
    const ev = evaluations.get(s.id)!;
    const product = ev.inputs.product;
    const r = ev.result;
    const from = ev.inputs.currency;
    const base = {
      id: s.id,
      roman: toRoman(index + 1),
      name: s.name || 'Без названия',
      color: scenarioColor(index),
      terms: `${sameApartment ? '' : `${ev.inputs.apartment.name} · `}${product ? product.name : `своя ставка ${s.annualRatePct}%`}`,
      compared: profile.comparedScenarioIds.includes(s.id),
    };
    if ('error' in r) return { ...base, values: null, note: 'не сходится' };
    try {
      const conv = (n: number) => convert(n, from, currency, state.fxRates);
      return {
        ...base,
        values: {
          price: conv(r.deal.price),
          loan: conv(Math.max(0, r.deal.price - r.deal.downPayment)),
          maxPayment: conv(maxPayment(r.baseline)),
          interest: conv(r.schedule.totalInterest),
          months: r.schedule.rows.length,
          cumulative: r.schedule.rows.map((row) => conv(row.cumulativeInterest)),
        },
        note: from === currency ? '' : `пересчитано из ${from}`,
      };
    } catch {
      return { ...base, values: null, note: `нет курса ${from}` };
    }
  });
}

/** Разница с текущим сценарием: меньше — лучше (зелёный), больше — хуже (красный). */
function Delta({ value, base, format }: { value: number; base: number | undefined; format: (n: number) => string }) {
  if (base === undefined) return null;
  const d = value - base;
  if (Math.abs(d) < 0.005) return <span className="chip neutral">=</span>;
  return <span className={`chip ${d < 0 ? 'good' : 'bad'}`}>{d > 0 ? '+' : '−'}{format(Math.abs(d))}</span>;
}

/** Сравнение всех сценариев в валюте активного: таблица + «горы переплаты» выбранных на одном графике. */
export function ComparisonSection({ state, profile, evaluations, currency, onToggle, onSelect }: Props) {
  const colors = useChartColors();
  const rows = buildRows(state, profile, evaluations, currency, colors.scenario);
  const current = rows.find((r) => r.id === profile.activeScenarioId)?.values ?? undefined;
  const money = (n: number) => formatCompact(n);
  const onChart = rows.filter((r) => r.compared && r.values);
  const months = Math.max(0, ...onChart.map((r) => r.values!.cumulative.length));
  const data = Array.from({ length: months }, (_, i) => {
    const point: Record<string, number> = { month: i + 1 };
    for (const r of onChart) {
      const c = r.values!.cumulative;
      // После закрытия кредита переплата больше не растёт — держим последнее значение.
      point[r.id] = c[i] ?? c.at(-1)!;
    }
    return point;
  });
  const step = months > 240 ? 60 : 12;
  const ticks = data.filter((p) => p.month! % step === 0).map((p) => p.month!);
  const full = profile.comparedScenarioIds.length >= MAX_COMPARED;

  return (
    <section className="card">
      <h2>Сравнение сценариев</h2>
      <p className="hint">
        Все суммы — в валюте текущего сценария ({currency}). Под числами — разница с текущим сценарием: зелёным — лучше,
        красным — хуже. Отметьте до {MAX_COMPARED} сценариев, чтобы сравнить их горы переплаты.
      </p>
      <div className="table-wrap">
        <table className="comparison">
          <thead>
            <tr>
              <th>На графике</th>
              <th>Сценарий</th>
              <th>Условия</th>
              <th>Цена</th>
              <th>Кредит</th>
              <th>Макс. платёж</th>
              <th>Переплата</th>
              <th>Закроется через</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === profile.activeScenarioId ? 'current' : ''}>
                <td>
                  <input type="checkbox" aria-label={`Показать «${r.name}» на графике`} checked={r.compared}
                    disabled={!r.compared && (full || !r.values)} onChange={() => onToggle(r.id)} />
                </td>
                <td className="name">
                  <span className="swatch" style={{ background: r.color }} aria-hidden />
                  <button type="button" className="link scenario-link" onClick={() => onSelect(r.id)} title="Перейти к сценарию">
                    <span className="roman">{r.roman}</span> {r.name}
                  </button>
                  {r.note && <small className="note">{r.note}</small>}
                </td>
                <td className="terms">{r.terms}</td>
                {r.values ? (
                  <>
                    <td><Money value={r.values.price} currency={currency} showCode={false} /></td>
                    <td><Money value={r.values.loan} currency={currency} showCode={false} /></td>
                    <td>
                      <Money value={r.values.maxPayment} currency={currency} showCode={false} />
                      {r.id !== profile.activeScenarioId && <Delta value={r.values.maxPayment} base={current?.maxPayment} format={money} />}
                    </td>
                    <td>
                      <Money value={r.values.interest} currency={currency} showCode={false} />
                      {r.id !== profile.activeScenarioId && <Delta value={r.values.interest} base={current?.interest} format={money} />}
                    </td>
                    <td>
                      {formatTerm(r.values.months)}
                      {r.id !== profile.activeScenarioId && <Delta value={r.values.months} base={current?.months} format={(n) => formatTerm(Math.round(n))} />}
                    </td>
                  </>
                ) : (
                  <td colSpan={5} className="muted">—</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {onChart.length > 0 ? (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" ticks={ticks} tickFormatter={(m: number) => String(m / 12)} tickLine={false}
              label={{ value: 'год', position: 'insideBottomRight', offset: -4 }} />
            <YAxis tickFormatter={formatCompact} width={76} />
            <Tooltip formatter={(value) => formatMoney(Number(value), currency)} labelFormatter={(m) => `Месяц ${String(m)}`} />
            <Legend itemSorter={null} />
            {onChart.map((r) => (
              <Line key={r.id} type="monotone" dataKey={r.id} name={`${r.roman} ${r.name}`} stroke={r.color} strokeWidth={2} dot={false}
                isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="hint">Отметьте сценарии в таблице, чтобы увидеть их на графике.</p>
      )}
    </section>
  );
}
