export const REVOLUT_STATUS_LABELS: Record<string, string> = {
  unmatched: "À rapprocher",
  matched: "Rapproché",
  ignored: "Refusé",
};

export const REVOLUT_DIRECTION_LABELS: Record<string, string> = {
  credit: "Revenu",
  debit: "Dépense",
};

export function revolutStatusLabel(status: string) {
  return REVOLUT_STATUS_LABELS[status] ?? status;
}

export function revolutDirectionLabel(direction: string | null | undefined) {
  if (!direction) return REVOLUT_DIRECTION_LABELS.credit;
  return REVOLUT_DIRECTION_LABELS[direction] ?? direction;
}

export function revolutStatusTone(status: string): "amber" | "gold" | "navy" {
  if (status === "unmatched") return "amber";
  if (status === "matched") return "gold";
  return "navy";
}

export function revolutDirectionTone(direction: string | null | undefined): "gold" | "navy" {
  return direction === "debit" ? "navy" : "gold";
}

export function revolutSyncSummary(
  fetched: number,
  inserted: number,
  autoMatched = 0
) {
  const lus = fetched > 1 ? `${fetched} mouvements lus` : `${fetched} mouvement lu`;
  const nouveaux = inserted > 1 ? `${inserted} nouveaux` : `${inserted} nouveau`;
  const base = `Synchronisation terminée : ${lus}, ${nouveaux}`;
  if (autoMatched <= 0) return `${base}.`;
  const auto =
    autoMatched > 1
      ? `${autoMatched} crédits automatiques`
      : `${autoMatched} crédit automatique`;
  return `${base}, ${auto}.`;
}
