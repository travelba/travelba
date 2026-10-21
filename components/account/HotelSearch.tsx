"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { parisTodayIso } from "@/lib/crm/dates";
import {
  nightsBetween,
  occupancyKey,
  stayPartyLabel,
  type ClientHotel,
  type HotelPerks,
  type HotelRoomOccupancy,
  type HotelSearchTarget,
  type PlaceSuggestion,
} from "@/lib/crm/hotel-search";
import { formatDateRangeShort, formatMoney } from "@/lib/crm/money";
import { siteConfig } from "@/lib/site";

type SearchEvent =
  | { type: "start" }
  | { type: "hotel"; hotel: ClientHotel; replaced?: boolean }
  | { type: "link"; hotelKey: string; offerId: string }
  | { type: "done"; tFirstMs: number | null; tDoneMs: number; cached: boolean; count: number }
  | { type: "error"; message: string };

type DraftRoom = { adults: number; children: (number | null)[] };
type Panel = "where" | "when" | "who";

const PERK_LABEL: { key: keyof HotelPerks; label: string }[] = [
  { key: "breakfast", label: "Petit-déjeuner" },
  { key: "freeCancellation", label: "Annulation gratuite" },
  { key: "upgrade", label: "Surclassement" },
  { key: "credit", label: "Crédit hôtel" },
  { key: "earlyCheckIn", label: "Arrivée anticipée" },
  { key: "lateCheckOut", label: "Départ tardif" },
];

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

let memory: { key: string; hotels: ClientHotel[]; at: number } | null = null;
const suggestMemory = new Map<string, PlaceSuggestion[]>();

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

function completeRooms(rooms: DraftRoom[]): HotelRoomOccupancy[] | null {
  const ready: HotelRoomOccupancy[] = [];
  for (const room of rooms) {
    if (room.children.some((age) => age == null)) return null;
    ready.push({ adults: room.adults, children: room.children.map((age) => ({ age: age as number })) });
  }
  return ready;
}

