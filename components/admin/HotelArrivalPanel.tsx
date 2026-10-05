"use client";

import { AgencyCardPeek } from "@/components/admin/AgencyCardPeek";
import { PliantCardDesk } from "@/components/admin/PliantCardDesk";
import { hotelDisplayName } from "@/lib/crm/carnet";
import { shownStayProvision, stayCardFace, tripStayCard } from "@/lib/crm/hotel-arrival";
import { stayCardIsManual } from "@/lib/crm/manual-stay-card";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import type { PliantCardDraft, PliantSpendLine } from "@/lib/crm/pliant-cards";
import type { CardViewLine, CrmBookingItem, CrmHotelArrival } from "@/lib/crm/types";

const ACTIVE = new Set(["confirmed", "travelling"]);

export function HotelArrivalPanel({
  bookingId,
  items,
  arrivals,
  holder = "",
  cardViews = [],
  bookingStatus = "",
  currency = "EUR",
  registry = null,
  spends = [],
  account = null,
}: {
  bookingId: string;
  items: CrmBookingItem[];
  arrivals: CrmHotelArrival[];
  holder?: string;
  cardViews?: CardViewLine[];
  bookingStatus?: string;
  currency?: string | null;
  registry?: PliantCardDraft | null;
  spends?: PliantSpendLine[];
  account?: { availableCents: number | null; currency: string } | null;
}) {
  const hotels = items.filter((item) => item.kind === "hotel");
  if (!hotels.length) return null;
  const stayCard = tripStayCard(
    hotels.flatMap((item) => {
      const arrival = arrivals.find((row) => row.booking_item_id === item.id);
      if (!arrival?.pliant_card_id) return [];
      return [
        stayCardFace({
          itemId: item.id,
          hotel: hotelDisplayName(item) || item.title,
          holder,
          last4: arrival.card_last4,
          closed: Boolean(arrival.card_closed_at) || arrival.status === "closed",
        }),
      ];
    })
  );
  const cardId =
    registry?.pliant_card_id ||
    arrivals.find((row) => row.pliant_card_id && !row.card_closed_at && row.status !== "closed")?.pliant_card_id ||
    arrivals.find((row) => row.pliant_card_id)?.pliant_card_id ||
    null;
  const ceiling = cardCeiling(hotels, arrivals, currency, registry);
  const face =
    stayCard ||
    stayCardFace({
      itemId: hotels[0]?.id || bookingId,
      hotel: "",
      holder,
      last4: registry?.last4 || null,
      closed: false,
    });
  return (
    <section className="admin-af-card overflow-hidden rounded-3xl">
      <div className="border-b border-[#e7e1d6] px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Avant l’arrivée</p>
        <h2 className="font-display text-xl font-extrabold tracking-tight text-[var(--admin-navy)]">Carte hôtel</h2>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-[var(--admin-navy)]/70">
          Une seule carte pour le voyage, en fin de réservation. Chaque hôtel entre dans le plafond, plus 30 %.
        </p>
      </div>
      <div className="divide-y divide-[#e7e1d6]">
        {hotels.map((item) => (
          <HotelCard
            key={item.id}
            bookingId={bookingId}
            item={item}
            arrival={arrivals.find((row) => row.booking_item_id === item.id) || null}
            cardViews={cardViews.filter((line) => line.itemId === item.id)}
            bookingStatus={bookingStatus}
            currency={currency}
          />
        ))}
      </div>
      <div className="border-t border-[#e7e1d6] px-5 py-5">
        <PliantCardDesk
          mode="booking"
          bookingId={bookingId}
          cardId={cardId}
          face={{ ...face, last4: face.last4 || registry?.last4 || null, closed: face.closed }}
          ceilingCents={ceiling?.cents ?? null}
          currency={ceiling?.currency || registry?.currency || currency || "EUR"}
          locked={registry?.status === "locked"}
          closed={face.closed}
          revealUrl={cardId ? `/api/admin/bookings/${bookingId}/hotel-arrival` : ""}
          account={account}
          spends={spends}
          views={cardViews.filter((line) => line.itemId === face.itemId && line.source === "pliant")}
        />
      </div>
    </section>
  );
}

