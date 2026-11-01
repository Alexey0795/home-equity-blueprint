import type { FreeVariable } from '../domain';

interface Props {
  value: FreeVariable;
  onChange: (value: FreeVariable) => void;
  /** Ставку в режиме карточки банка подбираем через ставку рефинансирования. */
  rateLabel: string;
}

export function FreeVariablePicker({ value, onChange, rateLabel }: Props) {
  const options: { id: FreeVariable; label: string }[] = [
    { id: 'payment', label: 'Платёж' },
    { id: 'downPayment', label: 'Первый взнос' },
    { id: 'price', label: 'Цену квартиры' },
    { id: 'term', label: 'Срок' },
    { id: 'rate', label: rateLabel },
  ];
  return (
    <div className="free-picker" role="group" aria-label="Что вычисляем">
      <span>Что вычисляем:</span>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} className={value === o.id ? 'active' : ''}
          onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const FREE_VARIABLE_HINTS: Record<FreeVariable, string> = {
  payment: 'Всё задано — считаем ежемесячный платёж.',
  // В остальных режимах «Платёж не больше» сравнивается с самым большим платежом графика (у льготных программ платёж растёт).
  downPayment: 'Какой нужен первый взнос, чтобы самый большой платёж не превышал заданный. Сколько не хватает — в блоке «Сбережения».',
  price: 'Квартиру какой цены можно взять при этом взносе, чтобы самый большой платёж не превышал заданный.',
  term: 'За какой срок самый большой платёж уложится в заданный. Срок округляется вверх до целого месяца.',
  rate: 'При какой ставке сделка сходится. Ставка рефинансирования связана с инфляцией (Нацбанк обычно держит её чуть выше), так что это ориентир, а не прогноз.',
};
