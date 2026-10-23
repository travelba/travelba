"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HotelJourney } from "@/components/account/HotelJourney";
import { HotelMap } from "@/components/account/HotelMap";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { parisTodayIso } from "@/lib/crm/dates";
import { hotelJourneySearch, hotelJourneyStep, presentHotels, type HotelJourneyStep, type HotelSort } from "@/lib/crm/hotel-journey";
import {
  hotelSearchDraft,
  nightsBetween,
  occupancyKey,
  parseHotelSearchDraft,
  shiftStayForward,
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
const LAST_SEARCH_KEY = "hotel-search-last";

const PERK_LABEL: { key: keyof HotelPerks; label: string }[] = [
  { key: "breakfast", label: "Petit-déjeuner" },
  { key: "freeCancellation", label: "Annulation gratuite" },
  { key: "upgrade", label: "Surclassement" },
  { key: "credit", label: "Crédit hôtel" },
  { key: "earlyCheckIn", label: "Arrivée anticipée" },
  { key: "lateCheckOut", label: "Départ tardif" },
];

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const RECENT_KEY = "hotel-recent-list";
const PERK_GROUPS: { title: string; keys: (keyof HotelPerks)[] }[] = [
  { title: "Avantages", keys: ["breakfast", "freeCancellation", "upgrade", "credit"] },
  { title: "Arrivée anticipée et départ tardif", keys: ["earlyCheckIn", "lateCheckOut"] },
];

let memory: { key: string; hotels: ClientHotel[]; at: number } | null = null;

function cachedHotels(key: string) {
  if (!memory || memory.key !== key || Date.now() - memory.at >= 10 * 60 * 1000) return null;
  return memory.hotels;
}

function rememberHotels(key: string, hotels: ClientHotel[]) {
  memory = { key, hotels, at: Date.now() };
}

function markStart() {
  return performance.now();
}

function since(started: number) {
  return Math.round(performance.now() - started);
}
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

function recentKey(row: RecentStay) {
  const shifted = shiftStayForward(parisTodayIso(), row.checkIn, row.checkOut);
  return `${row.destination.trim().toLocaleLowerCase("fr")}|${row.target?.kind || ""}|${row.target?.id || ""}|${shifted.checkIn}|${shifted.checkOut}|${row.party}`;
}

const EMPTY_RECENT = "[]";
let recentSnapshot = EMPTY_RECENT;
let recentFresh = false;
const recentListeners = new Set<() => void>();

function parseRecent(raw: string): RecentStay[] {
  try {
    const parsed = JSON.parse(raw) as RecentStay[];
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: RecentStay[] = [];
    for (const row of parsed) {
      if (!row || typeof row.destination !== "string") continue;
      const key = recentKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
      if (out.length === 5) break;
    }
    return out;
  } catch {
    return [];
  }
}

function readRecentSnapshot() {
  if (recentFresh) return recentSnapshot;
  try {
    recentSnapshot = localStorage.getItem(RECENT_KEY) || sessionStorage.getItem("hotel-recent") || EMPTY_RECENT;
  } catch {
    recentSnapshot = EMPTY_RECENT;
  }
  recentFresh = true;
  return recentSnapshot;
}

function emptyRecentSnapshot() {
  return EMPTY_RECENT;
}

function subscribeRecent(onChange: () => void) {
  const notify = () => {
    recentFresh = false;
    onChange();
  };
  recentListeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    recentListeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

function writeRecent(entry: RecentStay) {
  const next = [entry, ...parseRecent(readRecentSnapshot()).filter((row) => recentKey(row) !== recentKey(entry))].slice(0, 5);
  const raw = JSON.stringify(next);
  localStorage.setItem(RECENT_KEY, raw);
  sessionStorage.setItem("hotel-recent", raw);
  recentSnapshot = raw;
  recentFresh = true;
  recentListeners.forEach((listener) => listener());
  return next;
}

function monthCursor(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return { year, month: month - 1 };
}

function emptyHotelDraftSnapshot() {
  return "";
}

function readHotelDraftSnapshot() {
  try {
    return localStorage.getItem(LAST_SEARCH_KEY) || sessionStorage.getItem(LAST_SEARCH_KEY) || sessionStorage.getItem("hotel-recent") || "";
  } catch {
    return "";
  }
}

function subscribeHotelDraft(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function seedFromSnapshot(today: string, raw: string) {
  if (!raw) return hotelSearchDraft(today, null);
  try {
    const value = JSON.parse(raw) as unknown;
    const parsed = Array.isArray(value) ? parseHotelSearchDraft(value[0]) : parseHotelSearchDraft(value);
    return hotelSearchDraft(today, parsed);
  } catch {
    return hotelSearchDraft(today, null);
  }
}

export function HotelSearch() {
  const today = useMemo(() => parisTodayIso(), []);
  const storedDraft = useSyncExternalStore(subscribeHotelDraft, readHotelDraftSnapshot, emptyHotelDraftSnapshot);
  const seed = useMemo(() => seedFromSnapshot(today, storedDraft), [today, storedDraft]);
  const [destinationText, setDestination] = useState<string | null>(null);
  const [cityText, setCity] = useState<string | null>(null);
  const [targetChoice, setTarget] = useState<HotelSearchTarget | null | undefined>(undefined);
  const [checkInText, setCheckIn] = useState<string | null>(null);
  const [checkOutText, setCheckOut] = useState<string | null>(null);
  const [roomDraft, setRooms] = useState<DraftRoom[] | null>(null);
  const destination = destinationText ?? seed.destination;
  const city = cityText ?? seed.city;
  const target = targetChoice === undefined ? seed.target : targetChoice;
  const checkIn = checkInText ?? seed.checkIn;
  const checkOut = checkOutText ?? seed.checkOut;
  const rooms = roomDraft ?? seed.rooms.map((room) => ({ adults: room.adults, children: room.children.slice() }));
  const [remoteSuggest, setRemoteSuggest] = useState<{ key: string; items: PlaceSuggestion[] } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [cursorPick, setCursor] = useState<{ year: number; month: number } | null>(null);
  const cursor = cursorPick ?? monthCursor(checkIn);
  const [hotels, setHotels] = useState<ClientHotel[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [note, setNote] = useState("");
  const [serverFirst, setServerFirst] = useState<number | null>(null);
  const [clientFirst, setClientFirst] = useState<number | null>(null);
  const [needs, setNeeds] = useState<(keyof HotelPerks)[]>([]);
  const [sort, setSort] = useState<HotelSort>("prix");
  const [tool, setTool] = useState<"" | "filtre" | "tri">("");
  const [layout, setLayout] = useState<"liste" | "carte">("liste");
  const router = useRouter();
  const params = useSearchParams();
  const hotelToken = params.get("hotel");
  const journeyStep = hotelJourneyStep(params.get("etape"));
  const [catalog, setCatalog] = useState<Record<string, ClientHotel>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [trackedToken, setTrackedToken] = useState<string | null>(hotelToken);
  const recentRaw = useSyncExternalStore(subscribeRecent, readRecentSnapshot, emptyRecentSnapshot);
  const recent = useMemo(() => parseRecent(recentRaw), [recentRaw]);
  const [committed, setCommitted] = useState<{ rooms: HotelRoomOccupancy[] } | null>(null);

  function tokenOf(hotel: ClientHotel) {
    return String(hotel.hotelId || hotel.hotelKey);
  }

  if (hotelToken !== trackedToken) {
    setTrackedToken(hotelToken);
    if (!hotelToken || hotelToken === pending) setPending(null);
  }
  const openedLive = (hotelToken ? catalog[hotelToken] : null) || (!hotelToken && pending ? catalog[pending] : null) || null;

  function openHotel(hotel: ClientHotel) {
    const token = tokenOf(hotel);
    setCatalog((current) => (current[token] === hotel ? current : { ...current, [token]: hotel }));
    setPending(token);
    router.push(`/mon-compte/hotels?${hotelJourneySearch(token, "hotel")}`);
  }

  function onJourneyStep(next: HotelJourneyStep | "back") {
    if (next === "back") {
      router.back();
      return;
    }
    if (!openedLive) return;
    const href = `/mon-compte/hotels?${hotelJourneySearch(tokenOf(openedLive), next)}`;
    if (`/mon-compte/hotels?${params.toString()}` === href) return;
    router.push(href);
  }

  const suggestAbort = useRef<AbortController | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const destinationRef = useRef<HTMLInputElement>(null);
  const focusReady = useRef(false);

  useEffect(() => {
    if (focusReady.current) return;
    focusReady.current = true;
    if (destinationRef.current?.value) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    destinationRef.current?.focus({ preventScroll: true });
  }, []);

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
    if (panel !== "where" || query.length < 2) return;
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
  }, [destination, panel]);

  useEffect(() => {
    if (sheet || searched || openedLive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sheet, searched, openedLive]);

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
    const date = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
  }

  function updateRoom(index: number, next: DraftRoom) {
    setRooms(rooms.map((room, at) => (at === index ? next : room)));
  }

  function resizeRooms(count: number) {
    setRooms(count > rooms.length ? [...rooms, { adults: 1, children: [] }] : rooms.slice(0, count));
  }

  async function onSearch(override?: RecentStay) {
    const nextDestination = (override?.destination ?? destination).trim();
    const nextCity = override?.city ?? city;
    const nextCheckIn = override?.checkIn ?? checkIn;
    const nextCheckOut = override?.checkOut ?? checkOut;
    const nextRooms = override?.rooms ?? rooms;
    const nextTarget = override ? override.target : target;
    const stayRooms = completeRooms(nextRooms);
    if (nextDestination.length < 2) {
      setNote("Indiquez une destination ou un hôtel.");
      setPanel("where");
      return;
    }
    if (!nextCheckIn || !nextCheckOut) {
      setNote("Indiquez les dates du séjour.");
      setPanel("when");
      return;
    }
    if (!stayRooms) {
      setNote("Indiquez l’âge de chaque enfant.");
      setPanel("who");
      return;
    }
    if (override) {
      setDestination(nextDestination);
      setCity(nextCity);
      setCheckIn(nextCheckIn);
      setCheckOut(nextCheckOut);
      setRooms(nextRooms);
      setTarget(nextTarget);
      setPanel(null);
    }
    setNote("");
    setSheet(false);
    setSearched(true);
    setPending(null);
    if (hotelToken) router.replace("/mon-compte/hotels");
    setCommitted({ rooms: stayRooms });
    try {
      const entry: RecentStay = {
        destination: nextDestination,
        city: nextCity,
        checkIn: nextCheckIn,
        checkOut: nextCheckOut,
        rooms: nextRooms,
        target: nextTarget,
        party: stayPartyLabel(stayRooms),
      };
      writeRecent(entry);
      const stored = JSON.stringify(entry);
      sessionStorage.setItem(LAST_SEARCH_KEY, stored);
      localStorage.setItem(LAST_SEARCH_KEY, stored);
    } catch {
      /* la session du navigateur peut refuser l’écriture */
    }
    const key = `${nextDestination.toLocaleLowerCase("fr")}|${nextCheckIn}|${nextCheckOut}|${occupancyKey(stayRooms)}|${nextTarget ? `${nextTarget.kind}${nextTarget.id}` : ""}`;
    const fresh = cachedHotels(key);
    const started = markStart();
    setClientFirst(null);
    setServerFirst(null);
    setHotels(fresh?.length ? fresh : []);
    if (fresh?.length) setClientFirst(since(started));
    setSearching(true);
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    try {
      const response = await fetch("/api/client/hotels/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination: nextDestination, city: nextCity, checkIn: nextCheckIn, checkOut: nextCheckOut, rooms: stayRooms, target: nextTarget }),
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
              setClientFirst(since(started));
            }
          } else if (event.type === "link") {
            latest = latest.map((hotel) =>
              hotel.hotelKey === event.hotelKey ? { ...hotel, offerId: event.offerId } : hotel
            );
          } else if (event.type === "done") {
            setServerFirst(event.tFirstMs);
            rememberHotels(key, latest);
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
  const nightCount = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const summaryDates = checkIn && checkOut ? formatDateRangeShort(checkIn, checkOut) : "Choisir les dates";
  const nightLabel = nightCount > 0 ? `${nightCount} nuit${nightCount > 1 ? "s" : ""}` : "";

  const shown = presentHotels(hotels, sort, needs);
  const hotelCount = shown.length;
  const canMap = hotels.some((hotel) => hotel.coords);
  const journeyQuery = useMemo(
    () => ({ destination, city, checkIn, checkOut, rooms: committed?.rooms ?? [] }),
    [destination, city, checkIn, checkOut, committed]
  );

  return (
    <section className="hotel-theme space-y-4" data-hotel-theme="a" data-hotel-search="1" data-t-client={clientFirst ?? ""} data-t-server={serverFirst ?? ""}>
      {openedLive && committed ? (
        <HotelJourney
          key={openedLive.hotelKey}
          hotel={openedLive}
          stayRooms={committed.rooms}
          datesLabel={summaryDates}
          party={party}
          query={journeyQuery}
          step={journeyStep}
          onStep={onJourneyStep}
          onBack={() => router.replace("/mon-compte/hotels")}
          others={shown.filter((item) => item.hotelKey !== openedLive.hotelKey).slice(0, 8)}
          onOpenOther={openHotel}
        />
      ) : null}
      {openedLive ? null : <>
      {searched ? (
        <button
          type="button"
          data-hotel-summary="1"
          onClick={() => openSheet("where")}
          className="h-recap sticky top-16 z-30 w-full text-left"
        >
          <span className="h-serif block text-[1.15rem] font-semibold leading-tight h-ink">{destination}</span>
          <span className="mt-1 block text-sm h-muted">{[summaryDates, nightLabel, party].filter(Boolean).join(" · ")}</span>
        </button>
      ) : (
        <form
          className="h-ask"
          data-hotel-ask="1"
          onSubmit={(event) => {
            event.preventDefault();
            void onSearch();
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <p className="h-serif px-1 text-[1.35rem] font-semibold h-ink">Hôtels</p>
            <label className="block">
              <span className="h-field flex min-h-14 items-center gap-3 px-1">
                <Icon name="search" className="h-4 w-4 shrink-0 h-muted" strokeWidth={1.5} />
                <input
                  ref={destinationRef}
                  value={destination}
                  data-hotel-destination="1"
                  onChange={(event) => {
                    setDestination(event.target.value);
                    setTarget(null);
                    setCity("");
                    setPanel("where");
                  }}
                  className="min-h-12 w-full bg-transparent text-[15px] h-ink outline-none"
                  placeholder="Destination ou hôtel"
                  autoComplete="off"
                  enterKeyHint="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-label="Destination ou hôtel"
                  onFocus={() => setPanel("where")}
                  aria-expanded={panel === "where" && (destinations.length > 0 || hotelNames.length > 0)}
                  aria-controls="hotel-suggest-list"
                />
              </span>
            </label>
            {(panel === null || panel === "where") && folded.length < 2 ? (
              <div data-hotel-recent="1" className="pt-1">
                <p className="h-section">Dernières recherches</p>
                {recent.length ? (
                  recent.map((item) => {
                    const shifted = shiftStayForward(today, item.checkIn, item.checkOut);
                    return (
                      <button
                        key={recentKey(item)}
                        type="button"
                        onClick={() => void onSearch({ ...item, checkIn: shifted.checkIn, checkOut: shifted.checkOut })}
                        className="flex min-h-11 w-full items-center gap-3 py-2 text-left"
                      >
                        <Icon name="history_edu" className="h-4 w-4 shrink-0 h-muted" strokeWidth={1.5} />
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold leading-tight h-ink">{item.destination}</span>
                          <span className="block truncate text-xs h-muted">
                            {formatDateRangeShort(shifted.checkIn, shifted.checkOut)} · {item.party}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="mt-2 text-sm h-muted">Aucune recherche pour le moment.</p>
                )}
              </div>
            ) : null}
            {panel === "where" && (destinations.length > 0 || hotelNames.length > 0) ? (
              <div id="hotel-suggest-list" role="listbox" className="py-1">
                <SuggestGroup title="Destinations" items={destinations} onPick={pickPlace} />
                <SuggestGroup title="Hôtels" items={hotelNames} onPick={pickPlace} />
              </div>
            ) : null}
            <button
              type="button"
              data-hotel-dates="1"
              onClick={() => setPanel(panel === "when" ? null : "when")}
              className="h-field h-press flex min-h-14 w-full items-center gap-3 px-1 text-left"
            >
              <Icon name="event" className="h-4 w-4 shrink-0 h-muted" strokeWidth={1.5} />
              <span className="text-[15px] h-ink">{nightLabel ? `${summaryDates} · ${nightLabel}` : summaryDates}</span>
            </button>
            {panel === "when" ? (
              <div className="px-1 py-2">
                <div className="flex items-center justify-between">
                  <button type="button" aria-label="Mois précédent" onClick={() => shiftMonth(-1)} className="grid h-11 w-11 place-items-center h-ink">
                    <Icon name="chevron_left" className="h-5 w-5" />
                  </button>
                  <p className="text-base font-semibold h-ink">{monthTitle(cursor.year, cursor.month)}</p>
                  <button type="button" aria-label="Mois suivant" onClick={() => shiftMonth(1)} className="grid h-11 w-11 place-items-center h-ink">
                    <Icon name="chevron_right" className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-7 text-center text-[11px] h-muted">
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
              data-hotel-party="1"
              onClick={() => setPanel(panel === "who" ? null : "who")}
              className="h-field h-press flex min-h-14 w-full items-center gap-3 px-1 text-left"
            >
              <Icon name="person" className="h-4 w-4 shrink-0 h-muted" strokeWidth={1.5} />
              <span className="text-[15px] h-ink">{party}</span>
              <Icon name="bed" className="ml-auto h-4 w-4 shrink-0 h-muted" strokeWidth={1.5} />
            </button>
            {panel === "who" ? (
              <div className="space-y-4 px-1 py-2">
                <Stepper
                  label="Chambres"
                  value={rooms.length}
                  min={1}
                  max={4}
                  onChange={resizeRooms}
                />
                {rooms.map((room, index) => (
                  <div key={index} className="space-y-3 pt-1">
                    <p className="text-sm h-muted">Chambre {index + 1}</p>
                    <Stepper label="Adultes" value={room.adults} min={1} max={6} onChange={(adults) => updateRoom(index, { ...room, adults })} />
                    <Stepper
                      label="Enfants"
                      value={room.children.length}
                      min={0}
                      max={4}
                      onChange={(count) =>
                        updateRoom(index, {
                          ...room,
                          children: count > room.children.length ? [...room.children, null] : room.children.slice(0, count),
                        })
                      }
                    />
                    {room.children.map((age, childIndex) => (
                      <label key={childIndex} className="flex min-h-11 items-center justify-between gap-3 text-sm h-ink">
                        <span>Âge, enfant {childIndex + 1}</span>
                        <select
                          value={age ?? ""}
                          aria-label={`Âge, enfant ${childIndex + 1}, chambre ${index + 1}`}
                          onChange={(event) => {
                            const next = room.children.slice();
                            next[childIndex] = Number(event.target.value);
                            updateRoom(index, { ...room, children: next });
                          }}
                          className="h-field min-h-11 px-3 py-2 text-base h-ink"
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
            {note ? <p className="text-sm h-gold">{note}</p> : null}
          </div>
          <div className="shrink-0 bg-[#f4efe6] pt-3">
            <button type="submit" data-hotel-search-cta="1" className="h-btn h-search-go h-press flex h-14 w-full items-center justify-center text-sm font-semibold">
              Rechercher
            </button>
          </div>
        </form>
      )}

      {searched && note && !sheet ? (
        <article className="h-recap">
          <p className="text-sm h-ink">{note}</p>
        </article>
      ) : null}
      {searching ? (
        <div className="h-ink">
          <BusyBar label="Nous préparons les tarifs" />
        </div>
      ) : null}

      <div className="space-y-3" aria-live="polite">
        {searching && hotels.length === 0
          ? [0, 1, 2].map((index) => (
              <article key={index} className="-mx-4" aria-hidden>
                <div className="h-72 animate-pulse h-skel" />
                <div className="space-y-2 px-4 py-4">
                  <div className="h-5 w-2/3 animate-pulse h-skel" />
                  <div className="h-4 w-1/3 animate-pulse h-skel" />
                </div>
              </article>
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
            <div className="flex gap-2">
              <button type="button" className="h-pill" aria-pressed={needs.length > 0} onClick={() => setTool("filtre")}>
                Filtres{needs.length ? ` · ${needs.length}` : ""}
              </button>
              <button type="button" className="h-pill" onClick={() => setTool("tri")}>
                {sort === "prix" ? "Prix" : "Privilèges"}
              </button>
            </div>
            {layout === "carte" && canMap ? <HotelMap hotels={shown} onOpen={openHotel} /> : null}
          </div>
        ) : null}
        {layout === "liste" || !canMap
          ? shown.map((hotel, index) => (
              <HotelCard key={hotel.hotelKey} hotel={hotel} first={index === 0} onOpen={() => openHotel(hotel)} />
            ))
          : null}
        {searched && !searching && hotels.length === 0 && !note ? (
          <article className="h-recap">
            <h3 className="h-serif text-[1.35rem] font-semibold h-ink">Aucun hôtel pour ces dates</h3>
            <p className="mt-2 text-sm h-muted">Écrivez-nous, nous cherchons autrement.</p>
            <a href={whatsapp} className="h-btn mt-4 flex h-12 items-center justify-center text-sm font-semibold">
              WhatsApp
            </a>
          </article>
        ) : null}
        {searched && !searching && hotels.length > 0 && shown.length === 0 ? (
          <article className="h-recap">
            <p className="text-sm h-ink">Aucun hôtel pour ces critères.</p>
            <button type="button" className="h-btn-line mt-3 text-sm font-semibold h-ink" onClick={() => setNeeds([])}>
              Retirer les filtres
            </button>
          </article>
        ) : null}
      </div>
      </>}

      {sheet ? (
        <div className="hotel-sheet h-search fixed inset-0 z-[60] flex flex-col" data-hotel-sheet="1" role="dialog" aria-modal="true" aria-label="Recherche de séjour">
          <header className="flex items-center justify-between bg-white px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <p className="h-serif text-[1.7rem] font-medium leading-tight h-ink">Où souhaitez-vous séjourner ?</p>
            <button type="button" aria-label="Fermer" onClick={() => setSheet(false)} className="grid h-10 w-10 shrink-0 place-items-center h-ink">
              <Icon name="close" className="h-5 w-5" />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-8">
            <label className="h-field flex items-center gap-3 px-4 py-3">
              <Icon name="search" className="h-4 w-4 h-muted" strokeWidth={1.5} />
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
              <div id="hotel-suggest-list" role="listbox" className="py-1">
                <SuggestGroup title="Destinations" items={destinations} onPick={pickPlace} />
                <SuggestGroup title="Hôtels" items={hotelNames} onPick={pickPlace} />
              </div>
            ) : null}
            {panel === "where" && folded.length < 2 ? (
              <div>
                <p className="h-section px-1 pb-1">Dernières recherches</p>
                {recent.length ? (
                  recent.map((item) => {
                    const shifted = shiftStayForward(today, item.checkIn, item.checkOut);
                    return (
                      <button
                        key={recentKey(item)}
                        type="button"
                        onClick={() => void onSearch({ ...item, checkIn: shifted.checkIn, checkOut: shifted.checkOut })}
                        className="flex min-h-11 w-full items-center gap-3 py-2 text-left"
                      >
                        <Icon name="history_edu" className="h-4 w-4 shrink-0 h-muted" strokeWidth={1.5} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold h-ink">{item.destination}</span>
                          <span className="block truncate text-xs h-muted">
                            {formatDateRangeShort(shifted.checkIn, shifted.checkOut)} · {item.party}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-1 text-sm h-muted">Aucune recherche pour le moment.</p>
                )}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setPanel("when")}
              className="h-field w-full px-4 py-3 text-left"
            >
              <span className="h-kicker">Vos dates</span>
              <span className="mt-1 block text-base font-medium h-ink">{nightLabel ? `${summaryDates} · ${nightLabel}` : summaryDates}</span>
            </button>
            {panel === "when" ? (
              <div className="px-1 py-2">
                <div className="flex items-center justify-between">
                  <button type="button" aria-label="Mois précédent" onClick={() => shiftMonth(-1)} className="grid h-10 w-10 place-items-center h-ink">
                    <Icon name="chevron_left" className="h-5 w-5" />
                  </button>
                  <p className="text-base font-semibold h-ink">{monthTitle(cursor.year, cursor.month)}</p>
                  <button type="button" aria-label="Mois suivant" onClick={() => shiftMonth(1)} className="grid h-10 w-10 place-items-center h-ink">
                    <Icon name="chevron_right" className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-7 text-center text-[11px] h-muted">
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
              <span className="h-kicker">Chambres et voyageurs</span>
              <span className="mt-1 block text-base font-medium h-ink">{party}</span>
            </button>
            {panel === "who" ? (
              <div className="space-y-4 px-1 py-2">
                <Stepper
                  label="Chambres"
                  value={rooms.length}
                  min={1}
                  max={4}
                  onChange={resizeRooms}
                />
                {rooms.map((room, index) => (
                  <div key={index} className="space-y-3 pt-1">
                    <p className="text-sm h-muted">Chambre {index + 1}</p>
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
            {note ? <p className="text-sm h-gold">{note}</p> : null}
          </div>
          <footer className="bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_28px_rgba(11,25,44,0.06)]">
            <button type="button" onClick={() => void onSearch()} className="h-btn h-search-go h-press flex h-14 w-full items-center justify-center text-sm font-semibold">
              Rechercher
            </button>
          </footer>
        </div>
      ) : null}
      {tool ? (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-[#1a1a1a]/40"
          role="dialog"
          aria-modal="true"
          aria-label={tool === "tri" ? "Trier" : "Filtres"}
          data-hotel-tools={tool}
          onClick={() => setTool("")}
        >
          <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden bg-[#f4efe6] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <p className="h-serif text-[1.2rem] font-semibold h-ink">{tool === "tri" ? "Trier" : "Filtres"}</p>
              <button type="button" aria-label="Fermer" onClick={() => setTool("")} className="grid h-10 w-10 place-items-center h-ink">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            {tool === "tri" ? (
              <div className="space-y-2">
                {([
                  ["prix", "Prix, du plus bas"],
                  ["avantages", "Privilèges"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={sort === key}
                    className={`h-recap flex w-full items-center justify-between text-left text-sm ${sort === key ? "h-on" : "h-ink"}`}
                    onClick={() => {
                      setSort(key);
                      setTool("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                  <p className="text-sm h-muted">
                    {needs.length ? `${needs.length} ${needs.length > 1 ? "filtres actifs" : "filtre actif"}` : "Aucun filtre"}
                  </p>
                  <button type="button" className="text-sm font-semibold h-ink disabled:opacity-40" onClick={() => setNeeds([])} disabled={needs.length === 0}>
                    Tout effacer
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                  {PERK_GROUPS.map((group) => (
                    <div key={group.title}>
                      <p className="h-section">{group.title}</p>
                      <div className="mt-2 space-y-2">
                        {group.keys.map((key) => {
                          const perk = PERK_LABEL.find((row) => row.key === key);
                          if (!perk) return null;
                          const on = needs.includes(perk.key);
                          return (
                            <button
                              key={perk.key}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              className={`h-recap flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm ${on ? "h-on" : "h-ink"}`}
                              onClick={() => setNeeds((current) => (on ? current.filter((item) => item !== perk.key) : [...current, perk.key]))}
                            >
                              {perk.label}
                              <span
                                aria-hidden
                                className={`grid h-5 w-5 shrink-0 place-items-center border ${on ? "border-[#1a1a1a] bg-[#1a1a1a] text-[#f4efe6]" : "border-[#1a1a1a]/30 bg-white"}`}
                              >
                                {on ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="h-btn mt-3 flex h-12 w-full shrink-0 items-center justify-center text-sm font-semibold" onClick={() => setTool("")}>
                  {hotelCount ? `Voir ${hotelCount} ${hotelCount > 1 ? "hôtels" : "hôtel"}` : "Aucun hôtel"}
                </button>
              </>
            )}
          </div>
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
    <div className="h-recap mt-2 p-0">
      <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] h-muted">{title}</p>
      {items.map((item) => (
        <button
          key={`${item.kind}-${item.id ?? ""}-${item.label}-${item.detail}`}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(item)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <Icon name={item.kind === "hotel" ? "bed" : "pin"} className="h-4 w-4 h-muted" strokeWidth={1.5} />
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
          className="h-btn-line h-press grid h-11 w-11 place-items-center text-lg disabled:opacity-30"
        >
          −
        </button>
        <span className="w-4 text-center text-lg font-semibold h-ink">{value}</span>
        <button
          type="button"
          aria-label={`Ajouter ${label.toLocaleLowerCase("fr")}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-btn-line h-press grid h-11 w-11 place-items-center text-lg disabled:opacity-30"
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
  const perk = PERK_LABEL.find((item) => hotel.perks[item.key])?.label || "";
  return (
    <article className="hotel-rise -mx-4">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="h-72 bg-[#eceae6]">
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
              className="h-fade h-full w-full object-cover"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <div className="grid h-full place-items-center h-muted">
              <Icon name="hotel" className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="space-y-1 px-4 pb-8 pt-3">
          <h3 className="h-serif text-[1.2rem] font-semibold leading-tight h-ink">{hotel.name}</h3>
          {hotel.city ? <p className="text-[15px] h-muted">{hotel.city}</p> : null}
          {perk ? <p className="pt-1 text-[12px] text-[#9a7b4f]">{perk}</p> : null}
          <p className="pt-2 text-lg font-medium h-ink">
            {euros(hotel.sellCents, hotel.currency)}
            <span className="ml-2 text-sm font-normal h-muted">{euros(hotel.perNightCents, hotel.currency)} / nuit</span>
          </p>
          <p className="pt-1 text-sm h-ink">Voir l’hôtel</p>
        </div>
      </button>
    </article>
  );
}
