import { gapToDownPayment, type Account, type Currency, type FxRates, type SavingsSummary } from '../domain';
import { newAccount } from '../state/appState';
import { CurrencySelect } from './CurrencySelect';
import { formatMoney } from './format';
import { NumberField } from './NumberField';

interface Props {
  accounts: Account[];
  fxRates: FxRates;
  dealCurrency: Currency;
  downPayment: number;
  /** Итоги по счетам или текст ошибки, если какие-то поля не заполнены. */
  summary: SavingsSummary | { error: string };
  onAccountsChange: (accounts: Account[]) => void;
  onRatesChange: (rates: FxRates) => void;
}

export function SavingsSection(props: Props) {
  const { accounts, fxRates, dealCurrency, downPayment, summary, onAccountsChange, onRatesChange } = props;

  function updateAccount(id: string, patch: Partial<Account>) {
    onAccountsChange(accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  return (
    <section className="card">
      <h2>Сбережения</h2>

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
                  <NumberField bare label={`Сумма счёта ${i + 1}`} value={a.amount} step={100}
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

      <h3>Курсы, вводятся вручную</h3>
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
        <DownPaymentProgress summary={summary} downPayment={downPayment} currency={dealCurrency} />
      )}
    </section>
  );
}

function DownPaymentProgress({ summary, downPayment, currency }: { summary: SavingsSummary; downPayment: number; currency: Currency }) {
  const gap = gapToDownPayment(downPayment, summary.availableForDown);
  const share = downPayment > 0 ? Math.min(1, summary.availableForDown / downPayment) : 1;
  return (
    <div className="savings-summary">
      <div className="summary">
        <div><span>Всего сбережений</span><strong>{formatMoney(summary.total, currency)}</strong></div>
        <div><span>Можно направить на взнос</span><strong>{formatMoney(summary.availableForDown, currency)}</strong></div>
        {Number.isFinite(gap) && (gap > 0 ? (
          <div><span>Не хватает на взнос</span><strong className="interest">{formatMoney(gap, currency)}</strong></div>
        ) : (
          <div><span>Остаётся после взноса</span><strong className="ok">{formatMoney(Math.max(0, -gap), currency)}</strong></div>
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
