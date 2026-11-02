import { useState, type KeyboardEvent } from 'react';
import type { Currency } from '../domain';
import { formatNumberInput, parseNumberInput } from './format';
import { useCurrencyTip } from './Money';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  /** Без видимой подписи (например, в строке таблицы); label остаётся для экранных читалок. */
  bare?: boolean;
  /** Если поле — сумма в валюте: при наведении подсказка с другими валютами. */
  currency?: Currency;
}

/**
 * Числовое поле с разрядами: «300 000», «9,25». Понимает пробелы, запятую и точку.
 * Пока поле в фокусе, текст не переформатируется (не прыгает курсор); при уходе — снова с разрядами.
 * Стрелки ↑/↓ меняют значение на шаг.
 */
export function NumberField({ label, value, onChange, step = 1, min = 0, bare = false, currency }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const tip = useCurrencyTip(value, currency);
  const text = draft ?? formatNumberInput(value);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const base = Number.isFinite(value) ? value : 0;
    const next = Math.max(min, Math.round((base + (e.key === 'ArrowUp' ? step : -step)) * 1e6) / 1e6);
    setDraft(formatNumberInput(next));
    onChange(next);
  }

  const input = (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={bare ? label : undefined}
      value={text}
      onFocus={() => setDraft(formatNumberInput(value))}
      onBlur={() => setDraft(null)}
      onKeyDown={onKeyDown}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(parseNumberInput(e.target.value));
      }}
    />
  );
  if (bare) return <span className="money-input" data-tip={tip}>{input}</span>;
  return (
    <label className="field" data-tip={tip}>
      <span>{label}</span>
      {input}
    </label>
  );
}
