import type { ReactNode } from 'react';
import type { Currency } from '../domain';
import {
  componentInUse,
  copyComponent,
  newApartment,
  newPrepaymentPlan,
  newSavingsPlan,
  scenariosUsing,
  type Apartment,
  type PrepaymentPlanComponent,
  type Profile,
  type SavingsPlan,
} from '../state/appState';
import { CurrencySelect } from './CurrencySelect';
import { toRoman } from './format';
import { NumberField } from './NumberField';
import { PrepaymentPlanEditor } from './PrepaymentPlanEditor';

interface Props {
  profile: Profile;
  /** Открыть сразу этот компонент (выбранный в текущем сценарии). */
  highlightIds: Set<string>;
  onProfileChange: (patch: (p: Profile) => Profile) => void;
  onApartmentCurrency: (apartmentId: string, to: Currency) => void;
}

type ListKey = 'apartments' | 'savingsPlans' | 'prepaymentPlans';

/** «I, III» — в каких сценариях используется компонент. */
function UsedIn({ numbers }: { numbers: number[] }) {
  if (numbers.length === 0) return <span className="used-in muted">не используется</span>;
  return <span className="used-in">в сценариях {numbers.map(toRoman).join(', ')}</span>;
}

interface CardProps {
  title: string;
  used: number[];
  highlighted: boolean;
  canDelete: boolean;
  onCopy: () => void;
  onDelete: () => void;
  children: ReactNode;
}

function ComponentCard({ title, used, highlighted, canDelete, onCopy, onDelete, children }: CardProps) {
  return (
    <details className={`product component${highlighted ? ' highlighted' : ''}`} open={highlighted || undefined}>
      <summary>
        <strong>{title || 'Без названия'}</strong>
        <UsedIn numbers={used} />
      </summary>
      <div className="product-editor">{children}</div>
      <div className="product-actions">
        <button type="button" onClick={onCopy}>Сделать копию</button>
        <button type="button" onClick={onDelete} disabled={!canDelete}
          title={canDelete ? undefined : 'Используется в сценариях — сначала выберите в них другой компонент'}>Удалить</button>
      </div>
    </details>
  );
}

/**
 * Компоненты профиля: квартиры, распределения сбережений, планы досрочки.
 * Они общие: правка меняет все сценарии, где компонент выбран.
 */
export function ComponentsSection({ profile, highlightIds, onProfileChange, onApartmentCurrency }: Props) {
  function updateItem<K extends ListKey>(list: K, id: string, patch: Partial<Profile[K][number]>) {
    onProfileChange((p) => ({ ...p, [list]: (p[list] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }
  function add<K extends ListKey>(list: K, item: Profile[K][number]) {
    onProfileChange((p) => ({ ...p, [list]: [...p[list], item] }));
  }
  function remove(list: ListKey, id: string, name: string) {
    if (!window.confirm(`Удалить «${name}»?`)) return;
    onProfileChange((p) => ({ ...p, [list]: (p[list] as { id: string }[]).filter((x) => x.id !== id) }));
  }
  const cardProps = <T extends { id: string; name: string }>(list: ListKey, item: T, uses: (s: Profile['scenarios'][number]) => boolean) => ({
    title: item.name,
    used: scenariosUsing(profile, uses),
    highlighted: highlightIds.has(item.id),
    canDelete: !componentInUse(profile, list, item.id),
    onCopy: () => add(list, copyComponent(item) as never),
    onDelete: () => remove(list, item.id, item.name),
  });

  return (
    <section className="card">
      <h2>Компоненты профиля</h2>
      <p className="hint">
        Кирпичики, из которых собираются сценарии. Компонент общий: поменяете его — пересчитаются все сценарии, где он
        выбран. Чтобы поменять только в одном сценарии, сделайте копию и выберите её там.
      </p>

      <h3>Квартиры</h3>
      <div className="products">
        {profile.apartments.map((a: Apartment) => (
          <ComponentCard key={a.id} {...cardProps('apartments', a, (s) => s.apartmentId === a.id)}>
            <div className="fields">
              <label className="field"><span>Название</span>
                <input type="text" value={a.name} onChange={(e) => updateItem('apartments', a.id, { name: e.target.value })} /></label>
              <label className="field"><span>Валюта сделки</span>
                <CurrencySelect label={`Валюта: ${a.name}`} value={a.currency} onChange={(to) => onApartmentCurrency(a.id, to)} /></label>
              <NumberField label={`Цена, ${a.currency}`} value={a.price} step={1000}
                onChange={(price) => updateItem('apartments', a.id, { price })} />
            </div>
          </ComponentCard>
        ))}
      </div>
      <button type="button" onClick={() => add('apartments', newApartment(`Квартира ${profile.apartments.length + 1}`))}>+ Квартира</button>

      <h3>Распределение сбережений</h3>
      <p className="hint">Первый взнос = сбережения с галочкой «На взнос» минус резерв «на чёрный день».</p>
      <div className="products">
        {profile.savingsPlans.map((sp: SavingsPlan) => (
          <ComponentCard key={sp.id}
            {...cardProps('savingsPlans', sp, (s) => s.downPayment.kind === 'savings' && s.downPayment.planId === sp.id)}>
            <div className="fields">
              <label className="field"><span>Название</span>
                <input type="text" value={sp.name} onChange={(e) => updateItem('savingsPlans', sp.id, { name: e.target.value })} /></label>
              <NumberField label={`Оставить в резерве, ${sp.reserveCurrency}`} value={sp.reserve} step={1000}
                onChange={(reserve) => updateItem('savingsPlans', sp.id, { reserve })} />
              <label className="field"><span>Валюта резерва</span>
                <CurrencySelect label={`Валюта резерва: ${sp.name}`} value={sp.reserveCurrency}
                  onChange={(reserveCurrency) => updateItem('savingsPlans', sp.id, { reserveCurrency })} /></label>
            </div>
          </ComponentCard>
        ))}
      </div>
      <button type="button" onClick={() => add('savingsPlans', newSavingsPlan('Часть в резерв'))}>+ Распределение</button>

      <h3>Планы досрочки</h3>
      <div className="products">
        {profile.prepaymentPlans.map((pp: PrepaymentPlanComponent) => (
          <ComponentCard key={pp.id} {...cardProps('prepaymentPlans', pp, (s) => s.prepaymentPlanId === pp.id)}>
            <div className="fields">
              <label className="field"><span>Название</span>
                <input type="text" value={pp.name} onChange={(e) => updateItem('prepaymentPlans', pp.id, { name: e.target.value })} /></label>
              <label className="field"><span>Валюта сумм</span>
                <CurrencySelect label={`Валюта плана: ${pp.name}`} value={pp.currency}
                  onChange={(currency) => updateItem('prepaymentPlans', pp.id, { currency })} /></label>
            </div>
            <PrepaymentPlanEditor plan={pp} onChange={(next) => updateItem('prepaymentPlans', pp.id, next)} />
          </ComponentCard>
        ))}
      </div>
      <button type="button" onClick={() => add('prepaymentPlans', newPrepaymentPlan(`План досрочки ${profile.prepaymentPlans.length + 1}`))}>
        + План досрочки
      </button>
    </section>
  );
}
