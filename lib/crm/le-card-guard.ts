import { hotelRefTokens } from "@/lib/crm/item-match";
import { isLeCancelled } from "@/lib/crm/little-emperors";
import { toAuditRow } from "@/lib/crm/audit-events";

/** État connu d’une confirmation Little Emperors déjà en base. */
export type KnownLeRef = {
  confirmation: string | null;
  state: string | null;
};

export type HotelCardSnapshot = {
  id: string;
  confirmation_ref?: string | null;
  lifecycle?: string | null;
  visible_to_client?: boolean | null;
};

export type HotelStatusPatch = {
  lifecycle?: "cancelled";
  visible_to_client?: false;
};

function tokenState(token: string, known: KnownLeRef[]): "booked" | "cancelled" | "unknown" {
  const hits = known.filter((row) => hotelRefTokens(row.confirmation).includes(token));
  if (!hits.length) return "unknown";
  if (hits.some((row) => !isLeCancelled(row.state))) return "booked";
  return "cancelled";
}

/**
 * Plusieurs références : la carte reste active dès qu’une est réservée.
 * On n’annule automatiquement que si chaque référence est annulée.
 * Une référence inconnue bloque l’annulation.
 */
export function hotelCardAutoCancel(confirmationRef: string | null | undefined, known: KnownLeRef[]) {
  const tokens = hotelRefTokens(confirmationRef);
  if (!tokens.length) return { cancel: false, booked: false };
  const states = tokens.map((token) => tokenState(token, known));
  if (states.includes("booked")) return { cancel: false, booked: true };
  if (states.includes("unknown")) return { cancel: false, booked: false };
  return { cancel: states.every((state) => state === "cancelled"), booked: false };
}

/** Statut et visibilité seulement. Jamais le grand livre, jamais un coût hôtel. */
export function automaticHotelCardPatch(
  item: { lifecycle?: string | null; visible_to_client?: boolean | null },
  decision: { cancel: boolean; booked: boolean }
): HotelStatusPatch | null {
  if (decision.booked || !decision.cancel) return null;
  const patch: HotelStatusPatch = {};
  if (item.lifecycle !== "cancelled") patch.lifecycle = "cancelled";
  if (item.visible_to_client) patch.visible_to_client = false;
  return Object.keys(patch).length ? patch : null;
}

/**
 * Une confirmation annulée ne s’ajoute pas à une carte qui a déjà une autre référence.
 * La référence réservée reste seule tant que l’agence ne l’a pas réunie elle-même.
 */
export function confirmationForStamp(
  itemRef: string | null | undefined,
  incoming: string | null | undefined,
  incomingCancelled: boolean
): string | null {
  if (!incomingCancelled) return incoming || null;
  const tokens = hotelRefTokens(itemRef);
  const incomingTokens = new Set(hotelRefTokens(incoming));
  if (!tokens.length || tokens.every((token) => incomingTokens.has(token))) return incoming || null;
  return null;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

/** Le sync n’écrit pas une carte déjà à jour : pas de réécriture, pas de visibilité. */
export function hotelStampChanged(
  item: { confirmation_ref?: string | null; details?: Record<string, unknown> | null },
  patch: { confirmation_ref?: string | null; details?: Record<string, unknown> | null }
) {
  const nextRef = "confirmation_ref" in patch ? patch.confirmation_ref ?? null : item.confirmation_ref ?? null;
  if ((nextRef || null) !== (item.confirmation_ref || null)) return true;
  return stableJson(item.details || {}) !== stableJson(patch.details || {});
}

export function planAutomaticHotelCancel(input: {
  items: HotelCardSnapshot[];
  matchedIds: string[];
  known: KnownLeRef[];
  mode: "sync" | "agent";
}) {
  const targets = input.items.filter((item) => input.matchedIds.includes(item.id));
  const keptBookedIds: string[] = [];
  const updates: { id: string; patch: HotelStatusPatch }[] = [];
  let blocked = false;
  for (const item of targets) {
    const decision = hotelCardAutoCancel(item.confirmation_ref, input.known);
    if (decision.booked) {
      keptBookedIds.push(item.id);
      continue;
    }
    if (!decision.cancel) {
      blocked = true;
      continue;
    }
    const patch = automaticHotelCardPatch(item, decision);
    if (patch) updates.push({ id: item.id, patch });
  }
  const useLedgerCancellation =
    input.mode === "agent" && keptBookedIds.length === 0 && !blocked && updates.length > 0;
  return { updates, keptBookedIds, useLedgerCancellation };
}

/** Un événement par champ changé : source, ancienne valeur, nouvelle valeur. */
export function automaticCardAudits(input: {
  bookingId: string;
  customerId?: string | null;
  itemId: string;
  source: string;
  changes: {
    field: "lifecycle" | "visible_to_client";
    oldValue: string | boolean | null;
    newValue: string | boolean | null;
  }[];
}) {
  return input.changes
    .filter((change) => change.oldValue !== change.newValue)
    .map((change) => ({
      ...toAuditRow({
        actorKind: "auto" as const,
        action: change.field === "lifecycle" ? "carte_statut" : "carte_visibilite",
        bookingId: input.bookingId,
        customerId: input.customerId,
        summary:
          change.field === "lifecycle"
            ? "Statut de la carte modifié automatiquement."
            : "Visibilité de la carte modifiée automatiquement.",
        detail: {
          source: input.source,
          item_id: input.itemId,
          field: change.field,
          old: change.oldValue,
          new: change.newValue,
        },
      }),
      entity_type: "booking_item",
      entity_id: input.itemId,
    }));
}
