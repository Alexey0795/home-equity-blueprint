import { useMemo, useState } from 'react';
import { buildAnnuitySchedule, loanAmount, type PaymentSchedule } from './domain';
import { formatMoney } from './ui/format';
import { NumberField } from './ui/NumberField';
import { ScheduleTable } from './ui/ScheduleTable';

export function App() {
  const [price, setPrice] = useState(10_000_000);
  const [downPayment, setDownPayment] = useState(2_000_000);
  const [annualRatePct, setAnnualRatePct] = useState(12);
  const [termYears, setTermYears] = useState(20);

  const loan = loanAmount(price, downPayment);

  const result = useMemo((): { schedule: PaymentSchedule } | { error: string } => {
    try {
      return { schedule: buildAnnuitySchedule({ principal: loan, annualRatePct, termMonths: Math.round(termYears * 12) }) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [loan, annualRatePct, termYears]);

  return (
    <main>
      <h1>Ипотечный калькулятор</h1>

      <section className="card">
        <h2>Сделка</h2>
        <div className="fields">
          <NumberField label="Цена квартиры" value={price} onChange={setPrice} step={100_000} />
          <NumberField label="Первый взнос" value={downPayment} onChange={setDownPayment} step={100_000} />
          <NumberField label="Ставка, % годовых" value={annualRatePct} onChange={setAnnualRatePct} step={0.1} />
          <NumberField label="Срок, лет" value={termYears} onChange={setTermYears} min={1} />
        </div>
      </section>

      {'error' in result ? (
        <p className="error">{result.error}</p>
      ) : (
        <>
          <section className="card summary">
            <div><span>Сумма кредита</span><strong>{formatMoney(loan)}</strong></div>
            <div><span>Ежемесячный платёж</span><strong>{formatMoney(result.schedule.monthlyPayment)}</strong></div>
            <div><span>Переплата по процентам</span><strong>{formatMoney(result.schedule.totalInterest)}</strong></div>
            <div><span>Всего выплат</span><strong>{formatMoney(result.schedule.totalPaid)}</strong></div>
          </section>

          <section className="card">
            <h2>График платежей</h2>
            <ScheduleTable schedule={result.schedule} />
          </section>
        </>
      )}
    </main>
  );
}
