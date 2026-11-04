import { useEffect } from 'react';
import { ReferenceContent } from './ReferenceContent';

/** Боковая панель «Справка»: открыта поверх калькулятора, калькулятор остаётся видимым слева. Esc — закрыть. */
export function ReferenceDrawer({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <aside className="drawer" role="dialog" aria-label="Справка: ставки и курсы НБРБ">
      <div className="drawer-head">
        <strong>Справка: ставки и курсы НБРБ</strong>
        <a href="./reference.html" target="_blank" rel="noopener">В отдельной вкладке ↗</a>
        <button type="button" className="icon" onClick={onClose} aria-label="Закрыть справку">✕</button>
      </div>
      <div className="drawer-body">
        <ReferenceContent />
      </div>
    </aside>
  );
}
