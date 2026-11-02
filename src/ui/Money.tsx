import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { convert, CURRENCIES, type Currency, type FxRates } from '../domain';
import { formatMoney } from './format';

/** Курсы для подсказок «эта сумма в других валютах»; задаются один раз в App. */
export const FxContext = createContext<FxRates | null>(null);

/** Строки подсказки: сумма во всех остальных валютах по ручным курсам. */
export function otherCurrencyLines(value: number, from: Currency, rates: FxRates | null): string[] {
  if (!rates || !Number.isFinite(value)) return [];
  return CURRENCIES.filter((c) => c !== from).map((to) => {
    try {
      return `≈ ${formatMoney(convert(value, from, to, rates), to)}`;
    } catch {
      return `${to}: нет курса`;
    }
  });
}

export function useCurrencyTip(value: number, currency: Currency | undefined): string | undefined {
  const rates = useContext(FxContext);
  if (!currency) return undefined;
  const lines = otherCurrencyLines(value, currency, rates);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/** Плавно «докручивает» число до нового значения (~0,4 с). При «уменьшить движение» в системе — сразу. */
function useAnimatedNumber(target: number, enabled: boolean): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!enabled || reduce || !Number.isFinite(target) || !Number.isFinite(from.current)) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 400);
      const eased = 1 - (1 - t) ** 3;
      const value = begin + (target - begin) * eased;
      from.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);
  return enabled ? shown : target;
}

interface Props {
  value: number;
  currency: Currency;
  /** Анимировать изменение (для крупных итоговых чисел). */
  animate?: boolean;
  /** Показывать код валюты после суммы. */
  showCode?: boolean;
  className?: string;
}

/** Сумма; при наведении (или фокусе с клавиатуры) — она же во всех остальных валютах. */
export function Money({ value, currency, showCode = true, className, animate = false }: Props) {
  const tip = useCurrencyTip(value, currency);
  const shown = useAnimatedNumber(value, animate);
  return (
    <span className={`money${className ? ` ${className}` : ''}`} data-tip={tip} tabIndex={tip ? 0 : undefined}>
      {Number.isFinite(shown) ? formatMoney(shown, showCode ? currency : undefined) : '—'}
    </span>
  );
}

/** Итоговое число: анимированное, со вспышкой при изменении (новый key → CSS-анимация проигрывается заново). */
export function BigMoney({ value, currency }: { value: number; currency: Currency }) {
  return (
    <span key={Math.round(value * 100)} className="flash">
      <Money value={value} currency={currency} animate />
    </span>
  );
}
