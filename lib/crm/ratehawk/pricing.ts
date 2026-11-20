/** Marge agence sur le net ETG, en pourcentage. Vide ou illisible : zéro. Pas de plancher. */

export function marginPercent(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function moneyNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Prix vendu = net × (1 + marge). Les taxes non incluses ne s’ajoutent pas. Marge omise : le net. */
export function sellFromNet(net: number, margin = 0): number {
  return roundMoney(net * (1 + marginPercent(margin) / 100));
}

export function priceDelta(before: number, after: number) {
  const delta = roundMoney(after - before);
  const percent = before > 0 ? (delta / before) * 100 : 0;
  return {
    increased: delta > 0.009,
    delta,
    percent,
  };
}

export function formPriceNeedsAcceptance(quoted: number, formAmount: number, accepted: boolean) {
  return priceDelta(quoted, formAmount).increased && !accepted;
}
