"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PAGE_POLL_MS, pollRunsWhileVisible } from "@/lib/crm/page-poll";
import { BusyBar } from "@/components/crm/BusyBar";
import { fieldControlClass, Field } from "@/components/crm/fields";
import { CERTIFICATION_HOTELS } from "@/lib/crm/ratehawk/catalog";
import { CHARGE_EXPLANATION, starLabel, stayLine } from "@/lib/crm/ratehawk/display";
import { assembleFinishGuests, validateUserPhone, type RoomGuests } from "@/lib/crm/ratehawk/limits";

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
  excluded_taxes: { name: string; label: string; amount: string; currency_code: string }[];
  taxes: { name: string; label: string; amount: string; currency_code: string; included: boolean }[];
  penalties: { text: string }[];
  room_images: string[];
  room_amenities: string[];
  needs_card: boolean;
};

type HotelCard = {
  hid: number;
  name: string;
  address?: string | null;
  star_rating?: number | null;
  rates: ShownRate[];
  images?: string[];
};

type HotelFacts = {
  name: string;
  address: string | null;
  star_rating: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  description: { title: string; text: string }[];
  amenities: string[];
  policies: string[];
  images: string[];
};

type BookingReceipt = {
  hotelName: string;
  room: string;
  meal: string;
  checkin: string;
  checkout: string;
  stay: string;
  guests: string[];
  penalties: { text: string }[];
  taxes: ShownRate["taxes"];
  showAmount: string;
  showCurrency: string;
  chargeAmount: string;
  chargeCurrency: string;
};

const CHILD_AGES = Array.from({ length: 18 }, (_, age) => age);

function childAgeLabel(age: number) {
  if (age === 0) return "Moins d’un an";
  if (age === 1) return "1 an";
  return `${age} ans`;
}

function HotelPhoto({ src, className }: { src: string; className: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- photos Ratehawk, hôte distant hors next.config
    <img src={src} alt="" referrerPolicy="no-referrer" className={className} />
  );
}

function sameMoney(rate: ShownRate) {
  return rate.show_amount === rate.amount && rate.show_currency_code === rate.currency_code;
}

