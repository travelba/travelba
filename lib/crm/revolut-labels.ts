/** Mêmes mots que Stripe : un crédit est à encaisser, encaissé ou refusé. */
export const REVOLUT_STATUS_LABELS: Record<string, string> = {
  unmatched: "À encaisser",
  matched: "Encaissé",
  ignored: "Refusé",
};

export function revolutStatusLabel(status: string) {
  return REVOLUT_STATUS_LABELS[status] ?? status;
}

/** Pastille de la file : un intérêt n’est pas un refus, un paiement Stripe déjà au livre non plus. */
export function revolutInboxStatus(row: {
  status: string;
  category?: string | null;
  stripe_line?: { deja_encaisse?: boolean } | null;
}): { label: string; tone: "amber" | "gold" | "navy" } {
  if (row.category === "interet") return { label: "Hors encaissement", tone: "navy" };
  if (row.category === "interne") return { label: "Virement interne", tone: "navy" };
  if (row.category === "frais") return { label: "Frais d’agence", tone: "navy" };
  if (row.category === "remboursement") return { label: "Remboursement", tone: "navy" };
  if (row.category === "stripe") return { label: "Versement Stripe", tone: "navy" };
  if (row.category === "stripe_paiement" && (row.status === "matched" || row.stripe_line?.deja_encaisse)) {
    return { label: "Virement Stripe (déjà encaissé via Stripe)", tone: "gold" };
  }
  return { label: revolutStatusLabel(row.status), tone: revolutStatusTone(row.status) };
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
