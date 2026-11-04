import { useEffect, useRef, useState } from 'react';
import { paymentDate, type CalendarDate, type Currency } from '../domain';
import type { HelpEvaluation } from '../state/help';
import { formatMonthYear, formatTerm } from './format';
import { Money } from './Money';

interface Props {
  evaluation: HelpEvaluation;
  currency: Currency;
  issueDate: CalendarDate | undefined;
}

/** Сколько секунд идёт вся гонка. */
const DURATION_S = 12;

interface Lane {
  key: string;
  name: string;
  className: string;
  /** Остаток на конец месяца m (m = 0 — сразу после выдачи). */
  balance: (m: number) => number;
  /** Месяц последнего платежа. */
  end: number;
}

/**
 * «Гонка долгов»: остаток долга банку без помощи, с помощью и долг родным — полосками, которые тают месяц за месяцем.
 * Кнопка «Старт» прокручивает весь срок за DURATION_S секунд; ползунок — вручную.
 */
export function DebtRace({ evaluation, currency, issueDate }: Props) {
  const { noHelp, withHelp, family, loan, tranches } = evaluation;
  const atStart = tranches.filter((t) => t.month === 0).reduce((s, t) => s + t.amount, 0);
  const lanes: Lane[] = [
    { key: 'no', name: 'Банку — без помощи', className: 'lane-nohelp', end: noHelp.rows.length,
      balance: (m) => (m === 0 ? loan.principal : noHelp.rows[m - 1]?.balance ?? 0) },
    { key: 'with', name: 'Банку — с помощью', className: 'lane-help', end: withHelp.rows.length,
      balance: (m) => (m === 0 ? Math.max(0, loan.principal - atStart) : withHelp.rows[m - 1]?.balance ?? 0) },
    { key: 'family', name: 'Родным', className: 'lane-family', end: family.lastPaymentMonth ?? 0,
      balance: (m) => (m === 0 ? atStart : family.rows[m - 1]?.balance ?? 0) },
  ];
  const total = Math.max(...lanes.map((l) => l.end), 1);
  const scale = loan.principal || 1;

  const [month, setMonth] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setMonth(total);
      setPlaying(false);
      return;
    }
    const startMonth = month >= total ? 0 : month;
    const start = performance.now();
    const tick = (now: number) => {
      const m = Math.min(total, startMonth + ((now - start) / 1000) * (total / DURATION_S));
      setMonth(m);
      if (m < total) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // Запуск только по кнопке; month читается один раз при старте.
  }, [playing, total]);

  const m = Math.floor(month);
  const when = m === 0
    ? 'выдача кредита'
    : issueDate ? formatMonthYear(paymentDate(issueDate, m)) : `${formatTerm(m)} от выдачи`;

  return (
    <section className="card race">
      <div className="help-head">
        <h2>Гонка долгов</h2>
        <button type="button" className="primary" onClick={() => setPlaying((p) => !p)}>
          {playing ? '❚❚ Пауза' : month >= total ? '↺ Ещё раз' : '▶ Старт'}
        </button>
      </div>
      <p className="hint">Остаток долга месяц за месяцем. Помощь родных делает синюю полоску короче — и банк отстаёт.</p>
      <div className="race-clock" aria-live="off">{when}</div>
      <div className="race-lanes">
        {lanes.filter((l) => l.end > 0 || l.key !== 'family').map((lane) => {
          const value = lane.balance(Math.min(m, lane.end));
          const done = m >= lane.end;
          return (
            <div className={`race-lane ${lane.className}${done ? ' done' : ''}`} key={lane.key}>
              <div className="race-label">
                <span>{lane.name}</span>
                <span>
                  {done
                    ? <>✓ закрыт: {issueDate ? formatMonthYear(paymentDate(issueDate, lane.end)) : `через ${formatTerm(lane.end)}`}</>
                    : <Money value={value} currency={currency} />}
                </span>
              </div>
              <div className="race-track"><div className="race-bar" style={{ width: `${(value / scale) * 100}%` }} /></div>
            </div>
          );
        })}
      </div>
      <input type="range" min={0} max={total} step={1} value={m} aria-label="Месяц от выдачи кредита"
        onChange={(e) => { setPlaying(false); setMonth(Number(e.target.value)); }} />
    </section>
  );
}