function cardCeiling(
  hotels: CrmBookingItem[],
  arrivals: CrmHotelArrival[],
  currency: string | null,
  registry: PliantCardDraft | null
) {
  if (registry?.limit_cents && registry.limit_cents > 0) {
    return { cents: registry.limit_cents, currency: registry.currency || currency || "EUR" };
  }
  let cents = 0;
  let code = currency || "EUR";
  for (const item of hotels) {
    const provision = shownStayProvision(
      item,
      arrivals.find((row) => row.booking_item_id === item.id) || null,
      currency
    );
    if (!provision) continue;
    cents += provision.ceilingCents;
    code = provision.currency;
  }
  return cents > 0 ? { cents, currency: code } : null;
}

function HotelCard({
  bookingId,
  item,
  arrival,
  cardViews,
  bookingStatus,
  currency,
}: {
  bookingId: string;
  item: CrmBookingItem;
  arrival: CrmHotelArrival | null;
  cardViews: CardViewLine[];
  bookingStatus: string;
  currency: string | null;
}) {
  const name = hotelDisplayName(item) || item.title;
  const provision = shownStayProvision(item, arrival, currency);
  const closed = Boolean(arrival?.card_closed_at) || arrival?.status === "closed";
  const issued = Boolean(arrival?.pliant_card_id);
  const pliantNote =
    !issued && arrival?.task_note?.startsWith("Pliant") ? arrival.task_note : null;
  const stay = item.start_at && item.end_at ? `${formatDateFr(item.start_at)} — ${formatDateFr(item.end_at)}` : "";

  let line = "Indiquez le prix sur la carte de cet hôtel. La carte du voyage se crée ensuite, avec 30 % de marge.";
  if (provision && closed) line = "Fermée après le séjour.";
  else if (issued && stayCardIsManual(arrival?.task_note)) line = "Générée au montant saisi. Elle se ferme trois jours après le départ.";
  else if (provision && issued) line = "Compté sur la carte du voyage. Elle se ferme après le dernier départ.";
  else if (provision && pliantNote) line = pliantNote;
  else if (provision && !ACTIVE.has(bookingStatus)) line = "Elle se crée à la confirmation du séjour.";
  else if (provision) line = "Elle se crée à l’ouverture de ce dossier.";

  return (
    <article className="space-y-4 px-5 py-5">
      <div>
        <p className="font-display text-lg font-extrabold tracking-tight text-[var(--admin-navy)]">{name}</p>
        {stay ? <p className="text-sm text-[var(--admin-navy)]/60">{stay}</p> : null}
      </div>
      {provision ? (
        <dl className="rounded-2xl bg-[#f6f1e8] px-4 py-3">
          <div className="flex items-baseline justify-between gap-3 text-sm text-[var(--admin-navy)]">
            <dt>Séjour</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(provision.baseCents / 100, provision.currency)}</dd>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3 text-sm text-[var(--admin-navy)]/70">
            <dt>Marge 30 %</dt>
            <dd className="tabular-nums">{formatMoney(provision.marginCents / 100, provision.currency)}</dd>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3 border-t border-[#e5dccb] pt-3">
            <dt className="text-sm font-semibold text-[var(--admin-navy)]">Part de cet hôtel</dt>
            <dd className="font-display text-2xl font-extrabold tabular-nums tracking-tight text-[var(--admin-navy)]">
              {formatMoney(provision.ceilingCents / 100, provision.currency)}
            </dd>
          </div>
        </dl>
      ) : null}
      {arrival?.client_card_name ? (
        <div className="text-xs">
          <AgencyCardPeek bookingId={bookingId} itemId={item.id} source="client" views={cardViews} />
        </div>
      ) : null}
      <p className="text-sm leading-relaxed text-[var(--admin-navy)]/70">{line}</p>
    </article>
  );
}
