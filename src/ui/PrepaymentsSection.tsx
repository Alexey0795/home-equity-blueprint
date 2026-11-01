import type { PrepaymentEffect, PrepaymentMode } from '../domain';
import { newPrepayment, type Prepayment } from '../state/appState';
import { formatMoney, formatTerm } from './format';
import { NumberField } from './NumberField';

interface Props {
  prepayments: Prepayment[];
  currency: string;
  /** Эффект досрочки или null, если график не посчитан. */
  effect: PrepaymentEffect | null;
  /** Предупреждения о запрете досрочного погашения в карточке банка. */
  problems: string[];
  onChange: (prepayments: Prepayment[]) => void;
}

export function PrepaymentsSection({ prepayments, currency, effect, problems, onChange }: Props) {
  function updateItem(id: string, patch: Partial<Prepayment>) {
    onChange(prepayments.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  const sorted = [...prepayments].sort((a, b) => a.month - b.month);

  return (
    <section className="card">
      <h2>Досрочные взносы</h2>
      <p className="hint">
        Крупная сумма сверх обычного платежа, целиком в погашение долга. «Сократить срок» — платёж тот же, кредит
        закрывается раньше, переплата падает сильнее. «Уменьшить платёж» — срок тот же, платёж меньше.
      </p>

      {sorted.length > 0 && (
        <table className="accounts prepayments">
          <thead>
            <tr><th>Месяц</th><th>Сумма, {currency}</th><th>Что уменьшаем</th><th /></tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.id}>
                <td>
                  <NumberField bare label={`Досрочный взнос ${i + 1}: месяц`} value={p.month} min={1}
                    onChange={(month) => updateItem(p.id, { month: Math.round(month) })} />
                </td>
                <td>
                  <NumberField bare label={`Досрочный взнос ${i + 1}: сумма`} value={p.amount} step={1000}
                    onChange={(amount) => updateItem(p.id, { amount })} />
                </td>
                <td>
                  <select aria-label={`Досрочный взнос ${i + 1}: что уменьшаем`} value={p.mode}
                    onChange={(e) => updateItem(p.id, { mode: e.target.value as PrepaymentMode })}>
                    <option value="reduceTerm">Сократить срок</option>
                    <option value="reducePayment">Уменьшить платёж</option>
                  </select>
                </td>
                <td>
                  <button type="button" className="icon" aria-label={`Удалить досрочный взнос ${i + 1}`}
                    onClick={() => onChange(prepayments.filter((x) => x.id !== p.id))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" onClick={() => {
        const lastMonth = sorted.at(-1)?.month ?? 0;
        onChange([...prepayments, newPrepayment(lastMonth + 12)]);
      }}>+ Досрочный взнос</button>

      {problems.map((problem) => <p key={problem} className="warning">⚠ {problem}</p>)}

      {effect && prepayments.length > 0 && (
        <div className="summary savings-summary">
          <div><span>Экономия на процентах</span><strong className="ok">{formatMoney(effect.interestSaved, currency)}</strong></div>
          <div>
            <span>Кредит закроется раньше на</span>
            <strong>{effect.monthsSaved > 0 ? formatTerm(effect.monthsSaved) : '—'}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
