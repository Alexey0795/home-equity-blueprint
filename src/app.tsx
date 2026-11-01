import { useMemo } from 'react';
import {
  buildSchedule,
  checkDealAgainstProduct,
  convert,
  loanAmount,
  paymentPhases,
  productRateSteps,
  summarizeSavings,
  yearlyTotals,
  type Currency,
  type RateStep,
} from './domain';
import { activeScenario, findProduct, type Scenario } from './state/appState';
import { useAppState } from './state/useAppState';
import { OverpaymentChart } from './ui/charts/OverpaymentChart';
import { YearlyPaymentsChart } from './ui/charts/YearlyPaymentsChart';
import { CurrencySelect } from './ui/CurrencySelect';
import { describeProduct } from './ui/describeProduct';
import { DataFileButtons } from './ui/DataFileButtons';
import { formatMoney } from './ui/format';
import { NumberField } from './ui/NumberField';
import { ProductsSection } from './ui/ProductsSection';
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

  const product = findProduct(state, scenario.productId);

  const result = useMemo(() => {
    try {
      const rateSteps: RateStep[] = product
        ? productRateSteps(product, state.refinancingRatePct)
        : [{ fromMonth: 1, annualRatePct: scenario.annualRatePct }];
      const schedule = buildSchedule({
        principal: loan,
        termMonths: scenario.termMonths,
        rateSteps,
        interestOnlyMonths: product?.interestOnlyMonths ?? 0,
      });
      return { schedule, phases: paymentPhases(schedule), years: yearlyTotals(schedule) };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [loan, product, state.refinancingRatePct, scenario.annualRatePct, scenario.termMonths]);

  /** Замечания «банк так не даст». Лимит суммы в карточке — в BYN, сделка может быть в другой валюте. */
  const productProblems = useMemo(() => {
    if (!product) return [];
    let maxLoan = product.maxLoan;
    if (maxLoan !== null && currency !== 'BYN') {
      try {
        maxLoan = convert(maxLoan, 'BYN', currency, state.fxRates);
      } catch {
        maxLoan = null;
      }
    }
    return checkDealAgainstProduct({ ...product, maxLoan }, scenario);
  }, [product, scenario, currency, state.fxRates]);

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
          <label className="field">
            <span>Условия кредита</span>
            <select aria-label="Условия кредита" value={scenario.productId ?? ''}
              onChange={(e) => update({ productId: e.target.value || null })}>
              <option value="">Своя ставка (вручную)</option>
              {state.products.map((p) => (
                <option key={p.id} value={p.id}>{p.name || 'Без названия'}{p.verified ? '' : ' — не проверено'}</option>
              ))}
            </select>
          </label>
          {!product && (
            <NumberField label="Ставка, % годовых" value={scenario.annualRatePct}
              onChange={(annualRatePct) => update({ annualRatePct })} step={0.1} />
          )}
          <NumberField label="Срок, лет" value={scenario.termMonths / 12} step={0.5} min={0.5}
            onChange={(years) => update({ termMonths: Math.round(years * 12) })} />
        </div>
        {product && (
          <div className="product-in-deal">
            <ul>
              {describeProduct(product, state.refinancingRatePct).map((line) => <li key={line}>{line}</li>)}
            </ul>
            {product.notes && <p className="hint">{product.notes}</p>}
            {productProblems.map((problem) => <p key={problem} className="warning">⚠ {problem}</p>)}
          </div>
        )}
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

      <ProductsSection
        products={state.products}
        refinancingRatePct={state.refinancingRatePct}
        usedIds={new Set(state.scenarios.flatMap((sc) => (sc.productId ? [sc.productId] : [])))}
        onProductsChange={(products) => setState((s) => {
          const ids = new Set(products.map((p) => p.id));
          return {
            ...s,
            products,
            // Удалённая карточка → сценарий переходит на ручную ставку.
            scenarios: s.scenarios.map((sc) => (sc.productId && !ids.has(sc.productId) ? { ...sc, productId: null } : sc)),
          };
        })}
        onRefinancingChange={(refinancingRatePct) => setState((s) => ({ ...s, refinancingRatePct }))}
      />

      {'error' in result ? (
        <p className="error">{result.error}</p>
      ) : (
        <>
          <section className="card summary">
            <div><span>Сумма кредита</span><strong>{formatMoney(loan, currency)}</strong></div>
            <div>
              <span>Ежемесячный платёж</span>
              {result.phases.length === 1 ? (
                <strong>{formatMoney(result.schedule.monthlyPayment, currency)}</strong>
              ) : (
                <ul className="phases">
                  {result.phases.map((ph) => (
                    <li key={ph.fromMonth}>
                      <strong>{formatMoney(ph.payment, currency)}</strong>
                      <span>{ph.fromMonth === ph.toMonth ? `мес. ${ph.fromMonth}` : `мес. ${ph.fromMonth}–${ph.toMonth}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div><span>Переплата по процентам</span><strong className="interest">{formatMoney(result.schedule.totalInterest, currency)}</strong></div>
            <div><span>Всего выплат</span><strong>{formatMoney(result.schedule.totalPaid, currency)}</strong></div>
          </section>

          <section className="card">
            <h2>Гора переплаты</h2>
            <p className="hint">Сколько процентов банку выплачено к каждому месяцу. При аннуитете в первые годы большая часть платежа уходит на проценты — поэтому гора круче в начале. Льготная ставка в начале делает подножие горы пологим.</p>
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
