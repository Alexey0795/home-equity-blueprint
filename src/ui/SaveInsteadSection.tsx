import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addMonths, convert, saveUntilPrice, type CalendarDate, type Currency, type FxRates, type PaymentSchedule } from '../domain';
import type { SavePlan } from '../state/appState';
import { useChartColors } from './charts/colors';
import { CurrencySelect } from './CurrencySelect';
import { formatCompact, formatMoney, formatMonthYear, formatTerm } from './format';
import { BigMoney, Money } from './Money';
import { NumberField } from './NumberField';

interface Props {
  plan: SavePlan;
  onChange: (plan: SavePlan) => void;
  /** Выбранный сценарий: цена, первый взнос и график — с ними сравниваем. */
  price: number;
  downPayment: number;
  schedule: PaymentSchedule;
  currency: Currency;
  fxRates: FxRates;
  issueDate: CalendarDate | undefined;
}

/** «через 3 года 2 мес.» или «сразу». */
const after = (months: number) => (months === 0 ? 'сразу' : `через ${formatTerm(months)}`);

/**
 * Ракурс «Копить»: не брать кредит, а откладывать на вклад, пока не хватит на квартиру (цена при этом растёт).
 * Сравнение с выбранным ипотечным сценарием: когда переезд, когда без долга и сколько ушло сверх сегодняшней цены.
 */
