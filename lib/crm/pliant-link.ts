/** Rattachement manuel d’une dépense Pliant : état à l’écran, proposition écartée, correction ciblée. */

export const MISTAKEN_PLIANT_LINK = {
  spendId: "a9c1150f-516f-4dfc-ba82-898b83e0b0c3",
  bookingReference: "TB-2026-0098",
} as const;

export type TripCostActor = { staffId?: string | null; label?: string | null };

export type PliantLinkPhase = "a_proposer" | "rattache" | "hors_voyage";

export function tripCostActorFromStaff(staff: { id: string; full_name?: string | null }): TripCostActor {
  return { staffId: staff.id, label: (staff.full_name || "").trim() || "Agence" };
}

export function pliantLinkPhase(input: { matchStatus: string | null; linked: boolean }): PliantLinkPhase {
  if (input.linked) return "rattache";
  if ((input.matchStatus || "").toLowerCase() === "ignored") return "hors_voyage";
  return "a_proposer";
}

export function pliantLinkPhaseLabel(phase: PliantLinkPhase) {
  if (phase === "a_proposer") return "À proposer";
  if (phase === "rattache") return "Rattachée";
  return "Hors voyage";
}

export function withoutRefusedSuggestions<T extends { bookingId: string }>(suggestions: T[], refusedBookingIds: readonly string[]) {
  if (!refusedBookingIds.length) return suggestions;
  const refused = new Set(refusedBookingIds);
  return suggestions.filter((row) => !refused.has(row.bookingId));
}

export type TripCostEventSentence = {
  action: string;
  who: string | null;
  fromReference: string | null;
  toReference: string | null;
  atLabel: string;
};

export function tripCostEventSentence(event: TripCostEventSentence) {
  const who = (event.who || "").trim();
  const when = (event.atLabel || "").trim();
  const tail = [who, when].filter(Boolean).join(" · ");
  switch (event.action) {
    case "attach":
      return joinTail(`Rattachée à ${event.toReference || "un dossier"}`, tail);
    case "detach":
      return joinTail(event.fromReference ? `Détachée de ${event.fromReference}` : "Détachée", tail);
    case "move":
      return joinTail(`${event.fromReference || "Dossier"} → ${event.toReference || "un dossier"}`, tail);
    case "refuse":
      return joinTail(event.toReference ? `Proposition écartée · ${event.toReference}` : "Proposition écartée", tail);
    case "correction":
      return joinTail(
        event.fromReference ? `Remise à proposer · retirée de ${event.fromReference}` : "Remise à proposer",
        when
      );
    default:
      return "";
  }
}

function joinTail(head: string, tail: string) {
  return tail ? `${head} · ${tail}` : head;
}

export type PliantUnlinkCost = { id: string; reference: string };

export type PliantUnlinkSnap = {
  spendId: string;
  matchStatus: string | null;
  bookingId: string | null;
  costs: PliantUnlinkCost[];
};

export type PliantUnlinkGuard = {
  merchant: string | null;
  last4: string | null;
  billingCents: number | null;
  status: string | null;
};

/** Cette dépense-là : Phulay Bay, carte ····7171, montant comptabilisé. Aucune autre. */
export function pliantUnlinkGuardOk(row: PliantUnlinkGuard) {
  const merchant = (row.merchant || "").toUpperCase();
  const cents = row.billingCents == null ? null : Math.round(Number(row.billingCents));
  return merchant.includes("PHULAY") && row.last4 === "7171" && cents === -1604211 && (row.status || "").toUpperCase() === "BOOKED";
}

/**
 * Retire seulement le coût posé sur le dossier indiqué.
 * Déjà sur un autre dossier : on ne touche pas.
 * Déjà à proposer : rien à faire.
 */
export function planPliantUnlink(snap: PliantUnlinkSnap, expected: { spendId: string; bookingReference: string }) {
  const empty = { dropCostIds: [] as string[], reset: false, changed: false, reason: "rien" };
  if (snap.spendId !== expected.spendId) return { ...empty, reason: "autre dépense" };
  const drop = snap.costs.filter((row) => row.reference === expected.bookingReference);
  const others = snap.costs.filter((row) => row.reference !== expected.bookingReference);
  if (others.length) return { ...empty, reason: "rattachée ailleurs" };
  const matched = (snap.matchStatus || "").toLowerCase() === "matched" || Boolean(snap.bookingId);
  if (!drop.length && !matched) return { ...empty, reason: "déjà à proposer" };
  return {
    dropCostIds: drop.map((row) => row.id),
    reset: true,
    changed: true,
    reason: drop.length ? "coût retiré" : "statut remis à proposer",
  };
}
