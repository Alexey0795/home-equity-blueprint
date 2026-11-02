import { describe, expect, it } from 'vitest';
import { buildSchedule } from './annuity';
import { downPaymentFromSavings } from './money';
import { expandPrepayments } from './prepaymentPlan';

describe('expandPrepayments', () => {
  it('каждые 12 мес. по 5 000 с 12-го по 48-й → месяцы 12, 24, 36, 48; разовые встают по порядку', () => {
    const list = expandPrepayments(
      [{ month: 30, amount: 1_000, mode: 'reducePayment' }],
      [{ fromMonth: 12, toMonth: 48, everyMonths: 12, amount: 5_000, mode: 'reduceTerm' }],
    );
    expect(list.map((p) => p.month)).toEqual([12, 24, 30, 36, 48]);
    expect(list.filter((p) => p.amount === 5_000)).toHaveLength(4);
  });

  it('конец не кратен шагу — последний взнос не позже toMonth', () => {
    const list = expandPrepayments([], [{ fromMonth: 1, toMonth: 10, everyMonths: 4, amount: 1, mode: 'reduceTerm' }]);
    expect(list.map((p) => p.month)).toEqual([1, 5, 9]);
  });

  it('ежемесячная досрочка 1 000 при нулевой ставке: 120 000 / (10 000 + 1 000) → закрыт за 11 мес.', () => {
    const prepayments = expandPrepayments([], [{ fromMonth: 1, toMonth: 12, everyMonths: 1, amount: 1_000, mode: 'reduceTerm' }]);
    const s = buildSchedule({
      principal: 120_000, termMonths: 12, rateSteps: [{ fromMonth: 1, annualRatePct: 0 }], interestOnlyMonths: 0, prepayments,
    });
    expect(s.rows).toHaveLength(11);
  });

  it('понятные ошибки', () => {
    const bad = (patch: object) => () =>
      expandPrepayments([], [{ fromMonth: 1, toMonth: 12, everyMonths: 1, amount: 1, mode: 'reduceTerm', ...patch }]);
    expect(bad({ everyMonths: 0 })).toThrow('периодичность');
    expect(bad({ toMonth: 0 })).toThrow('окончания');
    expect(bad({ fromMonth: 0 })).toThrow('начала');
  });
});

describe('downPaymentFromSavings', () => {
  it('на взнос 65 000, резерв 15 000 → взнос 50 000', () => {
    expect(downPaymentFromSavings(65_000, 15_000)).toBe(50_000);
  });
  it('резерв больше сбережений → взнос 0', () => {
    expect(downPaymentFromSavings(10_000, 15_000)).toBe(0);
  });
  it('пустой резерв → ошибка', () => {
    expect(() => downPaymentFromSavings(10_000, Number.NaN)).toThrow('Резерв');
  });
});
