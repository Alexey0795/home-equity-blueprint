import { describe, expect, it } from 'vitest';
import { saveUntilPrice } from './saveInstead';

const base = { start: 0, monthly: 1_000, depositRatePct: 0, price: 12_000, priceGrowthPct: 0, rentPerMonth: 500 };

describe('saveUntilPrice', () => {
  it('без процентов и роста цены: 12 000 по 1 000 в месяц — 12 месяцев, аренда 12 × 500', () => {
    const r = saveUntilPrice(base);
    expect(r.purchaseMonth).toBe(12);
    expect(r.rentTotal).toBe(6_000);
    expect(r.contributed).toBe(12_000);
  });

  it('вклад 12%: месяц покупки — первый, когда будущая стоимость взносов 1 000 × (1,01^n − 1) / 0,01 ≥ цены', () => {
    const price = 100_000;
    const r = saveUntilPrice({ ...base, price, depositRatePct: 12 });
    const n = Math.ceil(Math.log(1 + (price * 0.01) / 1_000) / Math.log(1.01));
    expect(r.purchaseMonth).toBe(n);
    expect(r.depositInterest).toBeCloseTo(r.rows.at(-1)!.deposit - 1_000 * n, 6);
  });

  it('рост цены 5% в год — через год цена 12 600, копить дольше', () => {
    const r = saveUntilPrice({ ...base, priceGrowthPct: 5 });
    expect(r.rows[12]!.price).toBeCloseTo(12_600, 6);
    expect(r.purchaseMonth).toBe(13);
  });

  it('уже хватает — месяц 0; не накопить — null; ошибки по-русски', () => {
    expect(saveUntilPrice({ ...base, start: 20_000 }).purchaseMonth).toBe(0);
    expect(saveUntilPrice({ ...base, monthly: 0 }).purchaseMonth).toBeNull();
    expect(() => saveUntilPrice({ ...base, price: 0 })).toThrow('Цена квартиры');
  });
});
