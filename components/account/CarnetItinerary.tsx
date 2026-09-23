import type {
  CrmBooking,
  CrmBookingDocument,
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCompanion,
  CrmCustomer,
} from "@/lib/crm/types";
import { BOOKING_ITEM_LABELS, type BookingItemKind } from "@/lib/crm/types";
import { Icon } from "@/components/crm/icons";
import { BrandMark } from "@/components/crm/BrandMark";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import {
  documentsForItem,
  confirmationForItem,
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
  hotelRooms,
  hotelStayLabel,
  itemClock,
  itemPriceLabel,
  kindIcon,
  undatedTimeline,
} from "@/lib/crm/carnet";
import { itemTicketCount } from "@/lib/crm/item-match";
import { ServiceOfferCard } from "@/components/crm/ServiceOfferCard";
import {
  bookingHasFlight,
  composeItineraryDay,
  extraAmount,
  extraFlightAt,
  extraHeadsFromBooking,
  extraNoticeOk,
  findExtra,
  formatCustomerAddress,
  itineraryOffers,
  offerKey,
  type ServiceOffer,
} from "@/lib/crm/extras";

function AgendaLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
    >
      <Icon name="event" className="h-4 w-4" />
      {children}
    </a>
  );
}

function ConfirmLink({
  item,
  docs,
}: {
  item: CrmBookingItem;
  docs: CrmBookingDocument[];
}) {
  const doc = confirmationForItem(item, docs);
  if (!doc) return null;
  return (
    <a
      href={`/api/files?path=${encodeURIComponent(doc.storage_path)}`}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--aura-blue)]"
    >
      Voir la confirmation
      <Icon name="picture_as_pdf" className="h-4 w-4" />
    </a>
  );
}

