/** Préviens le bot SNCF. Sans URL, rien ne part. Pas de numéro de pièce dans le corps. */

export type TrainBotEvent =
  | "demande_creee"
  | "contrainte"
  | "prix_a_reconfirmer"
  | "choix_recu"
  | "accord"
  | "relance"
  | "refus"
  | "suite"
  | "recherche"
  | "agence";

/** Événement webhook pour un tour déjà calculé. La création est notifiée à part. */
export function trainBotEventsForTurn(turn: { action: string; patch?: Record<string, unknown> | null }): TrainBotEvent[] {
  if (turn.action === "choix") return ["accord"];
  if (turn.action === "delai") return ["relance"];
  if (turn.action === "reprise") return ["prix_a_reconfirmer"];
  if (turn.action === "refuse") return ["refus"];
  if (turn.action === "contrainte") return ["contrainte"];
  if (turn.action === "suite") return ["suite"];
  if (turn.action === "agence") return ["agence"];
  const patch = turn.patch || {};
  const chose =
    Object.prototype.hasOwnProperty.call(patch, "choix_aller") ||
    Object.prototype.hasOwnProperty.call(patch, "choix_retour") ||
    Object.prototype.hasOwnProperty.call(patch, "classe") ||
    Object.prototype.hasOwnProperty.call(patch, "tarif") ||
    patch.step === "accord";
  if (turn.action === "question" && chose) return ["choix_recu"];
  return [];
}

export async function notifyTrainBot(
  body: { evenement: TrainBotEvent; demande_id: string; dossier_id?: string; reference?: string; contrainte?: string; suite?: string },
  fetchImpl: typeof fetch = fetch
) {
  const url = process.env.TRAIN_BOT_WEBHOOK_URL?.trim() || "";
  if (!url) return { envoye: false as const, raison: "TRAIN_BOT_WEBHOOK_URL absent" };
  const secret = process.env.TRAIN_BOT_WEBHOOK_SECRET?.trim() || "";
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { envoye: false as const, raison: `HTTP ${response.status}` };
    return { envoye: true as const };
  } catch {
    return { envoye: false as const, raison: "webhook injoignable" };
  }
}
