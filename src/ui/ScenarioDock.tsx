import { useEffect, useState } from 'react';
import type { Scenario } from '../state/appState';
import { toRoman } from './format';

interface Props {
  scenarios: Scenario[];
  activeId: string;
  onSelect: (id: string) => void;
  /** id элемента, пока виден который, панель не нужна (вкладки сценариев вверху). */
  watchId: string;
}

/** Плавающая панель с римскими номерами сценариев: появляется, когда вкладки наверху ушли из виду. */
export function ScenarioDock({ scenarios, activeId, onSelect, watchId }: Props) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const target = document.getElementById(watchId);
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry!.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchId]);

  if (scenarios.length < 2) return null;
  return (
    <nav className={`scenario-dock${visible ? ' visible' : ''}`} aria-label="Быстрое переключение сценариев" aria-hidden={!visible}>
      {scenarios.map((s, i) => (
        <button key={s.id} type="button" className={s.id === activeId ? 'active' : ''} title={s.name}
          tabIndex={visible ? 0 : -1} aria-pressed={s.id === activeId} onClick={() => onSelect(s.id)}>
          {toRoman(i + 1)}
        </button>
      ))}
    </nav>
  );
}
