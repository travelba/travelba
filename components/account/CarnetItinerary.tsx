import type {
  CrmBookingDocument,
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCompanion,
  CrmCustomer,
} from "@/lib/crm/types";
import type { PublicBooking } from "@/lib/crm/public-booking";
import { BOOKING_ITEM_LABELS, isActiveItem, visibleServiceCopy, type BookingItemKind } from "@/lib/crm/types";
import { Icon } from "@/components/crm/icons";
import { BrandMark } from "@/components/crm/BrandMark";
import { FilePreviewTile } from "@/components/crm/FilePreview";
import { HotelContactButton } from "@/components/crm/HotelContact";
import { HotelReservationCard } from "@/components/crm/HotelReservationCard";
import { HotelStayFacts } from "@/components/crm/HotelStayFacts";
import { hotelPhotos, hotelRoomLine } from "@/lib/crm/hotel-gallery";
import { withoutHotelRoster } from "@/lib/crm/hotel-contact";
import { flightGate, flightTerminal, flightWatchBadge } from "@/lib/crm/flight-watch";
import { ticketTravelerNames } from "@/lib/crm/document-passengers";
import {
  documentsForItems,
  dayHeading,
  detailList,
  detailStr,
  flightCardSubtitle,
  flightCardTitle,
  flightCities,
  flightIata,
  groupByDay,
  hotelCityLine,
  hotelDisplayName,
  hotelStayLabel,
  itemClock,
  itemPriceLabel,
  undatedTimeline,
} from "@/lib/crm/carnet";
import { flightLegLine, roundTripMate, roundTripPriceLabel, roundTripReturnIds } from "@/lib/crm/flight-roundtrip";
import { statedTicketCount } from "@/lib/crm/item-match";
import { completeFlightRoutes } from "@/lib/crm/flight-route";
import {
  accueilVipDayTitle,
  accueilVipLegOnDay,
  accueilVipPartyLine,
} from "@/lib/crm/accueil-vip";
import { ClientInfo } from "@/components/crm/ClientInfo";
import { flightCountsInStay } from "@/lib/crm/bookings";
import { ServiceOfferCard } from "@/components/crm/ServiceOfferCard";
import { itemCalendarHref, type PhoneCalendarLink, type PhoneCalendarLinks } from "@/lib/crm/calendar-open";
import { AddToPhoneCalendar } from "@/components/account/AddToPhoneCalendar";
import { HotelFreeCancel } from "@/components/account/HotelFreeCancel";
import type { ClientHotelCancelOffer } from "@/lib/crm/le-cancel-copy";
import {
  bookingHasFlight,
  composeItineraryDay,
  extraAgencyStatus,
  extraAmount,
  extraFlightAt,
  extraHeadsFromBooking,
  extraNoticeOk,
  extraProposed,
  findExtra,
  formatCustomerAddress,
  isServiceRefused,
  itineraryOffers,
  offerKey,
  type ServiceOffer,
  type ServiceRefusal,
} from "@/lib/crm/extras";

function AgendaLink({
  href,
  phone = null,
  children,
}: {
  href: string;
  phone?: PhoneCalendarLink | null;
  children: string;
}) {
  return (
    <AddToPhoneCalendar
      href={href}
      googleHref={phone?.google}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
      fallbackClassName="inline-flex items-center text-xs font-semibold text-[var(--admin-navy)]/70 underline-offset-2 hover:underline"
    >
      <Icon name="event" className="h-4 w-4" />
      {children}
    </AddToPhoneCalendar>
  );
}

