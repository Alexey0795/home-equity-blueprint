import type { PaymentSchedule } from '../domain';
import { formatMoney } from './format';

export function ScheduleTable({ schedule }: { schedule: PaymentSchedule }) {
  const hasPrepayments = schedule.rows.some((r) => r.prepayment > 0);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Месяц</th>
            <th>Платёж</th>
            <th>Проценты</th>
            <th>Основной долг</th>
            {hasPrepayments && <th>Досрочно</th>}
            <th>Остаток</th>
          </tr>
        </thead>
        <tbody>
          {schedule.rows.map((row) => (
            <tr key={row.month}>
              <td>{row.month}</td>
              <td>{formatMoney(row.payment)}</td>
              <td>{formatMoney(row.interest)}</td>
              <td>{formatMoney(row.principal)}</td>
              {hasPrepayments && <td className={row.prepayment > 0 ? 'prepaid' : ''}>{row.prepayment > 0 ? formatMoney(row.prepayment) : ''}</td>}
              <td>{formatMoney(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
