import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { paymentDate, type CalendarDate, type PaymentSchedule } from '../../domain';
import { formatCompact, formatDate, formatMoney } from '../format';
import { useChartColors } from './colors';

interface Props {
  schedule: PaymentSchedule;
  /** График без досрочных взносов — рисуется пунктиром для сравнения. */
  baseline?: PaymentSchedule;
  /** Дата выдачи — тогда ось подписана календарными годами. */
  issueDate?: CalendarDate;
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
export function OverpaymentChart({ schedule, baseline, issueDate }: Props) {
  const colors = useChartColors();
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
  // С датой выдачи — на январских платежах, подпись — календарный год.
  const everyYears = months > 240 ? 5 : 1;
  const ticks = issueDate
    ? data.filter((p) => {
        const d = paymentDate(issueDate, p.month);
        return d.month === 1 && d.year % everyYears === 0;
      }).map((p) => p.month)
    : data.filter((p) => p.month % (12 * everyYears) === 0).map((p) => p.month);
  const tickLabel = (m: number) => (issueDate ? String(paymentDate(issueDate, m).year) : String(m / 12));
  const tooltipLabel = (m: number) => (issueDate ? `Месяц ${m} · ${formatDate(paymentDate(issueDate, m))}` : `Месяц ${m}`);
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" ticks={ticks} tickFormatter={tickLabel} tickLine={false}
          label={issueDate ? undefined : { value: 'год', position: 'insideBottomRight', offset: -4 }} />
        <YAxis tickFormatter={formatCompact} width={76} />
        <Tooltip
          formatter={(value) => formatMoney(Number(value))}
          labelFormatter={(m) => tooltipLabel(Number(m))}
        />
        <Legend itemSorter={null} />
        <Area type="monotone" dataKey="cumulativeInterest" name="Переплата нарастающим итогом"
          stroke={colors.interest} fill={colors.interest} fillOpacity={0.35} isAnimationActive={false} />
        {baseline && (
          <Line type="monotone" dataKey="baselineInterest" name="Переплата без досрочки" stroke={colors.interest}
            strokeDasharray="6 4" dot={false} strokeWidth={2} isAnimationActive={false} />
        )}
        <Line type="monotone" dataKey="balance" name="Остаток долга" stroke={colors.balance} dot={false}
          strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
