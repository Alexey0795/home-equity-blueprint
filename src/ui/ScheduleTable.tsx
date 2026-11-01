import type { PaymentSchedule } from '../domain';
import { formatMoney } from './format';

export function ScheduleTable({ schedule }: { schedule: PaymentSchedule }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Месяц</th>
            <th>Платёж</th>
            <th>Проценты</th>
            <th>Основной долг</th>
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
              <td>{formatMoney(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
