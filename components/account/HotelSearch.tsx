"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DateFrInput, fieldControlClass } from "@/components/crm/fields";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import type { ClientHotel, HotelPerks, PlaceSuggestion } from "@/lib/crm/hotel-search";
import { formatMoney } from "@/lib/crm/money";
import { siteConfig } from "@/lib/site";

type SearchEvent =
  | { type: "start" }
  | { type: "hotel"; hotel: ClientHotel; replaced?: boolean }
  | { type: "link"; hotelKey: string; offerId: string }
  | { type: "done"; tFirstMs: number | null; tDoneMs: number; cached: boolean; count: number }
  | { type: "error"; message: string };

const inputClass = `${fieldControlClass} rounded-2xl border-[#e5e3dc] bg-[#faf9f6] px-4 py-3 focus:border-[var(--admin-gold)]`;

const PERK_LABEL: { key: keyof HotelPerks; label: string }[] = [
  { key: "breakfast", label: "Petit-déjeuner" },
  { key: "freeCancellation", label: "Annulation gratuite" },
  { key: "upgrade", label: "Surclassement" },
  { key: "credit", label: "Crédit hôtel" },
  { key: "earlyCheckIn", label: "Arrivée anticipée" },
  { key: "lateCheckOut", label: "Départ tardif" },
];

let memory: { key: string; hotels: ClientHotel[]; at: number } | null = null;
const suggestMemory = new Map<string, PlaceSuggestion[]>();

function searchKey(destination: string, checkIn: string, checkOut: string, adults: number) {
  return `${destination.trim().toLocaleLowerCase("fr")}|${checkIn}|${checkOut}|${adults}`;
}

function euros(cents: number, currency: string) {
  return formatMoney(cents / 100, currency);
}

function upsertHotel(list: ClientHotel[], hotel: ClientHotel) {
  const index = list.findIndex((row) => row.hotelKey === hotel.hotelKey);
  const next = list.slice();
  if (index < 0) next.push(hotel);
  else next[index] = { ...next[index], ...hotel, offerId: hotel.offerId || next[index].offerId };
  next.sort((a, b) => a.sellCents - b.sellCents || a.name.localeCompare(b.name, "fr"));
  return next;
}

