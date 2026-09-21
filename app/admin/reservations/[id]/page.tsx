import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { BookingEditor } from "@/components/admin/BookingEditor";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";
import { reconcileBookingTravelers } from "@/lib/crm/traveler-link";
import type {
  CrmBooking,
  CrmBookingDocument,
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCompanion,
  CrmCustomer,
  CrmTravelDocument,
} from "@/lib/crm/types";

type Props = { params: Promise<{ id: string }> };

export default async function AdminBookingPage({ params }: Props) {
  const { id } = await params;
  const { supabase } = await requireStaffPage();
  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!booking) notFound();
  const b = booking as CrmBooking;
  const [
    { data: items },
    { data: travelers },
    { data: documents },
    { data: companions },
    { data: identityDocs },
    { data: holder },
    { data: customers },
  ] = await Promise.all([
    supabase.from("crm_booking_items").select("*").eq("booking_id", id).order("sort_order"),
    supabase.from("crm_booking_travelers").select("*").eq("booking_id", id),
    supabase.from("crm_booking_documents").select("*").eq("booking_id", id),
    supabase.from("crm_travel_companions").select("*").eq("customer_id", b.customer_id),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", b.customer_id),
    supabase
      .from("crm_customers")
      .select("first_name, last_name")
      .eq("id", b.customer_id)
      .maybeSingle(),
    supabase.from("crm_customers").select("*").order("last_name"),
  ]);
  const allIdentity = (identityDocs || []) as CrmTravelDocument[];
  const party = await reconcileBookingTravelers({
    travelers: (travelers || []) as CrmBookingTraveler[],
    customer: {
      first_name: holder?.first_name || "",
      last_name: holder?.last_name || "",
    },
    companions: (companions || []) as CrmCompanion[],
  });

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">{b.reference}</p>
      <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">{b.title}</h1>
      <div className="mt-6">
        <BookingEditor
          booking={b}
          items={(items || []) as CrmBookingItem[]}
          travelers={party}
          documents={(documents || []) as CrmBookingDocument[]}
          identityDocs={allIdentity}
          companions={(companions || []) as CrmCompanion[]}
          customers={(customers || []) as CrmCustomer[]}
          holderName={{
            first_name: holder?.first_name || "",
            last_name: holder?.last_name || "",
          }}
          aiConfigured={aiGatewayConfigured()}
        />
      </div>
    </div>
  );
}
