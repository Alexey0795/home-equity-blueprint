import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  addDays,
  costPerDay,
  daysBetween,
  helpAfterPayment,
  helpDelayCurve,
  interestAtDay,
  paymentDate,
  rateForMonth,
  type CalendarDate,
  type Currency,
  type PaymentSchedule,
  type PrepaymentMode,
  type VariableLoanParams,
} from '../domain';
import { useChartColors } from './charts/colors';
import { formatCompact, formatDate, formatMoney, formatTerm } from './format';
import { BigMoney, Money } from './Money';
import { NumberField } from './NumberField';

interface Props {
  /** Кредит сценария как есть (без помощи), со своими досрочными взносами. */
  loan: VariableLoanParams;
  /** Его график — «без помощи». */
  noHelp: PaymentSchedule;
  currency: Currency;
  issueDate: CalendarDate | undefined;
  /** Сумма по умолчанию (если в этом браузере ещё не вводили): все транши помощи родных. */
  defaultAmount?: number;
  /** «Обед в кафе — 20»: в валюте сделки. */
  equivalents?: { name: string; price: number }[];
}

/** «≈ 0,45 обеда в кафе · 1,5 чашки кофе». */
export function equivalentsText(amount: number, equivalents: { name: string; price: number }[]): string {
  const n = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: amount >= 10 ? 0 : 1 });
  return equivalents.map((e) => `${n.format(amount / e.price)} × ${e.name}`).join(' · ');
}

const AMOUNT_KEY = 'home-equity-blueprint/help-amount';
/** Сколько месяцев промедления показывать на графике и ползунке. */
const HORIZON_MONTHS = 36;
const DAYS_PER_MONTH = 365 / 12;

function loadAmount(fallback: number): number {
  try {
    const saved = Number(localStorage.getItem(AMOUNT_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : fallback;
  } catch {
    return fallback;
  }
}

function saveAmount(amount: number): void {
  try {
    localStorage.setItem(AMOUNT_KEY, String(amount));
  } catch {
    // Нет доступа к хранилищу — просто не запоминаем.
  }
}

const fine = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 5, maximumFractionDigits: 5 });

/** Живой счётчик: сколько процентов набежало, пока открыт экран (perDay — цена одного дня). */
export function Ticker({ perDay, currency }: { perDay: number; currency: Currency }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setInterval(() => setSeconds((performance.now() - start) / 1000), reduce ? 1000 : 100);
    return () => window.clearInterval(id);
  }, [perDay]);
  return (
    <span className="ticker">
      {fine.format((perDay / 86_400) * seconds)} {currency}
    </span>
  );
}

/**
 * «Тетрис» месяцев: каждая клетка — платёж, ряд — год. Оранжевая часть — проценты в этом месяце (бледная — сколько
 * было бы без помощи). Зелёные клетки — платежи, которых не будет.
 */
