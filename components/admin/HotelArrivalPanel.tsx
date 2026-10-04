"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AgencyCardPeek } from "@/components/admin/AgencyCardPeek";
import { hotelDisplayName } from "@/lib/crm/carnet";
import { shownStayProvision, stayCardFace, tripStayCard } from "@/lib/crm/hotel-arrival";
import { stayCardIsManual } from "@/lib/crm/manual-stay-card";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import type { CardViewLine, CrmBookingItem, CrmHotelArrival } from "@/lib/crm/types";
import { StayCard } from "@/components/crm/StayCard";

const fieldClass =
  "w-full rounded-xl border border-[#d9d1c3] bg-[#faf9f6] px-3 py-2.5 text-sm text-[#0B192C] outline-none transition placeholder:text-[#3d4654] focus:border-[#0B192C] focus:bg-white";

const ACTIVE = new Set(["confirmed", "travelling"]);

export function HotelArrivalPanel({
  bookingId,
  items,
  arrivals,
  holder = "",
  guestFirst = "",
  guestLast = "",
  cardViews = [],
  bookingStatus = "",
  currency = "EUR",
}: {
  bookingId: string;
  items: CrmBookingItem[];
  arrivals: CrmHotelArrival[];
  holder?: string;
  guestFirst?: string;
  guestLast?: string;
  cardViews?: CardViewLine[];
  bookingStatus?: string;
  currency?: string | null;
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
            guestFirst={guestFirst}
            guestLast={guestLast}
          />
        ))}
      </div>
      {stayCard ? (
        <div className="border-t border-[#e7e1d6] px-5 py-5">
          <StayCard
            face={stayCard}
            revealUrl={`/api/admin/bookings/${bookingId}/hotel-arrival`}
            views={cardViews.filter((line) => line.itemId === stayCard.itemId && line.source === "pliant")}
          />
        </div>
      ) : null}
    </section>
  );
}

function HotelCard({
  bookingId,
  item,
  arrival,
  cardViews,
  bookingStatus,
  currency,
  guestFirst,
  guestLast,
}: {
  bookingId: string;
  item: CrmBookingItem;
  arrival: CrmHotelArrival | null;
  cardViews: CardViewLine[];
  bookingStatus: string;
  currency: string | null;
  guestFirst: string;
  guestLast: string;
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
      {issued ? null : (
        <ManualStayCardForm bookingId={bookingId} itemId={item.id} firstName={guestFirst} lastName={guestLast} />
      )}
    </article>
  );
}

function ManualStayCardForm({
  bookingId,
  itemId,
  firstName,
  lastName,
}: {
  bookingId: string;
  itemId: string;
  firstName: string;
  lastName: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/hotel-arrival`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId,
          action: "issue-manual",
          amount,
          firstName: first,
          lastName: last,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || "La carte n’a pas pu être créée.");
        return;
      }
      router.refresh();
    } catch {
      setError("La carte n’a pas pu être créée.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3 rounded-2xl border border-[#e5dccb] bg-[#faf9f6] px-4 py-4" onSubmit={submit}>
      <p className="text-sm font-semibold text-[var(--admin-navy)]">Générer une carte</p>
      <p className="text-sm leading-relaxed text-[var(--admin-navy)]/70">
        Montant en euros, libellé au prénom et au nom. Aucune restriction de paiement. La carte est rattachée à Benjamin Boukris, et reste ouverte jusqu’à trois jours après le départ.
      </p>
      <label className="block text-sm text-[var(--admin-navy)]">
        Montant (€)
        <input
          className={`${fieldClass} mt-1`}
          inputMode="decimal"
          value={amount}
          disabled={busy}
          required
          aria-label="Montant en euros"
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-[var(--admin-navy)]">
          Nom
          <input
            className={`${fieldClass} mt-1`}
            value={last}
            disabled={busy}
            required
            aria-label="Nom sur la carte"
            onChange={(event) => setLast(event.target.value)}
          />
        </label>
        <label className="block text-sm text-[var(--admin-navy)]">
          Prénom
          <input
            className={`${fieldClass} mt-1`}
            value={first}
            disabled={busy}
            required
            aria-label="Prénom sur la carte"
            onChange={(event) => setFirst(event.target.value)}
          />
        </label>
      </div>
      {error ? <p className="text-sm text-[#8a3b2b]">{error}</p> : null}
      <button
        type="submit"
        className="rounded-full bg-[#0B192C] px-4 py-2 text-sm font-semibold text-[#faf9f6] disabled:opacity-50"
        disabled={busy}
      >
        {busy ? "Génération…" : "Générer la carte"}
      </button>
    </form>
  );
}
