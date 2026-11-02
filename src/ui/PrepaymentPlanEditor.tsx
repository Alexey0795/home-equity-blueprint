import type { PrepaymentMode } from '../domain';
import { newPrepayment, newRecurring, type Prepayment, type PrepaymentPlanComponent, type Recurring } from '../state/appState';
import { NumberField } from './NumberField';

interface Props {
  plan: PrepaymentPlanComponent;
  onChange: (plan: PrepaymentPlanComponent) => void;
}

function ModeSelect({ value, label, onChange }: { value: PrepaymentMode; label: string; onChange: (m: PrepaymentMode) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as PrepaymentMode)}>
      <option value="reduceTerm">Сократить срок</option>
      <option value="reducePayment">Уменьшить платёж</option>
    </select>
  );
}

/** Разовые и повторяющиеся досрочные взносы плана. Суммы — в валюте плана. */
export function PrepaymentPlanEditor({ plan, onChange }: Props) {
  const c = plan.currency;
  const setOneOff = (oneOff: Prepayment[]) => onChange({ ...plan, oneOff });
  const setRecurring = (recurring: Recurring[]) => onChange({ ...plan, recurring });
  const updOne = (id: string, patch: Partial<Prepayment>) => setOneOff(plan.oneOff.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const updRec = (id: string, patch: Partial<Recurring>) =>
    setRecurring(plan.recurring.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const sorted = [...plan.oneOff].sort((a, b) => a.month - b.month);

  return (
    <div className="plan-editor">
      <h4>Разовые взносы</h4>
      {sorted.length > 0 && (
        <table className="accounts prepayments">
          <thead><tr><th>Месяц</th><th>Сумма, {c}</th><th>Что уменьшаем</th><th /></tr></thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.id}>
                <td><NumberField bare label={`Разовый взнос ${i + 1}: месяц`} value={p.month} min={1}
                  onChange={(month) => updOne(p.id, { month: Math.round(month) })} /></td>
                <td><NumberField bare label={`Разовый взнос ${i + 1}: сумма`} value={p.amount} step={1000}
                  onChange={(amount) => updOne(p.id, { amount })} /></td>
                <td><ModeSelect label={`Разовый взнос ${i + 1}: что уменьшаем`} value={p.mode} onChange={(mode) => updOne(p.id, { mode })} /></td>
                <td><button type="button" className="icon" aria-label={`Удалить разовый взнос ${i + 1}`}
                  onClick={() => setOneOff(plan.oneOff.filter((x) => x.id !== p.id))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" onClick={() => setOneOff([...plan.oneOff, newPrepayment((sorted.at(-1)?.month ?? 0) + 12)])}>
        + Разовый взнос
      </button>

      <h4>Повторяющиеся взносы</h4>
      <p className="hint">«Постепенно гасить из резерва»: например, каждые 12 мес. по 5 000 с 12-го по 60-й месяц.</p>
      {plan.recurring.length > 0 && (
        <table className="accounts prepayments recurring">
          <thead><tr><th>Каждые, мес.</th><th>Сумма, {c}</th><th>С месяца</th><th>По месяц</th><th>Что уменьшаем</th><th /></tr></thead>
          <tbody>
            {plan.recurring.map((p, i) => (
              <tr key={p.id}>
                <td><NumberField bare label={`Повторяющийся ${i + 1}: каждые`} value={p.everyMonths} min={1}
                  onChange={(everyMonths) => updRec(p.id, { everyMonths: Math.round(everyMonths) })} /></td>
                <td><NumberField bare label={`Повторяющийся ${i + 1}: сумма`} value={p.amount} step={500}
                  onChange={(amount) => updRec(p.id, { amount })} /></td>
                <td><NumberField bare label={`Повторяющийся ${i + 1}: с месяца`} value={p.fromMonth} min={1}
                  onChange={(fromMonth) => updRec(p.id, { fromMonth: Math.round(fromMonth) })} /></td>
                <td><NumberField bare label={`Повторяющийся ${i + 1}: по месяц`} value={p.toMonth} min={1}
                  onChange={(toMonth) => updRec(p.id, { toMonth: Math.round(toMonth) })} /></td>
                <td><ModeSelect label={`Повторяющийся ${i + 1}: что уменьшаем`} value={p.mode} onChange={(mode) => updRec(p.id, { mode })} /></td>
                <td><button type="button" className="icon" aria-label={`Удалить повторяющийся взнос ${i + 1}`}
                  onClick={() => setRecurring(plan.recurring.filter((x) => x.id !== p.id))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" onClick={() => setRecurring([...plan.recurring, newRecurring()])}>+ Повторяющийся взнос</button>
    </div>
  );
}
