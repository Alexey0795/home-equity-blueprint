import type { CreditProduct, RatePeriod, RateSpec } from '../domain';
import { newId, newProduct } from '../state/appState';
import { describeProduct } from './describeProduct';
import { NumberField } from './NumberField';

interface Props {
  products: CreditProduct[];
  refinancingRatePct: number;
  /** id карточек, выбранных в каком-нибудь сценарии — их удаление переключит сценарий на ручную ставку. */
  usedIds: Set<string>;
  onProductsChange: (products: CreditProduct[]) => void;
  onRefinancingChange: (value: number) => void;
}

export function ProductsSection({ products, refinancingRatePct, usedIds, onProductsChange, onRefinancingChange }: Props) {
  function updateProduct(id: string, patch: Partial<CreditProduct>) {
    onProductsChange(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  return (
    <section className="card">
      <h2>Условия банков</h2>
      <div className="fields rates">
        <NumberField label="Ставка рефинансирования Нацбанка, %" value={refinancingRatePct} step={0.25}
          onChange={onRefinancingChange} />
      </div>
      <p className="hint">Многие банки считают ставку как «ставка рефинансирования (СР) + надбавка». Меняете СР здесь — пересчитываются все такие карточки.</p>

      <div className="products">
        {products.map((p) => (
          <details key={p.id} className="product">
            <summary>
              <strong>{p.name || 'Без названия'}</strong>
              {!p.verified && <span className="badge">не проверено</span>}
              <span className="product-brief">{describeProduct(p, refinancingRatePct).join(' · ')}</span>
            </summary>
            <ProductEditor
              product={p}
              refinancingRatePct={refinancingRatePct}
              onChange={(patch) => updateProduct(p.id, patch)}
            />
            <div className="product-actions">
              <button type="button" onClick={() => {
                const copy = { ...structuredClone(p), id: newId(), name: `${p.name} (копия)` };
                onProductsChange([...products, copy]);
              }}>Сделать копию</button>
              <button type="button" onClick={() => {
                const warning = usedIds.has(p.id) ? ' Она выбрана в сценарии — там включится ручная ставка.' : '';
                if (window.confirm(`Удалить карточку «${p.name}»?${warning}`)) {
                  onProductsChange(products.filter((x) => x.id !== p.id));
                }
              }}>Удалить</button>
            </div>
          </details>
        ))}
      </div>
      <button type="button" onClick={() => onProductsChange([...products, newProduct()])}>+ Добавить карточку</button>
    </section>
  );
}

interface EditorProps {
  product: CreditProduct;
  refinancingRatePct: number;
  onChange: (patch: Partial<CreditProduct>) => void;
}

function ProductEditor({ product, refinancingRatePct, onChange }: EditorProps) {
  const periods = product.ratePeriods;

  function setPeriods(ratePeriods: RatePeriod[]) {
    onChange({ ratePeriods });
  }
  function updatePeriod(index: number, patch: Partial<RatePeriod>) {
    setPeriods(periods.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  /** Смена типа ставки сохраняет итоговую ставку: 15,4% ↔ СР 9,25 + 6,15. */
  function switchKind(index: number, kind: RateSpec['kind']) {
    const rate = periods[index]!.rate;
    if (rate.kind === kind) return;
    const next: RateSpec = rate.kind === 'fixed'
      ? { kind: 'refinancing', marginPct: round(rate.ratePct - refinancingRatePct) }
      : { kind: 'fixed', ratePct: round(refinancingRatePct + rate.marginPct) };
    updatePeriod(index, { rate: next });
  }

  return (
    <div className="product-editor">
      <label className="field">
        <span>Название</span>
        <input type="text" value={product.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>

      <h3>Ставка по периодам</h3>
      <table className="periods">
        <thead>
          <tr><th>С месяца</th><th>Тип ставки</th><th>Значение, %</th><th /></tr>
        </thead>
        <tbody>
          {periods.map((period, i) => (
            <tr key={i}>
              <td>
                {i === 0 ? <span className="muted">1</span> : (
                  <NumberField bare label={`Период ${i + 1}: с месяца`} value={period.fromMonth} min={2}
                    onChange={(fromMonth) => updatePeriod(i, { fromMonth })} />
                )}
              </td>
              <td>
                <select aria-label={`Период ${i + 1}: тип ставки`} value={period.rate.kind}
                  onChange={(e) => switchKind(i, e.target.value as RateSpec['kind'])}>
                  <option value="fixed">Фиксированная</option>
                  <option value="refinancing">СР + надбавка</option>
                </select>
              </td>
              <td>
                {period.rate.kind === 'fixed' ? (
                  <NumberField bare label={`Период ${i + 1}: ставка`} value={period.rate.ratePct} step={0.01}
                    onChange={(ratePct) => updatePeriod(i, { rate: { kind: 'fixed', ratePct } })} />
                ) : (
                  <NumberField bare label={`Период ${i + 1}: надбавка`} value={period.rate.marginPct} step={0.01} min={-100}
                    onChange={(marginPct) => updatePeriod(i, { rate: { kind: 'refinancing', marginPct } })} />
                )}
              </td>
              <td>
                {i > 0 && (
                  <button type="button" className="icon" aria-label={`Удалить период ${i + 1}`}
                    onClick={() => setPeriods(periods.filter((_, j) => j !== i))}>✕</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => {
        const last = periods.at(-1)!;
        setPeriods([...periods, { fromMonth: last.fromMonth + 12, rate: { ...last.rate } }]);
      }}>+ Период ставки</button>

      <h3>Условия и лимиты</h3>
      <div className="fields">
        <NumberField label="Только проценты, мес." value={product.interestOnlyMonths}
          onChange={(interestOnlyMonths) => onChange({ interestOnlyMonths })} />
        <NumberField label="Досрочка запрещена, мес." value={product.prepaymentBanMonths}
          onChange={(prepaymentBanMonths) => onChange({ prepaymentBanMonths })} />
        <NumberField label="Макс. срок, лет" value={product.maxTermMonths / 12} step={1}
          onChange={(years) => onChange({ maxTermMonths: Math.round(years * 12) })} />
        <NumberField label="Мин. первый взнос, %" value={product.minDownPct}
          onChange={(minDownPct) => onChange({ minDownPct })} />
        <NumberField label="Макс. сумма кредита, BYN (пусто — без лимита)" value={product.maxLoan ?? Number.NaN} step={1000}
          onChange={(v) => onChange({ maxLoan: Number.isFinite(v) ? v : null })} />
      </div>

      <label className="field">
        <span>Оговорки и ограничения</span>
        <textarea rows={2} value={product.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      </label>
      <div className="fields">
        <label className="field">
          <span>Источник</span>
          <input type="text" value={product.source} placeholder="Ссылка или «договор»"
            onChange={(e) => onChange({ source: e.target.value })} />
        </label>
        <label className="field">
          <span>Дата проверки</span>
          <input type="date" value={product.checkedAt} onChange={(e) => onChange({ checkedAt: e.target.value })} />
        </label>
        <label className="field checkbox">
          <input type="checkbox" checked={product.verified} onChange={(e) => onChange({ verified: e.target.checked })} />
          <span>Сверено с банком или договором</span>
        </label>
      </div>
    </div>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
