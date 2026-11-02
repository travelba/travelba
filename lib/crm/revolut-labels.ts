/** Mêmes mots que Stripe : un crédit est à encaisser, encaissé ou refusé. */
export const REVOLUT_STATUS_LABELS: Record<string, string> = {
  unmatched: "À encaisser",
  matched: "Encaissé",
  ignored: "Refusé",
};

export function revolutStatusLabel(status: string) {
  return REVOLUT_STATUS_LABELS[status] ?? status;
}

export function revolutStatusTone(status: string): "amber" | "gold" | "navy" {
  if (status === "unmatched") return "amber";
  if (status === "matched") return "gold";
  return "navy";
}

/** Aucun crédit ne part tout seul : le résumé ne compte que les mouvements lus et les nouveaux. */
export function revolutSyncSummary(fetched: number, inserted: number) {
  const lus = fetched > 1 ? `${fetched} mouvements lus` : `${fetched} mouvement lu`;
  const nouveaux = inserted > 1 ? `${inserted} nouveaux` : `${inserted} nouveau`;
  return `Synchronisation terminée : ${lus}, ${nouveaux}.`;
}

/** « 3 clients possibles — choisir » : des candidats, aucun assez sûr pour être présélectionné. */
export function possibleClientsLabel(count: number) {
  const plural = count > 1 ? "s" : "";
  return `${count} client${plural} possible${plural} — choisir`;
}
