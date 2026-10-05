"use client";

import { useState, type MouseEvent } from "react";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { ClientPreviewScope } from "@/components/account/client-preview";
import { ClientTransactionsPanel } from "@/components/account/ClientTransactionsPanel";
import { EncoursPayment } from "@/components/account/EncoursPayment";
import { ClientTripBody } from "@/components/account/ClientTripBody";
import { StayExpenses } from "@/components/account/StayExpenses";
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
  insuranceLineLabel,
  itemPriceLabel,
  publishRevealIds,
  tripPlaceLine,
  whatsappModifyHref,
} from "@/lib/crm/carnet";
import { stayTitleFromItems } from "@/lib/crm/staff-stay";
import { findVisaExtra, visaProposed, type ServiceRefusal } from "@/lib/crm/extras";
import { agencyFeeExtraAmounts } from "@/lib/crm/bookings";
import { clientStayExpenseLines, clientStayPriceLabel } from "@/lib/crm/ledger-display";
import { formatDateFr, todayIsoDate } from "@/lib/crm/money";
import { attachmentPreviews, passportPreviewsForStay } from "@/lib/crm/preview-files";
import { stripePublishableKey } from "@/lib/crm/stripe";
import { collectableTicketingFee, ticketingTicketCount } from "@/lib/crm/ticketing-fee";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { passportVaultRows } from "@/lib/crm/passport-vault";
import type { ShareCompanion } from "@/lib/crm/trip-share";
import {
  isActiveItem,
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
import { visaRequestShown, type ClientVisaStep, type EstaAnswers } from "@/lib/crm/visa-flow";
import type { ClientLedgerView } from "@/lib/crm/client-ledger";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import { siteConfig } from "@/lib/site";

const CLIENT_TABS = [
  { id: "home", label: "Accueil", icon: "explore" },
  { id: "stay", label: "Réservations", icon: "luggage" },
  { id: "transactions", label: "Transactions", icon: "receipt_long" },
  { id: "account", label: "Mon compte", icon: "badge" },
] as const;

export type ClientPreviewScreen = "stay" | "transactions";

function openableScreen(id: (typeof CLIENT_TABS)[number]["id"]): ClientPreviewScreen | null {
  if (id === "stay" || id === "transactions") return id;
  return null;
}

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
  ledger = null,
  initialScreen = "stay",
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
  /** Même lecture que /mon-compte/transactions. */
  ledger?: ClientLedgerView | null;
  initialScreen?: ClientPreviewScreen;
}) {
  const [screen, setScreen] = useState<ClientPreviewScreen>(initialScreen);
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
      ) : (
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
          screen={screen}
          onScreen={setScreen}
          ledger={ledger}
          showStay={hasCarnet}
        />
      )}
    </section>
  );
}

