/** Поле, значение которого вычислил решатель: только показывает, редактировать нельзя. */
export function ComputedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="field computed">
      <span>{label}</span>
      <output aria-label={label}>{value}</output>
      <small>вычислено</small>
    </div>
  );
}
