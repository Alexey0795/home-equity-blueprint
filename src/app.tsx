import { useMemo, useState } from 'react';
import {
  checkDealAgainstProduct,
  convert,
  loanAmount,
  loanParamsForDeal,
  maxPayment,
  paymentHeadroom,
  paymentDate,
  prepaymentBanProblems,
  type Currency,
  type DealField,
  type FreeVariable,
} from './domain';
import {
  activeProfile,
  activeScenario,
  addProfile,
  addScenario,
  changeApartmentCurrency,
  deleteProfile,
  deleteScenario,
  duplicateScenario,
  scenariosUsing,
  toggleCompared,
  updateProfile,
  type Profile,
  type Scenario,
} from './state/appState';
import { evaluateProfile } from './state/evaluate';
import { evaluateHelp } from './state/help';
import { useAppState } from './state/useAppState';
import { OverpaymentChart } from './ui/charts/OverpaymentChart';
import { YearlyPaymentsChart } from './ui/charts/YearlyPaymentsChart';
import { ComparisonSection } from './ui/ComparisonSection';
import { ComponentsSection } from './ui/ComponentsSection';
import { ComputedField } from './ui/ComputedField';
import { describeProduct, formatPct } from './ui/describeProduct';
import { DataFileButtons } from './ui/DataFileButtons';
import { formatDate, formatMonthYear, formatTerm, toRoman } from './ui/format';
import { BigMoney, FxContext, Money } from './ui/Money';
import { FREE_VARIABLE_HINTS, FreeVariablePicker } from './ui/FreeVariablePicker';
import { NumberField } from './ui/NumberField';
import { DebtRace } from './ui/DebtRace';
import { FamilyHelpSection } from './ui/FamilyHelpSection';
import { HelpTimingSection } from './ui/HelpTimingSection';
import { StoryMode } from './ui/StoryMode';
import { LoanSection } from './ui/LoanSection';
import { ProductsSection } from './ui/ProductsSection';
import { ProfileSwitcher } from './ui/ProfileSwitcher';
import { SavingsSection } from './ui/SavingsSection';
import { ScenarioBar } from './ui/ScenarioBar';
import { ScenarioDock } from './ui/ScenarioDock';
import { ScheduleTable } from './ui/ScheduleTable';
import { WelcomeBanner } from './ui/WelcomeBanner';

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Сколько отрезков платежа показывать в итогах; остальное — в таблице. */
const MAX_PHASES = 4;

const REPAYMENT_LABEL = { annuity: 'аннуитет', differentiated: 'дифференцированный' } as const;

/** Дифференцированный платёж меняется каждый месяц — показываем первый, самый большой и последний. */
function DifferentiatedPayments({ rows, currency, monthLabel }: {
  rows: { month: number; payment: number }[];
  currency: Currency;
  monthLabel: (m: number) => string;
}) {
  const first = rows[0]!;
  const last = rows.at(-1)!;
  const max = rows.reduce((a, b) => (b.payment > a.payment + 1e-9 ? b : a), first);
  const items = [
    { label: 'первый', row: first },
    ...(max !== first ? [{ label: 'самый большой', row: max }] : []),
    { label: 'последний', row: last },
  ];
  return (
    <ul className="phases">
      {items.map(({ label, row }) => (
        <li key={label}>
          <strong><Money value={row.payment} currency={currency} /></strong>
          <span>{label}, {monthLabel(row.month)}</span>
        </li>
      ))}
      <li><span className="muted">долг равными частями</span></li>
    </ul>
  );
}

/** «в сценариях I, III» — подпись под выбором компонента. */
function sharedNote(numbers: number[]): string {
  return numbers.length > 1 ? `общий для сценариев ${numbers.map(toRoman).join(', ')}` : '';
}

