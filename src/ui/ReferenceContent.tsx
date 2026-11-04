import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FX_HISTORY, REFERENCE_AS_OF, REFINANCING_RATE_HISTORY } from '../reference/nbrbHistory';
import { useChartColors } from './charts/colors';

const pct = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const fx = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «2011-04-20» → «апр 2011». */
const monthTitle = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** Время в годах с дробью — для оси графиков. */
const yearValue = (iso: string) => Number(iso.slice(0, 4)) + (Number(iso.slice(5, 7)) - 1) / 12 + (Number(iso.slice(8, 10) || 1) - 1) / 365;

/** Ставка рефинансирования по годам: на начало года, максимум, на конец года и все изменения. */
function rateByYear() {
  const firstYear = Number(REFINANCING_RATE_HISTORY[0]?.from.slice(0, 4) ?? 2011);
  const lastYear = Number(REFERENCE_AS_OF.slice(0, 4));
  const rows = [];
  for (let year = Math.max(2011, firstYear); year <= lastYear; year++) {
    const before = REFINANCING_RATE_HISTORY.filter((r) => r.from < `${year}-01-02`).at(-1);
    const changes = REFINANCING_RATE_HISTORY.filter((r) => r.from.startsWith(String(year)) && r !== before);
    const values = [before?.ratePct, ...changes.map((c) => c.ratePct)].filter((v): v is number => v !== undefined);
    rows.push({
      year,
      start: before?.ratePct,
      end: values.at(-1),
      max: values.length ? Math.max(...values) : undefined,
      min: values.length ? Math.min(...values) : undefined,
      changes,
    });
  }
  return rows;
}

/** Курсы по годам: на 1 января и изменение за год. */
function fxByYear() {
  const years = [...new Set(FX_HISTORY.map((p) => p.month.slice(0, 4)))];
  return years.map((year, i) => {
    const start = FX_HISTORY.find((p) => p.month.startsWith(year))!;
    const nextYear = years[i + 1];
    const end = nextYear ? FX_HISTORY.find((p) => p.month.startsWith(nextYear))! : FX_HISTORY.at(-1)!;
    return { year, start, end, usdChange: (end.usd / start.usd - 1) * 100 };
  });
}

/**
 * Справка: история ставки рефинансирования и официальных курсов НБРБ. Используется в боковой панели калькулятора
 * и на отдельной странице reference.html (чтобы держать в соседней вкладке).
 */
export function ReferenceContent() {
  const colors = useChartColors();
  const rateData = REFINANCING_RATE_HISTORY.map((r) => ({ t: yearValue(r.from), rate: r.ratePct }));
  const last = REFINANCING_RATE_HISTORY.at(-1);
  if (last) rateData.push({ t: yearValue(REFERENCE_AS_OF), rate: last.ratePct });
  const fxData = FX_HISTORY.map((p) => ({ t: yearValue(`${p.month}-01`), usd: p.usd, eur: p.eur }));
  const ticks = Array.from({ length: Math.floor((Number(REFERENCE_AS_OF.slice(0, 4)) - 2011) / 3) + 1 }, (_, i) => 2011 + i * 3);

  return (
    <div className="reference">
      <p className="hint">
        Данные НБРБ с 2011 года по {REFERENCE_AS_OF.split('-').reverse().join('.')}: чтобы уловить закономерность, а не для
        расчётов до дня. Курсы — в новых рублях: до деноминации 01.07.2016 (10 000 старых = 1 новый) значения разделены
        на 10 000.
      </p>

      <h2>Ставка рефинансирования</h2>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rateData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="t" type="number" domain={[2011, 'dataMax']} ticks={ticks} tickFormatter={(v: number) => String(Math.floor(v))} />
          <YAxis width={40} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip formatter={(v) => [`${pct.format(Number(v))}%`, 'Ставка']}
            labelFormatter={(v) => `${Math.floor(Number(v))} г.`} />
          <Line type="stepAfter" dataKey="rate" stroke={colors.interest} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="table-wrap">
        <table className="ref-table">
          <thead>
            <tr><th>Год</th><th>1 января</th><th>Мин – макс</th><th>Изменения</th></tr>
          </thead>
          <tbody>
            {rateByYear().map((y) => (
              <tr key={y.year}>
                <td>{y.year}</td>
                <td>{y.start !== undefined ? `${pct.format(y.start)}%` : '—'}</td>
                <td>{y.min !== undefined && y.max !== undefined ? (y.min === y.max ? `${pct.format(y.min)}%` : `${pct.format(y.min)} – ${pct.format(y.max)}%`) : '—'}</td>
                <td className="ref-changes">
                  {y.changes.length === 0
                    ? 'без изменений'
                    : y.changes.map((c) => <span key={c.from}>{monthTitle(c.from)}: <strong>{pct.format(c.ratePct)}%</strong></span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Официальные курсы НБРБ</h2>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={fxData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="t" type="number" domain={[2011, 'dataMax']} ticks={ticks} tickFormatter={(v: number) => String(Math.floor(v))} />
          <YAxis width={40} />
          <Tooltip formatter={(v, name) => [fx.format(Number(v)), name === 'usd' ? 'USD' : 'EUR']}
            labelFormatter={(v) => `${Math.floor(Number(v))} г.`} />
          <Legend itemSorter={null} formatter={(v) => (v === 'usd' ? 'BYN за 1 USD' : 'BYN за 1 EUR')} />
          <Line type="monotone" dataKey="usd" stroke={colors.principal} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="eur" stroke={colors.prepayment} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="table-wrap">
        <table className="ref-table">
          <thead>
            <tr><th>Год</th><th>USD на начало</th><th>EUR на начало</th><th>USD за год</th></tr>
          </thead>
          <tbody>
            {fxByYear().map((y) => (
              <tr key={y.year}>
                <td>{y.year}</td>
                <td>{fx.format(y.start.usd)}</td>
                <td>{fx.format(y.start.eur)}</td>
                <td className={y.usdChange > 10 ? 'ref-up' : ''}>{y.usdChange >= 0 ? '+' : ''}{pct.format(y.usdChange)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="explain">
        <summary>Все значения по месяцам</summary>
        <div className="table-wrap">
          <table className="ref-table">
            <thead><tr><th>Месяц</th><th>USD</th><th>EUR</th></tr></thead>
            <tbody>
              {FX_HISTORY.map((p) => (
                <tr key={p.month}><td>{monthTitle(`${p.month}-01`)}</td><td>{fx.format(p.usd)}</td><td>{fx.format(p.eur)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="hint">Источники и уровень доверия к цифрам — в репозитории: docs/research/nbrb-history-2026-11.md.</p>
    </div>
  );
}
