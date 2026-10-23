export function formatUsd(amount: number): string {
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount);
  return `${formatted}\u00a0USD`;
}

export function nightsLabel(count: number): string {
  return count > 1 ? `${count} nuits` : `${count} nuit`;
}
