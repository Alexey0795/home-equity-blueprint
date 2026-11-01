import { useEffect, useState } from 'react';
import { defaultState, parseState, serializeState, type AppState } from './appState';

const STORAGE_KEY = 'home-equity-blueprint/state';

function load(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseState(saved);
  } catch (e) {
    // Испорченные или старые данные не должны ломать экран — начинаем с чистого состояния.
    console.warn('Не удалось прочитать сохранённые данные:', e);
  }
  return defaultState();
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
