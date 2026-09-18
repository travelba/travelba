import type { CrmBooking, CrmBookingDocument, CrmBookingItem } from "@/lib/crm/types";
import { BOOKING_ITEM_LABELS, type BookingItemKind } from "@/lib/crm/types";
import { Icon } from "@/components/crm/icons";
import {
  confirmationForItem,
  dayHeading,
  detailList,
  detailStr,
  flightCities,
  flightIata,
  groupByDay,
  hotelRooms,
  hotelStayLabel,
  itemClock,
  itemPriceLabel,
  kindIcon,
  undatedTimeline,
} from "@/lib/crm/carnet";

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
}: {
  item: CrmBookingItem;
  currency: string;
  docs: CrmBookingDocument[];
  compactHotel?: boolean;
}) {
  const price = itemPriceLabel(item, currency);
  const included = detailList(item, "included");
  const rooms = hotelRooms(item);
  const iata = flightIata(item);
  const cities = flightCities(item);
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

  return (
    <details className="group rounded-2xl border border-[#e5e3dc] bg-white">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-peach)] text-[var(--admin-navy)]">
          <Icon name={kindIcon(item.kind)} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
            {BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind}
            {item.kind !== "hotel" && clock ? ` · ${clock}` : ""}
            {endClock && item.kind !== "hotel" ? ` → ${endClock}` : ""}
          </p>
          <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">{item.title}</p>
          {item.kind === "flight" || item.kind === "rail" ? (
            <>
              {iata ? <p className="truncate text-xs font-semibold text-[var(--admin-navy)]">{iata}</p> : null}
              {cities ? <p className="truncate text-xs text-muted">{cities}</p> : null}
            </>
          ) : (
            <p className="truncate text-xs text-muted">
              {item.kind === "hotel"
                ? compactHotel
                  ? city || hotelStayLabel(item)
                  : hotelStayLabel(item)
                : [item.supplier, item.confirmation_ref].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {price ? (
          <p className="shrink-0 text-sm font-bold text-[var(--admin-navy)]">{price}</p>
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
          <p>
            {[detailStr(item, "meeting_point") || city, detailStr(item, "duration")].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {item.confirmation_ref ? (
          <p className="text-xs text-muted">Réf. {item.confirmation_ref}</p>
        ) : null}
        <ConfirmLink item={item} docs={docs} />
      </div>
    </details>
  );
}

export function CarnetItinerary({
  booking,
  items,
  docs,
}: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  docs: CrmBookingDocument[];
}) {
  const days = groupByDay(items);
  const undated = undatedTimeline(items);

  if (!days.length && !undated.length) return null;

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">Itinéraire</h2>
        {days.map(([day, rows]) => (
          <div key={day} className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
              {dayHeading(day)}
            </p>
            {rows.map((item) => (
              <CardBody
                key={`${item.id}-${day}`}
                item={item}
                currency={booking.currency}
                docs={docs}
                compactHotel={item.kind === "hotel"}
              />
            ))}
          </div>
        ))}
        {undated.length ? (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
              Sans horaire
            </p>
            {undated.map((item) => (
              <CardBody key={item.id} item={item} currency={booking.currency} docs={docs} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
