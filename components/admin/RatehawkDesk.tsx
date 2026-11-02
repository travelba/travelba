"use client";

import { useEffect, useMemo, useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";
import { fieldControlClass, Field } from "@/components/crm/fields";
import { CERTIFICATION_HOTELS } from "@/lib/crm/ratehawk/catalog";
import type { RoomGuests } from "@/lib/crm/ratehawk/limits";

type Destination =
  | { kind: "region"; id: number; name: string; country_code: string | null }
  | { kind: "hotel"; hid: number; name: string; region_id: number | null; region_name: string | null };

type ShownRate = {
  book_hash: string;
  room_name: string;
  meal_label: string;
  show_amount: string;
  show_currency_code: string;
  sell_amount: string | null;
  amount: string;
  currency_code: string;
  payment_type: string;
  excluded_taxes: { name: string; amount: string; currency_code: string }[];
  penalties: { text: string }[];
  room_images: string[];
  room_amenities: string[];
  needs_card: boolean;
};

type HotelCard = { hid: number; name: string; rates: ShownRate[] };

export type RatehawkOrder = {
  partner_order_id: string;
  status: string;
  status_reason: string | null;
  hotel_name: string | null;
  hid: number | null;
  checkin: string | null;
  checkout: string | null;
  sell_amount: number | null;
  currency: string | null;
  environment: string;
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: "En cours",
  success: "Confirmée",
  failed: "Échouée",
  cancelled: "Annulée",
  price_review: "Prix à confirmer",
  price_increase: "Prix à confirmer",
};

const STATUS_ETG: Record<string, string> = {
  in_progress: "In progress",
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
  price_review: "In progress",
  price_increase: "In progress",
};

function plusDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function emptyRoom(adults = 2, children: number[] = []): RoomGuests {
  return { adults, children };
}

export function RatehawkDesk({
  configured,
  bookingReady,
  environment,
  paymentType,
  priceIncreasePercent,
  marginPercent,
  orders,
  mappedHotels,
}: {
  configured: boolean;
  bookingReady: boolean;
  environment: string;
  paymentType: string;
  priceIncreasePercent: number;
  marginPercent: number;
  orders: RatehawkOrder[];
  mappedHotels: number[];
}) {
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<Destination[]>([]);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [checkin, setCheckin] = useState(plusDays(30));
  const [checkout, setCheckout] = useState(plusDays(32));
  const [residency, setResidency] = useState("fr");
  const [rooms, setRooms] = useState<RoomGuests[]>([emptyRoom()]);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<HotelCard[]>([]);
  const [hotel, setHotel] = useState<HotelCard | null>(null);
  const [policies, setPolicies] = useState<string[]>([]);
  const [quote, setQuote] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ShownRate | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [priceAccepted, setPriceAccepted] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [scenario, setScenario] = useState("none");
  const [dossier, setDossier] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [orderReason, setOrderReason] = useState<string | null>(null);
  const [formAmount, setFormAmount] = useState<string | null>(null);
  const [list, setList] = useState(orders);

  const guests = useMemo(() => rooms, [rooms]);

  useEffect(() => {
    if (!orderId || orderStatus !== "in_progress") return;
    let stop = false;
    const timer = setInterval(async () => {
      const response = await fetch("/api/admin/ratehawk/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ partner_order_id: orderId }),
      });
      const payload = (await response.json()) as { status?: string; reason?: string | null; error?: string };
      if (stop) return;
      if (payload.status) setOrderStatus(payload.status);
      setOrderReason(payload.reason || payload.error || null);
      if (payload.status && payload.status !== "in_progress") {
        const fresh = await fetch("/api/admin/ratehawk/orders");
        const body = (await fresh.json()) as { orders?: RatehawkOrder[] };
        if (body.orders) setList(body.orders);
      }
    }, 5000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [orderId, orderStatus]);

  async function lookup(value: string) {
    setQuery(value);
    if (value.trim().length < 2 && !/^\d+$/.test(value.trim())) {
      setChoices([]);
      return;
    }
    const response = await fetch(`/api/admin/ratehawk/destinations?q=${encodeURIComponent(value.trim())}`);
    const payload = (await response.json()) as { regions?: Destination[]; hotels?: Destination[] };
    setChoices([...(payload.regions || []), ...(payload.hotels || [])]);
  }

  function applyCertification(kind: "multi" | "uz" | "mc" | "increase") {
    const hotel = CERTIFICATION_HOTELS[kind === "increase" ? 1 : 0];
    setDestination({ kind: "hotel", hid: hotel.hid, name: hotel.name, region_id: hotel.region_id, region_name: hotel.region_name });
    setQuery(hotel.name);
    setScenario("none");
    if (kind === "multi") {
      setResidency("fr");
      setRooms([emptyRoom(2, [3]), emptyRoom(2, [1, 5, 17])]);
    } else if (kind === "uz") {
      setResidency("uz");
      setRooms([emptyRoom(2, [])]);
    } else if (kind === "mc") {
      setResidency("mc");
      setRooms([emptyRoom(2, [0, 17])]);
    } else {
      setResidency("fr");
      setRooms([emptyRoom(2, [])]);
    }
  }

  async function search() {
    setBusy("Recherche des disponibilités…");
    setError(null);
    setHotel(null);
    setQuote(null);
    setChosen(null);
    const mode = destination?.kind === "region" ? "region" : latitude && longitude && !destination ? "geo" : "hids";
    const hids = destination?.kind === "hotel" ? [destination.hid] : mode === "hids" ? [] : undefined;
    if (mode === "hids" && !hids?.length) {
      setBusy(null);
      setError("Choisissez une destination, un hôtel, ou des coordonnées.");
      return;
    }
    const response = await fetch("/api/admin/ratehawk/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode,
        region_id: destination?.kind === "region" ? destination.id : undefined,
        latitude: latitude ? Number(latitude) : undefined,
        longitude: longitude ? Number(longitude) : undefined,
        hids,
        checkin,
        checkout,
        residency,
        guests,
      }),
    });
    const payload = (await response.json()) as { hotels?: HotelCard[]; error?: string };
    setBusy(null);
    if (!response.ok) {
      setError(payload.error || "Recherche impossible.");
      return;
    }
    setResults(payload.hotels || []);
    if (payload.error && !(payload.hotels || []).length) setError(payload.error);
  }

  async function openHotel(hid: number, name: string) {
    setBusy("Ouverture de la fiche hôtel…");
    setError(null);
    setQuote(null);
    setChosen(null);
    setPriceAccepted(false);
    const response = await fetch("/api/admin/ratehawk/hotel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hid, checkin, checkout, residency, guests }),
    });
    const payload = (await response.json()) as { hotel?: HotelCard | null; static?: { policies?: string[] } | null; error?: string };
    setBusy(null);
    if (!response.ok) {
      setError(payload.error || "Fiche indisponible.");
      return;
    }
    setHotel(payload.hotel ? { ...payload.hotel, name: payload.hotel.name || name } : { hid, name, rates: [] });
    setPolicies(payload.static?.policies || []);
    if (payload.error && !payload.hotel?.rates?.length) setError(payload.error);
  }

  async function prebook(rate: ShownRate) {
    if (!hotel) return;
    setBusy("Vérification du tarif…");
    setError(null);
    setPriceNote(null);
    setPriceAccepted(false);
    const response = await fetch("/api/admin/ratehawk/prebook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hash: rate.book_hash, hid: hotel.hid, show_amount: rate.show_amount }),
    });
    const payload = (await response.json()) as {
      rate?: ShownRate;
      quote?: string;
      price?: { increased: boolean; before: number; after: number; delta: number; percent: number };
      error?: string;
    };
    setBusy(null);
    if (!response.ok || !payload.quote || !payload.rate) {
      setError(payload.error || "Ce tarif n’est plus disponible.");
      return;
    }
    setChosen(payload.rate);
    setQuote(payload.quote);
    if (payload.price?.increased) {
      setPriceNote(
        `Le prix net passe de ${payload.price.before.toFixed(2)} à ${payload.price.after.toFixed(2)} ${payload.rate.show_currency_code} (+${payload.price.percent.toFixed(1)} %). Confirmez-le pour continuer.`
      );
    }
  }

  function guestName(room: number, guest: number, field: "first" | "last") {
    return names[`${room}-${guest}-${field}`] || "";
  }

  async function book(acceptForm = false) {
    if (!hotel || !chosen || !quote) return;
    if (priceNote && !priceAccepted) {
      setError("Confirmez la hausse de prix avant de réserver.");
      return;
    }
    setBusy("Réservation en cours…");
    setError(null);
    const payloadRooms = rooms.map((room, roomIndex) => {
      const guestsInRoom = [];
      const adultFirst = guestName(roomIndex, 0, "first");
      const adultLast = guestName(roomIndex, 0, "last");
      guestsInRoom.push({ first_name: adultFirst, last_name: adultLast });
      room.children.forEach((age, childIndex) => {
        const first = guestName(roomIndex, childIndex + 1, "first");
        const last = guestName(roomIndex, childIndex + 1, "last");
        if (first || last) guestsInRoom.push({ first_name: first, last_name: last, is_child: true, age });
      });
      return { guests: guestsInRoom };
    });
    const response = await fetch("/api/admin/ratehawk/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quote,
        hid: hotel.hid,
        hotel_name: hotel.name,
        checkin,
        checkout,
        residency,
        guests: rooms,
        rooms: payloadRooms,
        price_accepted: priceAccepted || !priceNote,
        accept_form_price: acceptForm,
        scenario: scenario === "none" ? null : scenario,
        dossier: dossier || null,
        partner_order_id: acceptForm ? orderId : null,
      }),
    });
    const payload = (await response.json()) as {
      status?: string;
      error?: string;
      partner_order_id?: string;
      amount?: string;
      currency_code?: string;
      frontend?: string;
    };
    setBusy(null);
    if (payload.partner_order_id) setOrderId(payload.partner_order_id);
    if (payload.status === "price_increase") {
      setFormAmount(`${payload.amount} ${payload.currency_code || ""}`.trim());
      setOrderStatus("price_increase");
      setError(payload.error || "Le prix du formulaire a augmenté.");
      return;
    }
    if (!response.ok || payload.status === "failed") {
      setOrderStatus("failed");
      setOrderReason(payload.error || null);
      setError(payload.error || "La réservation a échoué.");
      return;
    }
    setOrderStatus(payload.status || "in_progress");
    setOrderReason(null);
  }

  async function cancel(partnerOrderId: string) {
    setBusy("Annulation…");
    setError(null);
    const response = await fetch("/api/admin/ratehawk/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partner_order_id: partnerOrderId }),
    });
    const payload = (await response.json()) as { error?: string; status?: string };
    setBusy(null);
    if (!response.ok) {
      setError(payload.error || "Annulation impossible.");
      return;
    }
    if (orderId === partnerOrderId) setOrderStatus("cancelled");
    setList((current) => current.map((row) => (row.partner_order_id === partnerOrderId ? { ...row, status: "cancelled" } : row)));
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4 text-sm text-[var(--admin-navy)]">
        <p>
          Environnement <strong>{environment}</strong>, paiement <strong>{paymentType}</strong>, hausse pré-réservation{" "}
          <strong>{priceIncreasePercent} %</strong>, marge <strong>{marginPercent} %</strong> du net.
        </p>
        <p className="mt-2">
          Hôtels de certification en base : {mappedHotels.includes(10004834) ? "10004834" : "10004834 manquant"}
          {" · "}
          {mappedHotels.includes(8819557) ? "8819557" : "8819557 manquant"}.
        </p>
        {!configured ? <p className="mt-2">Les clés Ratehawk ne sont pas posées. La recherche restera fermée.</p> : null}
        {configured && !bookingReady ? <p className="mt-2">Posez RATEHAWK_AGENCY_EMAIL avant une réservation.</p> : null}
      </section>

      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
        <h2 className="text-lg font-semibold text-[var(--admin-navy)]">Recherche</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-full border border-[#e5e3dc] px-3 py-1 text-xs" type="button" onClick={() => applyCertification("multi")}>
            2 chambres, enfants
          </button>
          <button className="rounded-full border border-[#e5e3dc] px-3 py-1 text-xs" type="button" onClick={() => applyCertification("uz")}>
            Ouzbékistan, 2 adultes
          </button>
          <button className="rounded-full border border-[#e5e3dc] px-3 py-1 text-xs" type="button" onClick={() => applyCertification("mc")}>
            Monaco, 0 et 17 ans
          </button>
          <button className="rounded-full border border-[#e5e3dc] px-3 py-1 text-xs" type="button" onClick={() => applyCertification("increase")}>
            Hausse 10 % (8819557)
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Destination ou hôtel">
            <input className={fieldControlClass} value={query} onChange={(event) => void lookup(event.target.value)} />
          </Field>
          <Field label="Nationalité du passeport" hint="Code pays, obligatoire. uz, mc, fr.">
            <input className={fieldControlClass} value={residency} maxLength={2} onChange={(event) => setResidency(event.target.value.toLowerCase())} />
          </Field>
          <Field label="Arrivée">
            <input className={fieldControlClass} type="date" value={checkin} onChange={(event) => setCheckin(event.target.value)} />
          </Field>
          <Field label="Départ">
            <input className={fieldControlClass} type="date" value={checkout} onChange={(event) => setCheckout(event.target.value)} />
          </Field>
          <Field label="Latitude, si pas de destination">
            <input className={fieldControlClass} value={latitude} onChange={(event) => setLatitude(event.target.value)} />
          </Field>
          <Field label="Longitude">
            <input className={fieldControlClass} value={longitude} onChange={(event) => setLongitude(event.target.value)} />
          </Field>
        </div>
        {choices.length ? (
          <ul className="mt-3 divide-y divide-[#e5e3dc] rounded-xl border border-[#e5e3dc]">
            {choices.map((choice) => (
              <li key={choice.kind === "region" ? `r-${choice.id}` : `h-${choice.hid}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm"
                  onClick={() => {
                    setDestination(choice);
                    setQuery(choice.name);
                    setChoices([]);
                  }}
                >
                  {choice.kind === "region" ? `Région · ${choice.name}` : `Hôtel · ${choice.name}`}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 space-y-3">
          {rooms.map((room, index) => (
            <div key={index} className="rounded-xl bg-[#f7f6f3] p-3">
              <p className="text-sm font-medium">Chambre {index + 1}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <label className="text-sm">
                  Adultes
                  <input
                    className={`${fieldControlClass} mt-1 w-24`}
                    type="number"
                    min={1}
                    max={6}
                    value={room.adults}
                    onChange={(event) => {
                      const adults = Number(event.target.value);
                      setRooms((current) => current.map((item, at) => (at === index ? { ...item, adults } : item)));
                    }}
                  />
                </label>
                <label className="text-sm">
                  Âges des enfants
                  <input
                    className={`${fieldControlClass} mt-1 w-48`}
                    placeholder="3, 5"
                    value={room.children.join(", ")}
                    onChange={(event) => {
                      const children = event.target.value
                        .split(/[,\s]+/)
                        .filter(Boolean)
                        .map((age) => Number(age));
                      setRooms((current) => current.map((item, at) => (at === index ? { ...item, children } : item)));
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="text-sm text-[#9e7e51]"
            onClick={() => setRooms((current) => (current.length >= 9 ? current : [...current, emptyRoom()]))}
          >
            Ajouter une chambre
          </button>
        </div>
        <button type="button" className="mt-4 rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm text-white" onClick={() => void search()}>
          Chercher
        </button>
      </section>

      {busy ? <BusyBar label={busy} /> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}

      {results.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--admin-navy)]">Résultats</h2>
          {results.map((card) => (
            <article key={card.hid} className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{card.name}</h3>
                  <p className="text-xs text-muted">hid {card.hid}</p>
                </div>
                <button type="button" className="rounded-full border border-[#e5e3dc] px-3 py-1 text-sm" onClick={() => void openHotel(card.hid, card.name)}>
                  Voir les tarifs
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {card.rates.slice(0, 2).map((rate) => (
                  <li key={`${card.hid}-${rate.show_amount}-${rate.meal_label}`}>
                    {rate.room_name} · {rate.meal_label} · net {rate.show_amount} {rate.show_currency_code}
                    {rate.sell_amount ? ` · agence ${rate.sell_amount} ${rate.show_currency_code}` : ""}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      ) : null}

      {hotel ? (
        <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
          <h2 className="text-lg font-semibold">{hotel.name}</h2>
          <ul className="mt-4 space-y-4">
            {hotel.rates.map((rate) => (
              <li key={rate.book_hash || `${rate.room_name}-${rate.show_amount}`} className="rounded-xl border border-[#e5e3dc] p-3">
                <p className="font-medium">{rate.room_name}</p>
                <p className="text-sm">{rate.meal_label}</p>
                <p className="mt-1 text-sm">
                  Net {rate.show_amount} {rate.show_currency_code}
                  {rate.sell_amount ? ` · Prix agence ${rate.sell_amount} ${rate.show_currency_code}` : ""}
                  {" · "}
                  {rate.payment_type}
                </p>
                {rate.excluded_taxes.length ? (
                  <ul className="mt-2 text-sm">
                    {rate.excluded_taxes.map((tax) => (
                      <li key={`${tax.name}-${tax.amount}`}>
                        Taxe non incluse : {tax.name} {tax.amount} {tax.currency_code}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className="mt-2 text-sm">
                  {rate.penalties.map((line) => (
                    <li key={line.text}>{line.text}</li>
                  ))}
                </ul>
                {rate.room_images.length ? (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {rate.room_images.slice(0, 4).map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element -- photos Ratehawk, hôte distant hors next.config
                      <img key={src} src={src} alt="" className="h-20 w-28 rounded-lg object-cover" />
                    ))}
                  </div>
                ) : null}
                {rate.room_amenities.length ? <p className="mt-2 text-xs">{rate.room_amenities.join(" · ")}</p> : null}
                {rate.book_hash.startsWith("h-") ? (
                  <button type="button" className="mt-3 rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-sm text-white" onClick={() => void prebook(rate)}>
                    Pré-réserver
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {policies.length ? (
            <div className="mt-4 text-sm">
              <h3 className="font-medium">Conditions de l’hôtel</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {policies.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {chosen && quote ? (
        <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
          <h2 className="text-lg font-semibold">Voyageurs</h2>
          <p className="mt-1 text-sm">
            {chosen.room_name} · net {chosen.show_amount} {chosen.show_currency_code}
            {chosen.sell_amount ? ` · agence ${chosen.sell_amount} ${chosen.show_currency_code}` : ""}
          </p>
          {priceNote ? (
            <div className="mt-3 rounded-xl bg-[#f8f1e6] p-3 text-sm">
              <p>{priceNote}</p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={priceAccepted} onChange={(event) => setPriceAccepted(event.target.checked)} />
                Continuer avec ce prix
              </label>
            </div>
          ) : null}
          {formAmount ? (
            <div className="mt-3 rounded-xl bg-[#f8f1e6] p-3 text-sm">
              <p>Le formulaire indique {formAmount}. Ce montant part chez Ratehawk.</p>
              <button type="button" className="mt-2 rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-white" onClick={() => void book(true)}>
                Confirmer et réserver
              </button>
            </div>
          ) : null}
          <div className="mt-4 space-y-4">
            {rooms.map((room, roomIndex) => (
              <div key={roomIndex} className="rounded-xl bg-[#f7f6f3] p-3">
                <p className="text-sm font-medium">Chambre {roomIndex + 1} — au moins un adulte</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <input className={fieldControlClass} placeholder="Prénom" value={guestName(roomIndex, 0, "first")} onChange={(event) => setNames((current) => ({ ...current, [`${roomIndex}-0-first`]: event.target.value }))} />
                  <input className={fieldControlClass} placeholder="Nom" value={guestName(roomIndex, 0, "last")} onChange={(event) => setNames((current) => ({ ...current, [`${roomIndex}-0-last`]: event.target.value }))} />
                </div>
                {room.children.map((age, childIndex) => (
                  <div key={`${age}-${childIndex}`} className="mt-2 grid gap-2 md:grid-cols-2">
                    <input className={fieldControlClass} placeholder={`Enfant ${age} ans, prénom (facultatif)`} value={guestName(roomIndex, childIndex + 1, "first")} onChange={(event) => setNames((current) => ({ ...current, [`${roomIndex}-${childIndex + 1}-first`]: event.target.value }))} />
                    <input className={fieldControlClass} placeholder="Nom" value={guestName(roomIndex, childIndex + 1, "last")} onChange={(event) => setNames((current) => ({ ...current, [`${roomIndex}-${childIndex + 1}-last`]: event.target.value }))} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Dossier Travel BA" hint="Référence ou identifiant, si le séjour existe déjà.">
              <input className={fieldControlClass} value={dossier} onChange={(event) => setDossier(event.target.value)} />
            </Field>
            <Field label="Scénario bac à sable">
              <select className={fieldControlClass} value={scenario} onChange={(event) => setScenario(event.target.value)}>
                <option value="none">Réservation normale</option>
                <option value="unknown_success">unknown puis succès</option>
                <option value="unknown_soldout">unknown puis complet</option>
                <option value="unknown_book_limit">unknown puis book_limit</option>
              </select>
            </Field>
          </div>
          <button type="button" className="mt-4 rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm text-white" onClick={() => void book(false)}>
            Réserver
          </button>
        </section>
      ) : null}

      {orderId ? (
        <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
          <h2 className="text-lg font-semibold">Statut</h2>
          <p className="mt-2 text-sm">
            {orderId}
            <br />
            {STATUS_LABEL[orderStatus || ""] || orderStatus} · {STATUS_ETG[orderStatus || ""] || ""}
          </p>
          {orderReason ? <p className="mt-1 text-sm">{orderReason}</p> : null}
          {orderStatus === "in_progress" ? <div className="mt-3"><BusyBar label="Ratehawk confirme la réservation…" /></div> : null}
          {orderStatus === "success" ? (
            <button type="button" className="mt-3 rounded-full border border-[#e5e3dc] px-3 py-1.5 text-sm" onClick={() => void cancel(orderId)}>
              Annuler la réservation
            </button>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold text-[var(--admin-navy)]">Réservations</h2>
        <ul className="mt-3 divide-y divide-[#e5e3dc] rounded-2xl border border-[#e5e3dc] bg-white">
          {list.length ? list.map((row) => (
            <li key={row.partner_order_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{row.hotel_name || "Hôtel"} · {STATUS_LABEL[row.status] || row.status}</p>
                <p className="text-xs">{row.partner_order_id}</p>
                <p className="text-xs">{STATUS_ETG[row.status] || row.status}{row.status_reason ? ` · ${row.status_reason}` : ""}</p>
              </div>
              {row.status === "success" ? (
                <button type="button" className="rounded-full border border-[#e5e3dc] px-3 py-1" onClick={() => void cancel(row.partner_order_id)}>
                  Annuler
                </button>
              ) : null}
            </li>
          )) : <li className="px-4 py-3 text-sm">Aucune réservation Ratehawk.</li>}
        </ul>
      </section>
    </div>
  );
}