function CardBody({
  item,
  currency,
  docs,
  compactHotel = false,
  calendarHref = null,
  day = null,
}: {
  item: CrmBookingItem;
  currency: string;
  docs: CrmBookingDocument[];
  compactHotel?: boolean;
  calendarHref?: string | null;
  day?: string | null;
}) {
  const price = itemPriceLabel(item, currency, day);
  const included = detailList(item, "included");
  const rooms = hotelRooms(item);
  const iata = flightIata(item);
  const cities = flightCities(item);
  const flightTitle = item.kind === "flight" || item.kind === "rail" ? flightCardTitle(item) : "";
  const flightSubtitle =
    item.kind === "flight" || item.kind === "rail" ? flightCardSubtitle(item) : "";
  const tickets = itemTicketCount(item);
  const clock = itemClock(item.start_at);
  const endClock = itemClock(item.end_at);
  const occupancy = detailStr(item, "occupancy");
  const special = detailStr(item, "special_requests");
  const pickupNote = detailStr(item, "pickup_note");
  const baggage = detailStr(item, "baggage");
  const seat = detailStr(item, "seat");
  const terminal = detailStr(item, "terminal");
  const cabin = detailStr(item, "cabin");
  const airline = detailStr(item, "airline") || item.supplier || "";
  const city = detailStr(item, "city");
  const board = detailStr(item, "board");
  const hotelName = item.kind === "hotel" ? hotelDisplayName(item) : "";
  const hotelCity = item.kind === "hotel" ? hotelCityLine(item) : "";

  return (
    <details className="group min-w-0 overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white">
      <summary className="flex min-w-0 cursor-pointer list-none items-start gap-3 overflow-hidden px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        <BrandMark item={item} className="h-10 w-10" />
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
            {BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind}
            {item.kind !== "hotel" && clock ? ` · ${clock}` : ""}
            {endClock && item.kind !== "hotel" ? ` → ${endClock}` : ""}
            {item.kind === "flight" && tickets > 1 ? ` · ${tickets} billets` : ""}
          </p>
          <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">
            {item.kind === "hotel"
              ? hotelName
              : item.kind === "flight" || item.kind === "rail"
                ? flightTitle
                : item.title}
          </p>
          {item.kind === "flight" || item.kind === "rail" ? (
            flightSubtitle ? (
              <p className="break-words text-xs leading-snug text-muted">{flightSubtitle}</p>
            ) : null
          ) : item.kind === "hotel" ? (
            <>
              {hotelCity ? <p className="truncate text-xs text-muted">{hotelCity}</p> : null}
              {compactHotel ? null : (
                <p className="truncate text-xs text-muted">{hotelStayLabel(item)}</p>
              )}
            </>
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
      <div className="space-y-2 border-t border-[#e5e3dc] px-3.5 py-3 text-sm text-[var(--admin-navy)]">
        {item.kind === "flight" || item.kind === "rail" ? (
          <>
            {airline ? <p>{airline}</p> : null}
            {iata ? <p>{iata}</p> : null}
            {cities ? <p>{cities}</p> : null}
            {cabin ? <p>Classe {cabin}</p> : null}
            {baggage ? <p>Bagages {baggage}</p> : null}
            {seat ? <p>Siège {seat}</p> : null}
            {terminal ? <p>Terminal {terminal}</p> : null}
          </>
        ) : null}
        {item.kind === "hotel" ? (
          <>
            {city ? <p>{city}</p> : null}
            {board ? <p>{board}</p> : null}
            {occupancy ? <p>{occupancy}</p> : null}
            {rooms.map((room, index) => (
              <p key={index} className="text-muted">
                {[room.room, room.guests, room.confirmation_ref].filter(Boolean).join(" · ")}
              </p>
            ))}
            {included.length ? (
              <ul className="list-disc pl-4 text-muted">
                {included.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            ) : null}
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
        <div className="flex flex-wrap items-center gap-3">
          {documentsForItem(item, docs).map((doc) => (
            <FileOpenLink
              key={doc.id}
              path={doc.storage_path}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--aura-blue)]"
            >
              <Icon name={fileKindIcon(doc.mime_type, doc.file_name)} className="h-4 w-4" />
              {doc.id === item.source_document_id ? "Voir la confirmation" : doc.file_name || "Pièce jointe"}
            </FileOpenLink>
          ))}
          {!documentsForItem(item, docs).length ? <ConfirmLink item={item} docs={docs} /> : null}
          {calendarHref ? <AgendaLink href={calendarHref}>Ajouter à l’agenda</AgendaLink> : null}
        </div>
      </div>
    </details>
  );
}

export function CarnetItinerary({
  booking,
  items,
  docs,
  calendarBase = null,
  services = null,
}: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  docs: CrmBookingDocument[];
  calendarBase?: string | null;
  services?: {
    variant: "admin" | "client";
    travelers: CrmBookingTraveler[];
    holder: CrmCustomer;
    companions: CrmCompanion[];
    whatsappHref?: string;
  } | null;
}) {
  const days = groupByDay(items);
  const undated = undatedTimeline(items);
  const offers = services && bookingHasFlight(items) ? itineraryOffers(items) : [];
  const now = new Date();
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
    return `${calendarBase}?item_id=${encodeURIComponent(id)}`;
  }

  function offerCard(offer: ServiceOffer) {
    if (!services || !heads) return null;
    const existing = findExtra(items, offer.kind, offer.leg, offer.place) as CrmBookingItem | null;
    const at = extraFlightAt(items, offer.leg, booking.start_date || booking.end_date);
    const price =
      offer.kind === "chauffeur" ? extraAmount("chauffeur") : extraAmount("greeter", heads.adults, heads.children);
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
        locked={services.variant === "client" && !extraNoticeOk(at, now)}
        whatsappHref={services.whatsappHref}
        addressLabel={
          offer.kind === "chauffeur"
            ? offer.place === "hotel"
              ? "Adresse de l’hôtel"
              : offer.leg === "arrival"
                ? "Adresse de dépôt"
                : "Adresse de prise en charge"
            : null
        }
        initialAddress={offer.place === "hotel" ? offer.address : homeAddress}
        detail={detail}
      />
    );
  }

  const seenDays = new Set(days.map(([key]) => key));
  const offerDays = [...new Set(offers.map((offer) => offer.day).filter((day) => !seenDays.has(day)))];
  const timeline = [
    ...days.map(([day, rows]) => [day, composeItineraryDay(day, rows, offers)] as const),
    ...offerDays.map((day) => [day, composeItineraryDay(day, [], offers)] as const),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">Itinéraire</h2>
          {calendarBase ? (
            <AgendaLink href={calendarBase}>Ajouter tout le séjour</AgendaLink>
          ) : null}
        </div>
        {timeline.map(([day, rows]) => (
          <div key={day} className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
              {dayHeading(day)}
            </p>
            {rows.map((row) =>
              row.type === "item" ? (
                <CardBody
                  key={`${row.item.id}-${day}`}
                  item={row.item}
                  currency={booking.currency}
                  docs={docs}
                  compactHotel={row.item.kind === "hotel"}
                  calendarHref={itemHref(row.item.id)}
                  day={day}
                />
              ) : (
                offerCard(row.offer)
              )
            )}
          </div>
        ))}
        {undated.length ? (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
              Sans horaire
            </p>
            {undated.map((item) => (
              <CardBody
                key={item.id}
                item={item}
                currency={booking.currency}
                docs={docs}
                calendarHref={itemHref(item.id)}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