export function HotelSearch() {
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [remoteSuggest, setRemoteSuggest] = useState<{ key: string; items: PlaceSuggestion[] } | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [hotels, setHotels] = useState<ClientHotel[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [note, setNote] = useState("");
  const [asked, setAsked] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState<string | null>(null);
  const [serverFirst, setServerFirst] = useState<number | null>(null);
  const [clientFirst, setClientFirst] = useState<number | null>(null);
  const suggestAbort = useRef<AbortController | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  const folded = destination.trim().toLocaleLowerCase("fr");
  const suggestions = useMemo(() => {
    if (folded.length < 2) return [];
    if (remoteSuggest?.key === folded) return remoteSuggest.items;
    const instant = [...suggestMemory.entries()].find(([key]) => folded.startsWith(key) || key.startsWith(folded));
    if (!instant) return [];
    return instant[1]
      .filter(
        (item) =>
          item.label.toLocaleLowerCase("fr").includes(folded) || item.detail.toLocaleLowerCase("fr").includes(folded)
      )
      .slice(0, 8);
  }, [folded, remoteSuggest]);
  const listOpen = suggestOpen && suggestions.length > 0;

  useEffect(() => {
    const query = destination.trim();
    if (query.length < 2) return;
    const key = query.toLocaleLowerCase("fr");
    const timer = setTimeout(() => {
      suggestAbort.current?.abort();
      const controller = new AbortController();
      suggestAbort.current = controller;
      void fetch(`/api/client/hotels/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { suggestions?: PlaceSuggestion[] } | null) => {
          if (!json?.suggestions) return;
          suggestMemory.set(key, json.suggestions);
          setRemoteSuggest({ key, items: json.suggestions });
        })
        .catch(() => {});
    }, 100);
    return () => clearTimeout(timer);
  }, [destination]);

  const whatsapp = `https://wa.me/${siteConfig.whatsappNumber}`;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setNote("");
    setSearched(true);
    const key = searchKey(destination, checkIn, checkOut, adults);
    const fresh = memory && memory.key === key && Date.now() - memory.at < 10 * 60 * 1000 ? memory.hotels : null;
    const started = performance.now();
    setClientFirst(null);
    setServerFirst(null);
    if (fresh?.length) {
      setHotels(fresh);
      setClientFirst(Math.round(performance.now() - started));
    } else {
      setHotels([]);
    }
    setSearching(true);
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    try {
      const response = await fetch("/api/client/hotels/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination, checkIn, checkOut, adults }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const json = (await response.json().catch(() => null)) as { error?: string } | null;
        setNote(json?.error || "La recherche n’a pas abouti.");
        setSearching(false);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let latest: ClientHotel[] = fresh || [];
      let sawHotel = Boolean(fresh?.length);
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as SearchEvent;
          if (event.type === "hotel") {
            latest = upsertHotel(latest, event.hotel);
            if (!sawHotel) {
              sawHotel = true;
              setClientFirst(Math.round(performance.now() - started));
            }
          } else if (event.type === "link") {
            latest = latest.map((hotel) =>
              hotel.hotelKey === event.hotelKey ? { ...hotel, offerId: event.offerId } : hotel
            );
          } else if (event.type === "done") {
            setServerFirst(event.tFirstMs);
            memory = { key, hotels: latest, at: Date.now() };
          } else if (event.type === "error") {
            setNote(event.message);
          }
        }
        setHotels(latest);
      }
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") setNote("La recherche n’a pas abouti. Réessayez.");
    } finally {
      if (searchAbort.current === controller) setSearching(false);
    }
  }

  async function ask(hotel: ClientHotel) {
    if (!hotel.offerId || asking) return;
    setAsking(hotel.hotelKey);
    try {
      const response = await fetch("/api/client/hotels/demandes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId: hotel.offerId }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      setAsked((current) => ({
        ...current,
        [hotel.hotelKey]: json?.message || json?.error || "La demande n’a pas pu être envoyée.",
      }));
    } finally {
      setAsking(null);
    }
  }

  return (
    <section ref={rootRef} className="space-y-4" data-hotel-search="1" data-t-client={clientFirst ?? ""} data-t-server={serverFirst ?? ""}>
      <form onSubmit={onSearch} className="rounded-[28px] border border-[var(--admin-gold)]/45 bg-white p-4 shadow-[0_18px_50px_rgba(11,25,44,0.06)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9e7e51]">Séjour</p>
        <h2 className="mt-1 font-display text-[1.65rem] font-bold leading-tight tracking-tight text-[var(--admin-navy)]">
          Où souhaitez-vous séjourner ?
        </h2>
        <p className="mt-1 text-sm text-[#5c5348]">Un seul prix, le plus avantageux, pour vos dates.</p>
        <div className="relative mt-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-[var(--admin-navy)]">Destination</span>
            <input
              value={destination}
              onChange={(event) => {
                setDestination(event.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
              className={inputClass}
              placeholder="Paris, Rome, un hôtel…"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={listOpen}
              aria-controls="hotel-suggest-list"
              required
            />
          </label>
          {listOpen ? (
            <ul id="hotel-suggest-list" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-2xl border border-[#e5e3dc] bg-[#faf9f6] py-1 shadow-xl" role="listbox">
              {suggestions.map((item) => (
                <li key={`${item.kind}-${item.label}-${item.detail}`}>
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left hover:bg-white"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setDestination(item.kind === "hotel" && item.detail ? `${item.label}, ${item.detail}` : item.label);
                      setSuggestOpen(false);
                    }}
                  >
                    <span className="font-medium text-[var(--admin-navy)]">{item.label}</span>
                    <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-[#9e7e51]">
                      {item.kind === "hotel" ? item.detail || "Hôtel" : "Ville"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-[var(--admin-navy)]">Arrivée</span>
            <DateFrInput value={checkIn} min={today} onChange={(iso) => {
              setCheckIn(iso);
              if (checkOut && iso && checkOut <= iso) setCheckOut("");
            }} className={inputClass} required />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-[var(--admin-navy)]">Départ</span>
            <DateFrInput value={checkOut} min={checkIn || today} onChange={setCheckOut} className={inputClass} required />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-[#e5e3dc] bg-[#faf9f6] px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--admin-navy)]">Voyageurs</span>
          <span className="flex items-center gap-3">
            <button
              type="button"
              className="account-press grid h-9 w-9 place-items-center rounded-full border border-[var(--admin-gold)] text-lg text-[var(--admin-navy)]"
              aria-label="Retirer un voyageur"
              onClick={() => setAdults((count) => Math.max(1, count - 1))}
            >
              −
            </button>
            <span className="w-4 text-center font-display text-lg font-bold text-[var(--admin-navy)]">{adults}</span>
            <button
              type="button"
              className="account-press grid h-9 w-9 place-items-center rounded-full border border-[var(--admin-gold)] text-lg text-[var(--admin-navy)]"
              aria-label="Ajouter un voyageur"
              onClick={() => setAdults((count) => Math.min(8, count + 1))}
            >
              +
            </button>
          </span>
        </div>
        <button
          type="submit"
          className="account-press mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--admin-navy)] text-sm font-semibold text-white"
        >
          <Icon name="search" className="h-4 w-4 text-[var(--admin-gold)]" />
          Rechercher
        </button>
        {searching ? <div className="mt-3 text-[var(--admin-navy)]"><BusyBar label="Tarifs en cours" /></div> : null}
        {note ? <p className="mt-3 text-sm text-[#8a5a2a]">{note}</p> : null}
      </form>

      <div className="space-y-3" aria-live="polite">
        {searching && hotels.length === 0
          ? [0, 1, 2].map((index) => (
              <div key={index} className="overflow-hidden rounded-[28px] border border-[#e5e3dc] bg-white" aria-hidden>
                <div className="h-56 animate-pulse bg-[#0B192C]/10" />
                <div className="space-y-2 p-4">
                  <div className="h-5 w-2/3 animate-pulse rounded bg-[#0B192C]/10" />
                  <div className="h-8 w-1/3 animate-pulse rounded bg-[#C5A880]/30" />
                </div>
              </div>
            ))
          : null}
        {hotels.map((hotel, index) => (
          <HotelCard
            key={hotel.hotelKey}
            hotel={hotel}
            first={index === 0}
            message={asked[hotel.hotelKey]}
            asking={asking === hotel.hotelKey}
            onAsk={() => void ask(hotel)}
            whatsapp={whatsapp}
          />
        ))}
        {searched && !searching && hotels.length === 0 ? (
          <article className="rounded-[28px] border border-[#e5e3dc] bg-white p-5">
            <h3 className="font-display text-xl font-bold text-[var(--admin-navy)]">Aucun hôtel pour ces dates</h3>
            <p className="mt-1 text-sm text-[#5c5348]">Écrivez à l’agence, nous cherchons autrement.</p>
            <a href={whatsapp} className="mt-4 inline-flex text-sm font-semibold text-[var(--admin-navy)]">
              WhatsApp
            </a>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function HotelCard({
  hotel,
  first,
  message,
  asking,
  onAsk,
  whatsapp,
}: {
  hotel: ClientHotel;
  first: boolean;
  message?: string;
  asking: boolean;
  onAsk: () => void;
  whatsapp: string;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = !photoFailed ? hotel.photo || hotel.thumb : null;
  const chips = PERK_LABEL.filter((perk) => hotel.perks[perk.key]);
  const nightsLabel = hotel.nights > 1 ? `${hotel.nights} nuits` : "1 nuit";
  return (
    <article className="hotel-rise overflow-hidden rounded-[28px] border border-[#e5e3dc] bg-white shadow-[0_16px_40px_rgba(11,25,44,0.06)]">
      <div className="relative h-56 bg-[#0B192C]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- photo fournisseur https, hors next/image
          <img
            src={photo}
            alt={hotel.name}
            width={800}
            height={500}
            sizes="(max-width: 480px) 100vw, 480px"
            loading={first ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={first ? "high" : "auto"}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <div className="grid h-full place-items-center text-[var(--admin-gold)]">
            <Icon name="hotel" className="h-10 w-10" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B192C]/80 via-[#0B192C]/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          {hotel.city ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">{hotel.city}</p>
          ) : null}
          <h3 className="font-display text-2xl font-bold leading-tight text-white">{hotel.name}</h3>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {hotel.room ? <p className="text-sm text-[#5c5348]">{hotel.room}</p> : null}
        {chips.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((perk) => (
              <li key={perk.key} className="rounded-full border border-[var(--admin-gold)]/70 bg-[#f8f3eb] px-2.5 py-1 text-[11px] font-semibold text-[var(--admin-navy)]">
                {perk.label}
              </li>
            ))}
          </ul>
        ) : null}
        <div>
          <p className="font-display text-[2rem] font-bold leading-none tracking-tight text-[var(--admin-navy)]">
            {euros(hotel.sellCents, hotel.currency)}
          </p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9e7e51]">
            {euros(hotel.perNightCents, hotel.currency)} / nuit · {nightsLabel}
          </p>
        </div>
        {message ? (
          <p className="text-sm text-[var(--admin-navy)]">
            {message}{" "}
            <a href={whatsapp} className="font-semibold underline decoration-[var(--admin-gold)]">
              WhatsApp
            </a>
          </p>
        ) : (
          <button
            type="button"
            disabled={!hotel.offerId || asking}
            onClick={onAsk}
            className="account-press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--admin-navy)] text-sm font-semibold text-white disabled:opacity-50"
          >
            {hotel.offerId ? "Demander cette réservation" : "Préparation du tarif"}
            <Icon name="arrow_forward" className="h-4 w-4 text-[var(--admin-gold)]" />
          </button>
        )}
        <p className="text-[11px] leading-relaxed text-[#5c5348]">Aucun paiement n’est lancé. L’agence valide la demande.</p>
      </div>
    </article>
  );
}
