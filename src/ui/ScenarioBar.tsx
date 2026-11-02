import { maxPayment } from '../domain';
import type { Scenario } from '../state/appState';
import type { ScenarioResult } from '../state/evaluate';
import { formatCompact, formatMoney } from './format';

interface Props {
  scenarios: Scenario[];
  activeId: string;
  results: Map<string, ScenarioResult | { error: string }>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Вкладки сценариев: быстрое переключение, под названием — главное о сценарии. */
export function ScenarioBar({ scenarios, activeId, results, onSelect, onAdd, onDuplicate, onDelete }: Props) {
  return (
    <nav className="scenario-bar" aria-label="Сценарии">
      <div className="scenario-tabs" role="tablist">
        {scenarios.map((s) => {
          const r = results.get(s.id);
          const ok = r && !('error' in r);
          const brief = ok ? `${formatCompact(maxPayment(r.baseline))}/мес · переплата ${formatCompact(r.schedule.totalInterest)}` : 'не сходится';
          const full = ok
            ? `Макс. платёж ${formatMoney(maxPayment(r.baseline), s.currency)}, переплата ${formatMoney(r.schedule.totalInterest, s.currency)}`
            : 'Сценарий не сходится';
          return (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === activeId} title={full}
              className={s.id === activeId ? 'active' : ''} onClick={() => onSelect(s.id)}>
              <strong>{s.name || 'Без названия'}</strong>
              <small>{brief}</small>
            </button>
          );
        })}
      </div>
      <div className="scenario-actions">
        <button type="button" onClick={onAdd}>+ Новый</button>
        <button type="button" onClick={onDuplicate}>Копия</button>
        <button type="button" onClick={onDelete} disabled={scenarios.length <= 1}>Удалить</button>
      </div>
    </nav>
  );
}
