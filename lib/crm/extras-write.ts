import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshBookingLedger } from "@/lib/crm/bookings";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import {
  extraAmount,
  extraFlightAt,
  extraHeadsFromBooking,
  extraItemPayload,
  extraNoticeOk,
  extraTitle,
  findExtra,
  isExtraKind,
  isExtraLeg,
  type ExtraKind,
  type ExtraLeg,
} from "@/lib/crm/extras";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "@/lib/crm/types";

export async function createBookingExtra(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    travelers: CrmBookingTraveler[];
    holder: CrmCustomer;
    companions: CrmCompanion[];
    kind: ExtraKind;
    leg: ExtraLeg;
    address?: string | null;
    enforceWindow?: boolean;
    now?: Date;
  }
) {
  if (opts.kind === "greeter" && !opts.holder.is_vip) {
    throw new BookingIssuesError("Greeter réservé aux clients VIP.", [
      {
        field: "kind",
        message: "Le greeter est réservé aux clients VIP. Passez le compte en VIP sur la fiche.",
      },
    ]);
  }
  if (findExtra(opts.items, opts.kind, opts.leg)) {
    throw new BookingIssuesError("Service déjà demandé.", [
      {
        field: "leg",
        message: `${extraTitle(opts.kind, opts.leg)} est déjà sur ce dossier.`,
      },
    ]);
  }
  const startAt =
    extraFlightAt(opts.items, opts.leg, opts.booking.start_date || opts.booking.end_date) || null;
  if (opts.enforceWindow && !extraNoticeOk(startAt, opts.now)) {
    throw new BookingIssuesError("Délai de 48 h dépassé.", [
      {
        field: "leg",
        message:
          "Ce service se demande au moins 48 h avant le vol. Écrivez-nous sur WhatsApp pour un départ imminent.",
      },
    ]);
  }
  const at = startAt ? new Date(startAt) : opts.now || new Date();
  const heads = extraHeadsFromBooking({
    travelers: opts.travelers,
    holder: opts.holder,
    companions: opts.companions,
    at,
  });
  const amount = extraAmount(opts.kind, heads.adults, heads.children);
  if (amount <= 0) {
    throw new BookingIssuesError("Montant invalide.", [
      { field: "amount", message: "Impossible de calculer le tarif de ce service." },
    ]);
  }
  const { data: existing } = await supabase
    .from("crm_booking_items")
    .select("sort_order")
    .eq("booking_id", opts.booking.id);
  const maxSort = (existing || []).reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), -1);
  const payload = extraItemPayload({
    kind: opts.kind,
    leg: opts.leg,
    startAt,
    amount,
    address: opts.address,
    adults: heads.adults,
    children: heads.children,
    visibleToClient: opts.booking.visible_to_client,
  });
  const { data, error } = await supabase
    .from("crm_booking_items")
    .insert({
      booking_id: opts.booking.id,
      sort_order: maxSort + 1,
      ...payload,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new BookingIssuesError("Service non enregistré.", [
      { field: "form", message: "Enregistrement du service impossible. Réessayez." },
    ]);
  }
  await refreshBookingLedger(supabase, opts.booking.id);
  return { item: data as CrmBookingItem, heads, amount };
}

export function parseExtraRequest(body: Record<string, unknown> | null) {
  const kind = String(body?.kind || "");
  const leg = String(body?.leg || "");
  if (!isExtraKind(kind) || !isExtraLeg(leg)) {
    throw new BookingIssuesError("Service invalide.", [
      { field: "kind", message: "Indiquez un service (chauffeur ou greeter) et un trajet (départ ou arrivée)." },
    ]);
  }
  return {
    kind,
    leg,
    address: String(body?.address || "").trim() || null,
  };
}
