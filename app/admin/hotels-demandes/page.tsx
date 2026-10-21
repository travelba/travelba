import { HotelSearchDesk, type HotelRequestView } from "@/components/admin/HotelSearchDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { listHotelRequests, loadRequestCustomers } from "@/lib/crm/hotel-search-store";
import { pliantConfigured } from "@/lib/crm/pliant";

export const metadata = { title: "Demandes hôtels" };

function originOf(account: string) {
  if (account === "little_emperors") return "Little Emperors";
  if (account === "net") return "Tarif agence";
  return "Compte interne";
}

export default async function HotelRequestsPage() {
  await requireStaffPage();
  const sandbox = process.env.PLIANT_SANDBOX === "1";
  const canIssue = sandbox && pliantConfigured();
  const blockedReason = sandbox
    ? "Pliant n’est pas branché."
    : "L’émission reste coupée tant que Pliant n’est pas en mode test.";
  let rows: HotelRequestView[] = [];
  try {
    const requests = await listHotelRequests();
    const people = await loadRequestCustomers(requests.map((row) => row.customer_id));
    rows = requests.map((row) => {
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
        sellCents: row.sell_cents,
        currency: row.currency,
        benefits: row.benefits,
        origin: originOf(row.account),
      };
    });
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Demandes hôtels"
        subtitle="La carte test n’est émise qu’après votre validation. Aucun débit n’est lancé."
      />
      <HotelSearchDesk rows={rows} canIssue={canIssue} blockedReason={blockedReason} />
    </div>
  );
}
