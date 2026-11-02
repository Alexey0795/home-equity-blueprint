import type { Profile } from '../state/appState';

interface Props {
  profiles: Profile[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

/** Профиль (человек) — верхний уровень. Выбирается в углу экрана. */
export function ProfileSwitcher({ profiles, activeId, onSelect, onAdd, onRename, onDelete }: Props) {
  const active = profiles.find((p) => p.id === activeId);
  return (
    <div className="profile-switcher">
      <label>
        <span className="sr-only">Профиль</span>
        <span aria-hidden className="profile-icon">👤</span>
        <select aria-label="Профиль" value={activeId} onChange={(e) => onSelect(e.target.value)}>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name || 'Без имени'}</option>)}
        </select>
      </label>
      <button type="button" className="icon" title="Новый профиль" aria-label="Новый профиль" onClick={() => {
        const name = window.prompt('Имя нового профиля', '');
        if (name !== null) onAdd(name.trim() || `Профиль ${profiles.length + 1}`);
      }}>+</button>
      <button type="button" className="icon" title="Переименовать профиль" aria-label="Переименовать профиль" onClick={() => {
        const name = window.prompt('Новое имя профиля', active?.name ?? '');
        if (name !== null && name.trim()) onRename(name.trim());
      }}>✎</button>
      <button type="button" className="icon" title="Удалить профиль" aria-label="Удалить профиль" disabled={profiles.length <= 1}
        onClick={() => {
          if (window.confirm(`Удалить профиль «${active?.name}» со всеми его счетами, компонентами и сценариями?`)) onDelete();
        }}>🗑</button>
    </div>
  );
}
