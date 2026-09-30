import { NewBookingForm } from "@/components/admin/NewBookingForm";
import { BookingsTable } from "@/components/admin/BookingsTable";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { loadStayArrivalPlaces } from "@/lib/crm/carnet-query";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";
import type { CrmBooking, CrmCustomer } from "@/lib/crm/types";

export default async function AdminReservationsPage() {
  const { supabase } = await requireStaffPage();
  const [{ data: bookings }, { data: customers }, { data: companies }] = await Promise.all([
    supabase
      .from("crm_bookings")
      .select("*")
      .order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("crm_customers").select("*").order("last_name"),
    supabase.from("crm_billing_companies").select("id, customer_id, company_name, sort_order").order("sort_order"),
  ]);
  const rows = (bookings || []) as CrmBooking[];
  const places = await loadStayArrivalPlaces(
    supabase,
    rows.map((row) => row.id)
  );

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Réservations"
        subtitle="Importer les PDF, Enregistrer le brouillon, puis Publier — Enregistrer ne rend pas le carnet visible."
      />
      <div className="mt-6">
        <NewBookingForm
          customers={(customers || []) as CrmCustomer[]}
          companies={(companies || []) as {
            id: string;
            customer_id: string;
            company_name: string | null;
            sort_order: number;
          }[]}
          aiConfigured={aiGatewayConfigured()}
        />
      </div>
      <BookingsTable
        bookings={rows}
        customers={(customers || []) as CrmCustomer[]}
        places={places}
      />
    </div>
  );
}
