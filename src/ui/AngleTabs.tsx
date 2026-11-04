import { useState } from 'react';

/** Ракурсы калькулятора — вкладки вверху экрана. */
export const ANGLES = [
  { id: 'deal', title: 'Подбор сделки', hint: 'зафиксировать всё, кроме одного' },
  { id: 'banks', title: 'Банки', hint: 'условия рядом' },
  { id: 'loan', title: 'Мой кредит', hint: 'хроника и прогноз' },
  { id: 'extra', title: 'Доп. взносы', hint: 'сумма сразу и потом' },
  { id: 'save', title: 'Копить', hint: 'без кредита' },
  { id: 'rent', title: 'Аренда', hint: 'за прошлые годы' },
] as const;

export type Angle = (typeof ANGLES)[number]['id'];

/** На этих вкладках нужен выбранный сценарий — над ними видны вкладки сценариев. */
export const ANGLES_WITH_SCENARIO = new Set<Angle>(['deal', 'banks', 'extra', 'save']);

const KEY = 'home-equity-blueprint/angle';

/** Текущий ракурс; запоминается в этом браузере (удобство, не данные). */
export function useAngle(): [Angle, (a: Angle) => void] {
  const [angle, setAngle] = useState<Angle>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      return ANGLES.some((a) => a.id === saved) ? (saved as Angle) : 'deal';
    } catch {
      return 'deal';
    }
  });
  const set = (a: Angle) => {
    setAngle(a);
    try {
      localStorage.setItem(KEY, a);
    } catch {
      // нет доступа к хранилищу — просто не запоминаем
    }
  };
  return [angle, set];
}

export function AngleTabs({ value, onChange }: { value: Angle; onChange: (a: Angle) => void }) {
  return (
    <nav className="angles" aria-label="Ракурсы">
      {ANGLES.map((a) => (
        <button key={a.id} type="button" className={a.id === value ? 'on' : ''} aria-current={a.id === value ? 'page' : undefined}
          onClick={() => onChange(a.id)}>
          <strong>{a.title}</strong>
          <small>{a.hint}</small>
        </button>
      ))}
    </nav>
  );
}