function ClientPreviewTabs({
  screen,
  onScreen,
}: {
  screen: ClientPreviewScreen;
  onScreen: (screen: ClientPreviewScreen) => void;
}) {
  return (
    <nav className="flex shrink-0 items-end justify-around border-b border-[#e5e3dc] px-1.5 py-2" aria-label="Navigation du client">
      {CLIENT_TABS.map((tab) => {
        const next = openableScreen(tab.id);
        const active = next === screen;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (next) onScreen(next);
            }}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1 text-[11px] leading-none ${
              active ? "font-bold text-[var(--admin-navy)]" : "font-semibold text-[#1a2740]"
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
                active ? "bg-[var(--admin-navy)] text-[var(--admin-gold)]" : "bg-[rgba(11,25,44,0.08)] text-[var(--admin-navy)]"
              }`}
            >
              <Icon name={tab.icon} className="h-[1.35rem] w-[1.35rem]" filled={active} />
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
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
  screen,
  onScreen,
  ledger,
  showStay,
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
  screen: ClientPreviewScreen;
  onScreen: (screen: ClientPreviewScreen) => void;
  ledger: ClientLedgerView | null;
  showStay: boolean;
}) {
  const insurances = items.filter((item) => item.kind === "insurance");
  const coverage = tripDocCoverage(travelers, identityDocs);
  const missingPassports = coverage.total > 0 && coverage.ready < coverage.total;
  const missingCount = coverage.total - coverage.ready;
  const modifyHref = whatsappModifyHref(siteConfig.whatsappNumber, booking.reference, booking.destination);
  const headline = stayTitleFromItems(booking.title, booking.destination, items);
  const placeLine = tripPlaceLine(headline, booking.destination);
  const formalities = frenchPassportTrip(items, travelers.length);
  const feeExtras = agencyFeeExtraAmounts(allItems);
  const expenseChoices = allItems
    .filter((item) => isActiveItem(item) && isLedgerExpenseKind(item.kind))
    .map((item) => ({
      id: item.id,
      title: visibleServiceCopy(item.title),
      amount: item.amount == null ? null : Number(item.amount),
      billing_company_id: item.billing_company_id || null,
    }));
  const ticketCount = ticketingTicketCount({
    hasFlight: allItems.some((item) => item.kind === "flight"),
    travelerCount: travelers.length,
  });
  const ticketingFee = collectableTicketingFee({
    status: booking.status,
    hasFlight: ticketCount > 0,
    travelerCount: travelers.length,
  });
  const pricesVisible = booking.prices_visible !== false;
  const expenseLines = clientStayExpenseLines({
    expenses: expenseChoices,
    agencyCommission: booking.agency_commission === true,
    stayTotal: Number(booking.total_amount),
    currency: booking.currency,
    pricesVisible,
    extras: feeExtras,
    ticketingFee,
    ticketCount,
  });
  const passportRows = passportVaultRows(travelers, identityDocs, todayIsoDate(), {
    first_name: customer.first_name,
    last_name: customer.last_name,
    usage_name: customer.usage_name,
  });
  const encoursPay =
    ledger && !ledger.member && ledger.owed.total > 0 ? (
      <EncoursPayment
        compact={screen === "transactions"}
        company={ledger.owed.company}
        personal={ledger.owed.personal}
        currency={ledger.currency}
        soleCompanyName={ledger.soleCompanyName}
        stripeKey={stripePublishableKey()}
      />
    ) : null;
  const title = screen === "transactions" ? "Transactions" : "Réservations";
  return (
    <ClientPreviewScope>
      <div
        className="account-app mx-auto flex h-[clamp(22rem,calc(100svh-20rem),42rem)] w-full max-w-[480px] flex-col overflow-hidden rounded-[2rem] border border-[#e5e3dc] bg-[var(--background)]"
        onClickCapture={keepInPreview}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#e5e3dc] px-4">
          <p className="font-display text-sm font-bold text-[var(--admin-navy)]">{title}</p>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-white">
            {initials}
          </span>
        </div>
        <ClientPreviewTabs screen={screen} onScreen={onScreen} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {screen === "transactions" ? (
            <div className="px-4 py-4">
              {ledger ? (
                <ClientTransactionsPanel view={ledger} payments={encoursPay} />
              ) : (
                <p className="text-sm text-muted">Le grand livre n’est pas lisible pour le moment.</p>
              )}
            </div>
          ) : showStay ? (
            <div className="space-y-5 px-4 py-4">
          <ClientTripBody
            intro={
              <>
                <p className="text-sm font-semibold text-[var(--aura-blue)]">← Réservations</p>
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
                {screen === "stay" ? encoursPay : null}
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
              visaRequestShown(booking, visaRequests) ? (
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
                  proposed={visaProposed(booking)}
                />
              ) : null
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
                    extras: feeExtras,
                    ticketingFee,
                  })}
                </p>
                {insurances.map((item) => {
                  const price = pricesVisible ? itemPriceLabel(item, booking.currency, null, true) : null;
                  return (
                    <p key={item.id} className="text-sm text-muted">
                      {insuranceLineLabel(item.title)}
                      {price ? ` · ${price}` : ""}
                    </p>
                  );
                })}
              </section>
            }
            expenses={expenseLines.length ? <StayExpenses lines={expenseLines} /> : null}
            tail={
              <>
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
          ) : (
            <p className="px-4 py-4 text-sm text-muted">Ce séjour n’est pas affiché dans Réservations.</p>
          )}
        </div>
      </div>
    </ClientPreviewScope>
  );
}
