import { useEffect, useState } from 'react';
import { parseState, serializeState, type AppState } from './appState';
import { demoState } from './demo';

const STORAGE_KEY = 'home-equity-blueprint/state';

/** Первый запуск (или гость) — демо-профиль; иначе — сохранённые данные. */
function load(): AppState {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseState(saved);
  } catch (e) {
    // Испорченные данные не должны ломать экран. Но и терять их нельзя: следующее сохранение их перезапишет,
    // поэтому сначала откладываем копию под отдельным ключом.
    console.warn('Не удалось прочитать сохранённые данные, копия отложена в', `${STORAGE_KEY}/backup`, e);
    try {
      if (saved) localStorage.setItem(`${STORAGE_KEY}/backup-${new Date().toISOString()}`, saved);
    } catch {
      // Хранилище недоступно — ничего не поделать.
    }
  }
  return demoState();
}

/** Состояние приложения, которое само сохраняется в localStorage при каждом изменении. */
export function useAppState() {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeState(state));
    } catch (e) {
      console.warn('Не удалось сохранить данные:', e);
    }
  }, [state]);

  return [state, setState] as const;
}
