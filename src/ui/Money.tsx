import { createContext, useContext } from 'react';
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

interface Props {
  value: number;
  currency: Currency;
  /** Показывать код валюты после суммы. */
  showCode?: boolean;
  className?: string;
}

/** Сумма; при наведении (или фокусе с клавиатуры) — она же во всех остальных валютах. */
export function Money({ value, currency, showCode = true, className }: Props) {
  const tip = useCurrencyTip(value, currency);
  return (
    <span className={`money${className ? ` ${className}` : ''}`} data-tip={tip} tabIndex={tip ? 0 : undefined}>
      {Number.isFinite(value) ? formatMoney(value, showCode ? currency : undefined) : '—'}
    </span>
  );
}
