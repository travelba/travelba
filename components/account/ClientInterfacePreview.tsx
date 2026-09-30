"use client";

import type { MouseEvent } from "react";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { ClientPreviewScope } from "@/components/account/client-preview";
import { ClientTripBody } from "@/components/account/ClientTripBody";
import { StayExpenses } from "@/components/account/StayExpenses";
import { StayPayment } from "@/components/account/StayPayment";
import { TripSharePanel } from "@/components/account/TripSharePanel";
import { BookingHero } from "@/components/crm/BookingHero";
import { ExtrasPanel } from "@/components/crm/ExtrasPanel";
import { Icon } from "@/components/crm/icons";
import { ReservationFiles } from "@/components/crm/ReservationFiles";
import { TripPassportGroup } from "@/components/crm/TripPassportGroup";
import { ReceivedVisasFold } from "@/components/crm/TripVisaUploads";
import { BookingStatusBadge } from "@/components/crm/ui";
import { VisaSection } from "@/components/crm/VisaSection";
import { withoutHotelRosterItems } from "@/lib/crm/hotel-contact";
import {
  carnetVisible,
  clientBookingStatusLabel,
  clientVisibleItems,
  itemPriceLabel,
  publishRevealIds,
  stayArrivalPlaces,
  stayHeadline,
  tripPlaceLine,
  whatsappModifyHref,
} from "@/lib/crm/carnet";
import { findVisaExtra, type ServiceRefusal } from "@/lib/crm/extras";
import { clientStayExpenseLines, clientStayPriceLabel } from "@/lib/crm/ledger-display";
import { formatDateFr, formatMoney, todayIsoDate } from "@/lib/crm/money";
import { paymentSlips, slipMention } from "@/lib/crm/payer";
import { attachmentPreviews, passportPreviewsForStay } from "@/lib/crm/preview-files";
import { stayPayMethods } from "@/lib/crm/stripe-pay";
import { collectableTicketingFee } from "@/lib/crm/ticketing-fee";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { passportVaultRows } from "@/lib/crm/passport-vault";
import type { ShareCompanion } from "@/lib/crm/trip-share";
import {
  isLedgerExpenseKind,
  visibleServiceCopy,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmCustomer,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import type { ClientVisaStep, EstaAnswers } from "@/lib/crm/visa-flow";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import { siteConfig } from "@/lib/site";

const CLIENT_TABS = [
  { label: "Accueil", icon: "explore", active: false },
  { label: "Réservations", icon: "luggage", active: true },
  { label: "Transactions", icon: "receipt_long", active: false },
  { label: "Mon compte", icon: "badge", active: false },
] as const;

function keepInPreview(event: MouseEvent<HTMLElement>) {
  const node = event.target instanceof Element ? event.target.closest("a") : null;
  if (!node) return;
  const href = node.getAttribute("href") || "";
  if (href.startsWith("/") || href.startsWith(window.location.origin)) event.preventDefault();
}

export function ClientInterfacePreview({
  booking,
  items: sourceItems,
  documents,
  travelers,
  identityDocs,
  companions,
  customer,
  visaRequests,
  refusals,
  pliantReady,
  shareUrl,
  shareCompanions,
  billingCompanies,
}: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  documents: CrmBookingDocument[];
  travelers: CrmBookingTraveler[];
  identityDocs: CrmTravelDocument[];
  companions: CrmCompanion[];
  customer: CrmCustomer | null;
  visaRequests: {
    country: string;
    step?: ClientVisaStep | null;
    status?: string | null;
    accepted_at?: string | null;
    answers?: Partial<EstaAnswers> | null;
  }[];
  refusals: ServiceRefusal[];
  pliantReady: boolean;
  shareUrl: string | null;
  shareCompanions: ShareCompanion[];
  billingCompanies: { id: string; company_name: string | null; sort_order: number }[];
}) {
  const items = withoutHotelRosterItems(sourceItems);
  const published = booking.visible_to_client === true;
  const reveal = new Set(publishRevealIds(items));
  const liveItems = clientVisibleItems(items);
  const shownItems = published ? liveItems : items.filter((item) => reveal.has(item.id));
  const hiddenIds = new Set(items.map((item) => item.id).filter((id) => !reveal.has(id)));
  const shownDocs = published
    ? documents.filter((doc) => doc.visible_to_client)
    : documents.filter((doc) => !doc.booking_item_id || !hiddenIds.has(doc.booking_item_id));
  const screenBooking: CrmBooking = published
    ? booking
    : { ...booking, visible_to_client: true, prices_visible: true };
  const hasCarnet = published ? carnetVisible(booking, liveItems) : shownItems.some((item) => item.kind !== "fee" && !isLedgerExpenseKind(item.kind));
  const initials = [customer?.first_name, customer?.last_name]
    .map((part) => (part || "").trim().charAt(0))
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="space-y-3">
      <p className="text-sm text-[var(--admin-navy)]">
        {published && hasCarnet
          ? "Écran actuel du client."
          : published
            ? "Le client ne voit pas ce séjour."
            : "Pas encore montré. Voici l’écran après publication."}
      </p>
      {!customer ? (
        <p className="text-sm text-muted">Associez un client pour voir son espace.</p>
      ) : !hasCarnet ? null : (
        <ClientScreen
          booking={screenBooking}
          items={shownItems}
          docs={shownDocs}
          allItems={items}
          travelers={travelers}
          identityDocs={identityDocs}
          companions={companions}
          customer={customer}
          initials={initials || "TB"}
          visaRequests={visaRequests}
          refusals={refusals}
          pliantReady={pliantReady}
          shareUrl={shareUrl}
          shareCompanions={shareCompanions}
          billingCompanies={billingCompanies}
        />
      )}
    </section>
  );
}

