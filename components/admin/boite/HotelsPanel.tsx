import { HotelSearchDesk, type HotelRequestView } from "@/components/admin/HotelSearchDesk";
import { HotelInbox } from "@/components/admin/HotelInbox";
import { ViewPills } from "@/components/admin/TabLinks";
import type { SearchParamValue } from "@/lib/crm/admin-list";
import { boiteHref, HOTELS_VIEW_LABELS, HOTELS_VIEWS, hotelsViewFromParam, type HotelsView } from "@/lib/crm/boite-tabs";
import { loadHotelInbox } from "@/lib/crm/hotel-inbox-load";
import { roomsFromStored, stayPartyLabel } from "@/lib/crm/hotel-search";
import { listHotelRequests, loadOfferPhotos, loadRequestCustomers } from "@/lib/crm/hotel-search-store";
import { pliantConfigured } from "@/lib/crm/pliant";
import { createServiceClient } from "@/lib/supabase/admin";

function originOf(account: string) {
  if (account === "little_emperors") return "Little Emperors";
  if (account === "net") return "Tarif agence";
  return "Compte interne";
}

async function loadHotelRequests(): Promise<HotelRequestView[]> {
  try {
    const requests = await listHotelRequests();
    const people = await loadRequestCustomers(requests.map((row) => row.customer_id));
    const photos = await loadOfferPhotos(requests.map((row) => row.offer_id || ""));
    return requests.map((row) => {
      const person = people.get(row.customer_id);
      const guest = person ? `${person.first_name} ${person.last_name}`.trim() : "Client";
      return {
        id: row.id,
        guest: guest || "Client",
        status: row.status,
        hotelName: row.hotel_name,
        city: row.city,
        room: row.room_label,
        checkIn: row.check_in,
        checkOut: row.check_out,
        adults: row.adults,
        party: stayPartyLabel(roomsFromStored(row.rooms, row.adults)),
        travelers: Array.isArray(row.guests) ? row.guests.filter((name): name is string => typeof name === "string").join(", ") : "",
        rate: row.rate_title || "",
        sellCents: row.sell_cents,
        currency: row.currency,
        benefits: row.benefits,
        origin: originOf(row.account),
        photo: row.offer_id ? photos.get(row.offer_id) || null : null,
      };
    });
  } catch {
    return [];
  }
}

function viewHref(view: HotelsView) {
  return boiteHref("hotels", { vue: view === "reponses" ? null : view });
}

/** Hôtels : une file de courriers, et à part les demandes de l’espace client. */
export async function HotelsPanel({
  params,
  counts,
}: {
  params: Record<string, SearchParamValue>;
  counts: { reponses: number };
}) {
  const view = hotelsViewFromParam(params.vue);
  const pills = (
    <ViewPills
      ariaLabel="Vues d’Hôtels"
      active={view}
      views={HOTELS_VIEWS.map((id) => ({
        id,
        href: viewHref(id),
        label: HOTELS_VIEW_LABELS[id],
        count: id === "reponses" ? counts.reponses : 0,
      }))}
    />
  );

  if (view === "demandes") {
    const sandbox = process.env.PLIANT_SANDBOX === "1";
    const canIssue = sandbox && pliantConfigured();
    const blockedReason = sandbox ? "Pliant n’est pas branché." : "L’émission reste coupée tant que Pliant n’est pas en mode test.";
    const rows = await loadHotelRequests();
    return (
      <div className="space-y-4">
        {pills}
        <p className="text-sm text-muted">Demandes de séjour reçues de l’espace client. La carte test n’est émise qu’après votre validation. Aucun débit n’est lancé.</p>
        <HotelSearchDesk rows={rows} canIssue={canIssue} blockedReason={blockedReason} />
      </div>
    );
  }

  const inbox = await loadHotelInbox(createServiceClient());
  return (
    <div className="space-y-6">
      {pills}
      <HotelInbox inbox={inbox} />
    </div>
  );
}
