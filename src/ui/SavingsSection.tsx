import { gapToDownPayment, type Account, type Currency, type FxRates, type SavingsSummary } from '../domain';
import { newAccount } from '../state/appState';
import { CurrencySelect } from './CurrencySelect';
import { Money } from './Money';
import { NumberField } from './NumberField';

interface Props {
  accounts: Account[];
  fxRates: FxRates;
  dealCurrency: Currency;
  downPayment: number;
  /** Резерв «на чёрный день» из распределения сбережений сценария, в валюте сделки. */
  reserve: number;
  /** Итоги по счетам или текст ошибки, если какие-то поля не заполнены. */
  summary: SavingsSummary | { error: string };
  onAccountsChange: (accounts: Account[]) => void;
  onRatesChange: (rates: FxRates) => void;
}

export function SavingsSection(props: Props) {
  const { accounts, fxRates, dealCurrency, downPayment, reserve, summary, onAccountsChange, onRatesChange } = props;

  function updateAccount(id: string, patch: Partial<Account>) {
    onAccountsChange(accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  return (
    <section className="card">
      <h2>Сбережения профиля</h2>

      {accounts.length > 0 && (
        <table className="accounts">
          <thead>
            <tr>
              <th>Счёт или наличные</th>
              <th>Сумма</th>
              <th>Валюта</th>
              <th title="Если снять галочку, деньги видны в общем итоге, но на первый взнос не идут">На взнос</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a, i) => (
              <tr key={a.id}>
                <td>
                  <input type="text" aria-label={`Название счёта ${i + 1}`} value={a.name}
                    placeholder="Например, «Наличные дома»" onChange={(e) => updateAccount(a.id, { name: e.target.value })} />
                </td>
                <td>
                  <NumberField bare label={`Сумма счёта ${i + 1}`} value={a.amount} step={100} currency={a.currency}
                    onChange={(amount) => updateAccount(a.id, { amount })} />
                </td>
                <td>
                  <CurrencySelect label={`Валюта счёта ${i + 1}`} value={a.currency}
                    onChange={(currency) => updateAccount(a.id, { currency })} />
                </td>
                <td className="center">
                  <input type="checkbox" aria-label={`Счёт ${i + 1} идёт на взнос`} checked={a.useForDownPayment}
                    onChange={(e) => updateAccount(a.id, { useForDownPayment: e.target.checked })} />
                </td>
                <td>
                  <button type="button" className="icon" title="Удалить счёт" aria-label={`Удалить счёт ${i + 1}`}
                    onClick={() => onAccountsChange(accounts.filter((x) => x.id !== a.id))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" onClick={() => onAccountsChange([...accounts, newAccount()])}>+ Добавить счёт</button>

      <h3>Курсы, вводятся вручную (общие для всех профилей)</h3>
      <div className="fields rates">
        <NumberField label="1 USD = … BYN" value={fxRates.USD} step={0.0001}
          onChange={(USD) => onRatesChange({ ...fxRates, USD })} />
        <NumberField label="1 EUR = … BYN" value={fxRates.EUR} step={0.0001}
          onChange={(EUR) => onRatesChange({ ...fxRates, EUR })} />
      </div>
      <p className="hint">Возьмите актуальные курсы на сайте Нацбанка или своего банка. Все суммы пересчитываются в валюту сделки ({dealCurrency}).</p>

      {'error' in summary ? (
        <p className="error">{summary.error}</p>
      ) : (
        <DownPaymentProgress summary={summary} downPayment={downPayment} reserve={reserve} currency={dealCurrency} />
      )}
    </section>
  );
}

interface ProgressProps {
  summary: SavingsSummary;
  downPayment: number;
  reserve: number;
  currency: Currency;
}

function DownPaymentProgress({ summary, downPayment, reserve, currency }: ProgressProps) {
  // Резерв не трогаем: на взнос идёт только то, что сверх него.
  const usable = Math.max(0, summary.availableForDown - reserve);
  const gap = gapToDownPayment(downPayment, usable);
  const share = downPayment > 0 ? Math.min(1, usable / downPayment) : 1;
  return (
    <div className="savings-summary">
      <div className="summary">
        <div><span>Всего сбережений</span><strong><Money value={summary.total} currency={currency} /></strong></div>
        <div><span>Можно направить на взнос</span><strong><Money value={summary.availableForDown} currency={currency} /></strong></div>
        {reserve > 0 && <div><span>Из них в резерве</span><strong><Money value={reserve} currency={currency} /></strong></div>}
        <div><span>Первый взнос сценария</span><strong><Money value={downPayment} currency={currency} /></strong></div>
        {Number.isFinite(gap) && (gap > 0 ? (
          <div><span>Не хватает на взнос</span><strong className="interest"><Money value={gap} currency={currency} /></strong></div>
        ) : (
          <div><span>Остаётся после взноса</span><strong className="ok"><Money value={Math.max(0, -gap)} currency={currency} /></strong></div>
        ))}
      </div>
      {Number.isFinite(share) && (
        <div className="progress" role="img" aria-label={`Собрано ${Math.round(share * 100)}% первого взноса`}>
          <div className="progress-fill" style={{ width: `${share * 100}%` }} />
          <span>{Math.round(share * 100)}% первого взноса</span>
        </div>
      )}
    </div>
  );
}
