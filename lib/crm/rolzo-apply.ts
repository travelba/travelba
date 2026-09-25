import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshBookingLedger } from "@/lib/crm/bookings";
import {
  extraServiceLeg,
  findExtra,
  isServicePlace,
  itineraryOffers,
  type ExtraLeg,
  type ServicePlace,
} from "@/lib/crm/extras";
import {
  cancellationNotice,
  cancelRolzoBooking,
  chauffeurItemFields,
  fetchRolzoBooking,
  legFromRolzoReference,
  RolzoError,
  type RolzoBookingView,
} from "@/lib/crm/rolzo";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

function chauffeurOffer(
  items: CrmBookingItem[],
  leg: ExtraLeg,
  place: ServicePlace
) {
  return (
    itineraryOffers(items).find(
      (row) => row.kind === "chauffeur" && row.leg === leg && row.place === place
    ) || null
  );
}

function rolzoIdOf(item: { details?: Record<string, unknown> | null }) {
  const value = item.details?.rolzo_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function matchChauffeurItem(
  items: CrmBookingItem[],
  leg: ExtraLeg,
  place: ServicePlace
) {
  const found = findExtra(items, "chauffeur", leg, place);
  return found && "id" in found ? (found as CrmBookingItem) : null;
}

function assertReference(booking: CrmBooking, view: RolzoBookingView, leg: ExtraLeg) {
  const echoed = legFromRolzoReference(booking.reference, view.referenceId);
  if (view.referenceId && echoed && echoed !== leg) {
    throw new RolzoError("Cette course ne correspond pas à ce vol.", 409, "leg_mismatch");
  }
}

async function writeChauffeur(
  supabase: SupabaseClient,
  booking: CrmBooking,
  items: CrmBookingItem[],
  leg: ExtraLeg,
  place: ServicePlace,
  view: RolzoBookingView
) {
  const offer = chauffeurOffer(items, leg, place);
  if (!offer) {
    throw new RolzoError("Ce transfert ne correspond pas aux vols du dossier.", 400, "no_offer");
  }
  assertReference(booking, view, leg);
  const fields = chauffeurItemFields({
    view,
    leg,
    place,
    startAt: offer.whenIso,
    visibleToClient: booking.visible_to_client,
  });
  const existing = matchChauffeurItem(items, leg, place);
  if (existing?.id) {
    const { data, error } = await supabase
      .from("crm_booking_items")
      .update(fields)
      .eq("id", existing.id)
      .eq("booking_id", booking.id)
      .select("*")
      .single();
    if (error || !data) throw new RolzoError("La course n’a pas pu être enregistrée.", 500, "write");
    await refreshBookingLedger(supabase, booking.id);
    return data as CrmBookingItem;
  }
  const { data: rows } = await supabase
    .from("crm_booking_items")
    .select("sort_order")
    .eq("booking_id", booking.id);
  const maxSort = (rows || []).reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), -1);
  const { data, error } = await supabase
    .from("crm_booking_items")
    .insert({ booking_id: booking.id, sort_order: maxSort + 1, ...fields })
    .select("*")
    .single();
  if (error || !data) throw new RolzoError("La course n’a pas pu être enregistrée.", 500, "write");
  await refreshBookingLedger(supabase, booking.id);
  return data as CrmBookingItem;
}

export async function applyRolzoConfirmation(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    rolzoBookingId: string;
    leg: ExtraLeg;
    place: ServicePlace;
    fetchImpl?: typeof fetch;
  }
) {
  const view = await fetchRolzoBooking(opts.rolzoBookingId, opts.fetchImpl);
  return writeChauffeur(supabase, opts.booking, opts.items, opts.leg, opts.place, view);
}

export async function refreshRolzoChauffeur(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    leg: ExtraLeg;
    place: ServicePlace;
    fetchImpl?: typeof fetch;
  }
) {
  const existing = matchChauffeurItem(opts.items, opts.leg, opts.place);
  const rolzoId = existing ? rolzoIdOf(existing) : null;
  if (!existing || !rolzoId) {
    throw new RolzoError("Aucune course chauffeur n’est enregistrée sur ce vol.", 404, "missing");
  }
  const view = await fetchRolzoBooking(rolzoId, opts.fetchImpl);
  return writeChauffeur(supabase, opts.booking, opts.items, opts.leg, opts.place, view);
}

export async function quoteRolzoCancellation(
  items: CrmBookingItem[],
  leg: ExtraLeg,
  place: ServicePlace,
  fetchImpl?: typeof fetch
) {
  const existing = matchChauffeurItem(items, leg, place);
  const rolzoId = existing ? rolzoIdOf(existing) : null;
  if (!existing || !rolzoId) {
    throw new RolzoError("Aucune course chauffeur n’est enregistrée sur ce vol.", 404, "missing");
  }
  const view = await fetchRolzoBooking(rolzoId, fetchImpl);
  return {
    notice: cancellationNotice(view),
    fee: view.cancellationFee,
    currency: view.currency,
    policy: view.cancellationPolicy,
  };
}

export async function cancelRolzoChauffeur(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    leg: ExtraLeg;
    place: ServicePlace;
    shown: string | null;
    fetchImpl?: typeof fetch;
  }
) {
  const existing = matchChauffeurItem(opts.items, opts.leg, opts.place);
  const rolzoId = existing ? rolzoIdOf(existing) : null;
  if (!existing || !rolzoId) {
    throw new RolzoError("Aucune course chauffeur n’est enregistrée sur ce vol.", 404, "missing");
  }
  const current = await fetchRolzoBooking(rolzoId, opts.fetchImpl);
  const notice = cancellationNotice(current);
  if ((notice || null) !== (opts.shown || null)) {
    throw new RolzoError("Les frais d’annulation ont changé. Relisez-les avant de confirmer.", 409, "fee_changed");
  }
  await cancelRolzoBooking(rolzoId, opts.fetchImpl);
  const view = await fetchRolzoBooking(rolzoId, opts.fetchImpl);
  return writeChauffeur(supabase, opts.booking, opts.items, opts.leg, opts.place, view);
}

export function chauffeurLegPlace(body: Record<string, unknown> | null): {
  leg: ExtraLeg;
  place: ServicePlace;
} {
  const leg = body?.leg === "arrival" || body?.leg === "departure" ? body.leg : null;
  const placeRaw = typeof body?.place === "string" ? body.place : "";
  if (!leg || !isServicePlace(placeRaw)) {
    throw new RolzoError("Indiquez le vol et le lieu du transfert.", 400, "bad_leg");
  }
  return { leg, place: placeRaw };
}

export function isRolzoChauffeur(item: { kind?: string | null; details?: Record<string, unknown> | null }) {
  return item.kind === "chauffeur" && item.details?.rolzo === true && extraServiceLeg(item) != null;
}
