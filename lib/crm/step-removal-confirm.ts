export type RemovalSignal = {
  id: string;
  title: string;
  /** Un enregistrement en ligne a été posé sur la carte. */
  checkin: boolean;
  boardingPass: boolean;
  /** Pièces liées, hors cartes d’embarquement déjà comptées à part. */
  documents: number;
};

export function cardHasOnlineCheckin(stored: { status?: string | null; actor?: string | null } | null | undefined) {
  if (!stored) return false;
  const status = (stored.status || "").trim();
  if (!status) return Boolean(stored.actor);
  if (status === "a_faire" && !stored.actor) return false;
  return true;
}

export function removalReasons(card: RemovalSignal) {
  const parts: string[] = [];
  if (card.checkin) parts.push("enregistrement en ligne");
  if (card.boardingPass) parts.push("carte d’embarquement");
  if (card.documents === 1) parts.push("une pièce liée");
  else if (card.documents > 1) parts.push(`${card.documents} pièces liées`);
  return parts;
}

export function removalIsSensitive(card: RemovalSignal) {
  return removalReasons(card).length > 0;
}

/** Texte de la confirmation avant un enregistrement qui retire des cartes. */
export function removalConfirm(cards: RemovalSignal[]) {
  const lines = cards.map((card) => {
    const name = card.title.trim() || "Étape";
    const reasons = removalReasons(card);
    return reasons.length ? `${name} — ${reasons.join(", ")}` : name;
  });
  const count = cards.length;
  return {
    title: count > 1 ? "Retirer ces étapes du carnet ?" : "Retirer cette étape du carnet ?",
    intro: count > 1 ? "L’enregistrement retire ces étapes :" : "L’enregistrement retire cette étape :",
    lines,
    warning: cards.some(removalIsSensitive)
      ? "Attention : une étape a un enregistrement en ligne, une carte d’embarquement ou des pièces liées."
      : null,
    confirmLabel: count > 1 ? "Retirer ces étapes" : "Retirer l’étape",
  };
}
