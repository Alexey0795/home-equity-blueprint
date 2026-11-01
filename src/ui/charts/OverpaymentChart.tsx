import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PaymentSchedule } from '../../domain';
import { formatCompact, formatMoney } from '../format';
import { COLORS } from './colors';

/** «Гора переплаты»: накопленные проценты растут слева направо; рядом — остаток долга. */
export function OverpaymentChart({ schedule }: { schedule: PaymentSchedule }) {
  // Подписи по годам; для длинных кредитов — каждые 5 лет, чтобы не слипались.
  const years = Math.ceil(schedule.rows.length / 12);
  const step = years > 20 ? 60 : 12;
  const ticks = schedule.rows.filter((r) => r.month % step === 0).map((r) => r.month);
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={schedule.rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="month" ticks={ticks} tickFormatter={(m: number) => String(m / 12)} tickLine={false}
          label={{ value: 'год', position: 'insideBottomRight', offset: -4 }} />
        <YAxis tickFormatter={formatCompact} width={76} />
        <Tooltip
          formatter={(value) => formatMoney(Number(value))}
          labelFormatter={(m) => `Месяц ${String(m)}`}
        />
        <Legend />
        <Area type="monotone" dataKey="cumulativeInterest" name="Переплата нарастающим итогом"
          stroke={COLORS.interest} fill={COLORS.interest} fillOpacity={0.35} isAnimationActive={false} />
        <Line type="monotone" dataKey="balance" name="Остаток долга" stroke={COLORS.balance} dot={false}
          strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
