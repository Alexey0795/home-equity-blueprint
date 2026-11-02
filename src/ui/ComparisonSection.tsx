import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { convert, maxPayment, type Currency } from '../domain';
import { findProduct, MAX_COMPARED, type AppState } from '../state/appState';
import type { ScenarioResult } from '../state/evaluate';
import { COLORS, scenarioColor } from './charts/colors';
import { formatCompact, formatMoney, formatTerm } from './format';

interface Props {
  state: AppState;
  results: Map<string, ScenarioResult | { error: string }>;
  /** Валюта активного сценария — в ней сравниваем все. */
  currency: Currency;
  onToggle: (id: string) => void;
}

interface Row {
  id: string;
  name: string;
  color: string;
  terms: string;
  compared: boolean;
  /** null — сценарий не сходится или нет курса для пересчёта. */
  values: { price: number; loan: number; maxPayment: number; interest: number; months: number; cumulative: number[] } | null;
  note: string;
}

function buildRows(state: AppState, results: Props['results'], currency: Currency): Row[] {
  return state.scenarios.map((s, index) => {
    const product = findProduct(state, s.productId);
    const r = results.get(s.id);
    const base = {
      id: s.id,
      name: s.name || 'Без названия',
      color: scenarioColor(index),
      terms: product ? product.name : `своя ставка ${s.annualRatePct}%`,
      compared: state.comparedScenarioIds.includes(s.id),
    };
    if (!r || 'error' in r) return { ...base, values: null, note: 'не сходится' };
    try {
      const conv = (n: number) => convert(n, s.currency, currency, state.fxRates);
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
        note: s.currency === currency ? '' : `пересчитано из ${s.currency}`,
      };
    } catch {
      return { ...base, values: null, note: `нет курса ${s.currency}` };
    }
  });
}

/** Сравнение всех сценариев в валюте активного: таблица + «горы переплаты» выбранных на одном графике. */
export function ComparisonSection({ state, results, currency, onToggle }: Props) {
  const rows = buildRows(state, results, currency);
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
  const full = state.comparedScenarioIds.length >= MAX_COMPARED;

  return (
    <section className="card">
      <h2>Сравнение сценариев</h2>
      <p className="hint">Все суммы — в валюте текущего сценария ({currency}). Отметьте до {MAX_COMPARED} сценариев, чтобы сравнить их горы переплаты.</p>
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
              <tr key={r.id} className={r.id === state.activeScenarioId ? 'current' : ''}>
                <td>
                  <input type="checkbox" aria-label={`Показать «${r.name}» на графике`} checked={r.compared}
                    disabled={!r.compared && (full || !r.values)} onChange={() => onToggle(r.id)} />
                </td>
                <td className="name">
                  <span className="swatch" style={{ background: r.color }} aria-hidden />
                  {r.name}
                  {r.note && <small className="note">{r.note}</small>}
                </td>
                <td className="terms">{r.terms}</td>
                {r.values ? (
                  <>
                    <td>{formatMoney(r.values.price)}</td>
                    <td>{formatMoney(r.values.loan)}</td>
                    <td>{formatMoney(r.values.maxPayment)}</td>
                    <td>{formatMoney(r.values.interest)}</td>
                    <td>{formatTerm(r.values.months)}</td>
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
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="month" ticks={ticks} tickFormatter={(m: number) => String(m / 12)} tickLine={false}
              label={{ value: 'год', position: 'insideBottomRight', offset: -4 }} />
            <YAxis tickFormatter={formatCompact} width={76} />
            <Tooltip formatter={(value) => formatMoney(Number(value), currency)} labelFormatter={(m) => `Месяц ${String(m)}`} />
            <Legend itemSorter={null} />
            {onChart.map((r) => (
              <Line key={r.id} type="monotone" dataKey={r.id} name={r.name} stroke={r.color} strokeWidth={2} dot={false}
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
