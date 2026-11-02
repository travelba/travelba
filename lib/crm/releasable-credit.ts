/**
 * Crédit que l’agence peut remettre en non rattaché.
 * Module sans serveur : le grand livre client l’importe.
 */

const RELEASE_SOURCES = new Set(["revolut", "stripe", "manual"]);
const RELEASE_KINDS = new Set(["transfer", "card_payment"]);

export function isReleasableCredit(row: {
  direction?: string | null;
  kind?: string | null;
  source?: string | null;
  status?: string | null;
}) {
  return (
    row.direction === "credit" &&
    row.status === "posted" &&
    RELEASE_KINDS.has(row.kind || "") &&
    RELEASE_SOURCES.has(row.source || "")
  );
}
