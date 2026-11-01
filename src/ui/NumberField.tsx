interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
}

export function NumberField({ label, value, onChange, step = 1, min = 0 }: Props) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        step={step}
        min={min}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}
