import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { planPartyLinks, planPassportAttach } from "./party-plan";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";
import { cloneTravelDocument } from "./travel-document-write";

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export async function reconcileCustomerParty(customerId: string, supabase?: SupabaseClient) {
  try {
    await linkParty(supabase ?? createServiceClient(), customerId);
  } catch (err) {
    console.error("[reconcile-party]", err instanceof Error ? err.message : "échec");
  }
}

async function linkParty(supabase: SupabaseClient, customerId: string) {
  const [{ data: customer }, { data: companions }, { data: documents }, { data: bookings }] =
    await Promise.all([
      supabase
        .from("crm_customers")
        .select("id, first_name, last_name, usage_name")
        .eq("id", customerId)
        .maybeSingle(),
      supabase
        .from("crm_travel_companions")
        .select("id, first_name, last_name, usage_name")
        .eq("customer_id", customerId),
      supabase.from("crm_travel_documents").select("*").eq("customer_id", customerId),
      supabase.from("crm_bookings").select("id, end_date").eq("customer_id", customerId),
    ]);
  if (!customer) return;
  const bookingRows = bookings || [];
  if (!bookingRows.length) return;
  const bookingIds = bookingRows.map((booking) => booking.id);
  const { data: travelerRows, error } = await supabase
    .from("crm_booking_travelers")
    .select("*")
    .in("booking_id", bookingIds);
  if (error) throw new Error(error.message);

  const holder = {
    first_name: customer.first_name as string | null,
    last_name: customer.last_name as string | null,
    usage_name: customer.usage_name as string | null,
  };
  const companionRows = (companions || []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    usage_name: string | null;
  }[];
  let docs = (documents || []) as CrmTravelDocument[];
  const byBooking = new Map<string, CrmBookingTraveler[]>();
  for (const row of (travelerRows || []) as CrmBookingTraveler[]) {
    const list = byBooking.get(row.booking_id);
    if (list) list.push(row);
    else byBooking.set(row.booking_id, [row]);
  }

  for (const booking of bookingRows) {
    let party = byBooking.get(booking.id) || [];
    if (!party.length) continue;
    const plans = planPartyLinks(party, holder, companionRows);
    for (const plan of plans) {
      if (plan.action === "delete") {
        const { error: deleteError } = await supabase
          .from("crm_booking_travelers")
          .delete()
          .eq("id", plan.id)
          .eq("booking_id", booking.id);
        if (deleteError) throw new Error(deleteError.message);
        party = party.filter((traveler) => traveler.id !== plan.id);
        docs = docs.filter((doc) => doc.traveler_id !== plan.id);
        continue;
      }
      if (plan.action === "link") {
        const { error: linkError } = await supabase
          .from("crm_booking_travelers")
          .update({
            is_account_holder: plan.is_account_holder,
            companion_id: plan.companion_id,
          })
          .eq("id", plan.id)
          .eq("booking_id", booking.id);
        if (linkError) throw new Error(linkError.message);
        party = party.map((traveler) =>
          traveler.id === plan.id
            ? {
                ...traveler,
                is_account_holder: Boolean(plan.is_account_holder),
                companion_id: plan.companion_id ?? null,
              }
            : traveler
        );
      }
    }

    const validOn = booking.end_date || isoToday();
    const used = new Set<string>();
    for (const traveler of party) {
      const source = planPassportAttach(traveler, docs, validOn, holder);
      if (!source || used.has(source.id)) continue;
      used.add(source.id);
      try {
        const cloned = await cloneTravelDocument(supabase, source.id, customerId, {
          bookingId: booking.id,
          travelerId: traveler.id,
          companionId: traveler.companion_id,
        });
        docs.push(cloned);
      } catch (err) {
        console.error("[reconcile-party]", err instanceof Error ? err.message : "échec");
      }
    }
  }
}