function RateRow({
  rate,
  stay,
  picked,
  onPrebook,
  onContinue,
}: {
  rate: ShownRate;
  stay: string;
  picked: boolean;
  onPrebook: () => void;
  onContinue: () => void;
}) {
  return (
    <li className={`rounded-xl border p-3 ${picked ? "border-[var(--admin-navy)] bg-[#f8f1e6]" : "border-[#e5e3dc]"}`}>
      {picked ? <p className="text-xs font-semibold uppercase tracking-wide text-[#9e7e51]">Tarif choisi</p> : null}
      <p className="font-medium">{rate.room_name}</p>
      <p className="text-sm">{rate.meal_label}</p>
      {stay ? <p className="text-sm">{stay}</p> : null}
      <p className="mt-1 text-sm">
        {rate.show_amount ? `Affiché ${rate.show_amount} ${rate.show_currency_code}` : null}
        {rate.amount && !sameMoney(rate) ? ` · Débit ${rate.amount} ${rate.currency_code}` : null}
        {!rate.show_amount && rate.amount ? `Débit ${rate.amount} ${rate.currency_code}` : null}
        {rate.sell_amount ? ` · Prix agence ${rate.sell_amount} ${rate.show_currency_code || rate.currency_code}` : ""}
      </p>
      {rate.taxes.length ? (
        <ul className="mt-2 text-sm">
          {rate.taxes.map((tax) => (
            <li key={`${tax.name}-${tax.amount}-${tax.included}`}>
              {tax.included ? "Incluse" : "À régler à l’hôtel"} : {tax.label} {tax.amount} {tax.currency_code}
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
            <HotelPhoto key={src} src={src} className="h-20 w-28 rounded-lg object-cover" />
          ))}
        </div>
      ) : null}
      {rate.room_amenities.length ? <p className="mt-2 text-xs">{rate.room_amenities.join(" · ")}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {rate.book_hash.startsWith("h-") ? (
          <button type="button" className="rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-sm text-white" onClick={onPrebook}>
            Pré-réserver
          </button>
        ) : null}
        {picked ? (
          <button type="button" className="rounded-full border border-[var(--admin-navy)] px-3 py-1.5 text-sm" onClick={onContinue}>
            Continuer : voyageurs
          </button>
        ) : null}
      </div>
    </li>
  );
}

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
  linkDossier = true,
  agencyPhone = "",
}: {
  configured: boolean;
  bookingReady: boolean;
  environment: string;
  paymentType: string;
  priceIncreasePercent: number;
  marginPercent: number;
  orders: RatehawkOrder[];
  mappedHotels: number[];
  /** Le relecteur de certification ne rattache pas un dossier du CRM. */
  linkDossier?: boolean;
  /** Préremplit le téléphone s’il a déjà 5 caractères. Le champ reste obligatoire. */
  agencyPhone?: string;
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
  const [facts, setFacts] = useState<HotelFacts | null>(null);
  const [policies, setPolicies] = useState<string[]>([]);
  const [quote, setQuote] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ShownRate | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [priceAccepted, setPriceAccepted] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState(agencyPhone);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [pickedHash, setPickedHash] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ target: "rates" | "guests"; token: number } | null>(null);
  function showStep(target: "rates" | "guests") {
    setFocus((current) => ({ target, token: (current?.token ?? 0) + 1 }));
  }
  const ratesRef = useRef<HTMLElement>(null);
  const guestsRef = useRef<HTMLElement>(null);
  const [scenario, setScenario] = useState("none");
  const [dossier, setDossier] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [orderReason, setOrderReason] = useState<string | null>(null);
  const [formAmount, setFormAmount] = useState<string | null>(null);
  const [list, setList] = useState(orders);
  const [reserving, setReserving] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);

  const guests = useMemo(() => rooms, [rooms]);
  const stay = useMemo(() => stayLine(checkin, checkout, rooms), [checkin, checkout, rooms]);

  useEffect(() => {
    if (!focus) return;
    const node = focus.target === "rates" ? ratesRef.current : guestsRef.current;
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  useEffect(() => {
    if (!orderId || orderStatus !== "in_progress") return;
    let stop = false;
    const pull = async () => {
      if (!pollRunsWhileVisible(document.visibilityState)) return;
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
    };
    const timer = setInterval(() => void pull(), PAGE_POLL_MS.ratehawk);
    const onVisible = () => {
      if (pollRunsWhileVisible(document.visibilityState)) void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
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
    setFacts(null);
    setListOpen(true);
    setPickedHash(null);
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
    setFacts(null);
    setPriceAccepted(false);
    const response = await fetch("/api/admin/ratehawk/hotel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hid, checkin, checkout, residency, guests }),
    });
    const payload = (await response.json()) as {
      hotel?: HotelCard | null;
      static?: HotelFacts | null;
      error?: string;
    };
    setBusy(null);
    if (!response.ok) {
      setError(payload.error || "Fiche indisponible.");
      return;
    }
    const page = payload.static;
    const images = page?.images?.length ? page.images : payload.hotel?.images || [];
    const hotelName = page?.name && page.name !== "Hôtel" ? page.name : payload.hotel?.name || name;
    setFacts(page || null);
    setHotel(
      payload.hotel
        ? { ...payload.hotel, name: hotelName, address: page?.address, star_rating: page?.star_rating, images }
        : { hid, name: hotelName, address: page?.address, star_rating: page?.star_rating, rates: [], images }
    );
    setPolicies(page?.policies || []);
    setListOpen(false);
    setPickedHash(null);
    showStep("rates");
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
      body: JSON.stringify({ hash: rate.book_hash, hid: hotel.hid, show_amount: rate.show_amount, amount: rate.amount }),
    });
    const payload = (await response.json()) as {
      rate?: ShownRate;
      quote?: string;
      price?: {
        increased: boolean;
        before: number;
        after: number;
        delta: number;
        percent: number;
        charge_before: number | null;
        charge_after: number;
        charge_currency: string;
      };
      error?: string;
    };
    setBusy(null);
    if (!response.ok || !payload.quote || !payload.rate) {
      setError(payload.error || "Ce tarif n’est plus disponible.");
      return;
    }
    setChosen(payload.rate);
    setQuote(payload.quote);
    setPickedHash(rate.book_hash);
    showStep("guests");
    if (payload.price?.increased) {
      const shown =
        payload.rate.show_amount && payload.rate.show_currency_code
          ? `Le prix affiché passe de ${payload.price.before.toFixed(2)} à ${payload.price.after.toFixed(2)} ${payload.rate.show_currency_code}. `
          : "";
      const charged =
        payload.price.charge_before != null
          ? `Le débit passe de ${payload.price.charge_before.toFixed(2)} à ${payload.price.charge_after.toFixed(2)} ${payload.price.charge_currency}. `
          : "";
      setPriceNote(`${shown}${charged}Confirmez ce prix pour continuer.`.trim());
    }
  }

  function guestName(room: number, guest: number, field: "first" | "last") {
    return names[`${room}-${guest}-${field}`] || "";
  }

  async function book(acceptForm = false) {
    setBookError(null);
    if (!hotel || !chosen || !quote) {
      setBookError("Choisissez un tarif pré-réservé.");
      return;
    }
    if (priceNote && !priceAccepted) {
      setBookError("Confirmez la hausse de prix avant de réserver.");
      showStep("guests");
      return;
    }
    const phoneProblem = validateUserPhone(phone);
    if (phoneProblem) {
      setPhoneError(phoneProblem);
      setBookError(phoneProblem);
      showStep("guests");
      return;
    }
    const assembled = assembleFinishGuests(rooms, (roomIndex, personIndex, field) => guestName(roomIndex, personIndex, field));
    if (!assembled.ok) {
      setBookError(assembled.error);
      showStep("guests");
      return;
    }
    setReserving(true);
    setBusy("Réservation en cours…");
    setError(null);
    const guestLines = assembled.rooms.flatMap((room, roomIndex) =>
      room.guests.map((guest) => {
        const who = guest.is_child ? `enfant, ${guest.age} ans` : "adulte";
        return `Chambre ${roomIndex + 1} · ${guest.first_name} ${guest.last_name} (${who})`;
      })
    );
    setReceipt({
      hotelName: hotel.name,
      room: chosen.room_name,
      meal: chosen.meal_label,
      checkin,
      checkout,
      stay,
      guests: guestLines,
      penalties: chosen.penalties,
      taxes: chosen.taxes,
      showAmount: chosen.show_amount,
      showCurrency: chosen.show_currency_code,
      chargeAmount: chosen.amount,
      chargeCurrency: chosen.currency_code,
    });
    let response: Response;
    try {
      response = await fetch("/api/admin/ratehawk/book", {
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
        rooms: assembled.rooms,
        price_accepted: priceAccepted || !priceNote,
        accept_form_price: acceptForm,
        scenario: scenario === "none" ? null : scenario,
        dossier: linkDossier ? dossier || null : null,
        phone: phone.trim(),
        partner_order_id: acceptForm ? orderId : null,
      }),
    });
    } catch {
      setBusy(null);
      setReserving(false);
      setBookError("La réservation n’a pas pu partir. Réessayez.");
      setError("La réservation n’a pas pu partir. Réessayez.");
      return;
    }
    const payload = (await response.json()) as {
      status?: string;
      error?: string;
      partner_order_id?: string;
      amount?: string;
      currency_code?: string;
      frontend?: string;
    };
    setBusy(null);
    setReserving(false);
    if (payload.amount && payload.currency_code) {
      setReceipt((current) => (current ? { ...current, chargeAmount: payload.amount || current.chargeAmount, chargeCurrency: payload.currency_code || current.chargeCurrency } : current));
    }
    if (payload.partner_order_id) setOrderId(payload.partner_order_id);
    if (payload.status === "price_increase") {
      setFormAmount(`${payload.amount} ${payload.currency_code || ""}`.trim());
      setOrderStatus("price_increase");
      setBookError(payload.error || "Le prix du formulaire a augmenté.");
      setError(payload.error || "Le prix du formulaire a augmenté.");
      return;
    }
    if (!response.ok || payload.status === "failed") {
      setOrderStatus("failed");
      setOrderReason(payload.error || null);
      setBookError(payload.error || "La réservation a échoué.");
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
          Hôtels de certification en base : {mappedHotels.includes(10004834) ? "Conrad Los Angeles" : "Conrad Los Angeles manquant"}
          {" · "}
          {mappedHotels.includes(8819557) ? "Rosa Bell Motel" : "Rosa Bell Motel manquant"}.
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
            Hausse 10 %, Rosa Bell
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
                <div className="min-w-[12rem] text-sm">
                  <span className="font-medium">Enfants</span>
                  <div className="mt-1 space-y-2">
                    {room.children.map((age, childIndex) => (
                      <div key={childIndex} className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`child-age-${index}-${childIndex}`}>
                          Âge de l’enfant {childIndex + 1}, chambre {index + 1}
                        </label>
                        <select
                          id={`child-age-${index}-${childIndex}`}
                          className={`${fieldControlClass} w-44`}
                          value={age}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            setRooms((current) =>
                              current.map((item, at) =>
                                at === index
                                  ? { ...item, children: item.children.map((value, childAt) => (childAt === childIndex ? next : value)) }
                                  : item
                              )
                            );
                          }}
                        >
                          {CHILD_AGES.map((option) => (
                            <option key={option} value={option}>
                              {childAgeLabel(option)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="text-xs text-[#9e7e51]"
                          onClick={() =>
                            setRooms((current) =>
                              current.map((item, at) =>
                                at === index ? { ...item, children: item.children.filter((_, childAt) => childAt !== childIndex) } : item
                              )
                            )
                          }
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                    {room.children.length < 4 ? (
                      <button
                        type="button"
                        className="text-sm text-[#9e7e51]"
                        onClick={() =>
                          setRooms((current) =>
                            current.map((item, at) => (at === index ? { ...item, children: [...item.children, 0] } : item))
                          )
                        }
                      >
                        Ajouter un enfant
                      </button>
                    ) : null}
                  </div>
                </div>
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
        listOpen ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-[var(--admin-navy)]">Résultats</h2>
              {hotel ? (
                <button
                  type="button"
                  className="rounded-full border border-[#e5e3dc] px-3 py-1 text-sm"
                  onClick={() => {
                    setListOpen(false);
                    showStep("rates");
                  }}
                >
                  Revenir aux tarifs
                </button>
              ) : null}
            </div>
            {results.map((card) => {
              const selected = hotel?.hid === card.hid;
              return (
                <article
                  key={card.hid}
                  className={`rounded-2xl border bg-white p-4 ${selected ? "border-[var(--admin-navy)] ring-2 ring-[var(--admin-navy)]" : "border-[#e5e3dc]"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      {card.images?.[0] ? <HotelPhoto src={card.images[0]} className="h-16 w-24 shrink-0 rounded-lg object-cover" /> : null}
                      <div>
                        <h3 className="font-semibold">{card.name}</h3>
                        {starLabel(card.star_rating) ? <p className="text-sm">{starLabel(card.star_rating)}</p> : null}
                        {card.address ? <p className="text-sm">{card.address}</p> : null}
                        {selected ? <p className="text-xs text-muted">Sélectionné</p> : null}
                      </div>
                    </div>
                    <button type="button" className="shrink-0 rounded-full border border-[#e5e3dc] px-3 py-1 text-sm" onClick={() => void openHotel(card.hid, card.name)}>
                      {selected ? "Tarifs affichés" : "Voir les tarifs"}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e5e3dc] bg-[#f7f6f3] px-4 py-3">
            <p className="text-sm text-[var(--admin-navy)]">
              <span className="font-medium">{results.length} hôtel{results.length > 1 ? "s" : ""}</span>
              {" · liste repliée. Les tarifs sont juste en dessous."}
            </p>
            <button type="button" className="rounded-full border border-[#e5e3dc] bg-white px-3 py-1 text-sm" onClick={() => setListOpen(true)}>
              Changer d’hôtel
            </button>
          </section>
        )
      ) : null}

      {hotel ? (
        <section ref={ratesRef} className="scroll-mt-24 rounded-2xl border-2 border-[var(--admin-navy)] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9e7e51]">Hôtel sélectionné</p>
          <div className="mt-2 flex gap-3">
            {hotel.images?.[0] ? <HotelPhoto src={hotel.images[0]} className="h-24 w-36 shrink-0 rounded-xl object-cover" /> : null}
            <div>
              <h2 className="text-lg font-semibold">{facts?.name || hotel.name}</h2>
              {starLabel(facts?.star_rating ?? hotel.star_rating) ? <p className="text-sm">{starLabel(facts?.star_rating ?? hotel.star_rating)}</p> : null}
              {facts?.address || hotel.address ? <p className="text-sm">{facts?.address || hotel.address}</p> : null}
              {facts?.check_in_time || facts?.check_out_time ? (
                <p className="mt-1 text-sm">
                  {facts.check_in_time ? `Arrivée à partir de ${facts.check_in_time}` : null}
                  {facts.check_in_time && facts.check_out_time ? " · " : null}
                  {facts.check_out_time ? `Départ avant ${facts.check_out_time}` : null}
                </p>
              ) : null}
              <p className="mt-1 text-sm">Choisissez un tarif, puis Pré-réserver. L’étape suivante s’ouvre juste en dessous.</p>
            </div>
          </div>
          {facts?.description.length ? (
            <div className="mt-4 space-y-2 text-sm">
              {facts.description.map((block) => (
                <p key={`${block.title}-${block.text.slice(0, 24)}`}>
                  {block.title ? <span className="font-medium">{block.title}. </span> : null}
                  {block.text}
                </p>
              ))}
            </div>
          ) : null}
          {facts?.amenities.length ? (
            <p className="mt-3 text-sm">
              <span className="font-medium">Équipements. </span>
              {facts.amenities.join(" · ")}
            </p>
          ) : null}
          {hotel.images && hotel.images.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {hotel.images.slice(0, 8).map((src) => (
                <HotelPhoto key={src} src={src} className="h-28 w-44 shrink-0 rounded-xl object-cover" />
              ))}
            </div>
          ) : null}
          <p className="mt-4 text-sm text-muted">{CHARGE_EXPLANATION}</p>
          <ul className="mt-4 space-y-4">
            {(pickedHash ? hotel.rates.filter((rate) => rate.book_hash === pickedHash) : hotel.rates).map((rate) => (
              <RateRow key={rate.book_hash || `${rate.room_name}-${rate.show_amount}`} rate={rate} stay={stay} picked={rate.book_hash === pickedHash} onPrebook={() => void prebook(rate)} onContinue={() => showStep("guests")} />
            ))}
          </ul>
          {pickedHash && hotel.rates.some((rate) => rate.book_hash !== pickedHash) ? (
            <details className="mt-4 rounded-xl border border-[#e5e3dc] p-3">
              <summary className="cursor-pointer text-sm font-medium">Autres tarifs ({hotel.rates.filter((rate) => rate.book_hash !== pickedHash).length})</summary>
              <ul className="mt-3 space-y-4">
                {hotel.rates.filter((rate) => rate.book_hash !== pickedHash).map((rate) => (
                  <RateRow key={rate.book_hash || `${rate.room_name}-${rate.show_amount}`} rate={rate} stay={stay} picked={false} onPrebook={() => void prebook(rate)} onContinue={() => showStep("guests")} />
                ))}
              </ul>
            </details>
          ) : null}
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
        <section ref={guestsRef} className="scroll-mt-24 rounded-2xl border-2 border-[#C5A880] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9e7e51]">Étape suivante</p>
          <h2 className="text-lg font-semibold">Voyageurs</h2>
          <p className="mt-1 text-sm">
            {chosen.room_name} · {chosen.meal_label}
            {stay ? ` · ${stay}` : ""}
            {chosen.show_amount ? ` · affiché ${chosen.show_amount} ${chosen.show_currency_code}` : ""}
            {chosen.amount ? ` · débit ${chosen.amount} ${chosen.currency_code}` : ""}
            {chosen.sell_amount ? ` · agence ${chosen.sell_amount} ${chosen.show_currency_code || chosen.currency_code}` : ""}
          </p>
          <div className="mt-4 max-w-md">
            <Field label="Téléphone" hint="Contact envoyé à Ratehawk. Au moins 5 caractères." error={phoneError}>
              <input
                className={fieldControlClass}
                type="tel"
                name="phone"
                required
                minLength={5}
                maxLength={35}
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPhoneError(event.target.value.trim().length >= 5 ? null : phoneError);
                }}
              />
            </Field>
          </div>
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
              <p>Le dépôt sera débité de {formAmount}. C’est le montant envoyé à Ratehawk.</p>
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
                    <input className={fieldControlClass} placeholder={age === 0 ? "Enfant de moins d’un an, prénom (facultatif)" : `Enfant ${age} ans, prénom (facultatif)`} value={guestName(roomIndex, childIndex + 1, "first")} onChange={(event) => setNames((current) => ({ ...current, [`${roomIndex}-${childIndex + 1}-first`]: event.target.value }))} />
                    <input className={fieldControlClass} placeholder="Nom" value={guestName(roomIndex, childIndex + 1, "last")} onChange={(event) => setNames((current) => ({ ...current, [`${roomIndex}-${childIndex + 1}-last`]: event.target.value }))} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {linkDossier ? (
              <Field label="Dossier Travel BA" hint="Référence ou identifiant, si le séjour existe déjà.">
                <input className={fieldControlClass} value={dossier} onChange={(event) => setDossier(event.target.value)} />
              </Field>
            ) : null}
            <Field label="Scénario bac à sable">
              <select className={fieldControlClass} value={scenario} onChange={(event) => setScenario(event.target.value)}>
                <option value="none">Réservation normale</option>
                <option value="unknown_success">unknown puis succès</option>
                <option value="unknown_soldout">unknown puis complet</option>
                <option value="unknown_book_limit">unknown puis book_limit</option>
              </select>
            </Field>
          </div>
          {bookError ? (
            <p className="mt-3 text-sm text-accent" role="alert">
              {bookError}
            </p>
          ) : null}
          {reserving ? (
            <div className="mt-3">
              <BusyBar label="Réservation en cours…" />
            </div>
          ) : null}
          <button
            type="button"
            className="mt-4 rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm text-white disabled:opacity-60"
            disabled={reserving}
            aria-busy={reserving}
            onClick={() => void book(false)}
          >
            {reserving ? "Réservation en cours…" : "Réserver"}
          </button>
        </section>
      ) : null}

      {orderId ? (
        <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
          <h2 className="text-lg font-semibold">{orderStatus === "success" ? "Confirmation" : "Statut"}</h2>
          {receipt ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium">{receipt.hotelName}</p>
              <p>
                {receipt.room} · {receipt.meal}
              </p>
              <p>
                {receipt.checkin} → {receipt.checkout}
                {receipt.stay ? ` · ${receipt.stay}` : ""}
              </p>
              {receipt.guests.length ? (
                <ul>
                  {receipt.guests.map((guest) => (
                    <li key={guest}>{guest}</li>
                  ))}
                </ul>
              ) : null}
              {receipt.penalties.length ? (
                <ul>
                  {receipt.penalties.map((line) => (
                    <li key={line.text}>{line.text}</li>
                  ))}
                </ul>
              ) : null}
              {receipt.taxes.length ? (
                <ul>
                  {receipt.taxes.map((tax) => (
                    <li key={`${tax.name}-${tax.amount}-${tax.included}`}>
                      {tax.included ? "Incluse" : "À régler à l’hôtel"} : {tax.label} {tax.amount} {tax.currency_code}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p>
                {receipt.showAmount ? `Affiché ${receipt.showAmount} ${receipt.showCurrency}` : null}
                {receipt.chargeAmount ? ` · Débit envoyé ${receipt.chargeAmount} ${receipt.chargeCurrency}` : null}
              </p>
              <p className="text-muted">{CHARGE_EXPLANATION}</p>
            </div>
          ) : null}
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
