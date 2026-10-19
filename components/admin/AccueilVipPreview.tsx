"use client";

import { useMemo, useState } from "react";
import { AccueilVipForm } from "@/components/admin/AccueilVipForm";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { accueilVipQuietLine, composeAccueilVip, readAccueilVipFields } from "@/lib/crm/accueil-vip";
import { dayHeading, groupByDay } from "@/lib/crm/carnet";
import type { PublicBooking } from "@/lib/crm/public-booking";
import type { CrmBookingItem } from "@/lib/crm/types";

const INFO = `Ce qui est inclus
- Arrivée le 26/12, AF956 à 5h50 : un agent Coral les attend avec une pancarte à leur nom dans le hall d'arrivée, avant l'immigration. Il les fait passer directement par la file rapide de l'immigration, puis les aide aux bagages et à la douane.
- Départ le 08/01, AF157 à 11h55 : il faut appeler la hotline environ 15 minutes avant d'arriver à l'aéroport. Un agent les attend au dépose-minute (nouveau terminal, porte 2, 3e étage). Après l'enregistrement, elles vont au comptoir Coral (rangée H, 3e étage), puis l'agent les accompagne en file rapide jusqu'à l'embarquement.
- Porteur : 2 bagages par personne, soit 4 en tout.`;

const BOOKING_ID = "apercu-phuket";

function stayItem(partial: Partial<CrmBookingItem> & Pick<CrmBookingItem, "id" | "kind" | "title">): CrmBookingItem {
  return {
    booking_id: BOOKING_ID,
    supplier: null,
    confirmation_ref: null,
    start_at: null,
    end_at: null,
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    details: {},
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

const ARRIVAL = stayItem({
  id: "af956",
  kind: "flight",
  title: "Paris → Phuket",
  sort_order: 0,
  start_at: "2026-12-25T23:20:00",
  end_at: "2026-12-26T05:50:00",
  confirmation_ref: "AF956",
  details: {
    airline: "Air France",
    flight_number: "AF956",
    from: "CDG",
    to: "HKT",
    city_from: "Paris",
    city_to: "Phuket",
    departure_timezone: "Europe/Paris",
    arrival_timezone: "Asia/Bangkok",
  },
});

const DEPARTURE = stayItem({
  id: "af157",
  kind: "flight",
  title: "Phuket → Paris",
  sort_order: 2,
  start_at: "2027-01-08T11:55:00",
  end_at: "2027-01-08T19:15:00",
  confirmation_ref: "AF157",
  details: {
    airline: "Air France",
    flight_number: "AF157",
    from: "HKT",
    to: "CDG",
    city_from: "Phuket",
    city_to: "Paris",
    departure_timezone: "Asia/Bangkok",
    arrival_timezone: "Europe/Paris",
  },
});

const COMPOSED = composeAccueilVip(
  {
    service: "roundtrip",
    provider: "Coral Thailand",
    arrivalFlightId: ARRIVAL.id,
    departureFlightId: DEPARTURE.id,
    passengers: 2,
    bags: 4,
    hotline: "+66 92 915 9515",
    email: "booking@coralthailand.com",
    confirmation: "PNR-021811",
    clientInfo: INFO,
    amount: null,
  },
  [ARRIVAL, DEPARTURE]
);

const booking: PublicBooking = {
  id: BOOKING_ID,
  reference: "TB-2026-0088",
  title: "Phuket & Krabi",
  destination: "Phuket · Krabi",
  start_date: "2026-12-25",
  end_date: "2027-01-08",
  currency: "EUR",
  status: "confirmed",
  cover_image_path: null,
  cover_credit: null,
  notes_client: null,
  prices_visible: true,
  visible_to_client: true,
  offer_chauffeur: false,
  offer_greeter: false,
  offer_checkin: false,
  offer_visa: false,
  updated_at: "2026-10-19T12:00:00.000Z",
};

export function AccueilVipPreview() {
  const [draft, setDraft] = useState(() => ({
    kind: "accueil_vip" as const,
    title: COMPOSED.ok ? COMPOSED.card.title : "Accueil VIP",
    supplier: "Coral Thailand",
    confirmation_ref: "PNR-021811",
    start_at: COMPOSED.ok ? COMPOSED.card.start_at || "" : "",
    end_at: COMPOSED.ok ? COMPOSED.card.end_at || "" : "",
    amount: null as number | null,
    include_in_ledger: false,
    details: COMPOSED.ok ? COMPOSED.card.details : {},
  }));
  const live = useMemo(() => {
    const fields = readAccueilVipFields({
      supplier: draft.supplier,
      confirmation_ref: draft.confirmation_ref,
      amount: draft.amount,
      details: draft.details as Record<string, unknown>,
    });
    return composeAccueilVip(fields, [ARRIVAL, DEPARTURE]);
  }, [draft]);
  const vip = live.ok
    ? stayItem({
        id: "vip",
        kind: "accueil_vip",
        title: live.card.title,
        supplier: live.card.supplier,
        confirmation_ref: live.card.confirmation_ref,
        start_at: live.card.start_at,
        end_at: live.card.end_at,
        amount: live.card.amount,
        sort_order: 1,
        details: live.card.details,
      })
    : null;
  const items = [ARRIVAL, DEPARTURE, ...(vip ? [vip] : [])];
  const days = groupByDay(items);

  return (
    <div className="mx-auto max-w-[390px] space-y-8 bg-[#F7F4EE] px-3 py-4 text-[var(--admin-navy)]">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">TB-2026-0088</p>
        <h1 className="font-display text-xl font-bold">Phuket & Krabi</h1>
        <p className="text-sm text-muted">Andréa Bensaïd</p>
      </header>
      <section id="vip-form" className="space-y-2">
        <h2 className="font-display text-lg font-bold">Accueil VIP</h2>
        <AccueilVipForm
          item={draft}
          flights={[ARRIVAL, DEPARTURE]}
          currency="EUR"
          onChange={(next) =>
            setDraft({
              kind: "accueil_vip",
              title: next.title,
              supplier: next.supplier || "",
              confirmation_ref: next.confirmation_ref || "",
              start_at: next.start_at || "",
              end_at: next.end_at || "",
              amount: next.amount ?? null,
              include_in_ledger: false,
              details: (next.details || {}) as Record<string, unknown>,
            })
          }
        />
      </section>
      <section id="vip-timeline" className="space-y-3">
        <h2 className="font-display text-lg font-bold">Itinéraire du dossier</h2>
        {days.map(([day, rows]) => (
          <div key={day} className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">{dayHeading(day)}</p>
            {rows.map((row) => (
              <article key={`${row.id}-${day}`} className="rounded-2xl border border-[#e5e3dc] bg-white px-3 py-3">
                <p className="text-sm font-semibold">{row.kind === "accueil_vip" ? row.title : row.title}</p>
                <p className="text-xs text-muted">
                  {row.kind === "accueil_vip" ? accueilVipQuietLine(row) : row.confirmation_ref}
                </p>
              </article>
            ))}
          </div>
        ))}
      </section>
      <section id="vip-client" className="space-y-2">
        <h2 className="font-display text-lg font-bold">Espace client</h2>
        <CarnetItinerary booking={booking} items={items} docs={[]} />
      </section>
    </div>
  );
}
