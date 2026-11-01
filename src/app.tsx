import { useMemo } from 'react';
import {
  checkDealAgainstProduct,
  convert,
  loanAmount,
  maxPayment,
  paymentPhases,
  prepaymentBanProblems,
  prepaymentEffect,
  solveDeal,
  summarizeSavings,
  yearlyTotals,
  type Currency,
  type DealInput,
  type FreeVariable,
} from './domain';
import { activeScenario, findProduct, type Scenario } from './state/appState';
import { useAppState } from './state/useAppState';
import { OverpaymentChart } from './ui/charts/OverpaymentChart';
import { YearlyPaymentsChart } from './ui/charts/YearlyPaymentsChart';
import { ComputedField } from './ui/ComputedField';
import { CurrencySelect } from './ui/CurrencySelect';
import { describeProduct, formatPct } from './ui/describeProduct';
import { DataFileButtons } from './ui/DataFileButtons';
import { formatMoney, formatTerm } from './ui/format';
import { FREE_VARIABLE_HINTS, FreeVariablePicker } from './ui/FreeVariablePicker';
import { NumberField } from './ui/NumberField';
import { PrepaymentsSection } from './ui/PrepaymentsSection';
import { ProductsSection } from './ui/ProductsSection';
import { SavingsSection } from './ui/SavingsSection';
import { ScheduleTable } from './ui/ScheduleTable';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Сколько отрезков платежа показывать в итогах; остальное — в таблице. */
const MAX_PHASES = 4;

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
      const conv = (n: number) => round2(convert(n, currency, to, state.fxRates));
      update({
        currency: to,
        price: conv(scenario.price),
        downPayment: conv(scenario.downPayment),
        targetPayment: conv(scenario.targetPayment),
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

  const product = findProduct(state, scenario.productId);
  const free = scenario.freeVariable;

  const result = useMemo(() => {
    const input: DealInput = {
      price: scenario.price,
      downPayment: scenario.downPayment,
      termMonths: scenario.termMonths,
      targetPayment: scenario.targetPayment,
      prepayments: scenario.prepayments,
      rate: product
        ? { kind: 'product', product, refinancingRatePct: state.refinancingRatePct }
        : { kind: 'manual', annualRatePct: scenario.annualRatePct },
    };
    try {
      const { deal, schedule, baseline } = solveDeal(free, input);
      return {
        deal,
        schedule,
        baseline,
        effect: prepaymentEffect(baseline, schedule),
        phases: paymentPhases(schedule),
        years: yearlyTotals(schedule),
      };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [free, product, state.refinancingRatePct, scenario]);

  /** Сделка с вычисленной величиной; если не сошлось — как ввёл пользователь. */
  const deal = 'error' in result ? scenario : result.deal;
  const loan = loanAmount(deal.price, deal.downPayment);
  const solvedRefinancing =
    !('error' in result) && result.deal.rate.kind === 'product' ? result.deal.rate.refinancingRatePct : state.refinancingRatePct;
  const solvedManualRate =
    !('error' in result) && result.deal.rate.kind === 'manual' ? result.deal.rate.annualRatePct : scenario.annualRatePct;

  /**
   * Смена свободной величины: вычисленные сейчас значения становятся зафиксированными, чтобы экран не прыгал.
   * Подобранная ставка рефинансирования общая для всех сценариев — её не записываем.
   */
  function chooseFree(next: FreeVariable) {
    if (next === free) return;
    const patch: Partial<Scenario> = { freeVariable: next };
    if (!('error' in result)) {
      patch.price = round2(result.deal.price);
      patch.downPayment = round2(result.deal.downPayment);
      patch.termMonths = result.deal.termMonths;
      if (result.deal.rate.kind === 'manual') patch.annualRatePct = Math.round(result.deal.rate.annualRatePct * 1000) / 1000;
      // Округляем вверх: иначе желаемый платёж окажется на доли копейки меньше текущего и срок «прыгнет» на месяц.
      if (free === 'payment') patch.targetPayment = Math.ceil(maxPayment(result.baseline) * 100) / 100;
    }
    update(patch);
  }

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
    return checkDealAgainstProduct({ ...product, maxLoan }, deal);
  }, [product, deal, currency, state.fxRates]);

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
        <FreeVariablePicker value={free} onChange={chooseFree}
          rateLabel={product ? 'Ставку рефинансирования' : 'Ставку'} />
        <p className="hint">{FREE_VARIABLE_HINTS[free]}</p>
        <div className="fields">
          {free !== 'payment' && (
            <NumberField label={`Платёж не больше, ${currency}`} value={scenario.targetPayment}
              onChange={(targetPayment) => update({ targetPayment })} step={50} />
          )}
          {free === 'price' ? (
            <ComputedField label={`Цена квартиры, ${currency}`} value={'error' in result ? '—' : formatMoney(deal.price)} />
          ) : (
            <NumberField label={`Цена квартиры, ${currency}`} value={scenario.price} onChange={(price) => update({ price })} step={1000} />
          )}
          {free === 'downPayment' ? (
            <ComputedField label={`Первый взнос, ${currency}`} value={'error' in result ? '—' : formatMoney(deal.downPayment)} />
          ) : (
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
          )}
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
          {!product && (free === 'rate' ? (
            <ComputedField label="Ставка, % годовых" value={'error' in result ? '—' : formatPct(solvedManualRate)} />
          ) : (
            <NumberField label="Ставка, % годовых" value={scenario.annualRatePct}
              onChange={(annualRatePct) => update({ annualRatePct })} step={0.1} />
          ))}
          {product && free === 'rate' && (
            <ComputedField label="Ставка рефинансирования" value={'error' in result ? '—' : formatPct(solvedRefinancing)} />
          )}
          {free === 'term' ? (
            <ComputedField label="Срок" value={'error' in result ? '—' : formatTerm(deal.termMonths)} />
          ) : (
            <div className="field-with-action">
              {/* Срок хранится в месяцах; в годах показываем с округлением, точное значение — подписью. */}
              <NumberField label="Срок, лет" value={Math.round((scenario.termMonths / 12) * 100) / 100} step={0.5} min={0.5}
                onChange={(years) => update({ termMonths: Math.round(years * 12) })} />
              {scenario.termMonths % 12 !== 0 && Number.isFinite(scenario.termMonths) && (
                <small className="muted">{formatTerm(scenario.termMonths)}</small>
              )}
            </div>
          )}
        </div>
        {product && (
          <div className="product-in-deal">
            <ul>
              {describeProduct(product, solvedRefinancing).map((line) => <li key={line}>{line}</li>)}
            </ul>
            {product.notes && <p className="hint">{product.notes}</p>}
            {productProblems.map((problem) => <p key={problem} className="warning">⚠ {problem}</p>)}
          </div>
        )}
        {'error' in result && <p className="error">{result.error}</p>}
        <p className="hint">Данные сохраняются в этом браузере автоматически. Чтобы перенести их или сделать копию — «Скачать JSON».</p>
      </section>

      <PrepaymentsSection
        prepayments={scenario.prepayments}
        currency={currency}
        effect={'error' in result ? null : result.effect}
        problems={product ? prepaymentBanProblems(product, scenario.prepayments) : []}
        onChange={(prepayments) => update({ prepayments })}
      />

      <SavingsSection
        accounts={state.accounts}
        fxRates={state.fxRates}
        dealCurrency={currency}
        downPayment={deal.downPayment}
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

      {'error' in result ? null : (
        <>
          <section className="card summary">
            <div><span>Сумма кредита</span><strong>{formatMoney(loan, currency)}</strong></div>
            <div>
              <span>Ежемесячный платёж</span>
              {result.phases.length === 1 ? (
                <strong>{formatMoney(result.schedule.monthlyPayment, currency)}</strong>
              ) : (
                <ul className="phases">
                  {result.phases.slice(0, MAX_PHASES).map((ph) => (
                    <li key={ph.fromMonth}>
                      <strong>{formatMoney(ph.payment, currency)}</strong>
                      <span>{ph.fromMonth === ph.toMonth ? `мес. ${ph.fromMonth}` : `мес. ${ph.fromMonth}–${ph.toMonth}`}</span>
                    </li>
                  ))}
                  {result.phases.length > MAX_PHASES && (
                    <li><span>и ещё {result.phases.length - MAX_PHASES} изм. — см. таблицу</span></li>
                  )}
                </ul>
              )}
            </div>
            {result.effect.monthsSaved > 0 && (
              <div><span>Кредит закроется через</span><strong>{formatTerm(result.schedule.rows.length)}</strong></div>
            )}
            <div><span>Переплата по процентам</span><strong className="interest">{formatMoney(result.schedule.totalInterest, currency)}</strong></div>
            <div><span>Всего выплат</span><strong>{formatMoney(result.schedule.totalPaid, currency)}</strong></div>
          </section>

          <section className="card">
            <h2>Гора переплаты</h2>
            <p className="hint">Сколько процентов банку выплачено к каждому месяцу. При аннуитете в первые годы большая часть платежа уходит на проценты — поэтому гора круче в начале. Льготная ставка в начале делает подножие горы пологим.{scenario.prepayments.length > 0 && ' Пунктир — та же гора без досрочных взносов.'}</p>
            <OverpaymentChart schedule={result.schedule}
              baseline={scenario.prepayments.length > 0 ? result.baseline : undefined} />
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
