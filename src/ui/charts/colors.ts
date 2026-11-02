import { useEffect, useState } from 'react';

/**
 * Цвета графиков. Recharts рисует SVG с цветами в атрибутах, поэтому тёмная тема — отдельный набор,
 * выбираемый хуком useChartColors() по настройке системы. Оси, сетка и подсказки красятся CSS-токенами (styles.css).
 * Проценты — тёплый, тело долга — синий, досрочка — зелёный.
 */
const LIGHT = {
  interest: '#e8590c',
  principal: '#1c7ed6',
  balance: '#495057',
  prepayment: '#2b8a3e',
  /**
   * Цвета сценариев: фиксированный порядок, проверен валидатором палитры (различимость, в т. ч. дальтонизм).
   * Цвет привязан к позиции сценария в списке, а не к порядку на графике — включение/выключение не перекрашивает линии.
   */
  scenarios: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  /** Для 9-го и дальше сценария — нейтральный серый, а не новый сгенерированный цвет. */
  other: '#868e96',
};

const DARK: typeof LIGHT = {
  interest: '#ff8a4c',
  principal: '#4dabf7',
  balance: '#ced4da',
  prepayment: '#51cf66',
  // Те же оттенки, подобранные для тёмного фона (валидатор: --mode dark, фон #1d2024).
  scenarios: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  other: '#868e96',
};

export type ChartColors = typeof LIGHT & { scenario: (index: number) => string };

const query = '(prefers-color-scheme: dark)';

function isDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia(query).matches;
}

/** Цвета графиков под текущую тему; переключаются на лету, если тема системы меняется. */
export function useChartColors(): ChartColors {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const onChange = () => setDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const palette = dark ? DARK : LIGHT;
  return { ...palette, scenario: (index) => palette.scenarios[index] ?? palette.other };
}
