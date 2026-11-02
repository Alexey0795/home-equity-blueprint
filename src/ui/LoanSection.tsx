import { useMemo } from 'react';
import {
  parseIsoDate,
  paymentDate,
  runJournal,
  scheduledPaymentDates,
  toIsoDate,
  type Currency,
  type DayCount,
  type JournalResult,
  type PrepaymentMode,
} from '../domain';
import { journalInputs, loanTerms, newLoan, newLoanEvent, type LoanEvent, type RealLoan } from '../state/loans';
import { LoanChart } from './charts/LoanChart';
import { CurrencySelect } from './CurrencySelect';
import { formatDate, formatMonthYear, formatTerm } from './format';
import { BigMoney, Money } from './Money';
import { NumberField } from './NumberField';

/** Сегодня по часам компьютера, «ГГГГ-ММ-ДД». */
export function todayIso(): string {
  const now = new Date();
  return toIsoDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

const KIND_LABEL: Record<LoanEvent['kind'], string> = { payment: 'Платёж', prepayment: 'Досрочный взнос', rate: 'Смена ставки' };
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Props {
  loans: RealLoan[];
  onChange: (loans: RealLoan[]) => void;
}

/** Хроника реальных кредитов профиля: параметры, журнал событий, факт и прогноз переплаты. */
export function LoanSection({ loans, onChange }: Props) {
  const update = (id: string, patch: (l: RealLoan) => RealLoan) => onChange(loans.map((l) => (l.id === id ? patch(l) : l)));
  return (
    <section className="card" id="loans">
      <h2>Хроника реального кредита</h2>
      <p className="hint">
        Когда кредит взят — вносите сюда фактические платежи, досрочные взносы и смены ставки. Проценты считаются
        по фактическим дням, как в банке, и видно, сколько переплачено на самом деле и сколько ещё предстоит.
      </p>
      {loans.map((loan) => (
        <LoanCard key={loan.id} loan={loan} onChange={(patch) => update(loan.id, patch)}
          onDelete={() => {
            if (window.confirm(`Удалить кредит «${loan.name}» вместе с журналом?`)) onChange(loans.filter((l) => l.id !== loan.id));
          }} />
      ))}
      <button type="button" onClick={() => onChange([...loans, newLoan(todayIso())])}>+ Кредит на учёт</button>
    </section>
  );
}

function LoanCard({ loan, onChange, onDelete }: { loan: RealLoan; onChange: (patch: (l: RealLoan) => RealLoan) => void; onDelete: () => void }) {
  const c = loan.currency;
  const set = (patch: Partial<RealLoan>) => onChange((l) => ({ ...l, ...patch }));
  const setEvent = (id: string, patch: Partial<LoanEvent>) =>
    onChange((l) => ({ ...l, events: l.events.map((e) => (e.id === id ? ({ ...e, ...patch } as LoanEvent) : e)) }));
  const addEvents = (events: LoanEvent[]) => onChange((l) => ({ ...l, events: [...l.events, ...events] }));

  const run = useMemo((): JournalResult | { error: string } => {
    try {
      return runJournal(loanTerms(loan), journalInputs(loan));
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [loan]);
  const ok = !('error' in run);

  /** Плановые даты после последнего события — для «+ Платёж» и «заполнить по сегодня». */
  const lastDate = ok ? run.lastDate : loan.issueDate;
  const futureDates = (until: string) => {
    try {
      return scheduledPaymentDates(loan.issueDate, loan.termMonths, until).filter((d) => d > lastDate);
    } catch {
      return [];
    }
  };
  const nextDate = futureDates('9999-12-31')[0] ?? todayIso();
  const plannedAmount = ok ? round2(run.scheduledPayment) : 0;

  const rowByIndex = new Map(ok ? run.rows.map((r) => [r.index, r]) : []);
  const ordered = ok ? run.rows.map((r) => loan.events[r.index]!) : loan.events;

  return (
    <div className="loan">
      <div className="fields">
        <label className="field"><span>Название</span>
          <input type="text" value={loan.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field"><span>Валюта</span>
          <CurrencySelect label="Валюта кредита" value={c} onChange={(currency: Currency) => set({ currency })} /></label>
        <label className="field"><span>Дата выдачи</span>
          <input type="date" value={loan.issueDate} onChange={(e) => set({ issueDate: e.target.value })} /></label>
        <NumberField label={`Сумма кредита, ${c}`} value={loan.principal} step={1000} currency={c} onChange={(principal) => set({ principal })} />
        <NumberField label="Ставка, % годовых" value={loan.annualRatePct} step={0.1} onChange={(annualRatePct) => set({ annualRatePct })} />
        <NumberField label="Срок по договору, лет" value={Math.round((loan.termMonths / 12) * 100) / 100} step={1} min={0.5}
          onChange={(years) => set({ termMonths: Math.round(years * 12) })} />
        <label className="field"><span>График платежей</span>
          <select aria-label="График платежей по договору" value={loan.repayment}
            onChange={(e) => set({ repayment: e.target.value as RealLoan['repayment'] })}>
            <option value="annuity">Аннуитет</option>
            <option value="differentiated">Дифференцированный</option>
          </select></label>
        <NumberField label="Только проценты, мес." value={loan.interestOnlyMonths} step={1}
          onChange={(v) => set({ interestOnlyMonths: Number.isFinite(v) ? Math.round(v) : 0 })} />
        <label className="field"><span>Как банк считает дни</span>
          <select aria-label="Как банк считает дни" value={loan.dayCount} onChange={(e) => set({ dayCount: e.target.value as DayCount })}>
            <option value="actual365">Факт. дни / 365</option>
            <option value="actualActual">Факт. дни / 365 или 366</option>
          </select></label>
      </div>
      <p className="hint">
        Способ счёта дней — в договоре (раздел о процентах). Не уверены — впишите в пару платежей разбивку из выписки
        банка: если расхождение больше копейки-двух, попробуйте другой способ.
      </p>

      {ok ? <LoanSummary loan={loan} result={run} /> : <p className="error">{run.error}</p>}

      <h3>Журнал</h3>
      {ordered.length > 0 && (
        <div className="table-wrap">
          <table className="journal">
            <thead>
              <tr><th>Дата · событие</th><th>Сумма, {c}</th><th title="Для платежа — разбивка из выписки банка, если есть">Подробности · выписка банка</th><th>Проценты</th><th>В долг</th><th>Остаток</th><th /></tr>
            </thead>
            <tbody>
              {ordered.map((e, i) => {
                const r = ok ? rowByIndex.get(loan.events.indexOf(e)) : undefined;
                return (
                  <tr key={e.id} className={`ev-${e.kind}`}>
                    <td className="when">
                      <input type="date" aria-label={`Событие ${i + 1}: дата`} value={e.date} onChange={(x) => setEvent(e.id, { date: x.target.value })} />
                      <small className="kind">{KIND_LABEL[e.kind]}</small>
                    </td>
                    <td>{e.kind === 'rate' ? '—' : (
                      <NumberField bare label={`Событие ${i + 1}: сумма`} value={e.amount} step={100} currency={c}
                        onChange={(amount) => setEvent(e.id, { amount })} />
                    )}</td>
                    <td className="details">
                      {e.kind === 'payment' && (
                        <div className="statement">
                          <NumberField bare label={`Событие ${i + 1}: проценты по выписке`} value={e.statementInterest ?? Number.NaN} step={1}
                            placeholder="проценты"
                            onChange={(v) => setEvent(e.id, { statementInterest: Number.isFinite(v) ? v : null })} />
                          <NumberField bare label={`Событие ${i + 1}: долг по выписке`} value={e.statementPrincipal ?? Number.NaN} step={1}
                            placeholder="долг"
                            onChange={(v) => setEvent(e.id, { statementPrincipal: Number.isFinite(v) ? v : null })} />
                        </div>
                      )}
                      {e.kind === 'prepayment' && (
                        <select aria-label={`Событие ${i + 1}: что уменьшаем`} value={e.mode}
                          onChange={(x) => setEvent(e.id, { mode: x.target.value as PrepaymentMode })}>
                          <option value="reduceTerm">Сократить срок</option>
                          <option value="reducePayment">Уменьшить платёж</option>
                        </select>
                      )}
                      {e.kind === 'rate' && (
                        <NumberField bare label={`Событие ${i + 1}: новая ставка, %`} value={e.annualRatePct} step={0.25}
                          onChange={(annualRatePct) => setEvent(e.id, { annualRatePct })} />
                      )}
                    </td>
                    <td>
                      {r && r.interestPaid > 0 && <Money value={r.interestPaid} currency={c} showCode={false} />}
                      {r && r.discrepancy !== null && Math.abs(r.discrepancy) >= 0.01 && (
                        <span className={`chip ${Math.abs(r.discrepancy) <= 0.05 ? 'neutral' : 'bad'}`}
                          title="Проценты по выписке минус наш расчёт">
                          {r.discrepancy > 0 ? '+' : '−'}{Math.abs(r.discrepancy).toFixed(2).replace('.', ',')}
                        </span>
                      )}
                    </td>
                    <td>{r && r.principalPaid > 0 && <Money value={r.principalPaid} currency={c} showCode={false} />}</td>
                    <td>{r && <Money value={r.balance} currency={c} showCode={false} />}</td>
                    <td><button type="button" className="icon" aria-label={`Удалить событие ${i + 1}`}
                      onClick={() => onChange((l) => ({ ...l, events: l.events.filter((x) => x.id !== e.id) }))}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="loan-actions">
        <button type="button" onClick={() => addEvents([newLoanEvent('payment', nextDate, plannedAmount)])}>+ Платёж</button>
        <button type="button" onClick={() => addEvents([newLoanEvent('prepayment', todayIso(), 10_000)])}>+ Досрочный взнос</button>
        <button type="button" onClick={() => addEvents([{ ...newLoanEvent('rate', todayIso()), annualRatePct: ok ? run.ratePct : loan.annualRatePct } as LoanEvent])}>
          + Смена ставки
        </button>
        <button type="button" disabled={!ok || futureDates(todayIso()).length === 0}
          title="Добавит плановые платежи с последнего события по сегодня — потом поправьте суммы по выписке"
          onClick={() => addEvents(futureDates(todayIso()).map((d) => newLoanEvent('payment', d, plannedAmount)))}>
          Заполнить плановыми платежами по сегодня
        </button>
        <button type="button" onClick={onDelete}>Удалить кредит</button>
      </div>
    </div>
  );
}

function LoanSummary({ loan, result }: { loan: RealLoan; result: JournalResult }) {
  const c = loan.currency;
  const forecastInterest = result.forecast?.totalInterest ?? 0;
  const totalInterest = result.interestPaid + forecastInterest;
  const saved = result.contract.totalInterest - totalInterest;
  const lastMonth = result.forecast ? result.forecastFromMonth - 1 + result.forecast.rows.length : undefined;
  const issue = parseIsoDate(loan.issueDate);
  const endLabel = lastMonth !== undefined ? formatMonthYear(paymentDate(issue, lastMonth)) : 'погашен';
  return (
    <>
      <div className="summary loan-summary">
        <div><span>На {formatDate(parseIsoDate(result.lastDate))} выплачено</span><strong><BigMoney value={result.totalPaid} currency={c} /></strong></div>
        <div><span>Из них проценты — переплата по факту</span><strong className="interest"><BigMoney value={result.interestPaid} currency={c} /></strong></div>
        <div><span>Остаток долга</span><strong><BigMoney value={result.balance} currency={c} /></strong>
          {result.unpaidInterest > 0 && <span className="chip neutral">+ начислено процентов <Money value={result.unpaidInterest} currency={c} /></span>}
        </div>
        <div><span>Ставка сейчас · плановый платёж</span><strong>{String(result.ratePct).replace('.', ',')}% · <Money value={result.scheduledPayment} currency={c} /></strong></div>
      </div>
      <div className="summary loan-summary forecast">
        <div><span>Прогноз: ещё процентов</span><strong><Money value={forecastInterest} currency={c} /></strong>
          {lastMonth !== undefined && <span className="chip neutral">до {endLabel}, {formatTerm(result.forecast!.rows.length)}</span>}
        </div>
        <div><span>Итог переплаты ≈</span><strong className="interest"><Money value={totalInterest} currency={c} /></strong></div>
        <div><span>По договору без досрочки было бы</span><strong><Money value={result.contract.totalInterest} currency={c} /></strong></div>
        <div><span>Экономия ≈</span><strong className={saved >= 0 ? 'ok' : 'interest'}><Money value={saved} currency={c} /></strong></div>
      </div>
      <p className="hint">
        Прогноз — оставшиеся платежи по текущей ставке (ставка / 12), без будущих досрочек; фактическая часть — по дням.
        Поэтому «экономия» — ориентир, точная переплата станет известна по мере ввода платежей.
      </p>
      <LoanChart issueDate={loan.issueDate} result={result} />
    </>
  );
}
