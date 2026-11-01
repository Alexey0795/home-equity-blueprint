/** Сумма кредита = цена объекта - первый взнос. Отрицательной быть не может. */
export function loanAmount(price: number, downPayment: number): number {
  return Math.max(0, price - downPayment);
}
