import { NextResponse } from "next/server";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import type { JournalKind } from "@/lib/crm/agency-journal-kinds";
import { jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import {
  cancelBookingExtra,
  clearServiceRefusal,
  confirmBookingExtra,
  confirmCheckinExtra,
  createBookingExtra,
  parseExtraRequest,
  updateTransferAddresses,
} from "@/lib/crm/extras-write";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

const EXTRA_WORDS: Record<string, string> = {
  chauffeur: "transfert chauffeur",
  greeter: "accueil VIP Airport",
  checkin: "enregistrement en ligne",
  visa: "formalité visa",
};

const LEG_WORDS: Record<string, string> = { departure: "au départ", arrival: "à l’arrivée" };

/** « transfert chauffeur (aller) » : ce que l’Historique dit de l’option. */
function extraWords(extra: { kind: string; leg?: string | null }) {
  const base = EXTRA_WORDS[extra.kind] || extra.kind;
  const leg = extra.leg ? LEG_WORDS[extra.leg] || extra.leg : null;
  return leg ? `${base} ${leg}` : base;
}

/** Une ligne d’Historique par geste sur une option : posée, levée, annulée, adresse modifiée. */
async function journalExtra(input: {
  staffId: string;
  bookingId: string;
  kind: JournalKind;
  summary: string;
  diff?: Record<string, unknown>;
}) {
  await recordAgencyJournal({
    staffId: input.staffId,
    action: input.kind === "option_annulee" ? "delete" : input.kind === "option_posee" ? "create" : "update",
    entityType: "dossier",
    entityId: input.bookingId,
    summary: input.summary,
    diff: input.diff,
    kind: input.kind,
    bookingId: input.bookingId,
    path: `/api/admin/bookings/${input.bookingId}/extras`,
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  try {
    const extra = parseExtraRequest(body);
    const [{ data: items }, { data: travelers }, { data: holder }, { data: companions }] =
      await Promise.all([
        auth.supabase.from("crm_booking_items").select("*").eq("booking_id", id),
        auth.supabase.from("crm_booking_travelers").select("*").eq("booking_id", id),
        auth.supabase.from("crm_customers").select("*").eq("id", booking.customer_id).maybeSingle(),
        auth.supabase.from("crm_travel_companions").select("*").eq("customer_id", booking.customer_id),
      ]);
    const list = (items || []) as CrmBookingItem[];
    if (body?.cancel === true) {
      const cancelled = await cancelBookingExtra(auth.supabase, {
        booking: booking as CrmBooking,
        items: list,
        kind: extra.kind,
        leg: extra.leg,
        place: extra.place,
        moment: extra.moment,
      });
      await journalExtra({
        staffId: auth.staff.id,
        bookingId: id,
        kind: "option_annulee",
        summary: `Option annulée : ${extraWords(extra)}.`,
        diff: { option: { avant: "posée", apres: "annulée" } },
      });
      return NextResponse.json(cancelled);
    }
    if (body?.addresses === true) {
      if (extra.kind !== "chauffeur") {
        return jsonError("Seule l’adresse d’un transfert se modifie ainsi.");
      }
      const updated = await updateTransferAddresses(auth.supabase, {
        booking: booking as CrmBooking,
        items: list,
        leg: extra.leg,
        place: extra.place,
        departAddress: extra.depart || "",
        arriveAddress: extra.arrive || "",
      });
      await journalExtra({
        staffId: auth.staff.id,
        bookingId: id,
        kind: "etape_modifiee",
        summary: `Adresses du ${extraWords(extra)} modifiées.`,
      });
      return NextResponse.json(updated);
    }
    if (body?.confirm === true) {
      if (extra.kind === "checkin") {
        const confirmed = await confirmCheckinExtra(auth.supabase, {
          booking: booking as CrmBooking,
          items: list,
        });
        await journalExtra({
          staffId: auth.staff.id,
          bookingId: id,
          kind: "option_levee",
          summary: `Option levée : ${extraWords(extra)} confirmé.`,
          diff: { option: { avant: "à confirmer", apres: "confirmée" } },
        });
        return NextResponse.json(confirmed);
      }
      if (extra.kind !== "chauffeur" && extra.kind !== "greeter") {
        return jsonError("Seuls le chauffeur, VIP Airport et l’enregistrement se confirment.");
      }
      const confirmed = await confirmBookingExtra(auth.supabase, {
        booking: booking as CrmBooking,
        items: list,
        kind: extra.kind,
        leg: extra.leg,
        place: extra.place,
        moment: extra.moment,
        holder: (holder as CrmCustomer | null) || null,
      });
      await journalExtra({
        staffId: auth.staff.id,
        bookingId: id,
        kind: "option_levee",
        summary: `Option levée : ${extraWords(extra)} confirmé.`,
        diff: { option: { avant: "à confirmer", apres: "confirmée" } },
      });
      return NextResponse.json(confirmed);
    }
    if (!holder) return jsonIssues([{ field: "customer_id", message: "Client introuvable." }], 404);
    if (body?.resume === true) {
      await clearServiceRefusal(auth.supabase, id, extra.kind, extra.leg, extra.place, extra.moment);
    }
    const created = await createBookingExtra(auth.supabase, {
      booking: booking as CrmBooking,
      items: list,
      travelers: (travelers || []) as CrmBookingTraveler[],
      holder: holder as CrmCustomer,
      companions: (companions || []) as CrmCompanion[],
      kind: extra.kind,
      leg: extra.leg,
      place: extra.place,
      moment: extra.moment,
      address: extra.address,
      departAddress: extra.depart,
      arriveAddress: extra.arrive,
      rateId: extra.rateId,
      vehicle: extra.vehicle,
      enforceWindow: false,
    });
    await journalExtra({
      staffId: auth.staff.id,
      bookingId: id,
      kind: "option_posee",
      summary: `Option posée : ${extraWords(extra)}.`,
      diff: { option: { avant: "aucune", apres: "posée, à confirmer" } },
    });
    return NextResponse.json(created);
  } catch (err) {
    if (err instanceof BookingIssuesError) return jsonIssues(err.issues);
    return jsonError(err instanceof Error ? err.message : "Service impossible", 400);
  }
}