export function SaveInsteadSection({ plan, onChange, price, downPayment, schedule, currency, fxRates, issueDate }: Props) {
  const colors = useChartColors();
  const set = (patch: Partial<SavePlan>) => onChange({ ...plan, ...patch });
  /** Средний платёж за весь срок: у льготных и дифференцированных графиков первый платёж нетипичен. */
  const averagePayment = schedule.rows.length > 0 ? schedule.rows.reduce((sum, r) => sum + r.payment, 0) / schedule.rows.length : 0;

  let body;
  try {
    const conv = (n: number) => convert(n, plan.currency, currency, fxRates);
    const start = Number.isFinite(plan.start) ? conv(plan.start) : downPayment;
    const monthly = Number.isFinite(plan.monthly) ? conv(plan.monthly) : averagePayment;
    const rent = Number.isFinite(plan.rentPerMonth) ? conv(plan.rentPerMonth) : 0;
    const r = saveUntilPrice({ start, monthly, depositRatePct: plan.depositRatePct, price, priceGrowthPct: plan.priceGrowthPct, rentPerMonth: rent });
    const m = r.purchaseMonth;
    const growth = r.priceAtPurchase - price;
    const saveCost = r.rentTotal + growth - r.depositInterest;
    const mortgageCost = schedule.totalInterest;
    const when = (months: number) => (issueDate ? formatMonthYear(addMonths(issueDate, months)) : after(months));
    const step = Math.max(1, Math.ceil(r.rows.length / 240));
    const data = r.rows.filter((row) => row.month % step === 0 || row.month === r.rows.length - 1);

    body = (
      <>
        <p className="hint">
          Сравнение при одинаковом бюджете: <Money value={monthly} currency={currency} /> в месяц — в банк (в среднем за срок)
          или на вклад. Аренда, пока копишь, — сверху.
        </p>
        {m === null ? (
          <p className="error">Не накопить и за 100 лет: цена растёт быстрее, чем вклад. Увеличьте взнос или ставку.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="placement">
                <thead>
                  <tr><th /><th>Ипотека (сценарий)</th><th>Копить на вкладе</th></tr>
                </thead>
                <tbody>
                  <tr><td>Переезд в свою квартиру</td><td>сразу</td><td>{when(m)}</td></tr>
                  <tr><td>Квартира без долга</td><td>{when(schedule.rows.length)}</td><td>{when(m)}</td></tr>
                  <tr><td>Проценты банку</td><td><Money value={mortgageCost} currency={currency} showCode={false} /></td><td>—</td></tr>
                  <tr><td>Аренда до переезда</td><td>—</td><td><Money value={r.rentTotal} currency={currency} showCode={false} /></td></tr>
                  <tr><td>Квартира подорожала</td><td>—</td><td><Money value={growth} currency={currency} showCode={false} /></td></tr>
                  <tr><td>Доход вклада</td><td>—</td><td>−<Money value={r.depositInterest} currency={currency} showCode={false} /></td></tr>
                  <tr className="placement-mortgage">
                    <td>Ушло сверх сегодняшней цены</td>
                    <td><strong><Money value={mortgageCost} currency={currency} /></strong></td>
                    <td><strong><Money value={saveCost} currency={currency} /></strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="summary help-summary">
              <div>
                <span>Выгоднее</span>
                <strong className="ok">{saveCost < mortgageCost ? 'копить' : 'ипотека'}</strong>
                <span className="chip neutral">разница <Money value={Math.abs(mortgageCost - saveCost)} currency={currency} /></span>
              </div>
              <div>
                <span>Цена ожидания</span>
                <strong><BigMoney value={r.rentTotal + growth} currency={currency} /></strong>
                <span className="chip neutral">аренда и рост цены за {formatTerm(m)}</span>
              </div>
            </div>
          </>
        )}
        <h3>Вклад догоняет цену</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" type="number" domain={[0, 'dataMax']} tickLine={false}
              tickFormatter={(v: number) => (issueDate ? String(addMonths(issueDate, v).year) : `${Math.round(v / 12)} г.`)} />
            <YAxis tickFormatter={formatCompact} width={76} />
            <Tooltip formatter={(v) => formatMoney(Number(v), currency)}
              labelFormatter={(v) => (issueDate ? formatMonthYear(addMonths(issueDate, Number(v))) : `Месяц ${String(v)}`)} />
            <Legend itemSorter={null} />
            <Line type="monotone" dataKey="deposit" name="На вкладе" stroke={colors.prepayment} dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="price" name="Цена квартиры" stroke={colors.interest} dot={false} strokeWidth={2} isAnimationActive={false} />
            {m !== null && <ReferenceLine x={m} stroke={colors.balance} strokeDasharray="4 3" />}
          </LineChart>
        </ResponsiveContainer>
        <p className="hint">Без роста цены копить почти всегда дешевле; с ростом цены и арендой — не обязательно. Поэтому рост цены — отдельное поле.</p>
      </>
    );
  } catch (e) {
    body = <p className="error">{e instanceof Error ? e.message : String(e)}</p>;
  }

  return (
    <section className="card">
      <h2>Копить вместо кредита</h2>
      <p className="hint">Покупка позже, зато без процентов банку. Пустые поля берутся из выбранного сценария.</p>
      <div className="fields">
        <label className="field">
          <span>Валюта полей</span>
          <CurrencySelect label="Валюта полей" value={plan.currency} onChange={(c) => set({ currency: c })} />
        </label>
        <NumberField label={`Есть сразу, ${plan.currency}`} value={plan.start} step={1000} currency={plan.currency}
          placeholder={`как первый взнос: ${formatMoney(downPayment)}`} onChange={(start) => set({ start })} />
        <NumberField label={`Откладываю в месяц, ${plan.currency}`} value={plan.monthly} step={100} currency={plan.currency}
          placeholder={`как средний платёж: ${formatMoney(averagePayment)}`} onChange={(monthly) => set({ monthly })} />
        <NumberField label="Вклад, % годовых" value={plan.depositRatePct} step={0.5} onChange={(depositRatePct) => set({ depositRatePct })} />
        <NumberField label="Рост цены квартиры, % в год" value={plan.priceGrowthPct} step={0.5} min={-99}
          onChange={(priceGrowthPct) => set({ priceGrowthPct })} />
        <NumberField label={`Аренда, пока коплю, ${plan.currency} в мес.`} value={plan.rentPerMonth} step={50} currency={plan.currency}
          placeholder="не задано" onChange={(rentPerMonth) => set({ rentPerMonth })} />
      </div>
      {body}
    </section>
  );
}