function ClientScreen({
  booking,
  items,
  docs,
  allItems,
  travelers,
  identityDocs,
  companions,
  customer,
  initials,
  visaRequests,
  refusals,
  pliantReady,
  shareUrl,
  shareCompanions,
  billingCompanies,
}: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  docs: CrmBookingDocument[];
  allItems: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  identityDocs: CrmTravelDocument[];
  companions: CrmCompanion[];
  customer: CrmCustomer;
  initials: string;
  visaRequests: {
    country: string;
    step?: ClientVisaStep | null;
    status?: string | null;
    accepted_at?: string | null;
    answers?: Partial<EstaAnswers> | null;
  }[];
  refusals: ServiceRefusal[];
  pliantReady: boolean;
  shareUrl: string | null;
  shareCompanions: ShareCompanion[];
  billingCompanies: { id: string; company_name: string | null; sort_order: number }[];
}) {
  const insurances = items.filter((item) => item.kind === "insurance");
  const coverage = tripDocCoverage(travelers, identityDocs);
  const missingPassports = coverage.total > 0 && coverage.ready < coverage.total;
  const missingCount = coverage.total - coverage.ready;
  const modifyHref = whatsappModifyHref(siteConfig.whatsappNumber, booking.reference, booking.destination);
  const headline = stayHeadline(booking.title, booking.destination, stayArrivalPlaces(booking.destination, booking.title, items));
  const placeLine = tripPlaceLine(booking.title, booking.destination);
  const formalities = frenchPassportTrip(items, travelers.length);
  const companies = [...billingCompanies].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)
  );
  const expenseChoices = allItems
    .filter((item) => isLedgerExpenseKind(item.kind))
    .map((item) => ({
      id: item.id,
      title: visibleServiceCopy(item.title),
      amount: item.amount == null ? null : Number(item.amount),
      billing_company_id: item.billing_company_id || null,
    }));
  const ticketingFee = collectableTicketingFee({
    status: booking.status,
    hasFlight: allItems.some((item) => item.kind === "flight"),
  });
  const pricesVisible = booking.prices_visible !== false;
  const expenseLines = clientStayExpenseLines({
    expenses: expenseChoices,
    agencyCommission: booking.agency_commission === true,
    stayTotal: Number(booking.total_amount),
    currency: booking.currency,
    pricesVisible,
    ticketingFee,
  });
  const passportRows = passportVaultRows(travelers, identityDocs, todayIsoDate(), {
    first_name: customer.first_name,
    last_name: customer.last_name,
    usage_name: customer.usage_name,
  });
  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;

  return (
    <ClientPreviewScope>
      <div
        className="account-app mx-auto w-full max-w-[480px] overflow-hidden rounded-[2rem] border border-[#e5e3dc] bg-[var(--background)]"
        onClickCapture={keepInPreview}
      >
        <div className="flex h-14 items-center justify-between border-b border-[#e5e3dc] px-4">
          <p className="font-display text-sm font-bold text-[var(--admin-navy)]">Réservations</p>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-white">
            {initials}
          </span>
        </div>
        <div className="space-y-5 px-4 py-4">
          <ClientTripBody
            intro={
              <>
                <p className="text-sm font-semibold text-[var(--aura-blue)]">← Mes réservations</p>
                <BookingHero
                  booking={booking}
                  items={allItems}
                  priority
                  className="rounded-2xl shadow-[0_16px_36px_rgba(11,31,58,0.25)]"
                >
                  <div className="absolute inset-0 flex flex-col justify-between p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <BookingStatusBadge label={clientBookingStatusLabel(booking.status)} />
                      <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold backdrop-blur">
                        {booking.reference}
                      </span>
                    </div>
                    <div>
                      <h2 className="font-display text-[1.7rem] font-extrabold leading-tight">{headline}</h2>
                      {placeLine ? <p className="text-sm text-white/75">{placeLine}</p> : null}
                      <p className="text-sm text-white/75">
                        {formatDateFr(booking.start_date)} — {formatDateFr(booking.end_date)}
                      </p>
                    </div>
                  </div>
                </BookingHero>
                {booking.notes_client ? (
                  <p className="aura-card rounded-[1.25rem] bg-white p-4 text-sm leading-relaxed text-[var(--admin-navy)]">
                    {booking.notes_client}
                  </p>
                ) : null}
              </>
            }
            itinerary={
              <CarnetItinerary
                booking={booking}
                items={items}
                docs={docs}
                pricesVisible={pricesVisible}
                calendarBase={`/mon-compte/reservations/${booking.reference}/agenda.ics`}
                services={{
                  variant: "client",
                  travelers,
                  holder: customer,
                  companions,
                  whatsappHref: modifyHref,
                }}
                refusals={refusals}
              />
            }
            services={
              <ExtrasPanel
                variant="client"
                booking={booking}
                items={items}
                travelers={travelers}
                holder={customer}
                companions={companions}
                whatsappHref={modifyHref}
                formalities={formalities}
                refusals={refusals}
              />
            }
            visaRequest={
              <VisaSection
                variant="client"
                bookingId={booking.id}
                reference={booking.reference}
                trip={formalities}
                requests={visaRequests}
                travelers={travelers}
                documents={identityDocs}
                visaBooked={Boolean(findVisaExtra(items))}
                pliantReady={pliantReady}
                showReceived={false}
              />
            }
            receivedVisas={
              <ReceivedVisasFold
                folded
                variant="client"
                bookingId={booking.id}
                reference={booking.reference}
                travelers={travelers}
                documents={identityDocs}
                entries={formalities.entries}
              />
            }
            passports={
              <TripPassportGroup
                rows={passportRows}
                hrefFor={() => "/mon-compte/profil/documents"}
                passports={passportPreviewsForStay(travelers, identityDocs, customer, booking.reference)}
                missingHref="/mon-compte/profil/documents"
                missingCount={missingPassports ? missingCount : 0}
              />
            }
            share={
              shareUrl ? (
                <TripSharePanel
                  bookingId={booking.id}
                  shareUrl={shareUrl}
                  companions={shareCompanions}
                  canSend={Boolean(customer.phone)}
                  preview
                />
              ) : null
            }
            amount={
              <section className="aura-card space-y-2 rounded-[1.35rem] bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
                  Montant du séjour
                </p>
                <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
                  {clientStayPriceLabel({
                    stayTotal: Number(booking.total_amount),
                    currency: booking.currency,
                    pricesVisible,
                    agencyCommission: booking.agency_commission === true,
                    expenses: expenseChoices,
                    ticketingFee,
                  })}
                </p>
                {insurances.map((item) => {
                  const price = itemPriceLabel(item, booking.currency, null, pricesVisible);
                  return (
                    <p key={item.id} className="text-sm text-muted">
                      Assurance {item.title}
                      {price ? ` · ${price}` : ""}
                    </p>
                  );
                })}
              </section>
            }
            expenses={expenseLines.length ? <StayExpenses lines={expenseLines} /> : null}
            tail={
              <>
                {booking.payer_kind === "company" || booking.payer_kind === "personal" ? (
                  <StayPayment
                    bookingId={booking.id}
                    reference={booking.reference}
                    stripeKey={stripeKey}
                    slips={(() => {
                      const stayCompany = companies.find((company) => company.id === booking.billing_company_id) || null;
                      const otherCompany = companies[0] || null;
                      return paymentSlips({
                        stayTotal: Number(booking.total_amount),
                        agencyCommission: booking.agency_commission === true,
                        clientSettlesStay: booking.client_settles_stay === true,
                        pricesVisible,
                        expenses: expenseChoices,
                        ticketingFee,
                        stayKind: booking.payer_kind,
                        stayCompanyId: booking.billing_company_id || null,
                        feesFollowStay: booking.fees_follow_stay !== false,
                        otherCompanyId: otherCompany?.id || null,
                      }).map((slip) => {
                        const company =
                          slip.kind === "company"
                            ? companies.find((row) => row.id === slip.companyId) || stayCompany || otherCompany
                            : null;
                        const member = customer.company_role === "member";
                        return {
                          slice: slip.slice,
                          kind: slip.kind,
                          mention: slipMention(slip.kind, company?.company_name),
                          amountLabel: slip.amount == null ? null : formatMoney(slip.amount, booking.currency),
                          payable: slip.payable,
                          hotelAside: slip.hotelAside,
                          canPay: !(slip.kind === "company" && member),
                          methods: slip.payable ? stayPayMethods(slip.kind, booking.currency) : [],
                          companyName: company?.company_name || null,
                        };
                      });
                    })()}
                  />
                ) : null}
                <ReservationFiles
                  showPassports={false}
                  attachments={attachmentPreviews(docs, items, booking.reference)}
                />
                {customer.phone ? (
                  <a
                    href={modifyHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
                  >
                    Modifier ce voyage
                  </a>
                ) : null}
              </>
            }
          />
        </div>
        <nav className="flex items-end justify-around border-t border-[#e5e3dc] px-1.5 py-2" aria-label="Navigation du client">
          {CLIENT_TABS.map((tab) => (
            <span
              key={tab.label}
              className={`flex min-w-[68px] flex-col items-center gap-1 px-1 py-1 text-[11px] leading-none ${
                tab.active ? "font-bold text-[var(--admin-navy)]" : "font-semibold text-[#1a2740]"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
                  tab.active ? "bg-[var(--admin-navy)] text-[var(--admin-gold)]" : "bg-[rgba(11,25,44,0.08)] text-[var(--admin-navy)]"
                }`}
              >
                <Icon name={tab.icon} className="h-[1.35rem] w-[1.35rem]" filled={tab.active} />
              </span>
              {tab.label}
            </span>
          ))}
        </nav>
      </div>
    </ClientPreviewScope>
  );
}
