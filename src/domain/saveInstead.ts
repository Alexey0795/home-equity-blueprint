/**
 * «Копить вместо кредита»: каждый месяц деньги кладутся на вклад, а цена квартиры растёт. Покупка — в первый месяц,
 * когда на вкладе не меньше цены. Пока копишь — платишь аренду.
 */
export interface SaveInsteadInput {
  /** Сколько есть сразу. */
  start: number;
  /** Сколько класть на вклад в месяц. */
  monthly: number;
  /** % годовых, проценты причисляются каждый месяц. */
  depositRatePct: number;
  /** Цена квартиры сегодня. */
  price: number;
  /** Рост цены, % в год (может быть отрицательным). */
  priceGrowthPct: number;
  /** Аренда в месяц, пока копишь. */
  rentPerMonth: number;
}

export interface SaveRow {
  month: number;
  deposit: number;
  price: number;
}

export interface SaveInsteadResult {
  rows: SaveRow[];
  /** Месяц покупки (0 — уже хватает); null — не накопить и за 100 лет. */
  purchaseMonth: number | null;
  priceAtPurchase: number;
  /** Сколько положено своих денег до покупки (старт + взносы). */
  contributed: number;
  /** Проценты вклада до покупки. */
  depositInterest: number;
  /** Аренда до покупки. */
  rentTotal: number;
}

const MAX_MONTHS = 1200;

/** Копить до полной цены. Бросает RangeError на некорректном вводе. */
export function saveUntilPrice(input: SaveInsteadInput): SaveInsteadResult {
  const { start, monthly, depositRatePct, price, priceGrowthPct, rentPerMonth } = input;
  const check = (v: number, what: string, min = 0) => {
    if (!Number.isFinite(v) || v < min) throw new RangeError(`${what}: нужно число${min === 0 ? ' не меньше 0' : ''}`);
  };
  check(start, 'Сколько есть сразу');
  check(monthly, 'Сколько откладывать в месяц');
  check(depositRatePct, 'Ставка вклада');
  check(rentPerMonth, 'Аренда в месяц');
  if (!Number.isFinite(price) || price <= 0) throw new RangeError('Цена квартиры должна быть положительным числом');
  if (!Number.isFinite(priceGrowthPct) || priceGrowthPct <= -100) throw new RangeError('Рост цены: число больше −100%');
  const r = depositRatePct / 100 / 12;
  const g = (1 + priceGrowthPct / 100) ** (1 / 12);

  const rows: SaveRow[] = [{ month: 0, deposit: start, price }];
  let deposit = start;
  let currentPrice = price;
  let interest = 0;
  let month = 0;
  while (deposit < currentPrice && month < MAX_MONTHS) {
    month++;
    const earned = deposit * r;
    interest += earned;
    deposit += earned + monthly;
    currentPrice *= g;
    rows.push({ month, deposit, price: currentPrice });
  }
  const bought = deposit >= currentPrice;
  return {
    rows,
    purchaseMonth: bought ? month : null,
    priceAtPurchase: currentPrice,
    contributed: start + monthly * month,
    depositInterest: interest,
    rentTotal: rentPerMonth * month,
  };
}
