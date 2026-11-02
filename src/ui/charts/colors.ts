/** Одни и те же цвета на всех графиках: проценты — тёплый, тело долга — синий. */
export const COLORS = {
  interest: '#e8590c',
  principal: '#1c7ed6',
  balance: '#495057',
  prepayment: '#2b8a3e',
  grid: '#e9ecef',
};

/**
 * Цвета сценариев на графике сравнения: фиксированный порядок, проверен на различимость (в т. ч. дальтонизм).
 * Цвет привязан к позиции сценария в списке, а не к порядку на графике — включение/выключение не перекрашивает линии.
 */
export const SCENARIO_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
/** Для 9-го и дальше сценария — нейтральный серый, а не новый сгенерированный цвет. */
export const SCENARIO_COLOR_OTHER = '#868e96';

export function scenarioColor(index: number): string {
  return SCENARIO_COLORS[index] ?? SCENARIO_COLOR_OTHER;
}
