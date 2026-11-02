import { useState } from 'react';

const KEY = 'home-equity-blueprint/welcome-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Пояснение для гостя: это пример, данные только в браузере, предложения банков на глаз не сравнить. */
export function WelcomeBanner({ onStartOwn }: { onStartOwn: () => void }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Без хранилища подсказка просто покажется снова в следующий раз.
    }
  };
  return (
    <aside className="welcome" role="note">
      <h2>Это пример — поиграйте с ним</h2>
      <p>
        Двушка за 250 000 BYN, одни и те же сбережения и четыре сценария с разными банками. «0,99%», «1%» и «14,9%»
        звучат несравнимо — а теперь сравните <strong>горы переплаты</strong> и <strong>самый большой платёж</strong> ниже:
        у льготных программ платёж через пару лет вырастает в разы.
      </p>
      <p className="hint">
        Всё, что вы введёте, хранится только в этом браузере — на сервер ничего не уходит. Условия банков — ориентиры
        с агрегаторов (ноябрь 2026), не предложение банка: сверяйте в банке.
      </p>
      <div className="welcome-actions">
        <button type="button" className="primary" onClick={() => { onStartOwn(); dismiss(); }}>Начать свой профиль</button>
        <button type="button" onClick={dismiss}>Понятно, остаться в примере</button>
      </div>
    </aside>
  );
}
