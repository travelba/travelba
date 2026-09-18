import { NewBookingForm } from "@/components/admin/NewBookingForm";
import { BookingsTable } from "@/components/admin/BookingsTable";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";
import type { CrmBooking, CrmCustomer } from "@/lib/crm/types";

export default async function AdminReservationsPage() {
  const { supabase } = await requireStaffPage();
  const [{ data: bookings }, { data: customers }] = await Promise.all([
    supabase
      .from("crm_bookings")
      .select("*")
      .order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("crm_customers").select("*").order("last_name"),
  ]);

  return (
    <div>
      <PageEyebrow>Back-office</PageEyebrow>
      <PageTitle
        title="Réservations"
        subtitle="Importer les PDF, Enregistrer le brouillon, puis Publier — Enregistrer ne rend pas le carnet visible."
      />
      <div className="mt-6">
        <NewBookingForm
          customers={(customers || []) as CrmCustomer[]}
          aiConfigured={aiGatewayConfigured()}
        />
      </div>
      <BookingsTable
        bookings={(bookings || []) as CrmBooking[]}
        customers={(customers || []) as CrmCustomer[]}
      />
    </div>
  );
}
