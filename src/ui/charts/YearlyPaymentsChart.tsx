import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearTotals } from '../../domain';
import { formatCompact, formatMoney } from '../format';
import { useChartColors } from './colors';

/**
 * Сколько за каждый год ушло на проценты и сколько — на погашение долга.
 * calendar — годы календарные (2027, 2028…; первый и последний неполные), иначе — годы кредита (1, 2, 3…).
 */
export function YearlyPaymentsChart({ years, calendar = false }: { years: YearTotals[]; calendar?: boolean }) {
  const colors = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={years} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="year" tickLine={false} label={calendar ? undefined : { value: 'год', position: 'insideBottomRight', offset: -4 }} />
        <YAxis tickFormatter={formatCompact} width={76} />
        <Tooltip formatter={(value) => formatMoney(Number(value))} labelFormatter={(y) => (calendar ? `${String(y)} год` : `Год кредита ${String(y)}`)} />
        <Legend itemSorter={null} />
        <Bar dataKey="interest" name="Проценты" stackId="pay" fill={colors.interest} isAnimationActive={false} />
        <Bar dataKey="principal" name="Основной долг" stackId="pay" fill={colors.principal} isAnimationActive={false} />
        {years.some((y) => y.prepayment > 0) && (
          <Bar dataKey="prepayment" name="Досрочно" stackId="pay" fill={colors.prepayment} isAnimationActive={false} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
