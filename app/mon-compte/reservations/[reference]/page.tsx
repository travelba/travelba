import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { ExtrasPanel } from "@/components/crm/ExtrasPanel";
import { TripFormalities } from "@/components/crm/TripFormalities";
import { TripVisaUploads } from "@/components/crm/TripVisaUploads";
import { bookingHasFlight, serviceRefusalFromRow, type ServiceRefusal } from "@/lib/crm/extras";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import { clientVisaPhase } from "@/lib/crm/visa-flow";
import { VISA_OFFICIAL, type VisaCorridor } from "@/lib/crm/visa-fees";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { BookingStatusBadge } from "@/components/crm/ui";
import {
  carnetVisible,
  itemPriceLabel,
  tripHeadline,
  tripPlaceLine,
  unlinkedDocuments,
  whatsappModifyHref,
} from "@/lib/crm/carnet";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { siteConfig } from "@/lib/site";
import { BookingHero } from "@/components/crm/BookingHero";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import { Icon } from "@/components/crm/icons";
import { TripPassportPicker } from "@/components/crm/TripPassportPicker";

type Props = { params: Promise<{ reference: string }> };

export default async function ReservationDetailPage({ params }: Props) {
  const { reference } = await params;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) notFound();
  const b = booking as CrmBooking;

  const [{ data: items }, { data: travelers }, { data: docs }, { data: identityDocs }, { data: companions }, { data: declined }, { data: visaRows }] =
    await Promise.all([
    supabase
      .from("crm_booking_items")
      .select("*")
      .eq("booking_id", b.id)
      .order("sort_order"),
    supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
    supabase
      .from("crm_booking_documents")
      .select("*")
      .eq("booking_id", b.id)
      .eq("visible_to_client", true),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
    supabase.from("crm_travel_companions").select("*").eq("customer_id", customer.id),
    supabase.from("crm_declined_services").select("kind, service_leg, place, moment").eq("booking_id", b.id),
    supabase.from("crm_visa_requests").select("status, country").eq("booking_id", b.id),
  ]);
  const refusals = ((declined || []) as { kind?: string | null; service_leg?: string | null; place?: string | null; moment?: string | null }[])
    .map(serviceRefusalFromRow)
    .filter((row): row is ServiceRefusal => Boolean(row));

  const visibleItems = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, visibleItems)) notFound();

  const insurances = visibleItems.filter((item) => item.kind === "insurance");
  const visibleDocs = (docs || []) as CrmBookingDocument[];
  const extraDocs = unlinkedDocuments(visibleDocs, visibleItems);
  const party = (travelers || []) as CrmBookingTraveler[];
  const coverage = tripDocCoverage(party, (identityDocs || []) as CrmTravelDocument[]);
  const missingPassports = coverage.total > 0 && coverage.ready < coverage.total;
  const modifyHref = whatsappModifyHref(
    siteConfig.whatsappNumber,
    b.reference,
    b.destination
  );
  const headline = tripHeadline(b.title, b.destination);
  const placeLine = tripPlaceLine(b.title, b.destination);
  const missingCount = coverage.total - coverage.ready;
  const formalities = frenchPassportTrip(visibleItems, party.length);

  return (
    <div className="space-y-5">
      <Link
        href="/mon-compte/reservations"
        className="inline-flex text-sm font-semibold text-[var(--aura-blue)]"
      >
        ← Mes réservations
      </Link>

      <BookingHero
        booking={b}
        priority
        className="rounded-2xl shadow-[0_16px_36px_rgba(11,31,58,0.25)]"
      >
        <div className="absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <BookingStatusBadge label={BOOKING_STATUS_LABELS[b.status]} />
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

      {missingPassports ? (
        <a
          href="#passeport"
          className="block rounded-2xl bg-[var(--admin-peach)] px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Pièce manquante pour {missingCount} voyageur{missingCount > 1 ? "s" : ""}.
        </a>
      ) : null}

      {b.notes_client ? (
        <p className="aura-card rounded-[1.25rem] bg-white p-4 text-sm leading-relaxed text-[var(--admin-navy)]">
          {b.notes_client}
        </p>
      ) : null}

      <CarnetItinerary
        booking={b}
        items={visibleItems}
        docs={visibleDocs}
        calendarBase={`/mon-compte/reservations/${b.reference}/agenda.ics`}
        services={{
          variant: "client",
          travelers: party,
          holder: customer,
          companions: (companions || []) as CrmCompanion[],
          whatsappHref: modifyHref,
        }}
        refusals={refusals}
      />

      {extraDocs.length ? (
        <section className="aura-card space-y-3 rounded-[1.35rem] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
            Documents du voyage
          </p>
          <ul className="space-y-2">
            {extraDocs.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--admin-navy)]">
                  <Icon
                    name={fileKindIcon(doc.mime_type, doc.file_name)}
                    className="h-5 w-5 shrink-0 text-[var(--admin-gold)]"
                  />
                  <span className="truncate">{doc.file_name || "Document"}</span>
                </span>
                <FileOpenLink
                  path={doc.storage_path}
                  className="inline-flex shrink-0 items-center rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] ring-1 ring-[#e5e3dc]"
                >
                  Ouvrir
                </FileOpenLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {bookingHasFlight(visibleItems) ? (
        <ExtrasPanel
          variant="client"
          booking={b}
          items={visibleItems}
          travelers={party}
          holder={customer}
          companions={(companions || []) as CrmCompanion[]}
          whatsappHref={modifyHref}
            formalities={formalities}
            refusals={refusals}
          />
      ) : null}

      <section className="aura-card space-y-2 rounded-[1.35rem] bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Montant du séjour
        </p>
        <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
          {b.prices_visible === false ? "Prix à la publication" : formatMoney(Number(b.total_amount), b.currency)}
        </p>
        {insurances.map((item) => (
          <p key={item.id} className="text-sm text-muted">
            Assurance {item.title}
            {itemPriceLabel(item, b.currency) ? ` · ${itemPriceLabel(item, b.currency)}` : ""}
          </p>
        ))}
      </section>

      <a
        href={modifyHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
      >
        Demander une modification
      </a>

      <TripPassportPicker
        variant="client"
        bookingId={b.id}
        travelers={party}
        documents={(identityDocs || []) as CrmTravelDocument[]}
        holder={customer}
      />

      {bookingHasFlight(visibleItems) ? (
        <section className="aura-card space-y-3 rounded-[1.35rem] bg-white p-4">
          <TripFormalities trip={formalities} />
          {((visaRows || []) as { status: string; country: VisaCorridor }[]).length ? (
            <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
              {((visaRows || []) as { status: string; country: VisaCorridor }[]).map((row) => (
                <li key={row.country}>
                  {VISA_OFFICIAL[row.country]?.countryName || row.country} —{" "}
                  {clientVisaPhase({ started: true, filed: row.status === "piece" })}
                </li>
              ))}
            </ul>
          ) : null}
          {formalities.needsFormality ? (
            <TripVisaUploads
              variant="client"
              bookingId={b.id}
              reference={b.reference}
              travelers={party}
              documents={(identityDocs || []) as CrmTravelDocument[]}
              entries={formalities.entries}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
