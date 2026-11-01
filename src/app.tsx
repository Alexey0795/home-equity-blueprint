import { useMemo } from 'react';
import { buildAnnuitySchedule, convert, loanAmount, summarizeSavings, yearlyTotals, type Currency } from './domain';
import { activeScenario, type Scenario } from './state/appState';
import { useAppState } from './state/useAppState';
import { OverpaymentChart } from './ui/charts/OverpaymentChart';
import { YearlyPaymentsChart } from './ui/charts/YearlyPaymentsChart';
import { CurrencySelect } from './ui/CurrencySelect';
import { DataFileButtons } from './ui/DataFileButtons';
import { formatMoney } from './ui/format';
import { NumberField } from './ui/NumberField';
import { SavingsSection } from './ui/SavingsSection';
import { ScheduleTable } from './ui/ScheduleTable';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function App() {
  const [state, setState] = useAppState();
  const scenario = activeScenario(state);
  const currency = scenario.currency;

  function update(patch: Partial<Scenario>) {
    setState((s) => ({
      ...s,
      scenarios: s.scenarios.map((sc) => (sc.id === scenario.id ? { ...sc, ...patch } : sc)),
    }));
  }

  /** Смена валюты сделки пересчитывает цену и взнос по курсу, чтобы квартира не подешевела в 3 раза. */
  function changeCurrency(to: Currency) {
    try {
      const round = (n: number) => Math.round(n * 100) / 100;
      update({
        currency: to,
        price: round(convert(scenario.price, currency, to, state.fxRates)),
        downPayment: round(convert(scenario.downPayment, currency, to, state.fxRates)),
      });
    } catch {
      // Курс не введён — пересчитать нечем, просто меняем валюту.
      update({ currency: to });
    }
  }

  const savings = useMemo(() => {
    try {
      return summarizeSavings(state.accounts, currency, state.fxRates);
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [state.accounts, state.fxRates, currency]);

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
      return { error: errorText(e) };
    }
  }, [loan, scenario.annualRatePct, scenario.termMonths]);

  const canUseAllSavings = !('error' in savings) && savings.availableForDown > 0;

  return (
    <main>
      <header className="top">
        <h1>Ипотечный калькулятор</h1>
        <DataFileButtons state={state} onImport={setState} />
      </header>

      <section className="card">
        <div className="scenario-row">
          <label className="field scenario-name">
            <span>Сценарий</span>
            <input type="text" value={scenario.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>Валюта сделки</span>
            <CurrencySelect label="Валюта сделки" value={currency} onChange={changeCurrency} />
          </label>
        </div>
        <div className="fields">
          <NumberField label={`Цена квартиры, ${currency}`} value={scenario.price} onChange={(price) => update({ price })} step={1000} />
          <div className="field-with-action">
            <NumberField label={`Первый взнос, ${currency}`} value={scenario.downPayment}
              onChange={(downPayment) => update({ downPayment })} step={1000} />
            <button type="button" className="link" disabled={!canUseAllSavings}
              title="Взнос = все сбережения с галочкой «На взнос», до копейки"
              onClick={() => {
                if ('error' in savings) return;
                update({ downPayment: Math.floor(savings.availableForDown * 100) / 100 });
              }}>
              = все сбережения
            </button>
          </div>
          <NumberField label="Ставка, % годовых" value={scenario.annualRatePct}
            onChange={(annualRatePct) => update({ annualRatePct })} step={0.1} />
          <NumberField label="Срок, лет" value={scenario.termMonths / 12} step={0.5} min={0.5}
            onChange={(years) => update({ termMonths: Math.round(years * 12) })} />
        </div>
        <p className="hint">Данные сохраняются в этом браузере автоматически. Чтобы перенести их или сделать копию — «Скачать JSON».</p>
      </section>

      <SavingsSection
        accounts={state.accounts}
        fxRates={state.fxRates}
        dealCurrency={currency}
        downPayment={scenario.downPayment}
        summary={savings}
        onAccountsChange={(accounts) => setState((s) => ({ ...s, accounts }))}
        onRatesChange={(fxRates) => setState((s) => ({ ...s, fxRates }))}
      />

      {'error' in result ? (
        <p className="error">{result.error}</p>
      ) : (
        <>
          <section className="card summary">
            <div><span>Сумма кредита</span><strong>{formatMoney(loan, currency)}</strong></div>
            <div><span>Ежемесячный платёж</span><strong>{formatMoney(result.schedule.monthlyPayment, currency)}</strong></div>
            <div><span>Переплата по процентам</span><strong className="interest">{formatMoney(result.schedule.totalInterest, currency)}</strong></div>
            <div><span>Всего выплат</span><strong>{formatMoney(result.schedule.totalPaid, currency)}</strong></div>
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
