import { useMemo } from 'react';
import { buildAnnuitySchedule, loanAmount, yearlyTotals } from './domain';
import { activeScenario, type Scenario } from './state/appState';
import { useAppState } from './state/useAppState';
import { OverpaymentChart } from './ui/charts/OverpaymentChart';
import { YearlyPaymentsChart } from './ui/charts/YearlyPaymentsChart';
import { DataFileButtons } from './ui/DataFileButtons';
import { formatMoney } from './ui/format';
import { NumberField } from './ui/NumberField';
import { ScheduleTable } from './ui/ScheduleTable';

export function App() {
  const [state, setState] = useAppState();
  const scenario = activeScenario(state);

  function update(patch: Partial<Scenario>) {
    setState((s) => ({
      ...s,
      scenarios: s.scenarios.map((sc) => (sc.id === scenario.id ? { ...sc, ...patch } : sc)),
    }));
  }

  const loan = loanAmount(scenario.price, scenario.downPayment);

  const result = useMemo(() => {
    try {
      const schedule = buildAnnuitySchedule({
        principal: loan,
        annualRatePct: scenario.annualRatePct,
        termMonths: scenario.termMonths,
      });
      return { schedule, years: yearlyTotals(schedule) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [loan, scenario.annualRatePct, scenario.termMonths]);

  return (
    <main>
      <header className="top">
        <h1>Ипотечный калькулятор</h1>
        <DataFileButtons state={state} onImport={setState} />
      </header>

      <section className="card">
        <label className="field scenario-name">
          <span>Сценарий</span>
          <input type="text" value={scenario.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <div className="fields">
          <NumberField label="Цена квартиры" value={scenario.price} onChange={(price) => update({ price })} step={1000} />
          <NumberField label="Первый взнос" value={scenario.downPayment}
            onChange={(downPayment) => update({ downPayment })} step={1000} />
          <NumberField label="Ставка, % годовых" value={scenario.annualRatePct}
            onChange={(annualRatePct) => update({ annualRatePct })} step={0.1} />
          <NumberField label="Срок, лет" value={scenario.termMonths / 12} step={0.5} min={0.5}
            onChange={(years) => update({ termMonths: Math.round(years * 12) })} />
        </div>
        <p className="hint">Данные сохраняются в этом браузере автоматически. Чтобы перенести их или сделать копию — «Скачать JSON».</p>
      </section>

      {'error' in result ? (
        <p className="error">{result.error}</p>
      ) : (
        <>
          <section className="card summary">
            <div><span>Сумма кредита</span><strong>{formatMoney(loan)}</strong></div>
            <div><span>Ежемесячный платёж</span><strong>{formatMoney(result.schedule.monthlyPayment)}</strong></div>
            <div><span>Переплата по процентам</span><strong className="interest">{formatMoney(result.schedule.totalInterest)}</strong></div>
            <div><span>Всего выплат</span><strong>{formatMoney(result.schedule.totalPaid)}</strong></div>
          </section>

          <section className="card">
            <h2>Гора переплаты</h2>
            <p className="hint">Сколько процентов банку выплачено к каждому месяцу. Платёж одинаковый весь срок (аннуитет), но в первые годы почти весь он уходит на проценты — поэтому гора круче в начале.</p>
            <OverpaymentChart schedule={result.schedule} />
          </section>

          <section className="card">
            <h2>Куда уходят платежи по годам</h2>
            <YearlyPaymentsChart years={result.years} />
          </section>

          <section className="card">
            <h2>График платежей по месяцам</h2>
            <ScheduleTable schedule={result.schedule} />
          </section>
        </>
      )}
    </main>
  );
}
