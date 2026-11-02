import type { Currency, PaymentSchedule } from '../domain';
import { Money } from './Money';

export function ScheduleTable({ schedule, currency }: { schedule: PaymentSchedule; currency: Currency }) {
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
              <td><Money value={row.payment} currency={currency} showCode={false} /></td>
              <td><Money value={row.interest} currency={currency} showCode={false} /></td>
              <td><Money value={row.principal} currency={currency} showCode={false} /></td>
              {hasPrepayments && <td className={row.prepayment > 0 ? 'prepaid' : ''}>{row.prepayment > 0 ? <Money value={row.prepayment} currency={currency} showCode={false} /> : ''}</td>}
              <td><Money value={row.balance} currency={currency} showCode={false} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
