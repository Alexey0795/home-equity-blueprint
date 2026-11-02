import type { Currency } from '../domain';
import { Money } from './Money';

interface Props {
  label: string;
  /** Текст значения (если это не сумма). */
  value?: string;
  /** Сумма — с подсказкой в других валютах. */
  money?: { value: number; currency: Currency };
}

/** Поле, значение которого вычислил решатель: только показывает, редактировать нельзя. */
export function ComputedField({ label, value, money }: Props) {
  return (
    <div className="field computed">
      <span>{label}</span>
      <output aria-label={label}>{money ? <Money value={money.value} currency={money.currency} showCode={false} /> : value}</output>
      <small>вычислено</small>
    </div>
  );
}
