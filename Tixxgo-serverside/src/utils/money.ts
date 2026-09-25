export function toPaise(inr: number | string): number {
  const value = typeof inr === 'string' ? Number(inr) : inr;
  if (!Number.isFinite(value)) {
    throw new TypeError('INR amount must be finite');
  }
  return Math.round(value * 100);
}

export function fromPaise(paise: number): number {
  if (!Number.isInteger(paise)) {
    throw new TypeError('Paise amount must be an integer');
  }
  return paise / 100;
}

export function addMoney(...amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

export function subMoney(amount: number, ...subtract: number[]): number {
  return subtract.reduce((total, value) => total - value, amount);
}
