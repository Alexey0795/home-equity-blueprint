import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  costPerDay,
  helpDelayCurve,
  paymentDate,
  type CalendarDate,
  type Currency,
  type PaymentSchedule,
} from '../domain';
import type { HelpPlan } from '../state/appState';
import type { HelpEvaluation } from '../state/help';
import { trancheWhen } from './ExtraSumSection';
import { formatMonthYear, formatTerm } from './format';
import { equivalentsText, MonthGrid, Ticker } from './HelpTimingSection';
import { Money } from './Money';

interface Props {
  scenarioName: string;
  apartmentName: string;
  price: number;
  /** Первый взнос сценария (без дополнительной суммы). */
  downPayment: number;
  loan: number;
  currency: Currency;
  issueDate: CalendarDate | undefined;
  /** Строка про банк и ставку: «Беларусбанк, 12% первые 2 года, потом СР + 5». */
  bankText: string;
  noHelp: PaymentSchedule;
  help: HelpEvaluation | null;
  plan: HelpPlan;
  onClose: () => void;
}

const times = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ratioFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** Простая «гора переплаты» на SVG (без Recharts — чтобы печаталась). */
function MiniMountain({ noHelp, withHelp }: { noHelp: PaymentSchedule; withHelp?: PaymentSchedule }) {
  const W = 600;
  const H = 220;
  const months = noHelp.rows.length;
  const max = noHelp.totalInterest || 1;
  const path = (s: PaymentSchedule) => {
    const pts = Array.from({ length: months }, (_, i) => {
      const row = s.rows[i] ?? s.rows.at(-1)!;
      return `${((i + 1) / months) * W},${H - (row.cumulativeInterest / max) * H}`;
    });
    return `M0,${H} L${pts.join(' L')}`;
  };
  const years = Math.floor(months / 12);
  const step = years > 20 ? 5 : years > 10 ? 2 : 1;
  /** Подпись у самого правого края не влезает — её не рисуем. */
  const tickYears = Array.from({ length: Math.floor(years / step) }, (_, i) => (i + 1) * step).filter((y) => (y * 12) / months < 0.97);
  return (
    <svg className="mini-mountain" viewBox={`0 0 ${W} ${H + 22}`} role="img"
      aria-label="Накопленные проценты по месяцам: гора переплаты">
      <path d={`${path(noHelp)} L${W},${H} Z`} className="mm-area" />
      <path d={path(noHelp)} className="mm-line" />
      {withHelp && <path d={path(withHelp)} className="mm-help" />}
      {tickYears.map((y) => (
        <text key={y} x={((y * 12) / months) * W} y={H + 16} className="mm-tick">{y}</text>
      ))}
    </svg>
  );
}

/**
 * «Обзор по шагам»: экран за экраном — квартира, цена кредита, гора переплаты, дополнительная сумма, цена промедления,
 * досрочка или вклад, возврат займа (если задан), итог. Стрелки ← → / пробел, Esc — выход. «Распечатать» — все слайды по одному на страницу.
 */