function monthCells(year: number, monthIndex: number) {
  const firstDow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const pad = (firstDow + 6) % 7;
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < pad; i += 1) cells.push(null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(`${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

function monthTitle(year: number, monthIndex: number) {
  const label = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toLocaleUpperCase("fr") + label.slice(1);
}

export function HotelSearch() {
  const today = useMemo(() => parisTodayIso(), []);
  const [destination, setDestination] = useState("");
  const [city, setCity] = useState("");
  const [target, setTarget] = useState<HotelSearchTarget | null>(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [rooms, setRooms] = useState<DraftRoom[]>([{ adults: 2, children: [] }]);
  const [remoteSuggest, setRemoteSuggest] = useState<{ key: string; items: PlaceSuggestion[] } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [panel, setPanel] = useState<Panel>("where");
  const [cursor, setCursor] = useState(() => {
    const [year, month] = parisTodayIso().split("-").map(Number);
    return { year, month: month - 1 };
  });
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
      .slice(0, 12);
  }, [folded, remoteSuggest]);
  const destinations = suggestions.filter((item) => item.kind === "ville").slice(0, 6);
  const hotelNames = suggestions.filter((item) => item.kind === "hotel").slice(0, 6);
  const readyRooms = completeRooms(rooms);
  const party = stayPartyLabel(readyRooms || rooms.map((room) => ({ adults: room.adults, children: [] })));

  useEffect(() => {
    const query = destination.trim();
    if (!sheet || query.length < 2) return;
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
  }, [destination, sheet]);

  useEffect(() => {
    if (!sheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheet(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheet]);

  function openSheet(next: Panel) {
    setNote("");
    setPanel(next);
    setSheet(true);
  }

  function pickPlace(item: PlaceSuggestion) {
    setDestination(item.label);
    setCity(item.kind === "hotel" ? item.detail : "");
    setTarget(item.id ? { kind: item.kind, id: item.id } : null);
    setPanel("when");
  }

  function pickDay(iso: string) {
    if (iso < today) return;
    setNote("");
    if (!checkIn || checkOut) {
      setCheckIn(iso);
      setCheckOut("");
      return;
    }
    if (iso <= checkIn) {
      setCheckIn(iso);
      setCheckOut("");
      return;
    }
    if (nightsBetween(checkIn, iso) > 30) {
      setNote("La recherche couvre trente nuits au plus.");
      return;
    }
    setCheckOut(iso);
    setPanel("who");
  }

  function shiftMonth(delta: number) {
    setCursor((current) => {
      const date = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    });
  }

  function updateRoom(index: number, next: DraftRoom) {
    setRooms((current) => current.map((room, at) => (at === index ? next : room)));
  }

  async function onSearch() {
    const stayRooms = completeRooms(rooms);
    if (destination.trim().length < 2) {
      setNote("Indiquez une destination ou un hôtel.");
      setPanel("where");
      return;
    }
    if (!checkIn || !checkOut) {
      setNote("Indiquez les dates du séjour.");
      setPanel("when");
      return;
    }
    if (!stayRooms) {
      setNote("Indiquez l’âge de chaque enfant.");
      setPanel("who");
      return;
    }
    setNote("");
    setSheet(false);
    setSearched(true);
    const key = `${destination.trim().toLocaleLowerCase("fr")}|${checkIn}|${checkOut}|${occupancyKey(stayRooms)}|${target ? `${target.kind}${target.id}` : ""}`;
    const fresh = memory && memory.key === key && Date.now() - memory.at < 10 * 60 * 1000 ? memory.hotels : null;
    const started = performance.now();
    setClientFirst(null);
    setServerFirst(null);
    setHotels(fresh?.length ? fresh : []);
    if (fresh?.length) setClientFirst(Math.round(performance.now() - started));
    setSearching(true);
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    try {
      const response = await fetch("/api/client/hotels/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination, city, checkIn, checkOut, rooms: stayRooms, target }),
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

  const whatsapp = `https://wa.me/${siteConfig.whatsappNumber}`;
  const summaryDates = checkIn && checkOut ? formatDateRangeShort(checkIn, checkOut) : "Dates";

  return (
    <section className="space-y-4" data-hotel-search="1" data-t-client={clientFirst ?? ""} data-t-server={serverFirst ?? ""}>
      {searched ? (
        <button
          type="button"
          data-hotel-summary="1"
          onClick={() => openSheet("where")}
          className="sticky top-16 z-30 w-full rounded-2xl border border-[var(--admin-gold)]/50 bg-[#faf9f6]/95 px-4 py-3 text-left shadow-[0_10px_30px_rgba(11,25,44,0.06)] backdrop-blur-md"
        >
          <span className="block font-display text-lg font-bold leading-tight text-[var(--admin-navy)]">{destination}</span>
          <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9e7e51]">
            {summaryDates} · {party}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => openSheet("where")}
          className="w-full rounded-[28px] border border-[var(--admin-gold)]/45 bg-white p-5 text-left shadow-[0_18px_50px_rgba(11,25,44,0.06)]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9e7e51]">Séjour</p>
          <p className="mt-1 font-display text-[1.85rem] font-bold leading-tight tracking-tight text-[var(--admin-navy)]">
            Où allez-vous ?
          </p>
          <p className="mt-2 text-sm text-[#5c5348]">Une destination ou un hôtel, les dates, les chambres.</p>
        </button>
      )}

      {note && !sheet ? <p className="text-sm text-[#8a5a2a]">{note}</p> : null}
      {searching ? (
        <div className="text-[var(--admin-navy)]">
          <BusyBar label="Tarifs en cours" />
        </div>
      ) : null}

      <div className="space-y-4" aria-live="polite">
        {searching && hotels.length === 0
          ? [0, 1, 2].map((index) => (
              <div key={index} className="overflow-hidden rounded-[28px] border border-[#e5e3dc] bg-white" aria-hidden>
                <div className="h-72 animate-pulse bg-[#0B192C]/10" />
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

      {sheet ? (
        <div className="hotel-sheet fixed inset-0 z-[60] flex flex-col bg-[#faf9f6]" data-hotel-sheet="1" role="dialog" aria-modal="true" aria-label="Recherche de séjour">
          <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <p className="font-display text-2xl font-bold text-[var(--admin-navy)]">Votre séjour</p>
            <button type="button" aria-label="Fermer" onClick={() => setSheet(false)} className="grid h-11 w-11 place-items-center rounded-full text-[var(--admin-navy)]">
              <Icon name="close" className="h-5 w-5" />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-8">
            <label className="block rounded-[24px] border border-[#e5e3dc] bg-white px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Destination ou hôtel</span>
              <input
                value={destination}
                onChange={(event) => {
                  setDestination(event.target.value);
                  setTarget(null);
                  setCity("");
                  setPanel("where");
                }}
                onFocus={() => setPanel("where")}
                className="mt-1 w-full bg-transparent font-display text-2xl font-bold text-[var(--admin-navy)] outline-none placeholder:text-[#c4b8a8]"
                placeholder="Paris, Rome, un hôtel…"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={panel === "where" && (destinations.length > 0 || hotelNames.length > 0)}
                aria-controls="hotel-suggest-list"
              />
            </label>
            {panel === "where" && (destinations.length > 0 || hotelNames.length > 0) ? (
              <div id="hotel-suggest-list" role="listbox" className="rounded-[24px] border border-[#e5e3dc] bg-white py-2">
                <SuggestGroup title="Destinations" items={destinations} onPick={pickPlace} />
                <SuggestGroup title="Hôtels" items={hotelNames} onPick={pickPlace} />
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setPanel("when")}
              className="w-full rounded-[24px] border border-[#e5e3dc] bg-white px-4 py-3 text-left"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Dates</span>
              <span className="mt-1 block font-display text-xl font-bold text-[var(--admin-navy)]">{summaryDates}</span>
            </button>
            {panel === "when" ? (
              <div className="rounded-[24px] border border-[#e5e3dc] bg-white p-4">
                <div className="flex items-center justify-between">
                  <button type="button" aria-label="Mois précédent" onClick={() => shiftMonth(-1)} className="grid h-10 w-10 place-items-center rounded-full text-[var(--admin-navy)]">
                    <Icon name="chevron_left" className="h-5 w-5" />
                  </button>
                  <p className="font-display text-lg font-bold text-[var(--admin-navy)]">{monthTitle(cursor.year, cursor.month)}</p>
                  <button type="button" aria-label="Mois suivant" onClick={() => shiftMonth(1)} className="grid h-10 w-10 place-items-center rounded-full text-[var(--admin-navy)]">
                    <Icon name="chevron_right" className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
                  {WEEKDAYS.map((day, index) => (
                    <span key={`${day}-${index}`}>{day}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7">
                  {monthCells(cursor.year, cursor.month).map((iso, index) => {
                    if (!iso) return <span key={`empty-${index}`} />;
                    const endpoint = iso === checkIn || iso === checkOut;
                    const inside = Boolean(checkIn && checkOut && iso > checkIn && iso < checkOut);
                    const past = iso < today;
                    return (
                      <button
                        key={iso}
                        type="button"
                        data-date={iso}
                        disabled={past}
                        onClick={() => pickDay(iso)}
                        className={`grid h-11 place-items-center text-sm ${
                          endpoint
                            ? "rounded-full bg-[#0B192C] font-semibold text-white"
                            : inside
                              ? "bg-[#f3eadc] text-[#0B192C]"
                              : past
                                ? "text-[#d5cbbd]"
                                : "text-[#0B192C]"
                        }`}
                      >
                        {Number(iso.slice(-2))}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setPanel("who")}
              className="w-full rounded-[24px] border border-[#e5e3dc] bg-white px-4 py-3 text-left"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Chambres et voyageurs</span>
              <span className="mt-1 block font-display text-xl font-bold text-[var(--admin-navy)]">{party}</span>
            </button>
            {panel === "who" ? (
              <div className="space-y-3 rounded-[24px] border border-[#e5e3dc] bg-white p-4">
                <Stepper
                  label="Chambres"
                  value={rooms.length}
                  min={1}
                  max={4}
                  onChange={(count) =>
                    setRooms((current) => {
                      if (count > current.length) return [...current, { adults: 1, children: [] }];
                      return current.slice(0, count);
                    })
                  }
                />
                {rooms.map((room, index) => (
                  <div key={index} className="space-y-3 border-t border-[#e5e3dc] pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Chambre {index + 1}</p>
                    <Stepper
                      label="Adultes"
                      value={room.adults}
                      min={1}
                      max={6}
                      onChange={(adults) => updateRoom(index, { ...room, adults })}
                    />
                    <Stepper
                      label="Enfants"
                      value={room.children.length}
                      min={0}
                      max={4}
                      onChange={(count) =>
                        updateRoom(index, {
                          ...room,
                          children:
                            count > room.children.length
                              ? [...room.children, null]
                              : room.children.slice(0, count),
                        })
                      }
                    />
                    {room.children.map((age, childIndex) => (
                      <label key={childIndex} className="flex items-center justify-between gap-3 text-sm text-[var(--admin-navy)]">
                        <span>Âge, enfant {childIndex + 1}</span>
                        <select
                          value={age ?? ""}
                          aria-label={`Âge, enfant ${childIndex + 1}, chambre ${index + 1}`}
                          onChange={(event) => {
                            const next = room.children.slice();
                            next[childIndex] = Number(event.target.value);
                            updateRoom(index, { ...room, children: next });
                          }}
                          className="rounded-full border border-[var(--admin-gold)]/70 bg-[#faf9f6] px-3 py-2 text-sm text-[var(--admin-navy)]"
                        >
                          <option value="">Âge</option>
                          {Array.from({ length: 18 }, (_, value) => (
                            <option key={value} value={value}>
                              {value === 0 ? "Moins d’un an" : `${value} ans`}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            {note ? <p className="text-sm text-[#8a5a2a]">{note}</p> : null}
          </div>
          <footer className="border-t border-[#e5e3dc] bg-[#faf9f6] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => void onSearch()}
              className="account-press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0B192C] text-sm font-semibold text-white"
            >
              <Icon name="search" className="h-4 w-4 text-[var(--admin-gold)]" />
              Voir les hôtels
            </button>
          </footer>
        </div>
      ) : null}
    </section>
  );
}

function SuggestGroup({
  title,
  items,
  onPick,
}: {
  title: string;
  items: PlaceSuggestion[];
  onPick: (item: PlaceSuggestion) => void;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9e7e51]">{title}</p>
      {items.map((item) => (
        <button
          key={`${item.kind}-${item.id ?? ""}-${item.label}-${item.detail}`}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(item)}
          className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-[#faf9f6]"
        >
          <span className="font-medium text-[var(--admin-navy)]">{item.label}</span>
          {item.detail ? <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-[#9e7e51]">{item.detail}</span> : null}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-[var(--admin-navy)]">{label}</span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Retirer ${label.toLocaleLowerCase("fr")}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="grid h-9 w-9 place-items-center rounded-full border border-[var(--admin-gold)] text-lg text-[var(--admin-navy)] disabled:opacity-30"
        >
          −
        </button>
        <span className="w-4 text-center font-display text-lg font-bold text-[var(--admin-navy)]">{value}</span>
        <button
          type="button"
          aria-label={`Ajouter ${label.toLocaleLowerCase("fr")}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="grid h-9 w-9 place-items-center rounded-full border border-[var(--admin-gold)] text-lg text-[var(--admin-navy)] disabled:opacity-30"
        >
          +
        </button>
      </span>
    </div>
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
      <div className="relative h-72 bg-[#0B192C]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- photo fournisseur https, hors next/image
          <img
            src={photo}
            alt={hotel.name}
            width={800}
            height={560}
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
          <h3 className="font-display text-[1.75rem] font-bold leading-tight text-white">{hotel.name}</h3>
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
            className="account-press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0B192C] text-sm font-semibold text-white disabled:opacity-50"
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
