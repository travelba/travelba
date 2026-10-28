import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { serviceRefusalFromRow, type ServiceRefusal } from "@/lib/crm/extras";
import { formatDateFr } from "@/lib/crm/money";
import { carnetVisible, clientVisibleItems, tripPlaceLine } from "@/lib/crm/carnet";
import { HiddenStayNotice } from "@/components/account/HiddenStayNotice";
import { nextStayLabels } from "@/lib/crm/staff-stay";
import { siteConfig } from "@/lib/site";
import { BookingHero } from "@/components/crm/BookingHero";
import { AccountPage } from "@/components/account/AccountPage";
import { stayTransitionName } from "@/lib/crm/account-motion";
import { withoutHotelRosterItems } from "@/lib/crm/hotel-contact";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadClientStay } from "@/lib/crm/client-stay-load";
import { ClientStayRest, StayRestSkeleton } from "@/components/account/ClientStayRest";
import type { ClientVisaStep } from "@/lib/crm/visa-flow";
import {
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { toPublicBooking } from "@/lib/crm/public-booking";
import { toClientBookingItem } from "@/lib/crm/supplier-commission";

type Props = { params: Promise<{ reference: string }> };

/**
 * Titre d’onglet : « {titre du séjour} · {référence} — TBA », seulement pour un dossier du client,
 * montré et non archivé. Sinon le titre reste neutre : un dossier en préparation ne se devine pas.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { reference } = await params;
  const neutral = { title: `Réservation · ${reference} — ${siteConfig.shortName}` };
  const { user, customer, booking } = await loadClientStay(reference);
  if (!user || !customer || !booking || !booking.visible_to_client || booking.archived_at) return neutral;
  const name = (booking.title || "").trim() || (booking.destination || "").trim() || "Réservation";
  return { title: `${name} · ${booking.reference || reference} — ${siteConfig.shortName}` };
}

/** Le dossier est bien à ce client mais la RLS le cache (dépublié, archivé) : on l’explique, pas un 404. */
async function stayExistsForCustomer(customerId: string, reference: string) {
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_bookings")
      .select("id")
      .eq("customer_id", customerId)
      .eq("reference", reference)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

export default async function ReservationDetailPage({ params }: Props) {
  const { reference } = await params;
  const { supabase, user, customer, booking } = await loadClientStay(reference);
  if (!user) redirect("/connexion");
  if (!customer) redirect("/connexion");
  if (!booking) {
    if (await stayExistsForCustomer(customer.id, reference)) return <HiddenStayNotice reference={reference} />;
    notFound();
  }
  const b = booking;
  if (b.archived_at) return <HiddenStayNotice reference={b.reference} />;
  const pub = toPublicBooking(b);

  const [{ data: items }, { data: travelers }, { data: docs }, { data: identityDocs }, { data: companions }, { data: declined }, { data: visaRows }] =
    await Promise.all([
      supabase.from("crm_booking_items").select("*").eq("booking_id", b.id).order("sort_order"),
      supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
      supabase.from("crm_booking_documents").select("*").eq("booking_id", b.id).eq("visible_to_client", true),
      supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
      supabase.from("crm_travel_companions").select("*").eq("customer_id", customer.id),
      supabase.from("crm_declined_services").select("kind, service_leg, place, moment").eq("booking_id", b.id),
      supabase.from("crm_visa_requests").select("country, step, status, accepted_at").eq("booking_id", b.id),
    ]);

  const allItems = ((items || []) as CrmBookingItem[]).map((item) => toClientBookingItem(item));
  const rawItems = clientVisibleItems(allItems);
  if (!carnetVisible(b, rawItems)) return <HiddenStayNotice reference={b.reference} />;

  const headerItems = withoutHotelRosterItems(rawItems);
  const labels = nextStayLabels(b.title, b.destination, headerItems, "Séjour", customer.city);
  const headline = labels.title || "Séjour";
  const placeLine = tripPlaceLine(headline, labels.destination);
  const refusals = ((declined || []) as { kind?: string | null; service_leg?: string | null; place?: string | null; moment?: string | null }[])
    .map(serviceRefusalFromRow)
    .filter((row): row is ServiceRefusal => Boolean(row));

  return (
    <AccountPage>
      <div className="space-y-5">
        <Link
          href="/mon-compte/reservations"
          transitionTypes={["nav-back"]}
          className="account-press inline-flex text-sm font-semibold text-[var(--aura-blue)]"
        >
          ← Réservations
        </Link>

        <BookingHero
          booking={pub}
          items={withoutHotelRosterItems(allItems)}
          priority
          className="rounded-2xl shadow-[0_16px_36px_rgba(11,31,58,0.25)]"
          transitionName={stayTransitionName(b.reference)}
        >
          <div className="absolute inset-0 flex flex-col justify-between p-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold backdrop-blur">
                {b.reference}
              </span>
            </div>
            <div>
              <h1 className="font-display text-[1.7rem] font-extrabold leading-tight">{headline}</h1>
              {placeLine ? <p className="text-sm text-white/75">{placeLine}</p> : null}
              <p className="text-sm text-white/75">
                {formatDateFr(b.start_date)} — {formatDateFr(b.end_date)}
              </p>
            </div>
          </div>
        </BookingHero>

        {pub.notes_client ? (
          <p className="aura-card rounded-[1.25rem] bg-white p-4 text-sm leading-relaxed text-[var(--admin-navy)]">
            {pub.notes_client}
          </p>
        ) : null}

        <Suspense fallback={<StayRestSkeleton />}>
          <ClientStayRest
            supabase={supabase}
            customer={customer}
            booking={b}
            allItems={allItems}
            rawItems={rawItems}
            travelers={(travelers || []) as CrmBookingTraveler[]}
            docs={(docs || []) as CrmBookingDocument[]}
            identityDocs={(identityDocs || []) as CrmTravelDocument[]}
            companions={(companions || []) as CrmCompanion[]}
            refusals={refusals}
            visaRows={(visaRows || []) as { country: string; step?: ClientVisaStep; status?: string; accepted_at?: string | null }[]}
          />
        </Suspense>
      </div>
    </AccountPage>
  );
}
