import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { BookingEditor } from "@/components/admin/BookingEditor";
import { DeleteBookingButton } from "@/components/admin/DeleteBookingButton";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import { formatDateRangeShort } from "@/lib/crm/money";
import { serviceRefusalFromRow, type ServiceRefusal } from "@/lib/crm/extras";
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
  const relatedIds = Array.from(
    new Set([b.customer_id, b.billing_customer_id].filter((value): value is string => Boolean(value)))
  );
  const [
    { data: items },
    { data: travelers },
    { data: documents },
    { data: companions },
    { data: identityDocs },
    { data: relatedCustomers },
    { data: declined },
  ] = await Promise.all([
    supabase.from("crm_booking_items").select("*").eq("booking_id", id).order("sort_order"),
    supabase.from("crm_booking_travelers").select("*").eq("booking_id", id),
    supabase.from("crm_booking_documents").select("*").eq("booking_id", id),
    supabase.from("crm_travel_companions").select("*").eq("customer_id", b.customer_id),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", b.customer_id),
    relatedIds.length
      ? supabase.from("crm_customers").select("*").in("id", relatedIds)
      : Promise.resolve({ data: [] as CrmCustomer[] }),
    supabase.from("crm_declined_services").select("kind, service_leg, place").eq("booking_id", id),
  ]);
  const party = (relatedCustomers || []) as CrmCustomer[];
  const customer = party.find((row) => row.id === b.customer_id) || null;
  const billingCustomer =
    party.find((row) => row.id === (b.billing_customer_id || b.customer_id)) || customer;
  const refusals = ((declined || []) as { kind?: string | null; service_leg?: string | null; place?: string | null }[])
    .map(serviceRefusalFromRow)
    .filter((row): row is ServiceRefusal => Boolean(row));
  const allIdentity = (identityDocs || []) as CrmTravelDocument[];
  const bookingItems = (items || []) as CrmBookingItem[];
  const bookingTravelers = (travelers || []) as CrmBookingTraveler[];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{b.reference}</p>
          <p className="text-sm font-semibold text-[var(--admin-navy)]">
            {formatDateRangeShort(b.start_date, b.end_date)}
            {b.destination ? ` · ${b.destination}` : ""}
          </p>
        </div>
        <DeleteBookingButton bookingId={b.id} label={`${b.reference} — ${b.title}`} />
      </div>
      <div className="mt-6">
        <BookingEditor
          booking={b}
          items={bookingItems}
          travelers={bookingTravelers}
          documents={(documents || []) as CrmBookingDocument[]}
          identityDocs={allIdentity}
          companions={(companions || []) as CrmCompanion[]}
          customer={customer}
          billingCustomer={billingCustomer}
          holderName={{
            first_name: customer?.first_name || "",
            last_name: customer?.last_name || "",
          }}
          aiConfigured={aiGatewayConfigured()}
          formalities={frenchPassportTrip(bookingItems, bookingTravelers.length)}
          refusals={refusals}
        />
      </div>
    </div>
  );
}