export function StoryMode(props: Props) {
  const { apartmentName, price, downPayment, loan, currency, issueDate, bankText, noHelp, help, plan, onClose } = props;
  const [index, setIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = (m: number) => (issueDate ? formatMonthYear(paymentDate(issueDate, m)) : `через ${formatTerm(m)}`);

  const saved = help ? help.noHelp.totalInterest - help.withHelp.totalInterest : 0;
  const shorter = help ? help.noHelp.rows.length - help.withHelp.rows.length : 0;
  let perDay = 0;
  if (help) {
    try {
      const curve = helpDelayCurve({ loan: help.loan, amount: help.totalHelp, mode: plan.mode }, 1, (k) => (k * 365) / 12);
      perDay = costPerDay(curve, 0);
    } catch {
      perDay = 0;
    }
  }

  const slides: { title: string; body: ReactNode }[] = [
    {
      title: 'Квартира',
      body: (
        <>
          <p className="story-big"><Money value={price} currency={currency} /></p>
          <p className="story-sub">{apartmentName}</p>
          <ul className="story-list">
            <li>Первый взнос — <Money value={downPayment} currency={currency} /></li>
            <li>Кредит — <strong><Money value={loan} currency={currency} /></strong></li>
            <li>Срок — {formatTerm(noHelp.rows.length)}</li>
            {bankText && <li>{bankText}</li>}
          </ul>
        </>
      ),
    },
    {
      title: 'Сколько стоит кредит',
      body: (
        <>
          <p className="story-sub">Переплата процентами за весь срок</p>
          <p className="story-big interest"><Money value={noHelp.totalInterest} currency={currency} /></p>
          <ul className="story-list">
            <li>Каждый рубль кредита обходится в <strong>{times.format(1 + noHelp.totalInterest / (loan || 1))}</strong> рубля</li>
            <li>Всего банку — <Money value={noHelp.totalPaid} currency={currency} /></li>
          </ul>
        </>
      ),
    },
    {
      title: 'Гора переплаты',
      body: (
        <>
          <MiniMountain noHelp={noHelp} withHelp={help?.withHelp} />
          <p className="story-sub">
            Проценты, выплаченные к каждому году (по горизонтали — годы).
            {help && ' Зелёная линия — с дополнительной суммой: гора ниже и кончается раньше.'}
          </p>
        </>
      ),
    },
  ];

  if (help) {
    slides.push(
      {
        title: 'Дополнительная сумма',
        body: (
          <>
            <ul className="story-list">
              {help.tranches.slice(0, 5).map((t, i) => (
                <li key={i}><Money value={t.amount} currency={currency} /> — {trancheWhen(t.month, issueDate)}</li>
              ))}
              {help.tranches.length > 5 && <li>и ещё {help.tranches.length - 5} взносов, всего <Money value={help.totalHelp} currency={currency} /></li>}
            </ul>
            <p className="story-sub">Процентов банку меньше на</p>
            <p className="story-big ok"><Money value={saved} currency={currency} /></p>
            {shorter > 0 && <p className="story-sub">Кредит короче на <strong>{formatTerm(shorter)}</strong></p>}
            {help.rent && (
              <p className="story-sub">
                Покупка раньше на <strong>{formatTerm(help.rent.months)}</strong> — аренды меньше на{' '}
                <strong><Money value={help.rent.rent} currency={currency} /></strong>
              </p>
            )}
            <MonthGrid noHelp={help.noHelp} withHelp={help.withHelp} helpMonth={-1} />
            <p className="story-note">Клетка — платёж, ряд — год. Зелёные клетки — платежи, которых не будет.</p>
          </>
        ),
      },
      {
        title: 'Цена промедления',
        body: (
          <>
            <p className="story-sub">Пока сумма не внесена в долг, на неё начисляются проценты. Один день стоит</p>
            <p className="story-big interest"><Money value={perDay} currency={currency} /></p>
            <ul className="story-list">
              <li>Месяц — <Money value={(perDay * 365) / 12} currency={currency} /></li>
              {help.equivalents.length > 0 && <li>День — это {equivalentsText(perDay, help.equivalents)}</li>}
              <li>За время этого экрана — <Ticker perDay={perDay} currency={currency} /></li>
            </ul>
          </>
        ),
      },
      {
        title: 'Досрочка или вклад',
        body: (
          <>
            <p className="story-sub">Та же сумма к {label(help.compareMonth)}:</p>
            <div className="story-totals">
              <div>
                <span>На вкладе под {plan.depositRatePct.toLocaleString('ru-RU')}%</span>
                <strong><Money value={help.alternatives.deposit.nominal} currency={currency} /></strong>
              </div>
              <div>
                <span>В ипотеке (освободившиеся деньги — на тот же вклад)</span>
                <strong className="ok"><Money value={help.mortgage.nominal} currency={currency} /></strong>
              </div>
            </div>
            <p className="story-note">
              В сегодняшних деньгах при инфляции {plan.inflationPct.toLocaleString('ru-RU')}% в год: вклад ≈{' '}
              <Money value={help.alternatives.deposit.today} currency={currency} />, ипотека ≈{' '}
              <Money value={help.mortgage.today} currency={currency} />, наличные ≈{' '}
              <Money value={help.alternatives.home.today} currency={currency} />.
            </p>
          </>
        ),
      },
    );
    if (help.privateLoan) {
      const pl = help.privateLoan;
      slides.push({
        title: 'Возврат займа',
        body: (
          <>
            <ul className="story-list">
              <li>{plan.ratePct > 0 ? `Ставка ${plan.ratePct.toLocaleString('ru-RU')}% годовых` : 'Без процентов'}</li>
              {plan.graceMonths > 0 && <li>Отсрочка — {formatTerm(plan.graceMonths)}</li>}
              {pl.firstPaymentMonth !== null && (
                <li>С {label(pl.firstPaymentMonth)} — <Money value={pl.rows[pl.firstPaymentMonth - 1]!.payment} currency={currency} /> в месяц</li>
              )}
              {pl.lastPaymentMonth !== null && <li>Последний платёж — {label(pl.lastPaymentMonth)}</li>}
            </ul>
            <p className="story-sub">Всего к возврату</p>
            <p className="story-big"><Money value={pl.totalReturned} currency={currency} /></p>
            {help.real && (
              <p className="story-note">
                В сегодняшних деньгах при инфляции {plan.inflationPct.toLocaleString('ru-RU')}% — ≈{' '}
                <Money value={help.real.returned} currency={currency} />.
              </p>
            )}
          </>
        ),
      });
    }
    slides.push({
      title: 'Итог',
      body: (
        <div className="story-totals">
          <div><span>Процентов банку меньше на</span><strong className="ok"><Money value={saved} currency={currency} /></strong></div>
          {help.rent && <div><span>Аренды меньше на</span><strong className="ok"><Money value={help.rent.rent} currency={currency} /></strong></div>}
          {shorter > 0 && <div><span>Кредит короче на</span><strong>{formatTerm(shorter)}</strong></div>}
          <div>
            <span>К {label(help.compareMonth)} сумма в ипотеке даёт против вклада под {plan.depositRatePct.toLocaleString('ru-RU')}%</span>
            <strong>×{ratioFormat.format(help.mortgage.nominal / (help.alternatives.deposit.nominal || 1))}</strong>
          </div>
        </div>
      ),
    });
  } else {
    slides.push({
      title: 'Дополнительная сумма',
      body: <p className="story-sub">Добавьте транши в блоке «Дополнительная сумма к взносу» — здесь появятся экономия, цена промедления и сравнение с вкладом.</p>,
    });
  }

  const last = slides.length - 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); setIndex((i) => Math.min(last, i + 1)); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [last, onClose]);

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  return (
    <div className="story" ref={rootRef} role="dialog" aria-modal="true" aria-label="Обзор по шагам">
      <div className="story-slides">
        {slides.map((s, i) => (
          <article key={s.title} className={`story-slide${i === index ? ' current' : ''}`} aria-hidden={i !== index}>
            <p className="story-step">{i + 1} / {slides.length}</p>
            <h2>{s.title}</h2>
            {s.body}
          </article>
        ))}
      </div>
      <nav className="story-nav">
        <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>← Назад</button>
        <div className="story-dots">
          {slides.map((s, i) => (
            <button key={s.title} type="button" className={i === index ? 'on' : ''} aria-label={`Слайд ${i + 1}: ${s.title}`}
              onClick={() => setIndex(i)} />
          ))}
        </div>
        <button type="button" className="primary" onClick={() => setIndex((i) => Math.min(last, i + 1))} disabled={index === last}>
          Далее →
        </button>
        <span className="story-tools">
          {document.fullscreenEnabled && <button type="button" onClick={fullscreen}>На весь экран</button>}
          <button type="button" onClick={() => window.print()}>Распечатать</button>
          <button type="button" onClick={onClose} aria-label="Закрыть обзор">✕</button>
        </span>
      </nav>
    </div>
  );
}
