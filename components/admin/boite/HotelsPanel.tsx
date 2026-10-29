import type { SupabaseClient } from "@supabase/supabase-js";
import { HotelSearchDesk, type HotelRequestView } from "@/components/admin/HotelSearchDesk";
import { InboundReplies } from "@/components/admin/InboundReplies";
import { RecentMails } from "@/components/admin/RecentMails";
import { ViewPills } from "@/components/admin/TabLinks";
import { UnansweredMails } from "@/components/admin/UnansweredMails";
import type { SearchParamValue } from "@/lib/crm/admin-list";
import { boiteHref, HOTELS_VIEW_LABELS, HOTELS_VIEWS, hotelsViewFromParam, type HotelsView } from "@/lib/crm/boite-tabs";
import { loadDashboardMails } from "@/lib/crm/dashboard-mails";
import { refreshStaleHotelThreads } from "@/lib/crm/hotel-desk-run";
import { loadInboundReplies, loadUnansweredMails } from "@/lib/crm/hotel-boite-load";
import { roomsFromStored, stayPartyLabel } from "@/lib/crm/hotel-search";
import { listHotelRequests, loadRequestCustomers } from "@/lib/crm/hotel-search-store";
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
      };
    });
  } catch {
    return [];
  }
}

/** Quatre fils au plus, 1,5 s : le téléphone n’attend pas Gmail. Le cron reprend le reste. */
async function loadFreshCourriers(supabase: SupabaseClient) {
  try {
    await refreshStaleHotelThreads(createServiceClient(), { limit: 4, budgetMs: 1500 });
  } catch {
    // La liste s’affiche avec le dernier fil déjà enregistré.
  }
  return loadDashboardMails(supabase);
}

function viewHref(view: HotelsView) {
  return boiteHref("hotels", { vue: view === "reponses" ? null : view });
}

/** Hôtels : les courriers et leurs réponses, les courriers sans réponse à relancer, les demandes de séjour. */
export async function HotelsPanel({
  supabase,
  params,
  counts,
}: {
  supabase: SupabaseClient;
  params: Record<string, SearchParamValue>;
  counts: { reponses: number };
}) {
  const view = hotelsViewFromParam(params.vue);
  const pills = (
    <ViewPills
      ariaLabel="Vues d’Hôtels"
      active={view}
      views={HOTELS_VIEWS.map((id) => ({ id, href: viewHref(id), label: HOTELS_VIEW_LABELS[id], count: id === "reponses" ? counts.reponses : 0 }))}
    />
  );

  if (view === "sans-reponse") {
    const rows = await loadUnansweredMails(supabase);
    return (
      <div className="space-y-4">
        {pills}
        <p className="text-sm text-muted">Messages envoyés sans réponse depuis 48 heures. Relancer ouvre le brouillon : il part seulement après confirmation.</p>
        <UnansweredMails rows={rows} />
      </div>
    );
  }

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

  const [courriers, replies] = await Promise.all([loadFreshCourriers(supabase), loadInboundReplies(supabase)]);
  return (
    <div className="space-y-6">
      {pills}
      <RecentMails mails={courriers} />
      <section aria-labelledby="hotels-recus">
        <h2 id="hotels-recus" className="font-display text-lg font-bold text-[var(--admin-navy)]">
          Messages reçus
        </h2>
        <p className="mt-1 text-sm text-muted">Les derniers messages des hôtels, du plus récent au plus ancien. Répondre ouvre le brouillon sur le dossier.</p>
        <InboundReplies rows={replies} />
      </section>
    </div>
  );
}
