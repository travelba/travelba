"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HotelJourney } from "@/components/account/HotelJourney";
import { HotelMap } from "@/components/account/HotelMap";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { parisTodayIso } from "@/lib/crm/dates";
import { HOTEL_THEMES, presentHotels, type HotelSort, type HotelThemeId } from "@/lib/crm/hotel-journey";
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

type RecentStay = {
  destination: string;
  city: string;
  checkIn: string;
  checkOut: string;
  rooms: DraftRoom[];
  target: HotelSearchTarget | null;
  party: string;
};

function readRecent(): RecentStay[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem("hotel-recent") || "[]") as RecentStay[];
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    return [];
  }
}

export function HotelSearch({ initialTheme }: { initialTheme?: HotelThemeId } = {}) {
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
  const [serverFirst, setServerFirst] = useState<number | null>(null);
  const [clientFirst, setClientFirst] = useState<number | null>(null);
  const [theme, setTheme] = useState<HotelThemeId>(initialTheme || "d");
  const [sort, setSort] = useState<HotelSort>("prix");
  const [needs, setNeeds] = useState<(keyof HotelPerks)[]>([]);
  const [layout, setLayout] = useState<"liste" | "carte">("liste");
  const [opened, setOpened] = useState<ClientHotel | null>(null);
  const [recent, setRecent] = useState<RecentStay[]>([]);
  const [committed, setCommitted] = useState<{ rooms: HotelRoomOccupancy[] } | null>(null);
  const suggestAbort = useRef<AbortController | null>(null);
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.dataset.hotelTheme = theme;
    return () => {
      delete document.documentElement.dataset.hotelTheme;
    };
  }, [theme]);

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
    setRecent(readRecent());
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
    setOpened(null);
    setCommitted({ rooms: stayRooms });
    try {
      const entry: RecentStay = {
        destination: destination.trim(),
        city,
        checkIn,
        checkOut,
        rooms,
        target,
        party: stayPartyLabel(stayRooms),
      };
      const nextRecent = [entry, ...readRecent().filter((row) => row.destination !== entry.destination || row.checkIn !== entry.checkIn)].slice(0, 4);
      sessionStorage.setItem("hotel-recent", JSON.stringify(nextRecent));
      setRecent(nextRecent);
    } catch {
      /* la session du navigateur peut refuser l’écriture */
    }
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

  const whatsapp = `https://wa.me/${siteConfig.whatsappNumber}`;
  const summaryDates = checkIn && checkOut ? formatDateRangeShort(checkIn, checkOut) : "Dates";

  const shown = presentHotels(hotels, sort, needs);
  const canMap = hotels.some((hotel) => hotel.coords);

  return (
    <section className="hotel-theme space-y-4" data-hotel-theme={theme} data-hotel-search="1" data-t-client={clientFirst ?? ""} data-t-server={serverFirst ?? ""}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" data-hotel-themes="1">
        {HOTEL_THEMES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={theme === item.id}
            onClick={() => setTheme(item.id)}
            className={theme === item.id ? "h-on pb-1" : "h-muted pb-1"}
          >
            {item.label}
          </button>
        ))}
      </div>
      {opened && committed ? (
        <HotelJourney
          hotel={opened}
          stayRooms={committed.rooms}
          datesLabel={summaryDates}
          party={party}
          query={{ destination, city, checkIn, checkOut, rooms: committed.rooms }}
          onBack={() => setOpened(null)}
        />
      ) : null}
      {opened ? null : <>
      {searched ? (
        <button
          type="button"
          data-hotel-summary="1"
          onClick={() => openSheet("where")}
          className="h-field h-summary sticky top-16 z-30 w-full px-4 py-3 text-left"
        >
          <span className="block text-base font-semibold h-ink">{destination}</span>
          <span className="mt-0.5 block text-xs h-muted">{summaryDates} · {party}</span>
        </button>
      ) : (
        <button type="button" onClick={() => openSheet("where")} className="h-field flex w-full items-center gap-3 px-4 py-4 text-left">
          <Icon name="search" className="h-4 w-4 h-gold" />
          <span>
            <span className="block text-base font-medium h-ink">Où allez-vous ?</span>
            <span className="block text-xs h-muted">Destination ou hôtel</span>
          </span>
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
              <div key={index} className="h-card h-line overflow-hidden border" aria-hidden>
                <div className="h-56 animate-pulse h-skel" />
                <div className="space-y-2 p-4">
                  <div className="h-5 w-2/3 animate-pulse h-skel" />
                  <div className="h-4 w-1/3 animate-pulse h-skel" />
                </div>
              </div>
            ))
          : null}
        {searched && hotels.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex gap-3">
                <button type="button" className={layout === "liste" ? "h-on" : "h-muted"} onClick={() => setLayout("liste")}>Liste</button>
                {canMap ? (
                  <button type="button" className={layout === "carte" ? "h-on" : "h-muted"} onClick={() => setLayout("carte")}>Carte</button>
                ) : null}
              </div>
              <p className="h-muted">{shown.length} {shown.length > 1 ? "hôtels" : "hôtel"}</p>
            </div>
            <div className="flex gap-4 text-sm">
              <button type="button" className={sort === "prix" ? "h-on" : "h-muted"} onClick={() => setSort("prix")}>Prix</button>
              <button type="button" className={sort === "avantages" ? "h-on" : "h-muted"} onClick={() => setSort("avantages")}>Avantages</button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {PERK_LABEL.slice(0, 4).map((perk) => {
                const on = needs.includes(perk.key);
                return (
                  <button
                    key={perk.key}
                    type="button"
                    aria-pressed={on}
                    className={on ? "h-on" : "h-muted"}
                    onClick={() => setNeeds((current) => (on ? current.filter((key) => key !== perk.key) : [...current, perk.key]))}
                  >
                    {perk.label}
                  </button>
                );
              })}
            </div>
            {layout === "carte" && canMap ? <HotelMap hotels={shown} onOpen={setOpened} /> : null}
          </div>
        ) : null}
        {layout === "liste" || !canMap
          ? shown.map((hotel, index) => (
              <HotelCard key={hotel.hotelKey} hotel={hotel} first={index === 0} onOpen={() => setOpened(hotel)} />
            ))
          : null}
        {searched && !searching && hotels.length === 0 ? (
          <article className="h-card h-line border p-4">
            <h3 className="text-lg font-semibold h-ink">Aucun hôtel pour ces dates</h3>
            <p className="mt-1 text-sm h-muted">Écrivez à l’agence, nous cherchons autrement.</p>
            <a href={whatsapp} className="mt-4 inline-flex text-sm font-semibold h-ink">
              WhatsApp
            </a>
          </article>
        ) : null}
        {searched && !searching && hotels.length > 0 && shown.length === 0 ? (
          <p className="text-sm h-muted">Aucun hôtel avec ces avantages.</p>
        ) : null}
      </div>
      </>}

      {sheet ? (
        <div className="hotel-sheet h-search fixed inset-0 z-[60] flex flex-col" data-hotel-sheet="1" role="dialog" aria-modal="true" aria-label="Recherche de séjour">
          <header className="h-header flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <p className="text-base font-semibold">Où allez-vous ?</p>
            <button type="button" aria-label="Fermer" onClick={() => setSheet(false)} className="grid h-10 w-10 place-items-center">
              <Icon name="close" className="h-5 w-5" />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-8">
            <label className="h-field flex items-center gap-3 px-4 py-3">
              <Icon name="search" className="h-4 w-4 h-gold" />
              <input
                value={destination}
                onChange={(event) => {
                  setDestination(event.target.value);
                  setTarget(null);
                  setCity("");
                  setPanel("where");
                }}
                onFocus={() => setPanel("where")}
                className="w-full bg-transparent text-base h-ink outline-none"
                placeholder="Destination ou hôtel"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={panel === "where" && (destinations.length > 0 || hotelNames.length > 0)}
                aria-controls="hotel-suggest-list"
              />
            </label>
            {panel === "where" && (destinations.length > 0 || hotelNames.length > 0) ? (
              <div id="hotel-suggest-list" role="listbox" className="h-card h-line border py-1">
                <SuggestGroup title="Destinations" items={destinations} onPick={pickPlace} />
                <SuggestGroup title="Hôtels" items={hotelNames} onPick={pickPlace} />
              </div>
            ) : null}
            {panel === "where" && folded.length < 2 && recent.length ? (
              <div>
                <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-[0.14em] h-gold">Recherches récentes</p>
                {recent.map((item) => (
                  <button
                    key={`${item.destination}-${item.checkIn}`}
                    type="button"
                    onClick={() => {
                      setDestination(item.destination);
                      setCity(item.city);
                      setCheckIn(item.checkIn);
                      setCheckOut(item.checkOut);
                      setRooms(item.rooms);
                      setTarget(item.target);
                      setPanel("when");
                    }}
                    className="flex w-full items-start gap-3 py-3 text-left"
                  >
                    <Icon name="hotel" className="mt-0.5 h-4 w-4 h-gold" />
                    <span>
                      <span className="block text-sm font-medium h-ink">{item.destination}</span>
                      <span className="block text-xs h-muted">
                        {formatDateRangeShort(item.checkIn, item.checkOut)} · {item.party}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setPanel("when")}
              className="h-field w-full px-4 py-3 text-left"
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] h-gold">Dates</span>
              <span className="mt-1 block text-base font-medium h-ink">{summaryDates}</span>
            </button>
            {panel === "when" ? (
              <div className="h-card h-line border p-4">
                <div className="flex items-center justify-between">
                  <button type="button" aria-label="Mois précédent" onClick={() => shiftMonth(-1)} className="grid h-10 w-10 place-items-center h-ink">
                    <Icon name="chevron_left" className="h-5 w-5" />
                  </button>
                  <p className="text-base font-semibold h-ink">{monthTitle(cursor.year, cursor.month)}</p>
                  <button type="button" aria-label="Mois suivant" onClick={() => shiftMonth(1)} className="grid h-10 w-10 place-items-center h-ink">
                    <Icon name="chevron_right" className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.14em] h-gold">
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
                          endpoint ? "h-day-on" : inside ? "h-range" : past ? "h-faint" : "h-ink"
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
              className="h-field w-full px-4 py-3 text-left"
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] h-gold">Chambres et voyageurs</span>
              <span className="mt-1 block text-base font-medium h-ink">{party}</span>
            </button>
            {panel === "who" ? (
              <div className="h-card h-line space-y-3 border p-4">
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
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] h-gold">Chambre {index + 1}</p>
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
                      <label key={childIndex} className="flex items-center justify-between gap-3 text-sm h-ink">
                        <span>Âge, enfant {childIndex + 1}</span>
                        <select
                          value={age ?? ""}
                          aria-label={`Âge, enfant ${childIndex + 1}, chambre ${index + 1}`}
                          onChange={(event) => {
                            const next = room.children.slice();
                            next[childIndex] = Number(event.target.value);
                            updateRoom(index, { ...room, children: next });
                          }}
                          className="h-field px-3 py-2 text-sm h-ink"
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
          <footer className="border-t h-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => void onSearch()} className="h-btn flex h-12 w-full items-center justify-center text-sm font-semibold">
              Rechercher
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
      <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] h-gold">{title}</p>
      {items.map((item) => (
        <button
          key={`${item.kind}-${item.id ?? ""}-${item.label}-${item.detail}`}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(item)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <Icon name={item.kind === "hotel" ? "bed" : "pin"} className="h-4 w-4 h-gold" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium h-ink">{item.label}</span>
            {item.detail ? <span className="block text-xs h-muted">{item.detail}</span> : null}
          </span>
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
      <span className="text-sm font-medium h-ink">{label}</span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Retirer ${label.toLocaleLowerCase("fr")}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-btn-line grid h-9 w-9 place-items-center text-lg disabled:opacity-30"
        >
          −
        </button>
        <span className="w-4 text-center text-lg font-semibold h-ink">{value}</span>
        <button
          type="button"
          aria-label={`Ajouter ${label.toLocaleLowerCase("fr")}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-btn-line grid h-9 w-9 place-items-center text-lg disabled:opacity-30"
        >
          +
        </button>
      </span>
    </div>
  );
}

function HotelCard({ hotel, first, onOpen }: { hotel: ClientHotel; first: boolean; onOpen: () => void }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = !photoFailed ? hotel.photo || hotel.thumb || hotel.images?.[0] : null;
  const lines = hotel.benefits.length ? hotel.benefits : PERK_LABEL.filter((perk) => hotel.perks[perk.key]).map((perk) => perk.label);
  return (
    <article className="hotel-rise h-card h-line overflow-hidden border">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="h-56 bg-[var(--h-header)]">
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
            <div className="grid h-full place-items-center h-gold">
              <Icon name="hotel" className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="space-y-3 p-4">
          <div>
            <h3 className="h-display text-lg font-semibold h-ink">{hotel.name}</h3>
            {hotel.city ? <p className="text-sm h-muted">{hotel.city}</p> : null}
          </div>
          {lines.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] h-gold">Avantages</p>
              <ul className="space-y-1.5">
                {lines.slice(0, 4).map((line) => (
                  <li key={line} className="flex gap-2 text-sm h-ink">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 h-gold" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex items-end justify-between gap-3 border-t h-line pt-3">
            <div>
              <p className="text-xl font-semibold h-ink">{euros(hotel.sellCents, hotel.currency)}</p>
              <p className="text-[11px] uppercase tracking-[0.12em] h-muted">{euros(hotel.perNightCents, hotel.currency)} / nuit</p>
            </div>
            <span className="text-sm font-semibold h-ink">Voir l’hôtel</span>
          </div>
        </div>
      </button>
    </article>
  );
}
