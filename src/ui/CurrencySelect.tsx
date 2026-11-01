import { CURRENCIES, type Currency } from '../domain';

interface Props {
  value: Currency;
  onChange: (value: Currency) => void;
  label: string;
}

export function CurrencySelect({ value, onChange, label }: Props) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Currency)}>
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}
