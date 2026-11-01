interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  /** Без видимой подписи (например, в строке таблицы); label остаётся для экранных читалок. */
  bare?: boolean;
}

export function NumberField({ label, value, onChange, step = 1, min = 0, bare = false }: Props) {
  const input = (
    <input
      type="number"
      aria-label={bare ? label : undefined}
      value={Number.isFinite(value) ? value : ''}
      step={step}
      min={min}
      onChange={(e) => onChange(e.target.valueAsNumber)}
    />
  );
  if (bare) return input;
  return (
    <label className="field">
      <span>{label}</span>
      {input}
    </label>
  );
}
