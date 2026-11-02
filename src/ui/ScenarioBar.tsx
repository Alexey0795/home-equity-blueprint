import { maxPayment } from '../domain';
import type { Scenario } from '../state/appState';
import type { ScenarioEvaluation } from '../state/evaluate';
import { formatCompact, formatMoney, toRoman } from './format';

interface Props {
  scenarios: Scenario[];
  activeId: string;
  evaluations: Map<string, ScenarioEvaluation>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Вкладки сценариев: римский номер, название и главное о сценарии. */
export function ScenarioBar({ scenarios, activeId, evaluations, onSelect, onAdd, onDuplicate, onDelete }: Props) {
  return (
    <nav className="scenario-bar" aria-label="Сценарии">
      <div className="scenario-tabs" role="tablist">
        {scenarios.map((s, i) => {
          const ev = evaluations.get(s.id);
          const r = ev?.result;
          const ok = r && !('error' in r);
          const c = ev?.inputs.currency;
          const brief = ok ? `${formatCompact(maxPayment(r.baseline))}/мес · переплата ${formatCompact(r.schedule.totalInterest)}` : 'не сходится';
          const full = ok
            ? `Макс. платёж ${formatMoney(maxPayment(r.baseline), c)}, переплата ${formatMoney(r.schedule.totalInterest, c)}`
            : 'Сценарий не сходится';
          return (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === activeId} title={full}
              className={s.id === activeId ? 'active' : ''} onClick={() => onSelect(s.id)}>
              <strong><span className="roman">{toRoman(i + 1)}</span> {s.name || 'Без названия'}</strong>
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
