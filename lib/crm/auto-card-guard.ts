import { isCancellationExtract, type BookingExtract } from "@/lib/crm/ingest-types";
import { findMatchingItem, type MatchableItem } from "@/lib/crm/item-match";
import { confirmationRefsAlign } from "@/lib/crm/email-match";
import { isLeCancelled } from "@/lib/crm/little-emperors";
import type { StepIdentity } from "@/lib/crm/step-journal";

export type AutoCard = StepIdentity & {
  lifecycle?: string | null;
};

export type CancelledReservation = {
  confirmation_ref?: string | null;
  booking_status?: string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
};

export type AutoCardSkip = "retiree" | "annulee" | "marquee";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stateText(value: unknown) {
  return text(value);
}

/** Statut d’annulation exact. Une politique « free cancellation » ne compte pas. */
export function markedCancelledState(value: unknown) {
  const raw = stateText(value);
  if (!raw) return false;
  if (isLeCancelled(raw)) return true;
  const folded = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return folded === "cancelled" || folded === "canceled" || folded === "annule" || folded === "annulee";
}

function detailRecord(details: Record<string, unknown> | null | undefined) {
  return details && typeof details === "object" ? details : {};
}

function roomRows(details: Record<string, unknown> | null | undefined) {
  const rooms = detailRecord(details).rooms;
  return Array.isArray(rooms) ? rooms : [];
}

/** La carte, ou chacune de ses chambres, est marquée annulée. */
export function reservationMarkedCancelled(item: AutoCard) {
  if (markedCancelledState(item.lifecycle)) return true;
  const details = detailRecord(item.details);
  if (markedCancelledState(details.state) || markedCancelledState(details.status) || markedCancelledState(details.phase)) {
    return true;
  }
  const rooms = roomRows(details);
  return rooms.length > 0 && rooms.every((room) => {
    if (!room || typeof room !== "object") return false;
    const row = room as { status?: unknown; state?: unknown; lifecycle?: unknown };
    return markedCancelledState(row.status) || markedCancelledState(row.state) || markedCancelledState(row.lifecycle);
  });
}

function asMatchable(item: AutoCard): MatchableItem {
  return {
    kind: item.kind || "",
    title: item.title,
    supplier: item.supplier,
    confirmation_ref: item.confirmation_ref,
    start_at: item.start_at,
    end_at: item.end_at,
    details: detailRecord(item.details),
  };
}

/** Même carte que celle retirée du dossier : référence, vol et jour, ou hôtel. */
export function matchesRemovedCard(incoming: AutoCard, removed: StepIdentity) {
  return Boolean(findMatchingItem([asMatchable(removed)], asMatchable(incoming)));
}

function confirmationHay(item: { confirmation_ref?: string | null; details?: Record<string, unknown> | null }) {
  const bits = [text(item.confirmation_ref)];
  const details = detailRecord(item.details);
  bits.push(text(details.pnr));
  for (const room of roomRows(details)) {
    if (!room || typeof room !== "object") continue;
    bits.push(text((room as { confirmation_ref?: unknown }).confirmation_ref));
  }
  return bits.filter(Boolean);
}

export function sharesCancelledConfirmation(incoming: AutoCard, row: CancelledReservation) {
  const dead = row.booking_status === "cancelled" || markedCancelledState(row.lifecycle);
  if (!dead) return false;
  const left = confirmationHay(incoming);
  const right = confirmationHay(row);
  if (!left.length || !right.length) return false;
  return left.some((needle) => right.some((hay) => confirmationRefsAlign(needle, hay)));
}

export function autoCardSkipReason(
  item: AutoCard,
  context: { removed: StepIdentity[]; cancelled: CancelledReservation[] }
): AutoCardSkip | null {
  if (reservationMarkedCancelled(item)) return "marquee";
  if (context.removed.some((row) => matchesRemovedCard(item, row))) return "retiree";
  if (context.cancelled.some((row) => sharesCancelledConfirmation(item, row))) return "annulee";
  return null;
}

export function filterAutomaticCards<T extends AutoCard>(
  items: T[],
  context: { removed: StepIdentity[]; cancelled: CancelledReservation[]; documentCancelled?: boolean }
) {
  const kept: T[] = [];
  const skipped: { title: string; reason: AutoCardSkip }[] = [];
  for (const item of items) {
    const reason = context.documentCancelled ? "marquee" : autoCardSkipReason(item, context);
    if (reason) skipped.push({ title: (item.title || "").trim() || "Étape", reason });
    else kept.push(item);
  }
  return { kept, skipped };
}

export function filterAutomaticExtract(
  extract: BookingExtract,
  context: { removed: StepIdentity[]; cancelled: CancelledReservation[] }
) {
  const filtered = filterAutomaticCards(extract.items || [], {
    ...context,
    documentCancelled: isCancellationExtract(extract),
  });
  return {
    extract: { ...extract, items: filtered.kept },
    skipped: filtered.skipped,
  };
}

export function skippedCardSummary(skipped: { title: string; reason: AutoCardSkip }) {
  if (skipped.reason === "retiree") return `Carte non recréée : l’agence l’a retirée (${skipped.title}).`;
  if (skipped.reason === "annulee") return `Carte non ajoutée : réservation déjà annulée (${skipped.title}).`;
  return `Carte non ajoutée : réservation marquée annulée (${skipped.title}).`;
}
