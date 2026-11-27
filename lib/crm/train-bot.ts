/** Préviens le bot SNCF. Sans URL, rien ne part. Pas de numéro de pièce dans le corps. */

export type TrainBotEvent = "demande_creee" | "contrainte" | "prix_a_reconfirmer" | "choix_recu" | "refus" | "suite";

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
