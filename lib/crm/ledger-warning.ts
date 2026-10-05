/**
 * Lecture côté écran de l’avertissement `ledger_warning` (réponse 200 des routes dossier et étapes).
 * L’enregistrement a réussi, seul le grand livre a refusé : on le dit à l’agent, sans « Réessayer »
 * (un second envoi dupliquerait le dossier ou l’étape).
 */
export function readLedgerWarning(json: unknown): string | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const value = (json as { ledger_warning?: unknown }).ledger_warning;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Ce que l’agent fait ensuite : ne pas rejouer l’action, contrôler les écritures avant de réclamer un solde. */
export const LEDGER_WARNING_HINT =
  "L’action est bien faite, ne la refaites pas. Contrôlez les écritures dans l’onglet Argent avant de réclamer un solde au client.";