export function App() {
  const [state, setState] = useAppState();
  const profile = activeProfile(state);
  const scenario = activeScenario(profile);
  const scenarioIndex = profile.scenarios.indexOf(scenario);

  const setProfile = (patch: (p: Profile) => Profile) => setState((s) => updateProfile(s, patch));
  const update = (patch: Partial<Scenario>) =>
    setProfile((p) => ({ ...p, scenarios: p.scenarios.map((sc) => (sc.id === scenario.id ? { ...sc, ...patch } : sc)) }));

  /** Расчёт всех сценариев профиля — для вкладок и сравнения; активный берём отсюда же. */
  const evaluations = useMemo(() => evaluateProfile(state, profile), [state, profile]);
  const { inputs, result } = evaluations.get(scenario.id)!;
  const { currency, apartment, product } = inputs;
  const free = scenario.freeVariable;

  /** Сделка с вычисленной величиной; если не сошлось — как ввёл пользователь. */
  const deal = 'error' in result
    ? { price: apartment.price, downPayment: inputs.downPayment, termMonths: scenario.termMonths }
    : result.deal;
  const loan = loanAmount(deal.price, deal.downPayment);
  const solvedRefinancing =
    !('error' in result) && result.deal.rate.kind === 'product' ? result.deal.rate.refinancingRatePct : state.refinancingRatePct;
  const solvedManualRate =
    !('error' in result) && result.deal.rate.kind === 'manual' ? result.deal.rate.annualRatePct : scenario.annualRatePct;

  /**
   * Смена свободной величины: вычисленные значения, которые принадлежат сценарию (срок, своя ставка, своя сумма взноса),
   * становятся зафиксированными. Цену (это компонент «Квартира», он общий) и ставку рефинансирования (общая) не трогаем.
   */
  function chooseFree(next: FreeVariable) {
    if (next === free) return;
    const patch: Partial<Scenario> = { freeVariable: next };
    if (!('error' in result)) {
      patch.termMonths = result.deal.termMonths;
      if (result.deal.rate.kind === 'manual') patch.annualRatePct = Math.round(result.deal.rate.annualRatePct * 1000) / 1000;
      if (free === 'downPayment' && scenario.downPayment.kind === 'manual') {
        patch.downPayment = { kind: 'manual', amount: round2(result.deal.downPayment) };
      }
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
    return [...checkDealAgainstProduct({ ...product, maxLoan }, deal), ...prepaymentBanProblems(product, inputs.prepayments)];
  }, [product, deal, currency, state.fxRates, inputs.prepayments]);

  /** Поля, которые нарушают условия банка, — подсвечиваются красной рамкой. */
  const badFields = new Set<DealField>(productProblems.map((p) => p.field));
  const bad = (...fields: DealField[]) => (fields.some((f) => badFields.has(f)) ? 'field-error' : '');
  /** Запас до «платёж не больше» (< 0 — превышение). */
  const headroom = 'error' in result ? Number.NaN : paymentHeadroom(result.baseline, scenario.targetPayment);

  const issueDate = inputs.issueDate;
  /** Подпись месяца платежа: «мар 2028», если задана дата выдачи, иначе «мес. 14». */
  const monthLabel = (m: number) => (issueDate ? formatMonthYear(paymentDate(issueDate, m)) : `мес. ${m}`);

  /** Кредит сценария как есть — вход для «Цены промедления»; объект один на расчёт, чтобы не пересчитывать кривую зря. */
  const helpLoan = useMemo(() => ('error' in result ? null : loanParamsForDeal(result.deal)), [result]);

  /** Помощь родных в текущем сценарии (транши, возврат) — для блока займа, гонки и рассказа. */
  const helpEval = useMemo(
    () => ('error' in result ? null : evaluateHelp(profile.help, result, currency, state.fxRates)),
    [profile.help, result, currency, state.fxRates],
  );
  const helpOk = helpEval && !('error' in helpEval) ? helpEval : null;
  const [storyOpen, setStoryOpen] = useState(false);

  const apartmentShared = sharedNote(scenariosUsing(profile, (s) => s.apartmentId === apartment.id));
  const downValue = scenario.downPayment.kind === 'manual' ? 'manual' : scenario.downPayment.planId;
  const usedProductIds = new Set(state.profiles.flatMap((p) => p.scenarios.flatMap((s) => (s.productId ? [s.productId] : []))));
  const highlightIds = new Set([apartment.id, inputs.savingsPlan?.id ?? '', inputs.prepaymentPlan?.id ?? '']);

  return (
    <FxContext.Provider value={state.fxRates}>
    <main>
      <header className="top">
        <h1>Ипотечный калькулятор</h1>
        <div className="top-actions">
          <ProfileSwitcher
            profiles={state.profiles}
            activeId={profile.id}
            onSelect={(id) => setState((s) => ({ ...s, activeProfileId: id }))}
            onAdd={(name) => setState((s) => addProfile(s, name))}
            onRename={(name) => setProfile((p) => ({ ...p, name }))}
            onDelete={() => setState((s) => deleteProfile(s, s.activeProfileId))}
          />
          {!('error' in result) && <button type="button" onClick={() => setStoryOpen(true)}>▶ Рассказ</button>}
          <DataFileButtons state={state} onImport={setState} />
        </div>
      </header>

      <WelcomeBanner onStartOwn={() => setState((s) => addProfile(s, 'Я'))} />

      <div id="scenario-tabs">
      <ScenarioBar
        scenarios={profile.scenarios}
        activeId={scenario.id}
        evaluations={evaluations}
        onSelect={(id) => setProfile((p) => ({ ...p, activeScenarioId: id }))}
        onAdd={() => setProfile(addScenario)}
        onDuplicate={() => setProfile((p) => duplicateScenario(p, scenario.id))}
        onDelete={() => {
          if (window.confirm(`Удалить сценарий «${scenario.name}»?`)) setProfile((p) => deleteScenario(p, scenario.id));
        }}
      />
      </div>
      <ScenarioDock scenarios={profile.scenarios} activeId={scenario.id} watchId="scenario-tabs"
        onSelect={(id) => setProfile((p) => ({ ...p, activeScenarioId: id }))} />

      <section className="card">
        <div className="scenario-row">
          <span className="roman big" aria-label={`Сценарий ${scenarioIndex + 1}`}>{toRoman(scenarioIndex + 1)}</span>
          <label className="field scenario-name">
            <span>Название сценария</span>
            <input type="text" value={scenario.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <div className="field-with-action issue-date">
            <label className="field">
              <span>Дата выдачи кредита</span>
              <input type="date" value={scenario.issueDate ?? ''} onChange={(e) => update({ issueDate: e.target.value || null })} />
            </label>
            {scenario.issueDate ? (
              <button type="button" className="link" onClick={() => update({ issueDate: null })}>без дат (месяц 1, 2, 3…)</button>
            ) : (
              <small className="muted">пусто — платежи «месяц 1, 2, 3…»</small>
            )}
          </div>
        </div>
        <FreeVariablePicker value={free} onChange={chooseFree} rateLabel={product ? 'Ставку рефинансирования' : 'Ставку'} />
        <p className="hint">{FREE_VARIABLE_HINTS[free]}</p>

        <div className="fields">
          <div className={`field-with-action${headroom < 0 ? ' field-error' : ''}`}>
            <NumberField label={`Платёж не больше, ${currency}`} value={scenario.targetPayment} currency={currency}
              onChange={(targetPayment) => update({ targetPayment })} step={50} />
            {free === 'payment' && <small className="muted">ориентир: самый большой платёж сравнивается с ним</small>}
          </div>

          <div className="field-with-action">
            <label className="field">
              <span>Квартира</span>
              <select aria-label="Квартира" value={apartment.id} onChange={(e) => update({ apartmentId: e.target.value })}>
                {profile.apartments.map((a) => <option key={a.id} value={a.id}>{a.name || 'Без названия'}</option>)}
              </select>
            </label>
            {apartmentShared && <small className="muted">{apartmentShared}</small>}
          </div>
          {free === 'price' ? (
            <ComputedField label={`Цена квартиры, ${currency}`} money={'error' in result ? undefined : { value: deal.price, currency }} value="—" />
          ) : (
            <div className={bad('loan')}>
              <NumberField label={`Цена квартиры, ${currency}`} value={apartment.price} step={1000} currency={currency}
                onChange={(price) => setProfile((p) => ({ ...p, apartments: p.apartments.map((a) => (a.id === apartment.id ? { ...a, price } : a)) }))} />
            </div>
          )}

          <label className="field">
            <span>Первый взнос</span>
            <select aria-label="Источник первого взноса" value={downValue}
              onChange={(e) => update({
                downPayment: e.target.value === 'manual'
                  ? { kind: 'manual', amount: Number.isFinite(inputs.downPayment) ? round2(inputs.downPayment) : 0 }
                  : { kind: 'savings', planId: e.target.value },
              })}>
              <option value="manual">Своя сумма</option>
              {profile.savingsPlans.map((sp) => <option key={sp.id} value={sp.id}>Из сбережений: {sp.name}</option>)}
            </select>
          </label>
          <div className={bad('downPayment', 'loan')}>
          {free === 'downPayment' ? (
            <ComputedField label={`Первый взнос, ${currency}`} money={'error' in result ? undefined : { value: deal.downPayment, currency }} value="—" />
          ) : scenario.downPayment.kind === 'manual' ? (
            <NumberField label={`Первый взнос, ${currency}`} value={scenario.downPayment.amount} step={1000} currency={currency}
              onChange={(amount) => update({ downPayment: { kind: 'manual', amount } })} />
          ) : (
            <div className="field derived">
              <span>Первый взнос, {currency}</span>
              <output><Money value={inputs.downPayment} currency={currency} showCode={false} /></output>
              {inputs.reserve > 0 && <small>сбережения минус резерв <Money value={inputs.reserve} currency={currency} /></small>}
            </div>
          )}
          </div>

          <label className="field">
            <span>Кредит</span>
            <select aria-label="Условия кредита" value={scenario.productId ?? ''}
              onChange={(e) => update({ productId: e.target.value || null })}>
              <option value="">Своя ставка (вручную)</option>
              {state.products.map((p) => (
                <option key={p.id} value={p.id}>{p.name || 'Без названия'}{p.verified ? '' : ' — не проверено'}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>График платежей</span>
            <select aria-label="График платежей" value={scenario.repayment ?? ''}
              title="Аннуитет — платёж одинаковый, в начале почти весь уходит на проценты. Дифференцированный — долг гасится равными частями: в начале платёж выше, потом уменьшается, переплата меньше."
              onChange={(e) => update({ repayment: (e.target.value || null) as Scenario['repayment'] })}>
              <option value="">{product ? `Как в банке — ${REPAYMENT_LABEL[product.repayment]}` : 'Аннуитет — равные платежи'}</option>
              {product && <option value="annuity">Аннуитет — равные платежи</option>}
              <option value="differentiated">Дифференцированный — долг равными частями</option>
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
            <div className={bad('term')}>
              <ComputedField label="Срок" value={'error' in result ? '—' : formatTerm(deal.termMonths)} />
            </div>
          ) : (
            <div className={`field-with-action ${bad('term')}`}>
              {/* Срок хранится в месяцах; в годах показываем с округлением, точное значение — подписью. */}
              <NumberField label="Срок, лет" value={Math.round((scenario.termMonths / 12) * 100) / 100} step={0.5} min={0.5}
                onChange={(years) => update({ termMonths: Math.round(years * 12) })} />
              {scenario.termMonths % 12 !== 0 && Number.isFinite(scenario.termMonths) && (
                <small className="muted">{formatTerm(scenario.termMonths)}</small>
              )}
            </div>
          )}

          <label className={`field ${bad('prepayments')}`}>
            <span>Досрочные взносы</span>
            <select aria-label="План досрочки" value={scenario.prepaymentPlanId ?? ''}
              onChange={(e) => update({ prepaymentPlanId: e.target.value || null })}>
              <option value="">Без досрочки</option>
              {profile.prepaymentPlans.map((pp) => <option key={pp.id} value={pp.id}>{pp.name || 'Без названия'}</option>)}
            </select>
          </label>
        </div>

        {product && (
          <div className="product-in-deal">
            <ul>
              {describeProduct(product, solvedRefinancing).map((line) => <li key={line}>{line}</li>)}
            </ul>
            {product.notes && <p className="hint">{product.notes}</p>}
          </div>
        )}
        {productProblems.map((problem) => <p key={problem.message} className="warning">⚠ {problem.message}</p>)}
        {'error' in result && <p className="error">{result.error}</p>}
        <p className="hint">
          Квартиры, распределения сбережений и планы досрочки настраиваются ниже, в «Компонентах профиля». Данные сохраняются
          в этом браузере автоматически; «Скачать JSON» — копия на диск.
        </p>
      </section>

      {'error' in result ? null : (
        <>
          <section className="card summary">
            <div className={badFields.has('loan') ? 'over' : ''}>
              <span>Сумма кредита</span><strong><BigMoney value={loan} currency={currency} /></strong>
            </div>
            <div className={headroom < 0 ? 'over' : ''}>
              <span>Ежемесячный платёж</span>
              {inputs.repayment === 'differentiated' ? (
                <DifferentiatedPayments rows={result.schedule.rows} currency={currency} monthLabel={monthLabel} />
              ) : result.phases.length === 1 ? (
                <strong><BigMoney value={result.schedule.monthlyPayment} currency={currency} /></strong>
              ) : (
                <ul className="phases">
                  {result.phases.slice(0, MAX_PHASES).map((ph) => (
                    <li key={ph.fromMonth}>
                      <strong><Money value={ph.payment} currency={currency} /></strong>
                      <span>
                        {ph.fromMonth === ph.toMonth
                          ? monthLabel(ph.fromMonth)
                          : issueDate
                            ? `${monthLabel(ph.fromMonth)} – ${monthLabel(ph.toMonth)}`
                            : `мес. ${ph.fromMonth}–${ph.toMonth}`}
                      </span>
                    </li>
                  ))}
                  {result.phases.length > MAX_PHASES && (
                    <li><span>и ещё {result.phases.length - MAX_PHASES} изм. — см. таблицу</span></li>
                  )}
                </ul>
              )}
              {Number.isFinite(headroom) && Number.isFinite(scenario.targetPayment) && (
                <span className={`chip ${headroom < 0 ? 'bad' : 'good'}`}>
                  {headroom < 0 ? 'выше желаемого на ' : 'запас до желаемого '}
                  <Money value={Math.abs(headroom)} currency={currency} />
                </span>
              )}
            </div>
            <div><span>Переплата по процентам</span><strong className="interest"><BigMoney value={result.schedule.totalInterest} currency={currency} /></strong></div>
            <div><span>Всего выплат</span><strong><BigMoney value={result.schedule.totalPaid} currency={currency} /></strong></div>
            {inputs.prepayments.length > 0 && (
              <div><span>Экономия от досрочки</span><strong className="ok"><BigMoney value={result.effect.interestSaved} currency={currency} /></strong></div>
            )}
            {issueDate ? (
              <>
                <div><span>Первый платёж</span><strong>{formatDate(paymentDate(issueDate, 1))}</strong></div>
                <div>
                  <span>Последний платёж</span>
                  <strong>{formatDate(paymentDate(issueDate, result.schedule.rows.length))}</strong>
                  {inputs.prepayments.length > 0 && <span className="chip neutral">через {formatTerm(result.schedule.rows.length)}</span>}
                </div>
              </>
            ) : inputs.prepayments.length > 0 && (
              <div><span>Кредит закроется через</span><strong>{formatTerm(result.schedule.rows.length)}</strong></div>
            )}
          </section>

          <section className="card">
            <h2>Гора переплаты</h2>
            <p className="hint">
              Сколько процентов банку выплачено к каждому месяцу. При аннуитете в первые годы большая часть платежа уходит на
              проценты — поэтому гора круче в начале. Льготная ставка в начале делает подножие горы пологим.
              {inputs.prepayments.length > 0 && ' Пунктир — та же гора без досрочных взносов.'}
            </p>
            <OverpaymentChart schedule={result.schedule} baseline={inputs.prepayments.length > 0 ? result.baseline : undefined}
              issueDate={issueDate} />
          </section>

          {loan > 0 && (
            <>
              <FamilyHelpSection plan={profile.help} onChange={(help) => setProfile((p) => ({ ...p, help }))}
                evaluation={helpEval} issueDate={issueDate} targetPayment={scenario.targetPayment}
                onStory={() => setStoryOpen(true)} />
              {helpOk && <DebtRace evaluation={helpOk} currency={currency} issueDate={issueDate} />}
              <HelpTimingSection loan={helpLoan!} noHelp={result.schedule} currency={currency} issueDate={issueDate}
                defaultAmount={helpOk ? helpOk.totalHelp : undefined} equivalents={helpOk?.equivalents} />
            </>
          )}
        </>
      )}

      {profile.scenarios.length > 1 && (
        <ComparisonSection state={state} profile={profile} evaluations={evaluations} currency={currency}
          onToggle={(id) => setProfile((p) => toggleCompared(p, id))}
          onSelect={(id) => {
            setProfile((p) => ({ ...p, activeScenarioId: id }));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }} />
      )}

      {'error' in result ? null : (
        <>
          <section className="card">
            <h2>Куда уходят платежи по годам</h2>
            <YearlyPaymentsChart years={result.years} calendar={issueDate !== undefined} />
          </section>
          <section className="card">
            <h2>График платежей по месяцам</h2>
            <ScheduleTable schedule={result.schedule} currency={currency} issueDate={issueDate} />
          </section>
        </>
      )}

      <LoanSection loans={profile.loans} onChange={(loans) => setProfile((p) => ({ ...p, loans }))} />

      <div id="components">
        <ComponentsSection
          profile={profile}
          highlightIds={highlightIds}
          issueDate={issueDate}
          onProfileChange={setProfile}
          onApartmentCurrency={(id, to) => setState((s) => changeApartmentCurrency(s, id, to))}
          onSelectScenario={(index) => {
            const target = profile.scenarios[index];
            if (target) setProfile((p) => ({ ...p, activeScenarioId: target.id }));
          }}
        />
      </div>

      <SavingsSection
        accounts={profile.accounts}
        fxRates={state.fxRates}
        dealCurrency={currency}
        downPayment={deal.downPayment}
        reserve={inputs.reserve}
        summary={inputs.savings}
        onAccountsChange={(accounts) => setProfile((p) => ({ ...p, accounts }))}
        onRatesChange={(fxRates) => setState((s) => ({ ...s, fxRates }))}
      />

      <ProductsSection
        products={state.products}
        refinancingRatePct={state.refinancingRatePct}
        usedIds={usedProductIds}
        onProductsChange={(products) => setState((s) => {
          const ids = new Set(products.map((p) => p.id));
          return {
            ...s,
            products,
            // Удалённая карточка → сценарии во всех профилях переходят на свою ставку.
            profiles: s.profiles.map((p) => ({
              ...p,
              scenarios: p.scenarios.map((sc) => (sc.productId && !ids.has(sc.productId) ? { ...sc, productId: null } : sc)),
            })),
          };
        })}
        onRefinancingChange={(refinancingRatePct) => setState((s) => ({ ...s, refinancingRatePct }))}
      />
    </main>
    {storyOpen && !('error' in result) && (
      <StoryMode
        scenarioName={scenario.name}
        apartmentName={apartment.name}
        price={deal.price}
        downPayment={deal.downPayment}
        loan={loan}
        currency={currency}
        issueDate={issueDate}
        bankText={product ? product.name : `Своя ставка ${formatPct(solvedManualRate)} годовых`}
        noHelp={result.schedule}
        help={helpOk}
        plan={profile.help}
        onClose={() => setStoryOpen(false)}
      />
    )}
    </FxContext.Provider>
  );
}