function CardBody({
  item,
  currency,
  docs,
  compactHotel = false,
  calendarHref = null,
  calendarPhone = null,
  day = null,
  partage = null,
  pricesVisible = true,
  showPrice = true,
  reference = null,
  cancelOffer = null,
  returnLeg = null,
  returnCalendarHref = null,
  stayItems = null,
}: {
  item: CrmBookingItem;
  currency: string;
  docs: CrmBookingDocument[];
  compactHotel?: boolean;
  calendarHref?: string | null;
  calendarPhone?: PhoneCalendarLink | null;
  day?: string | null;
  partage?: string | null;
  pricesVisible?: boolean;
  showPrice?: boolean;
  reference?: string | null;
  cancelOffer?: ClientHotelCancelOffer | null;
  returnLeg?: CrmBookingItem | null;
  returnCalendarHref?: string | null;
  stayItems?: CrmBookingItem[] | null;
}) {
  const price = returnLeg && stayItems
    ? roundTripPriceLabel(item, returnLeg, stayItems, currency, pricesVisible)
    : showPrice
      ? itemPriceLabel(item, currency, day, pricesVisible)
      : null;
  const included = detailList(item, "included");
  const iata = flightIata(item);
  const cities = flightCities(item);
  const flightTitle = item.kind === "flight" || item.kind === "rail" ? flightCardTitle(item) : "";
  const flightSubtitle =
    item.kind === "flight" || item.kind === "rail" ? flightCardSubtitle(item) : "";
  const tickets = statedTicketCount(item) ?? 0;
  const vipLeg = item.kind === "accueil_vip" ? accueilVipLegOnDay(item, day) : null;
  const vipTitle = item.kind === "accueil_vip" ? accueilVipDayTitle(item, day || "") : "";
  const vipClock = vipLeg ? itemClock(vipLeg.at) : "";
  const vipPlace = vipLeg ? [vipLeg.airport_city, vipLeg.airport_iata].filter(Boolean).join(" ") : "";
  const clientInfo = item.kind === "accueil_vip" ? detailStr(item, "client_info") : "";
  const hotline = item.kind === "accueil_vip" ? detailStr(item, "phone") : "";
  const providerMail = item.kind === "accueil_vip" ? detailStr(item, "email") : "";
  const party = item.kind === "accueil_vip" ? accueilVipPartyLine(item.details) : "";
  const clock = item.kind === "accueil_vip" ? vipClock : itemClock(item.start_at);
  const endClock = item.kind === "accueil_vip" ? "" : itemClock(item.end_at);
  const occupancy = detailStr(item, "occupancy");
  const special = detailStr(item, "special_requests");
  const pickupNote = detailStr(item, "pickup_note");
  const baggage = detailStr(item, "baggage");
  const seat = detailStr(item, "seat");
  const terminal = item.kind === "flight" ? flightTerminal(item) : detailStr(item, "terminal");
  const gate = item.kind === "flight" ? flightGate(item) : "";
  const watchLine = item.kind === "flight" ? flightWatchBadge(item, new Date()) : "";
  const cabin = detailStr(item, "cabin");
  const airline = detailStr(item, "airline") || item.supplier || "";
  const city = detailStr(item, "city");
  const hotelName = item.kind === "hotel" ? hotelDisplayName(item) : "";
  const ticketTravelers =
    item.kind === "flight" || item.kind === "rail" ? ticketTravelerNames(item.details).join(", ") : "";
  const hotelCity = item.kind === "hotel" ? hotelCityLine(item) : "";
  const photos = item.kind === "hotel" ? hotelPhotos(item) : [];
  const checkInDay = (item.start_at || "").slice(0, 10);
  const showGallery = photos.length > 0 && (!day || day === checkInDay);
  const roomLine = item.kind === "hotel" ? hotelRoomLine(item, photos) : "";
  const roomShown =
    roomLine && roomLine.localeCompare(hotelName, "fr", { sensitivity: "accent" }) !== 0 ? roomLine : "";
  const hotelKicker = [visibleServiceCopy(BOOKING_ITEM_LABELS.hotel), hotelCity].filter(Boolean).join(" · ");

  const panel = (
    <div className="space-y-2 border-t border-[#e5e3dc] px-3.5 py-3 text-sm text-[var(--admin-navy)]">
      {item.kind === "flight" || item.kind === "rail" ? (
        <>
          {returnLeg ? <p className="text-xs font-semibold uppercase tracking-wide text-muted">Aller</p> : null}
          {airline ? <p>{airline}</p> : null}
          {detailStr(item, "flight_number") ? <p>{detailStr(item, "flight_number")}</p> : null}
          {cities ? <p>{cities}</p> : null}
          {iata ? <p>{iata}</p> : null}
          {cabin ? <p>Classe {cabin}</p> : null}
          {baggage ? <p>Bagages {baggage}</p> : null}
          {seat ? <p>Siège {seat}</p> : null}
          {gate ? <p>Porte {gate}</p> : null}
          {terminal ? <p>Terminal {terminal}</p> : null}
          {returnLeg ? (
            <>
              <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Retour</p>
              <p>{flightLegLine(returnLeg)}</p>
              {flightCardSubtitle(returnLeg) ? <p>{flightCardSubtitle(returnLeg)}</p> : null}
            </>
          ) : null}
        </>
      ) : null}
      {item.kind === "hotel" ? (
        <>
          <HotelStayFacts item={item} />
          {occupancy ? <p>{occupancy}</p> : null}
          {special ? <p>Demandes : {special}</p> : null}
        </>
      ) : null}
      {item.kind === "chauffeur" || item.kind === "greeter" ? (
        <>
          {detailStr(item, "pickup") ? <p>{detailStr(item, "pickup")}</p> : null}
          {item.kind === "greeter" ? (
            <p className="text-muted">
              Accueil à la sortie chauffeur, enregistrement, sûreté, porte ou salon.
            </p>
          ) : (
            <p className="text-muted">Trajet domicile ↔ aéroport, mis en place par l’agence.</p>
          )}
        </>
      ) : null}
      {item.kind === "transfer" ? (
        <>
          <p>
            {[detailStr(item, "pickup"), detailStr(item, "dropoff")].filter(Boolean).join(" → ")}
          </p>
          {pickupNote ? <p>{pickupNote}</p> : null}
        </>
      ) : null}
      {item.kind === "car" ? (
        <p>
          {[detailStr(item, "vehicle"), detailStr(item, "driver"), detailStr(item, "pickup"), detailStr(item, "dropoff")]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {item.kind === "activity" || item.kind === "cruise" ? (
        <>
          <p>
            {[detailStr(item, "meeting_point") || city, detailStr(item, "duration")].filter(Boolean).join(" · ")}
          </p>
          {included.length ? (
            <ul className="list-disc pl-4 text-muted">
              {included.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      {item.confirmation_ref ? (
        <p className="text-xs text-muted">Réf. {item.confirmation_ref}</p>
      ) : null}
      {cancelOffer && reference && item.kind === "hotel" ? (
        <HotelFreeCancel
          reference={reference}
          free={cancelOffer.mode === "free"}
          itemId={cancelOffer.itemId}
          hotelName={cancelOffer.mode === "free" ? cancelOffer.hotelName : ""}
          stayLabel={cancelOffer.mode === "free" ? cancelOffer.stayLabel : ""}
          untilLabel={cancelOffer.mode === "free" ? cancelOffer.untilLabel : ""}
        />
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        {documentsForItems(returnLeg ? [item, returnLeg] : [item], docs).map((doc) => (
          <FilePreviewTile
            key={doc.id}
            file={{
              id: doc.id,
              path: doc.storage_path,
              fileName: doc.file_name || "document",
              mimeType: doc.mime_type,
              label: doc.id === item.source_document_id ? "Confirmation" : doc.file_name || "Pièce jointe",
              shareText: "Bonjour, je vous transmets une pièce de la réservation.",
              partage,
            }}
          />
        ))}
        {calendarHref ? (
          <AgendaLink href={calendarHref} phone={calendarPhone}>
            {returnLeg ? "Ajouter l’aller à l’agenda" : "Ajouter à l’agenda"}
          </AgendaLink>
        ) : null}
        {returnLeg && returnCalendarHref ? (
          <AgendaLink href={returnCalendarHref} phone={null}>
            Ajouter le retour à l’agenda
          </AgendaLink>
        ) : null}
      </div>
    </div>
  );

  if (showGallery) {
    return (
      <HotelReservationCard
        photos={photos}
        title={hotelName || item.title}
        kicker={hotelKicker}
        room={roomShown}
        price={price}
        item={withoutHotelRoster(item)}
      >
        {panel}
      </HotelReservationCard>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white">
    <details className="group min-w-0">
      <summary className="flex min-w-0 cursor-pointer list-none items-start gap-3 overflow-hidden px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        <BrandMark item={item} className="h-10 w-10" />
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
            {visibleServiceCopy(BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind)}
            {item.kind !== "hotel" && clock ? ` · ${clock}` : ""}
            {endClock && item.kind !== "hotel" ? ` → ${endClock}` : ""}
            {returnLeg ? " · aller-retour" : ""}
            {item.kind === "flight" && tickets > 1 ? ` · ${tickets} billets` : ""}
            {watchLine ? ` · ${watchLine}` : ""}
          </p>
          <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">
            {item.kind === "hotel"
              ? hotelName
              : item.kind === "flight" || item.kind === "rail"
                ? flightTitle
                : item.kind === "accueil_vip"
                  ? vipTitle
                  : visibleServiceCopy(item.title)}
          </p>
          {item.kind === "flight" || item.kind === "rail" ? (
            <>
              {flightSubtitle ? (
                <p className="break-words text-xs leading-snug text-muted">{flightSubtitle}</p>
              ) : null}
              {returnLeg ? (
                <p className="break-words text-xs leading-snug text-muted">Retour · {flightLegLine(returnLeg)}</p>
              ) : null}
              {ticketTravelers ? (
                <p className="break-words text-xs leading-snug text-[var(--admin-navy)]">{ticketTravelers}</p>
              ) : null}
            </>
          ) : item.kind === "hotel" ? (
            <>
              {hotelCity ? <p className="truncate text-xs text-muted">{hotelCity}</p> : null}
              {compactHotel ? null : (
                <p className="truncate text-xs text-muted">{hotelStayLabel(item)}</p>
              )}
            </>
          ) : item.kind === "accueil_vip" ? (
            <p className="break-words text-xs text-muted">
              {[item.supplier, vipLeg?.flight_number, vipPlace, item.confirmation_ref].filter(Boolean).join(" · ")}
            </p>
          ) : (
            <p className="truncate text-xs text-muted">
              {[item.supplier, item.confirmation_ref].filter(Boolean).join(" · ")}
            </p>
          )}
          {price ? (
            <p className="mt-1 break-words text-sm font-bold text-[var(--admin-navy)] sm:hidden">
              {price}
            </p>
          ) : null}
        </div>
        {price ? (
          <p className="hidden max-w-[7.5rem] shrink-0 text-right text-sm font-bold leading-snug text-[var(--admin-navy)] sm:block">
            {price}
          </p>
        ) : null}
      </summary>
      {panel}
    </details>
    {item.kind === "accueil_vip" && (clientInfo || hotline || providerMail || party) ? (
      <div className="space-y-2 border-t border-[#e5e3dc] px-3.5 py-3">
        {party ? <p className="text-xs text-muted">{party}</p> : null}
        {hotline ? (
          <a href={`tel:${hotline.replace(/\s/g, "")}`} className="block text-sm font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline">
            Hotline {hotline}
          </a>
        ) : null}
        {providerMail ? (
          <a href={`mailto:${providerMail}`} className="block text-sm text-[var(--admin-navy)] underline-offset-2 hover:underline">
            {providerMail}
          </a>
        ) : null}
        <ClientInfo text={clientInfo} />
      </div>
    ) : null}
    {item.kind === "hotel" ? (
      <div className="px-3.5 pb-3">
        <HotelContactButton item={withoutHotelRoster(item)} roster={false} />
      </div>
    ) : null}
    </div>
  );
}

export function CarnetItinerary({
  booking,
  items,
  docs,
  calendarBase = null,
  phones = null,
  services = null,
  refusals = [],
  partage = null,
  pricesVisible = true,
  hotelCancels = [],
}: {
  booking: PublicBooking;
  items: CrmBookingItem[];
  docs: CrmBookingDocument[];
  calendarBase?: string | null;
  /** Liens qui ouvrent l’agenda du téléphone. Le href https reste le repli bureau. */
  phones?: PhoneCalendarLinks | null;
  /** Lien public : les confirmations passent par /api/files, sans session. */
  partage?: string | null;
  /** Faux : chaque ligne qui aurait un montant affiche « Prix à la publication ». */
  pricesVisible?: boolean;
  /** Titulaire seulement. Absent de l’aperçu, du lien public et de l’exemple. */
  hotelCancels?: ClientHotelCancelOffer[];
  refusals?: ServiceRefusal[];
  services?: {
    variant: "admin" | "client";
    travelers: CrmBookingTraveler[];
    holder: CrmCustomer;
    companions: CrmCompanion[];
    whatsappHref?: string;
  } | null;
}) {
  const liveItems = completeFlightRoutes(items).filter((item) => isActiveItem(item));
  const returnIds = roundTripReturnIds(liveItems);
  const days = groupByDay(liveItems);
  const undated = undatedTimeline(liveItems);
  const now = new Date();
  const offers =
    services && bookingHasFlight(liveItems)
      ? itineraryOffers(liveItems).filter((offer) => {
          if (isServiceRefused(refusals, offer)) return false;
          const booked = findExtra(liveItems, offer.kind, offer.leg, offer.place, offer.moment);
          if (booked) return true;
          if (!extraProposed(booking, offer.kind)) return false;
          if (services.variant === "client" && !extraNoticeOk(extraFlightAt(liveItems, offer.leg, booking.start_date || booking.end_date), now)) {
            return false;
          }
          return true;
        })
      : [];
  const heads = services
    ? extraHeadsFromBooking({
        travelers: services.travelers,
        holder: services.holder,
        companions: services.companions,
        at: now,
      })
    : null;
  const homeAddress = services ? formatCustomerAddress(services.holder) : "";

  if (!days.length && !undated.length && !offers.length) return null;

  function itemHref(id: string) {
    if (!calendarBase) return null;
    return itemCalendarHref(calendarBase, id);
  }

  function offerCard(offer: ServiceOffer) {
    if (!services || !heads) return null;
    const existing = findExtra(items, offer.kind, offer.leg, offer.place, offer.moment) as CrmBookingItem | null;
    const at = extraFlightAt(items, offer.leg, booking.start_date || booking.end_date);
    const price =
      offer.kind === "chauffeur"
        ? Number(existing?.amount) || 0
        : extraAmount("greeter", heads.adults, heads.children);
    const detail =
      offer.kind === "greeter"
        ? `${heads.adults} adulte${heads.adults > 1 ? "s" : ""} · ${heads.children} enfant${heads.children > 1 ? "s" : ""}${
            heads.missingBirth ? ` · ${heads.missingBirth} sans date de naissance (compté adulte)` : ""
          }`
        : null;
    return (
      <ServiceOfferCard
        key={`${offerKey(offer)}-${offer.day}`}
        offer={offer}
        existing={existing}
        variant={services.variant}
        bookingId={booking.id}
        reference={booking.reference}
        price={price}
        currency={booking.currency}
        pricesVisible={pricesVisible}
        locked={services.variant === "client" && !extraNoticeOk(at, now)}
        homeAddress={homeAddress}
        detail={detail}
      />
    );
  }

  const coveredExtraIds = new Set(
    offers.flatMap((offer) => {
      const row = findExtra(items, offer.kind, offer.leg, offer.place, offer.moment) as CrmBookingItem | null;
      return row?.id ? [row.id] : [];
    })
  );
  const bookedOffers = offers
    .filter((offer) => findExtra(items, offer.kind, offer.leg, offer.place, offer.moment))
    .sort((a, b) => {
      const rank = (offer: ServiceOffer) => {
        const row = findExtra(items, offer.kind, offer.leg, offer.place, offer.moment);
        return row && extraAgencyStatus(row) === "confirmed" ? 1 : 0;
      };
      return rank(a) - rank(b);
    });
  const openOffers = offers.filter(
    (offer) => !findExtra(items, offer.kind, offer.leg, offer.place, offer.moment)
  );
  const seenDays = new Set(days.map(([key]) => key));
  const offerDays = [...new Set(openOffers.map((offer) => offer.day).filter((day) => !seenDays.has(day)))];
  const timeline = [
    ...days.map(([day, rows]) => [day, composeItineraryDay(day, rows, openOffers)] as const),
    ...offerDays.map((day) => [day, composeItineraryDay(day, [], openOffers)] as const),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">Itinéraire</h2>
          {calendarBase ? (
            <AgendaLink href={calendarBase} phone={phones?.stay}>
              Ajouter tout le séjour
            </AgendaLink>
          ) : null}
        </div>
        {bookedOffers.length ? (
          <div className="space-y-2">{bookedOffers.map((offer) => offerCard(offer))}</div>
        ) : null}
        {timeline.map(([day, rows]) => (
          <div key={day} className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
              {dayHeading(day)}
            </p>
            {rows.map((row) => {
              if (row.type !== "item") return offerCard(row.offer);
              if (coveredExtraIds.has(row.item.id) || returnIds.has(row.item.id)) return null;
              const mate = roundTripMate(row.item, liveItems);
              return (
                  <CardBody
                    key={`${row.item.id}-${day}`}
                    item={row.item}
                    currency={booking.currency}
                    docs={docs}
                    compactHotel={row.item.kind === "hotel"}
                    calendarHref={itemHref(row.item.id)}
                    calendarPhone={
                      row.item.kind === "accueil_vip"
                        ? phones?.items[`${row.item.id}:${day}`] || phones?.items[row.item.id]
                        : phones?.items[row.item.id]
                    }
                    day={day}
                    partage={partage}
                    pricesVisible={pricesVisible}
                    showPrice={flightCountsInStay(row.item, items)}
                    reference={booking.reference}
                    cancelOffer={hotelCancels.find((offer) => offer.itemId === row.item.id) || null}
                    returnLeg={mate}
                    returnCalendarHref={mate ? itemHref(mate.id) : null}
                    stayItems={liveItems}
                  />
              );
            })}
          </div>
        ))}
        {undated.length ? (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
              Sans horaire
            </p>
            {undated.filter((item) => !returnIds.has(item.id)).map((item) => {
              const mate = roundTripMate(item, liveItems);
              return (
              <CardBody
                key={item.id}
                item={item}
                currency={booking.currency}
                docs={docs}
                calendarHref={itemHref(item.id)}
                calendarPhone={phones?.items[item.id]}
                pricesVisible={pricesVisible}
                showPrice={flightCountsInStay(item, items)}
                partage={partage}
                reference={booking.reference}
                cancelOffer={hotelCancels.find((offer) => offer.itemId === item.id) || null}
                returnLeg={mate}
                returnCalendarHref={mate ? itemHref(mate.id) : null}
                stayItems={liveItems}
              />
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
