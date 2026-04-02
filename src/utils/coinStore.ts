const COINS_KEY = 'fighting-wars-coins';

export function getCoins(): number {
  const stored = localStorage.getItem(COINS_KEY);
  return stored ? parseInt(stored, 10) : 0;
}

export function addCoins(amount: number): number {
  const total = getCoins() + amount;
  localStorage.setItem(COINS_KEY, total.toString());
  return total;
}
