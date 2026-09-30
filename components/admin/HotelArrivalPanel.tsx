"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hotelDisplayName } from "@/lib/crm/carnet";
import {
  ARRIVAL_CHANNEL_LABELS,
  ARRIVAL_STATUS_LABELS,
  formatArrivalAmount,
  stayCardFace,
} from "@/lib/crm/hotel-arrival";
import type { CardViewLine, CrmBookingItem, CrmHotelArrival } from "@/lib/crm/types";
import { fieldControlClass } from "@/components/crm/fields";
import { StayCard } from "@/components/crm/StayCard";
import { AgencyCardPeek } from "@/components/admin/AgencyCardPeek";

export function HotelArrivalPanel({
  bookingId,
  items,
  arrivals,
  holder = "",
  cardViews = [],
}: {
  bookingId: string;
  items: CrmBookingItem[];
  arrivals: CrmHotelArrival[];
  holder?: string;
  hasCardCode?: boolean;
  cardViews?: CardViewLine[];
}) {
  const hotels = items.filter((item) => item.kind === "hotel");
  if (!hotels.length) return null;
  return (
    <section className="admin-af-card space-y-4 rounded-3xl p-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Avant l’arrivée</p>
        <h2 className="text-lg font-semibold text-[var(--admin-navy)]">Carte de séjour</h2>
      </div>
      <div className="space-y-4">
        {hotels.map((item) => (
          <HotelArrivalRow
            key={item.id}
            bookingId={bookingId}
            item={item}
            arrival={arrivals.find((row) => row.booking_item_id === item.id) || null}
            holder={holder}
            cardViews={cardViews.filter((line) => line.itemId === item.id)}
          />
        ))}
      </div>
    </section>
  );
}

function HotelArrivalRow({
  bookingId,
  item,
  arrival,
  holder,
  cardViews,
}: {
  bookingId: string;
  item: CrmBookingItem;
  arrival: CrmHotelArrival | null;
  holder: string;
  cardViews: CardViewLine[];
}) {
  const router = useRouter();
  const [net, setNet] = useState(arrival?.net_cents != null ? (arrival.net_cents / 100).toFixed(2) : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(action: string, extra?: { net?: string }) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/hotel-arrival`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, action, ...extra }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string; pan?: string; expiry?: string; cvc?: string } | null;
      if (!res.ok) {
        setError(json?.error || "Action impossible");
        return null;
      }
      return json;
    } finally {
      setBusy(null);
    }
  }

  async function saveNet() {
    const json = await post("net", { net });
    if (json) router.refresh();
  }

  async function markPaid() {
    const json = await post("paid");
    if (json) router.refresh();
  }

  async function clearTask() {
    const json = await post("task_done");
    if (json) router.refresh();
  }

  async function generateCard() {
    const json = await post("issue");
    if (json) router.refresh();
  }

  const name = hotelDisplayName(item) || item.title;
  return (
    <article className="rounded-2xl border border-[#e5e3dc] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--admin-navy)]">{name}</p>
          <p className="text-sm text-[var(--admin-navy)]/70">
            {arrival ? ARRIVAL_CHANNEL_LABELS[arrival.channel] : "Hôtel"}
            {arrival ? ` · ${ARRIVAL_STATUS_LABELS[arrival.status]}` : ""}
          </p>
        </div>
        {arrival?.amount_cents != null ? (
          <p className="text-sm font-semibold text-[var(--admin-navy)]">
            {formatArrivalAmount(arrival.amount_cents, arrival.currency)}
          </p>
        ) : null}
      </div>
      {arrival?.task_open && arrival.task_note ? (
        <p className="mt-3 text-sm text-[var(--admin-navy)]">{arrival.task_note}</p>
      ) : null}
      {arrival?.payment_url ? (
        <a className="mt-3 inline-block text-sm underline" href={arrival.payment_url} target="_blank" rel="noreferrer">
          Ouvrir le lien de paiement
        </a>
      ) : null}
      {arrival?.channel === "direct" ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm text-[var(--admin-navy)]">
            Net hôtel
            <input
              className={`${fieldControlClass} mt-1`}
              inputMode="decimal"
              value={net}
              onChange={(event) => setNet(event.target.value)}
            />
          </label>
          <button type="button" className="admin-af-btn rounded-full px-3 py-2 text-sm" disabled={busy === "net"} onClick={saveNet}>
            Enregistrer le net
          </button>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {arrival?.pliant_card_id ? null : (
          <button type="button" className="admin-af-btn rounded-full px-3 py-2 text-sm" disabled={busy === "issue"} onClick={() => void generateCard()}>
            {busy === "issue" ? "…" : "Générer la carte"}
          </button>
        )}
        {arrival && arrival.channel !== "expedia" && arrival.status !== "vip_sent" && arrival.status !== "closed" ? (
          <button type="button" className="admin-af-btn rounded-full px-3 py-2 text-sm" disabled={busy === "paid"} onClick={markPaid}>
            Le règlement est fait
          </button>
        ) : null}
        {arrival?.task_open ? (
          <button type="button" className="admin-af-btn rounded-full px-3 py-2 text-sm" disabled={busy === "task_done"} onClick={clearTask}>
            Tâche traitée
          </button>
        ) : null}
      </div>
      {arrival?.pliant_card_id ? (
        <div className="mt-2">
          <StayCard
            face={stayCardFace({
              itemId: item.id,
              hotel: name,
              holder,
              last4: arrival.card_last4,
              closed: Boolean(arrival.card_closed_at),
            })}
            revealUrl={`/api/admin/bookings/${bookingId}/hotel-arrival`}
            personal
            views={cardViews.filter((line) => line.source === "pliant")}
          />
        </div>
      ) : null}
      {arrival?.client_card_name ? (
        <div className="mt-1 text-xs">
          <AgencyCardPeek bookingId={bookingId} itemId={item.id} source="client" views={cardViews} />
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </article>
  );
}
