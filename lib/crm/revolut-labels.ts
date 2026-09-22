export const REVOLUT_STATUS_LABELS: Record<string, string> = {
  unmatched: "À rapprocher",
  matched: "Crédité",
  ignored: "Ignoré",
};

export function revolutStatusLabel(status: string) {
  return REVOLUT_STATUS_LABELS[status] ?? status;
}

export function revolutStatusTone(status: string): "amber" | "gold" | "navy" {
  if (status === "unmatched") return "amber";
  if (status === "matched") return "gold";
  return "navy";
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
