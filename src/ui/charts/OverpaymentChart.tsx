import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PaymentSchedule } from '../../domain';
import { formatCompact, formatMoney } from '../format';
import { COLORS } from './colors';

interface Props {
  schedule: PaymentSchedule;
  /** График без досрочных взносов — рисуется пунктиром для сравнения. */
  baseline?: PaymentSchedule;
}

interface Point {
  month: number;
  cumulativeInterest: number;
  balance: number;
  baselineInterest?: number;
}

/**
 * «Гора переплаты»: накопленные проценты растут слева направо; рядом — остаток долга.
 * С досрочкой кредит закрывается раньше — после этого гора остаётся плато на итоговой переплате.
 */
export function OverpaymentChart({ schedule, baseline }: Props) {
  const months = Math.max(schedule.rows.length, baseline?.rows.length ?? 0);
  const last = schedule.rows.at(-1)!;
  const data: Point[] = [];
  for (let i = 0; i < months; i++) {
    const row = schedule.rows[i];
    data.push({
      month: i + 1,
      cumulativeInterest: row ? row.cumulativeInterest : last.cumulativeInterest,
      balance: row ? row.balance : 0,
      baselineInterest: baseline?.rows[i]?.cumulativeInterest,
    });
  }
  // Подписи по годам; для длинных кредитов — каждые 5 лет, чтобы не слипались.
  const step = months > 240 ? 60 : 12;
  const ticks = data.filter((p) => p.month % step === 0).map((p) => p.month);
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="month" ticks={ticks} tickFormatter={(m: number) => String(m / 12)} tickLine={false}
          label={{ value: 'год', position: 'insideBottomRight', offset: -4 }} />
        <YAxis tickFormatter={formatCompact} width={76} />
        <Tooltip
          formatter={(value) => formatMoney(Number(value))}
          labelFormatter={(m) => `Месяц ${String(m)}`}
        />
        <Legend itemSorter={null} />
        <Area type="monotone" dataKey="cumulativeInterest" name="Переплата нарастающим итогом"
          stroke={COLORS.interest} fill={COLORS.interest} fillOpacity={0.35} isAnimationActive={false} />
        {baseline && (
          <Line type="monotone" dataKey="baselineInterest" name="Переплата без досрочки" stroke={COLORS.interest}
            strokeDasharray="6 4" dot={false} strokeWidth={2} isAnimationActive={false} />
        )}
        <Line type="monotone" dataKey="balance" name="Остаток долга" stroke={COLORS.balance} dot={false}
          strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