export function MonthGrid({ noHelp, withHelp, helpMonth }: { noHelp: PaymentSchedule; withHelp: PaymentSchedule; helpMonth: number }) {
  const maxInterest = noHelp.rows.reduce((m, r) => Math.max(m, r.interest), 0) || 1;
  const years = Math.ceil(noHelp.rows.length / 12);
  return (
    <div className="month-grid" role="img"
      aria-label={`Платежей без помощи: ${noHelp.rows.length}, с помощью: ${withHelp.rows.length}`}>
      {Array.from({ length: years }, (_, y) => (
        <div className="month-row" key={y}>
          <span className="month-year">{y + 1}</span>
          {Array.from({ length: 12 }, (_, m) => {
            const i = y * 12 + m;
            const base = noHelp.rows[i];
            if (!base) return <span key={m} className="cell empty" />;
            const row = withHelp.rows[i];
            const gone = !row || row.payment < 1e-6;
            const title = gone
              ? `Платёж ${i + 1}: его не будет`
              : `Платёж ${i + 1}: проценты ${formatMoney(row.interest)} (без помощи ${formatMoney(base.interest)})`;
            return (
              <span key={m} className={`cell${gone ? ' gone' : ''}${i + 1 === helpMonth ? ' arrival' : ''}`} title={title}>
                <i className="ghost" style={{ height: `${(base.interest / maxInterest) * 100}%` }} />
                {!gone && <i className="fill" style={{ height: `${(row.interest / maxInterest) * 100}%` }} />}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * «Цена промедления»: дополнительная сумма (помощь на первый взнос) против дня, когда она дойдёт до долга.
 * Расчёт — domain/helpTiming.ts; между датами платежей переплата растёт пропорционально дням.
 */
export function HelpTimingSection({ loan, noHelp, currency, issueDate, defaultAmount, equivalents = [] }: Props) {
  const colors = useChartColors();
  const sectionRef = useRef<HTMLElement>(null);
  const [amount, setAmount] = useState(() => loadAmount(defaultAmount ?? Math.max(1000, Math.round((loan.principal * 0.15) / 1000) * 1000)));
  const [mode, setMode] = useState<PrepaymentMode>('reduceTerm');
  const [delay, setDelay] = useState(30);

  const horizon = Math.max(1, Math.min(HORIZON_MONTHS, noHelp.rows.length - 1));
  const dayOfPayment = (k: number) => (issueDate ? daysBetween(issueDate, paymentDate(issueDate, k)) : Math.round(k * DAYS_PER_MONTH));
  const maxDay = dayOfPayment(horizon);
  const day = Math.min(delay, maxDay);

  const calc = useMemo(() => {
    try {
      const input = { loan, amount, mode };
      const curve = helpDelayCurve(input, horizon, dayOfPayment);
      return { input, curve };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
    // dayOfPayment зависит только от issueDate.
  }, [loan, amount, mode, horizon, issueDate]);

  if ('error' in calc) {
    return (
      <section className="card">
        <h2>Цена промедления</h2>
        <p className="error">{calc.error}</p>
      </section>
    );
  }

  const { curve, input } = calc;
  const without = noHelp.totalInterest;
  const now = curve[0]!;
  const later = interestAtDay(curve, day);
  const perDayNow = costPerDay(curve, 0);
  const perDayLater = costPerDay(curve, day);
  /** Последний платёж, после которого пришла помощь (для «тетриса»). */
  const k = curve.filter((p) => p.day <= day).at(-1)!.payment;
  const withHelp = helpAfterPayment(input, k).schedule;
  const nowSchedule = helpAfterPayment(input, 0).schedule;
  const rate = rateForMonth(loan.rateSteps, 1);
  const simplePerDay = (Math.min(amount, loan.principal) * rate) / 100 / 365;
  const goneMonths = noHelp.rows.length - withHelp.rows.length;
  const goneMoney = noHelp.rows.slice(withHelp.rows.length).reduce((s, r) => s + r.payment, 0);
  const arrival = issueDate ? formatDate(addDays(issueDate, day)) : null;

  const data = curve.map((p) => ({ day: p.day, saved: without - p.totalInterest }));
  const tickDays = curve.filter((p) => p.payment % (horizon > 18 ? 6 : 3) === 0).map((p) => p.day);
  const dayLabel = (d: number) => (issueDate ? formatDate(addDays(issueDate, d)) : `день ${d}`);

  const fullscreen = () => {
    const el = sectionRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <section className="card help-timing" ref={sectionRef}>
      <div className="help-head">
        <h2>Цена промедления</h2>
        {typeof document !== 'undefined' && document.fullscreenEnabled && (
          <button type="button" onClick={fullscreen}>На весь экран</button>
        )}
      </div>
      <p className="hint">
        Что будет, если к первому взносу добавится ещё сумма — и что, если она придёт не сразу, а позже, досрочным взносом.
        Банк начисляет проценты на долг каждый день, поэтому промедление считается по дням.
      </p>

      <div className="fields">
        <NumberField label={`Дополнительная сумма, ${currency}`} value={amount} step={1000} currency={currency}
          onChange={(v) => { setAmount(v); saveAmount(v); }} />
        <label className="field">
          <span>Как её учесть</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as PrepaymentMode)}
            title="Сократить срок — платёж как без помощи, кредит закроется раньше. Уменьшить платёж — срок тот же, платёж меньше.">
            <option value="reduceTerm">Сократить срок</option>
            <option value="reducePayment">Уменьшить платёж</option>
          </select>
        </label>
        <label className="field delay-field">
          <span>
            Деньги придут через <strong>{day}</strong> дн.{arrival && <> — {arrival}</>}
          </span>
          <input type="range" min={0} max={maxDay} step={1} value={day} onChange={(e) => setDelay(Number(e.target.value))}
            aria-label="Через сколько дней после выдачи кредита придёт помощь" />
        </label>
      </div>

      <div className="summary help-summary">
        <div>
          <span>Без помощи</span>
          <strong className="interest"><BigMoney value={without} currency={currency} /></strong>
          <span className="chip neutral">переплата за {formatTerm(noHelp.rows.length)}</span>
        </div>
        <div>
          <span>Помощь в день выдачи</span>
          <strong className="ok"><BigMoney value={without - now.totalInterest} currency={currency} /></strong>
          <span className="chip good">
            экономия · {mode === 'reduceTerm'
              ? `на ${formatTerm(noHelp.rows.length - now.months)} короче`
              : <>платёж меньше на <Money value={noHelp.rows[0]!.payment - nowSchedule.rows[0]!.payment} currency={currency} /></>}
          </span>
        </div>
        <div>
          <span>Помощь через {day} дн.</span>
          <strong className="ok"><BigMoney value={without - later} currency={currency} /></strong>
          <span className={`chip ${day > 0 ? 'bad' : 'neutral'}`}>
            промедление стоит <Money value={later - now.totalInterest} currency={currency} />
          </span>
        </div>
        <div>
          <span>Один день промедления</span>
          <strong className="interest"><BigMoney value={perDayLater} currency={currency} /></strong>
          <span className="chip neutral">месяц ≈ <Money value={perDayLater * DAYS_PER_MONTH} currency={currency} /></span>
          {equivalents.length > 0 && <span className="chip neutral">≈ {equivalentsText(perDayLater, equivalents)}</span>}
        </div>
      </div>

      <p className="ticker-line">
        Пока открыт этот экран, помощь, которая ещё не дошла до долга, обошлась в <Ticker perDay={perDayNow} currency={currency} />.
        Каждый час — <Money value={perDayNow / 24} currency={currency} />.
      </p>

      <h3>Как тает экономия</h3>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" type="number" domain={[0, maxDay]} ticks={tickDays} tickLine={false}
            tickFormatter={(d: number) => (issueDate ? formatDate(addDays(issueDate, d)).slice(3) : `${Math.round(d / DAYS_PER_MONTH)} мес.`)} />
          <YAxis tickFormatter={formatCompact} width={76} domain={[0, 'auto']} />
          <Tooltip formatter={(v) => [formatMoney(Number(v), currency), 'Экономия']} labelFormatter={(d) => dayLabel(Number(d))} />
          <Area type="linear" dataKey="saved" name="Экономия" stroke={colors.prepayment} fill={colors.prepayment}
            fillOpacity={0.25} strokeWidth={2} isAnimationActive={false} />
          <ReferenceLine x={day} stroke={colors.interest} strokeDasharray="4 3" />
          <ReferenceDot x={day} y={without - later} r={6} fill={colors.interest} stroke="none" />
        </AreaChart>
      </ResponsiveContainer>
      <p className="hint">
        По горизонтали — когда придут деньги, по вертикали — сколько процентов они сэкономят. Каждый день кривая ниже.
      </p>

      <h3>Месяцы платежей</h3>
      <MonthGrid noHelp={noHelp} withHelp={withHelp} helpMonth={k + 1} />
      <p className="hint">
        Клетка — один платёж, ряд — год кредита. Оранжевое — проценты в этом месяце (бледное — сколько было бы без помощи).
        {goneMonths > 0 && <> <strong className="ok">Зелёных клеток: {goneMonths}</strong> — платежей на{' '}
          <Money value={goneMoney} currency={currency} />, которых не будет.</>}
      </p>

      <details className="explain">
        <summary>Почему каждый день так дорог — сложный процент простыми словами</summary>
        <p>
          Банк каждый день начисляет проценты на весь долг: ставка × долг / 365. Пока дополнительная сумма не внесена, она тоже
          долг, и на неё капает <Money value={simplePerDay} currency={currency} /> в день (ставка {rate.toLocaleString('ru-RU')}%).
        </p>
        <p>
          Это только верхушка. Когда сумма внесена, проценты на неё больше не начисляются, а платёж{' '}
          {mode === 'reduceTerm' ? 'остаётся прежним — и сэкономленное каждый месяц идёт в погашение долга. ' : 'уменьшается, '}
          На погашенный долг в следующем месяце тоже не начисляются проценты — экономия растёт сама на себя, как вклад
          с ежемесячной капитализацией под ставку кредита. Поэтому полная цена дня
          ({formatMoney(perDayNow, currency)}) {perDayNow > simplePerDay * 1.05 ? 'больше' : 'около'} простых процентов на сумму.
        </p>
        <p className="muted">
          Суммы — в номинальных деньгах, без инфляции; ставка — по условиям сценария на весь срок.
        </p>
      </details>
    </section>
  );
}
