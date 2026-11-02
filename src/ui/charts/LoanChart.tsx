import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { paymentDate, parseIsoDate, type CalendarDate, type JournalResult } from '../../domain';
import { formatCompact, formatDate, formatMoney } from '../format';
import { useChartColors } from './colors';

interface Point {
  month: number;
  actual?: number;
  forecast?: number;
  contract?: number;
}

/** Номер месяца от выдачи для даты события (дробный: 15 дней ≈ 0,5 мес.) — чтобы точки факта легли между плановыми. */
function monthOffset(issue: CalendarDate, date: CalendarDate): number {
  return (date.year - issue.year) * 12 + (date.month - issue.month) + (date.day - issue.day) / 30;
}

/** «Гора переплаты» реального кредита: факт (сплошная), прогноз (пунктир), договор без досрочки (тонкая серая). */
export function LoanChart({ issueDate, result }: { issueDate: string; result: JournalResult }) {
  const colors = useChartColors();
  const issue = parseIsoDate(issueDate);
  const points: Point[] = [{ month: 0, actual: 0, contract: 0 }];
  for (const row of result.rows) points.push({ month: monthOffset(issue, parseIsoDate(row.date)), actual: row.cumulativeInterestPaid });
  if (result.forecast) {
    const start = result.forecastFromMonth - 1;
    points.push({ month: monthOffset(issue, parseIsoDate(result.lastDate)), forecast: result.interestPaid });
    for (const row of result.forecast.rows) points.push({ month: start + row.month, forecast: result.interestPaid + row.cumulativeInterest });
  }
  for (const row of result.contract.rows) points.push({ month: row.month, contract: row.cumulativeInterest });
  points.sort((a, b) => a.month - b.month);

  const last = Math.max(...points.map((p) => p.month));
  const everyYears = last > 240 ? 5 : last > 120 ? 2 : 1;
  const ticks: number[] = [];
  for (let m = 1; m <= last; m++) {
    const d = paymentDate(issue, m);
    if (d.month === 1 && d.year % everyYears === 0) ticks.push(m);
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" type="number" domain={[0, last]} ticks={ticks} tickLine={false}
          tickFormatter={(m: number) => String(paymentDate(issue, Math.round(m)).year)} />
        <YAxis tickFormatter={formatCompact} width={76} />
        <Tooltip
          formatter={(value) => formatMoney(Number(value))}
          labelFormatter={(m) => `≈ ${formatDate(paymentDate(issue, Math.max(0, Math.round(Number(m)))))}`}
        />
        <Legend itemSorter={null} />
        <Line type="monotone" dataKey="actual" name="Переплачено фактически" stroke={colors.interest} strokeWidth={2.5}
          dot={false} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="forecast" name="Прогноз" stroke={colors.interest} strokeDasharray="6 4" strokeWidth={2}
          dot={false} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="contract" name="По договору без досрочки" stroke={colors.balance} strokeWidth={1}
          strokeDasharray="2 3" dot={false} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
