import { describe, expect, it } from 'vitest';
import { missingSampleProducts, sampleProducts } from './sampleProducts';

let n = 0;
const id = () => `id-${n++}`;

describe('карточки из исследования', () => {
  it('у всех есть источник и дата проверки; названия не повторяются', () => {
    const list = sampleProducts(id);
    expect(new Set(list.map((p) => p.name)).size).toBe(list.length);
    for (const p of list) {
      expect(p.source).toMatch(/^https:\/\//);
      expect(p.checkedAt).toBe('2026-11-02');
    }
  });

  it('«добавить из исследования» добавляет только недостающие (по названию)', () => {
    const existing = sampleProducts(id).slice(0, 3);
    const missing = missingSampleProducts(existing, id);
    expect(missing).toHaveLength(sampleProducts(id).length - 3);
    expect(missingSampleProducts([...existing, ...missing], id)).toEqual([]);
  });
});
