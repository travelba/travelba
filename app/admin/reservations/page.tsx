import { NewBookingForm } from "@/components/admin/NewBookingForm";
import { BookingsTable } from "@/components/admin/BookingsTable";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { loadStayArrivalPlaces } from "@/lib/crm/carnet-query";
import { loadDisplayedStayAmounts } from "@/lib/crm/displayed-stay";
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
  const [places, displayed] = await Promise.all([
    loadStayArrivalPlaces(
      supabase,
      rows.map((row) => row.id)
    ),
    loadDisplayedStayAmounts(supabase, rows),
  ]);

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Réservations"
        subtitle="Enregistrez le dossier, puis montrez-le au client. Enregistrer ne le rend pas visible."
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
        displayAmounts={Object.fromEntries(displayed)}
      />
    </div>
  );
}
