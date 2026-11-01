import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearTotals } from '../../domain';
import { formatCompact, formatMoney } from '../format';
import { COLORS } from './colors';

/** Сколько за каждый год ушло на проценты и сколько — на погашение долга. */
export function YearlyPaymentsChart({ years }: { years: YearTotals[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={years} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="year" tickLine={false} label={{ value: 'год', position: 'insideBottomRight', offset: -4 }} />
        <YAxis tickFormatter={formatCompact} width={76} />
        <Tooltip formatter={(value) => formatMoney(Number(value))} labelFormatter={(y) => `Год ${String(y)}`} />
        <Legend />
        <Bar dataKey="interest" name="Проценты" stackId="pay" fill={COLORS.interest} isAnimationActive={false} />
        <Bar dataKey="principal" name="Основной долг" stackId="pay" fill={COLORS.principal} isAnimationActive={false} />
        {years.some((y) => y.prepayment > 0) && (
          <Bar dataKey="prepayment" name="Досрочно" stackId="pay" fill={COLORS.prepayment} isAnimationActive={false} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
