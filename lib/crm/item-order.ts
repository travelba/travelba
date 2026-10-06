import type { SupabaseClient } from "@supabase/supabase-js";
import { isLedgerExpenseKind } from "@/lib/crm/types";

export type ChronoCard = {
  id: string;
  kind?: string | null;
  start_at?: string | null;
  sort_order?: number | null;
};

function dayOf(value: string | null | undefined) {
  const raw = (value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function clockOf(value: string | null | undefined) {
  const match = (value || "").match(/[T ](\d{2}:\d{2})/);
  return match?.[1] || "";
}

/**
 * Jour, puis l’heure imprimée. Minuit sur un hôtel (ou toute carte sans vol ni train)
 * n’est pas une heure : la carte passe après les trajets du même jour.
 * Deux cartes à la même clé gardent leur `sort_order`.
 */
export function stepChronoKey(item: { kind?: string | null; start_at?: string | null }) {
  const day = dayOf(item.start_at) || "9999-99-99";
  const clock = clockOf(item.start_at);
  const timed = item.kind === "flight" || item.kind === "rail";
  if (timed) return `${day}T${clock || "00:00"}`;
  if (clock && clock !== "00:00") return `${day}T${clock}`;
  return `${day}T23:59`;
}

export function compareChrono(a: ChronoCard, b: ChronoCard) {
  const byDate = stepChronoKey(a).localeCompare(stepChronoKey(b));
  if (byDate) return byDate;
  const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (order) return order;
  return a.id.localeCompare(b.id);
}

export function cardsInListOrder<T extends ChronoCard>(items: T[]) {
  return items
    .filter((item) => !isLedgerExpenseKind(item.kind))
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id));
}

export function chronoRank<T extends ChronoCard>(items: T[]) {
  return items.slice().sort(compareChrono);
}

function sameIds(left: { id: string }[], right: { id: string }[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id);
}

/** Insère chaque carte nouvelle devant la première déjà là dont la date est plus tardive. */
export function spliceCardsByDate<T extends ChronoCard>(existing: T[], incoming: T[]) {
  const list = existing.slice();
  for (const card of chronoRank(incoming)) {
    const key = stepChronoKey(card);
    const index = list.findIndex((row) => stepChronoKey(row) > key);
    if (index < 0) list.push(card);
    else list.splice(index, 0, card);
  }
  return list;
}

/**
 * Défaut : toute la liste repasse en dates.
 * Rangement manuel : les cartes déjà là gardent leur ordre, la nouvelle se glisse à sa date.
 * Un glisser qui ne suit plus les dates marque le dossier comme rangé à la main.
 */
export function orderAfterChange(input: {
  custom: boolean;
  existing: ChronoCard[];
  created: ChronoCard[];
  submittedIds?: string[] | null;
}): { custom: boolean; ids: string[] } {
  const existingIds = input.existing.map((card) => card.id);
  const existingSet = new Set(existingIds);
  const submittedExisting = (input.submittedIds || []).filter((id) => existingSet.has(id));
  const dragged =
    Boolean(input.submittedIds?.length) && submittedExisting.join("\0") !== existingIds.join("\0");
  const byId = new Map([...input.existing, ...input.created].map((card) => [card.id, card]));

  let ordered: ChronoCard[];
  if (dragged) {
    const kept = submittedExisting.map((id) => byId.get(id)).filter((card): card is ChronoCard => Boolean(card));
    ordered = spliceCardsByDate(kept, input.created);
  } else if (!input.custom) {
    ordered = chronoRank([...input.existing, ...input.created]);
  } else {
    ordered = spliceCardsByDate(input.existing, input.created);
  }

  const seen = new Set(ordered.map((card) => card.id));
  for (const card of [...input.existing, ...input.created]) {
    if (!seen.has(card.id)) ordered.push(card);
  }
  const chrono = chronoRank(ordered);
  return { custom: !sameIds(ordered, chrono), ids: ordered.map((card) => card.id) };
}

/** Réécrit `sort_order` des cartes (pas les dépenses) et le drapeau de rangement manuel. */
export async function persistBookingCardOrder(
  supabase: SupabaseClient,
  bookingId: string,
  opts?: { createdIds?: string[]; submittedIds?: string[] | null }
) {
  const [{ data: booking, error: bookingError }, { data: rows, error: rowsError }] = await Promise.all([
    supabase.from("crm_bookings").select("items_order_custom").eq("id", bookingId).maybeSingle(),
    supabase
      .from("crm_booking_items")
      .select("id, kind, start_at, sort_order")
      .eq("booking_id", bookingId),
  ]);
  if (bookingError) throw bookingError;
  if (rowsError) throw rowsError;
  const cards = cardsInListOrder((rows || []) as ChronoCard[]);
  const createdSet = new Set(opts?.createdIds || []);
  const plan = orderAfterChange({
    custom: booking?.items_order_custom === true,
    existing: cards.filter((card) => !createdSet.has(card.id)),
    created: cards.filter((card) => createdSet.has(card.id)),
    submittedIds: opts?.submittedIds,
  });
  for (let index = 0; index < plan.ids.length; index += 1) {
    const current = cards.find((card) => card.id === plan.ids[index]);
    if (current?.sort_order === index) continue;
    const { error } = await supabase
      .from("crm_booking_items")
      .update({ sort_order: index })
      .eq("id", plan.ids[index])
      .eq("booking_id", bookingId);
    if (error) throw error;
  }
  if ((booking?.items_order_custom === true) !== plan.custom) {
    const { error } = await supabase
      .from("crm_bookings")
      .update({ items_order_custom: plan.custom })
      .eq("id", bookingId);
    if (error) throw error;
  }
}
