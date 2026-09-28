import Link from "next/link";
import { notFound } from "next/navigation";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { ClientTripBody } from "@/components/account/ClientTripBody";
import { FullCreditDesk } from "@/components/admin/FullCreditDesk";
import { BookingHero } from "@/components/crm/BookingHero";
import { ExtrasPanel } from "@/components/crm/ExtrasPanel";
import { ReservationFiles } from "@/components/crm/ReservationFiles";
import { BookingStatusBadge } from "@/components/crm/ui";
import { VisaSection } from "@/components/crm/VisaSection";
import { carnetVisible, clientBookingStatusLabel, clientVisibleItems, HIDDEN_PRICE_LABEL, itemPriceLabel, stayArrivalPlaces, stayHeadline, tripPlaceLine, whatsappModifyHref } from "@/lib/crm/carnet";
import { findVisaExtra } from "@/lib/crm/extras";
import { EXAMPLE_BASE, EXAMPLE_REFERENCE } from "@/lib/crm/example-session";
import { readExample } from "@/lib/crm/example-store";
import { formatDateFr, formatMoney, todayIsoDate } from "@/lib/crm/money";

export const dynamic = "force-dynamic";
import { attachmentPreviews, passportPreviewsForStay } from "@/lib/crm/preview-files";
import { siteConfig } from "@/lib/site";
import { TripSharePanel } from "@/components/account/TripSharePanel";
import { TripPassportGroup } from "@/components/crm/TripPassportGroup";
import { ReceivedVisasFold } from "@/components/crm/TripVisaUploads";
import { companionsForShare, tripShareUrl } from "@/lib/crm/trip-share";
import { passportVaultRows } from "@/lib/crm/passport-vault";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";

type Props = { params: Promise<{ reference: string }> };

export default async function ExampleReservationPage({ params }: Props) {
  const { reference } = await params;
  if (reference !== EXAMPLE_REFERENCE) notFound();
  const session = readExample();
  const b = session.booking;
  const visibleItems = clientVisibleItems(session.items);
  if (!carnetVisible(b, visibleItems)) notFound();

  const insurances = visibleItems.filter((item) => item.kind === "insurance");
  const party = session.travelers;
  const coverage = tripDocCoverage(party, session.documents);
  const missingPassports = coverage.total > 0 && coverage.ready < coverage.total;
  const modifyHref = whatsappModifyHref(siteConfig.whatsappNumber, b.reference, b.destination);
  const headline = stayHeadline(
    b.title,
    b.destination,
    stayArrivalPlaces(b.destination, b.title, visibleItems)
  );
  const placeLine = tripPlaceLine(b.title, b.destination);
  const missingCount = coverage.total - coverage.ready;
  const formalities = frenchPassportTrip(visibleItems, party.length);
  const fullCreditEndpoint = `/api/exemple/bookings/${b.reference}/full-credit`;
  const now = new Date().toISOString();

  return (
    <ClientTripBody
      intro={
        <>
          <Link href={`${EXAMPLE_BASE}/reservations`} className="inline-flex text-sm font-semibold text-[var(--aura-blue)]">
            ← Mes réservations
          </Link>

          <BookingHero booking={b} items={session.items} priority className="rounded-2xl shadow-[0_16px_36px_rgba(11,31,58,0.25)]">
            <div className="absolute inset-0 flex flex-col justify-between p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <BookingStatusBadge label={clientBookingStatusLabel(b.status)} />
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

          {b.notes_client ? (
            <p className="aura-card rounded-[1.25rem] bg-white p-4 text-sm leading-relaxed text-[var(--admin-navy)]">
              {b.notes_client}
            </p>
          ) : null}
        </>
      }
      itinerary={
        <CarnetItinerary
          booking={b}
          items={visibleItems}
          docs={[]}
          pricesVisible={b.prices_visible !== false}
          fullCredit={{
            visible: b.visible_to_client,
            status: b.status,
            clientSettles: b.client_settles_stay === true,
            now,
            phone: siteConfig.whatsappNumber,
            requests: session.fullCredits.map((row) => ({
              booking_item_id: row.booking_item_id,
              status: row.status,
            })),
            endpoint: fullCreditEndpoint,
          }}
          calendarBase={`${EXAMPLE_BASE}/reservations/${b.reference}/agenda.ics`}
          services={{
            variant: "client",
            travelers: party,
            holder: session.customer,
            companions: session.companions,
            whatsappHref: modifyHref,
          }}
          refusals={session.refusals}
        />
      }
      services={
        <ExtrasPanel
          variant="client"
          booking={b}
          items={visibleItems}
          travelers={party}
          holder={session.customer}
          companions={session.companions}
          whatsappHref={modifyHref}
          formalities={formalities}
          refusals={session.refusals}
        />
      }
      visaRequest={
        <VisaSection
          variant="client"
          bookingId={b.id}
          reference={b.reference}
          trip={formalities}
          requests={session.visaRequests}
          travelers={party}
          documents={session.documents}
          visaBooked={Boolean(findVisaExtra(visibleItems))}
          pliantReady={false}
          showReceived={false}
        />
      }
      receivedVisas={
        <ReceivedVisasFold
          folded
          variant="client"
          bookingId={b.id}
          reference={b.reference}
          travelers={party}
          documents={session.documents}
          entries={formalities.entries}
        />
      }
      passports={
        <TripPassportGroup
          rows={passportVaultRows(party, session.documents, todayIsoDate(), {
            first_name: session.customer.first_name,
            last_name: session.customer.last_name,
            usage_name: session.customer.usage_name,
          })}
          hrefFor={() => `${EXAMPLE_BASE}/profil/documents`}
          passports={passportPreviewsForStay(party, session.documents, session.customer, b.reference)}
          missingHref={`${EXAMPLE_BASE}/profil/documents`}
          missingCount={missingPassports ? missingCount : 0}
        />
      }
      share={
        <TripSharePanel
          preview
          bookingId={b.id}
          shareUrl={tripShareUrl(siteConfig.url, "ABCDEFGH")}
          companions={companionsForShare(party, session.companions)}
        />
      }
      amount={
        <section className="aura-card space-y-2 rounded-[1.35rem] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
            Montant du séjour
          </p>
          <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
            {b.prices_visible === false ? HIDDEN_PRICE_LABEL : formatMoney(Number(b.total_amount), b.currency)}
          </p>
          {insurances.map((item) => (
            <p key={item.id} className="text-sm text-muted">
              Assurance {item.title}
              {itemPriceLabel(item, b.currency, null, b.prices_visible !== false)
                ? ` · ${itemPriceLabel(item, b.currency, null, b.prices_visible !== false)}`
                : ""}
            </p>
          ))}
        </section>
      }
      tail={
        <>
          <section className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
              Aperçu agence
            </p>
            <FullCreditDesk
              bookingId={b.id}
              reference={b.reference}
              visible={b.visible_to_client}
              status={b.status}
              clientSettles={b.client_settles_stay === true}
              pliantReady={false}
              items={visibleItems}
              credits={session.fullCredits}
              now={now}
              endpoint={fullCreditEndpoint}
            />
          </section>
          <ReservationFiles
            showPassports={false}
            attachments={attachmentPreviews([], visibleItems, b.reference)}
          />
          <a
            href={modifyHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
          >
            Modifier ce voyage
          </a>
        </>
      }
    />
  );
}
