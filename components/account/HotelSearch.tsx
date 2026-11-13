"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HotelJourney } from "@/components/account/HotelJourney";
import { HotelPhotoStrip } from "@/components/account/HotelPhotoStrip";
import { HotelMap } from "@/components/account/HotelMap";
import { HotelWait } from "@/components/account/HotelWait";
import { HotelBenefits } from "@/components/crm/HotelBenefits";
import { Icon } from "@/components/crm/icons";
import { localTodayIso, parisTodayIso } from "@/lib/crm/dates";
import {
  HOTEL_ACCESS_EYEBROW,
  HOTEL_ACCESS_LEVEL,
  HOTEL_ACCESS_LEVEL_LABEL,
  HOTEL_ACCESS_LINES,
  HOTEL_ACCESS_OFFER,
  HOTEL_ACCESS_PROMISE,
  HOTEL_ACCESS_RESERVE,
  HOTEL_ACCESS_UNTIL,
  HOTEL_SEARCH_CITY_CHIPS,
  HOTEL_SEARCH_HERO_FALLBACK,
  hotelDraftStorageKey,
  hotelRecentStorageKey,
  hotelSearchHeroSrc,
  type FeaturedHotel,
} from "@/lib/crm/hotel-search-home";
import { postHotelActivity } from "@/lib/crm/hotel-activity-client";
import { HOTEL_RESULT_PAGE } from "@/lib/crm/hotel-activity";
import { discreetSearchPerk, hotelJourneySearch, hotelJourneyStep, presentHotels, SEARCH_PERK_LABEL, type HotelJourneyStep, type HotelSort } from "@/lib/crm/hotel-journey";
import {
  hotelSearchDraft,
  leRoomPartyOk,
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
import { frenchCity } from "@/lib/crm/hotel-fr";
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
let draftOwner = LAST_SEARCH_KEY;
let recentOwner = "hotel-recent-list";

const PERK_LABEL = SEARCH_PERK_LABEL;

const WEEKDAYS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
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

function compactStayDates(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return "Dates";
  const day = (iso: string) => String(Number(iso.slice(8, 10)));
  const month = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }).replace(".", "");
  if (checkIn.slice(0, 7) === checkOut.slice(0, 7)) return `${day(checkIn)}–${day(checkOut)} ${month(checkOut)}`;
  return `${day(checkIn)} ${month(checkIn)} – ${day(checkOut)} ${month(checkOut)}`;
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

function monthsFrom(iso: string, count = 8) {
  const start = monthCursor(iso);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(start.year, start.month + index, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
  });
}

function confirmStayLine(checkIn: string, checkOut: string) {
  const label = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  if (!checkIn) return "Choisissez l’arrivée";
  if (!checkOut) return label(checkIn);
  return `${label(checkIn)} – ${label(checkOut)}`;
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
  const destination = frenchCity(row.destination.trim());
  return `${destination.toLocaleLowerCase("fr")}|${row.target?.kind || ""}|${row.target?.id || ""}|${shifted.checkIn}|${shifted.checkOut}|${row.party}`;
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
    recentSnapshot =
      localStorage.getItem(recentOwner) ||
      sessionStorage.getItem(recentOwner) ||
      (recentOwner === RECENT_KEY ? sessionStorage.getItem("hotel-recent") : "") ||
      EMPTY_RECENT;
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
  localStorage.setItem(recentOwner, raw);
  sessionStorage.setItem(recentOwner, raw);
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
    return localStorage.getItem(draftOwner) || sessionStorage.getItem(draftOwner) || (draftOwner === LAST_SEARCH_KEY ? sessionStorage.getItem("hotel-recent") || "" : "");
  } catch {
    return "";
  }
}

function adoptHotelStorage(customerId: string) {
  const nextRecent = hotelRecentStorageKey(customerId);
  const nextDraft = hotelDraftStorageKey(customerId);
  if (recentOwner === nextRecent && draftOwner === nextDraft) return;
  recentOwner = nextRecent;
  draftOwner = nextDraft;
  recentFresh = false;
  recentListeners.forEach((listener) => listener());
  window.dispatchEvent(new Event("storage"));
}

function subscribeHotelDraft(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function subscribeNever() {
  return () => {};
}

/**
 * Jour de l’appareil (fuseau du navigateur) pour les dates proposées. Le serveur rend le jour de Paris ;
 * React remplace par le jour local à l’hydratation, sans décalage d’affichage.
 */
function useDeviceToday() {
  return useSyncExternalStore(subscribeNever, () => localTodayIso(), () => parisTodayIso());
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

export function HotelSearch({
  trial = true,
  leApi = false,
  customerId = "",
  highlights = [],
}: {
  trial?: boolean;
  leApi?: boolean;
  /** Isole les recherches récentes de cet appareil pour cette personne. */
  customerId?: string;
  /** Hôtels déjà réservés, avec photo. Vide : la section reste cachée. */
  highlights?: FeaturedHotel[];
}) {
  const today = useDeviceToday();
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
  const [hotels, setHotels] = useState<ClientHotel[]>([]);
  const [searching, setSearching] = useState(false);
  const searchLock = useRef(false);
  const [searched, setSearched] = useState(false);
  const [note, setNote] = useState("");
  const [serverFirst, setServerFirst] = useState<number | null>(null);
  const [clientFirst, setClientFirst] = useState<number | null>(null);
  const [needs, setNeeds] = useState<(keyof HotelPerks)[]>([]);
  const [sort, setSort] = useState<HotelSort>("prix");
  const [page, setPage] = useState(1);
  const [tool, setTool] = useState<"" | "filtre" | "tri">("");
  const [layout, setLayout] = useState<"liste" | "carte">("liste");
  const [heroBroken, setHeroBroken] = useState(false);
  const [heroSeen, setHeroSeen] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const hotelsPath = pathname.startsWith("/exemple") ? "/exemple/hotels" : "/mon-compte/hotels";
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
    if (!hotel.hotelId) postHotelActivity({ kind: "view", hotel: hotel.name, city: hotel.city });
    setCatalog((current) => (current[token] === hotel ? current : { ...current, [token]: hotel }));
    setPending(token);
    router.push(`${hotelsPath}?${hotelJourneySearch(token, "hotel")}`);
  }

  function onJourneyStep(next: HotelJourneyStep | "back") {
    if (next === "back") {
      router.back();
      return;
    }
    if (!openedLive) return;
    const href = `${hotelsPath}?${hotelJourneySearch(tokenOf(openedLive), next)}`;
    if (`${hotelsPath}?${params.toString()}` === href) return;
    router.push(href);
  }

  const suggestAbort = useRef<AbortController | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const destinationRef = useRef<HTMLInputElement>(null);
  const focusReady = useRef(false);

  useEffect(() => {
    adoptHotelStorage(customerId);
  }, [customerId]);

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
    postHotelActivity({ kind: "suggest", label: item.label, placeKind: item.kind });
    setDestination(item.label);
    setCity(item.kind === "hotel" ? item.detail : "");
    setTarget(item.id ? { kind: item.kind, id: item.id } : null);
    setPanel("when");
    setSheet(true);
  }

  /** Le calendrier s’ouvre sur le mois de l’arrivée proposée (demain), déjà sélectionnée avec le départ. */
  function openDates() {
    setNote("");
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
  }

  function noteParty(next: DraftRoom[]) {
    const ready = completeRooms(next);
    if (!ready) return;
    const party = leRoomPartyOk(ready);
    setNote(party.ok ? "" : party.message);
  }

  function updateRoom(index: number, next: DraftRoom) {
    const roomsNext = rooms.map((room, at) => (at === index ? next : room));
    setRooms(roomsNext);
    noteParty(roomsNext);
  }

  function resizeRooms(count: number) {
    const roomsNext = count > rooms.length ? [...rooms, { adults: 1, children: [] }] : rooms.slice(0, count);
    setRooms(roomsNext);
    noteParty(roomsNext);
  }

  function applyFilters(next: (keyof HotelPerks)[]) {
    setNeeds(next);
    postHotelActivity({ kind: "filter", filters: next, destination });
  }

  async function onSearch(override?: RecentStay) {
    if (searchLock.current) return;
    const nextDestination = (override?.destination ?? destination).trim();
    const nextCity = override?.city ?? city;
    const nextCheckIn = override?.checkIn ?? checkIn;
    const nextCheckOut = override?.checkOut ?? checkOut;
    const nextRooms = override?.rooms ?? rooms;
    const nextTarget = override ? override.target : target;
    const stayRooms = completeRooms(nextRooms);
    const searchBody = {
      destination: nextDestination,
      city: nextCity,
      checkIn: nextCheckIn,
      checkOut: nextCheckOut,
      rooms: stayRooms || nextRooms,
      target: nextTarget,
      filters: needs,
    };
    if (nextDestination.length < 2) {
      setNote("Indiquez une destination ou un hôtel.");
      setPanel("where");
      setSheet(true);
      void fetch("/api/client/hotels/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(searchBody),
      }).catch(() => {});
      return;
    }
    if (!nextCheckIn || !nextCheckOut) {
      setNote("Indiquez les dates du séjour.");
      setPanel("when");
      setSheet(true);
      void fetch("/api/client/hotels/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(searchBody),
      }).catch(() => {});
      return;
    }
    if (!stayRooms) {
      setNote("Indiquez l’âge de chaque enfant.");
      setPanel("who");
      setSheet(true);
      void fetch("/api/client/hotels/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(searchBody),
      }).catch(() => {});
      return;
    }
    const partyOk = leRoomPartyOk(stayRooms);
    if (!partyOk.ok) {
      setNote(partyOk.message);
      setPanel("who");
      setSheet(true);
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
    searchLock.current = true;
    setPage(1);
    setPending(null);
    if (hotelToken) router.replace(hotelsPath);
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
      sessionStorage.setItem(draftOwner, stored);
      localStorage.setItem(draftOwner, stored);
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
        body: JSON.stringify(searchBody),
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
      searchLock.current = false;
      if (searchAbort.current === controller) setSearching(false);
    }
  }

  const heroCandidate = hotelSearchHeroSrc((city || destination).trim());
  if (heroSeen !== heroCandidate) {
    setHeroSeen(heroCandidate);
    setHeroBroken(false);
  }
  const heroSrc = heroBroken ? HOTEL_SEARCH_HERO_FALLBACK : heroCandidate;
  const whatsapp = `https://wa.me/${siteConfig.whatsappNumber}`;
  const nightCount = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const summaryDates = checkIn && checkOut ? formatDateRangeShort(checkIn, checkOut) : "Choisir les dates";
  const nightLabel = nightCount > 0 ? `${nightCount} nuit${nightCount > 1 ? "s" : ""}` : "";
  const destinationLabel = destination.trim() ? frenchCity(destination.trim()) : "Destination";
  const barDates = compactStayDates(checkIn, checkOut);
  const barAdults = rooms.reduce((sum, room) => sum + room.adults, 0);
  const barChildren = rooms.reduce((sum, room) => sum + room.children.length, 0);
  const barPeople = barChildren
    ? `${barAdults} ad. · ${barChildren} enf.`
    : barAdults > 1 ? `${barAdults} adultes` : "1 adulte";
  const barRooms = rooms.length > 1 ? `${rooms.length} chambres` : "1 chambre";
  const guestLine = `${barAdults > 1 ? `${barAdults} adultes` : "1 adulte"} · ${
    barChildren > 1 ? `${barChildren} enfants` : barChildren === 1 ? "1 enfant" : "0 enfant"
  }`;

  function openPlace(destinationName: string, cityName = "", hotelId: number | null = null) {
    void onSearch({
      destination: destinationName,
      city: cityName,
      checkIn,
      checkOut,
      rooms,
      target: hotelId ? { kind: "hotel", id: hotelId } : null,
      party,
    });
  }

  const shown = presentHotels(hotels, sort, needs);
  const visible = shown.slice(0, page * HOTEL_RESULT_PAGE);
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
          onBack={() => router.replace(hotelsPath)}
          others={shown.filter((item) => item.hotelKey !== openedLive.hotelKey).slice(0, 8)}
          onOpenOther={openHotel}
          trial={trial}
          leApi={leApi}
        />
      ) : null}
      {openedLive ? null : <>
      <div className={searched ? "h-searchbar -mx-4 -mt-4 px-3 pb-2 pt-2 sm:-mx-5" : ""} data-hotel-ask="1" data-hotel-fields="1" data-hotel-summary="1" data-hotel-search-dock="1">
        {searched ? (
          <div className="h-searchbar-row">
            <button type="button" data-hotel-destination="1" onClick={() => openSheet("where")} className="h-bar-cell h-press" aria-label={destination.trim() ? `Destination, ${destinationLabel}` : "Destination ou hôtel"}>
              <Icon name="search" className="h-4 w-4 shrink-0 text-[#C5A880]" strokeWidth={1.5} />
              <span className="truncate">{destinationLabel}</span>
            </button>
            <button type="button" data-hotel-dates="1" onClick={() => { openDates(); setSheet(true); }} className="h-bar-cell h-press" aria-label={checkIn && checkOut ? `Dates, ${barDates}` : "Dates"}>
              <Icon name="event" className="h-4 w-4 shrink-0 text-[#C5A880]" strokeWidth={1.5} />
              <span className="truncate">{barDates}</span>
            </button>
            <button type="button" data-hotel-party="1" onClick={() => openSheet("who")} className="h-bar-cell h-press" aria-label={`Voyageurs, ${party}`}>
              <Icon name="person" className="h-4 w-4 shrink-0 text-[#C5A880]" strokeWidth={1.5} />
              <span className="min-w-0 text-left leading-tight">
                <span className="block truncate">{barPeople}</span>
                <span className="block truncate text-[11px] font-medium text-[#8c7352]">{barRooms}</span>
              </span>
            </button>
            <button type="button" data-hotel-search-cta="1" disabled={searching} onClick={() => void onSearch()} className="h-btn h-search-go h-bar-go h-press inline-flex items-center justify-center gap-1.5 font-semibold disabled:opacity-60">
              <Icon name="search" className="h-4 w-4 text-[#C5A880]" strokeWidth={1.75} />
              <span>Rechercher</span>
            </button>
          </div>
        ) : (
          <div className="h-search-stack">
            <label className="h-stack-field">
              <Icon name="search" className="h-4 w-4 shrink-0 text-[#C5A880]" strokeWidth={1.5} />
              <input
                value={destination}
                data-hotel-destination="1"
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
                aria-expanded={panel === "where" && !sheet && (destinations.length > 0 || hotelNames.length > 0)}
                aria-controls="hotel-suggest-home"
                ref={sheet ? undefined : destinationRef}
                aria-label={destination.trim() ? `Destination, ${destinationLabel}` : "Destination ou hôtel"}
              />
            </label>
            {panel === "where" && !sheet && (destinations.length > 0 || hotelNames.length > 0) ? (
              <div id="hotel-suggest-home" role="listbox" className="overflow-hidden rounded-xl bg-white">
                <SuggestGroup title="Destinations" items={destinations} onPick={pickPlace} />
                <SuggestGroup title="Hôtels" items={hotelNames} onPick={pickPlace} />
              </div>
            ) : null}
            <button type="button" data-hotel-dates="1" onClick={() => { openDates(); setSheet(true); }} className="h-stack-field h-press" aria-label={checkIn && checkOut ? `Dates, ${barDates}` : "Dates"}>
              <Icon name="event" className="h-4 w-4 shrink-0 text-[#C5A880]" strokeWidth={1.5} />
              <span className="truncate">{checkIn && checkOut ? `${barDates} (${nightLabel})` : "Dates"}</span>
            </button>
            <button type="button" data-hotel-party="1" onClick={() => openSheet("who")} className="h-stack-field h-press" aria-label={`Voyageurs, ${party}`}>
              <Icon name="person" className="h-4 w-4 shrink-0 text-[#C5A880]" strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate text-left">{guestLine}</span>
              <Icon name="bed" className="h-4 w-4 shrink-0 text-[#C5A880]" strokeWidth={1.5} />
              <span className="shrink-0">{barRooms}</span>
            </button>
            <button type="button" data-hotel-search-cta="1" disabled={searching} onClick={() => void onSearch()} className="h-btn h-search-go h-press mt-1 flex h-12 w-full items-center justify-center font-semibold disabled:opacity-60">
              <span>Rechercher</span>
            </button>
          </div>
        )}
        {note && !sheet ? <p className="px-1 pt-2 text-sm h-gold">{note}</p> : null}
        {searched && hotels.length > 0 ? (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto">
            <button type="button" className={`h-pill shrink-0 ${layout === "liste" ? "h-on" : ""}`} onClick={() => setLayout("liste")}>Liste</button>
            {canMap ? (
              <button type="button" className={`h-pill shrink-0 ${layout === "carte" ? "h-on" : ""}`} onClick={() => setLayout("carte")}>Carte</button>
            ) : null}
            <button type="button" className="h-pill shrink-0" aria-pressed={needs.length > 0} onClick={() => setTool("filtre")}>
              Filtres{needs.length ? ` · ${needs.length}` : ""}
            </button>
            <button type="button" className="h-pill shrink-0" onClick={() => setTool("tri")}>
              {sort === "prix" ? "Prix" : "Privilèges"}
            </button>
            <p className="ml-auto shrink-0 text-xs h-muted">{shown.length} {shown.length > 1 ? "hôtels" : "hôtel"}</p>
          </div>
        ) : null}
      </div>
      {!searched ? (
        <div className="h-ask">
          <div className="h-member" data-hotel-hero="1">
            {/* eslint-disable-next-line @next/next/no-img-element -- photo de lieu ou image déjà dans le projet */}
            <img
              src={heroSrc}
              alt=""
              width={960}
              height={540}
              fetchPriority="high"
              decoding="async"
              onError={() => setHeroBroken(true)}
              className="absolute inset-0 h-full w-full object-cover opacity-35"
            />
            <div className="absolute inset-0 bg-[#0B192C]/80" aria-hidden />
            <div className="relative space-y-3 px-4 py-4" data-hotel-agency-benefits="1">
              <div className="flex items-end justify-between gap-3 border-b border-[#C5A880]/40 pb-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C5A880]">{HOTEL_ACCESS_EYEBROW}</p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{HOTEL_ACCESS_LEVEL_LABEL}</p>
                  <p className="h-serif text-[1.45rem] leading-none tracking-[0.04em] text-[#f7f4ee]">{HOTEL_ACCESS_LEVEL}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-semibold text-[#C5A880]">{HOTEL_ACCESS_OFFER}</p>
                  <p className="mt-1 text-[12px] leading-snug text-white/75">{HOTEL_ACCESS_UNTIL}</p>
                </div>
              </div>
              <h1 className="h-serif text-[1.02rem] font-semibold leading-snug">{HOTEL_ACCESS_PROMISE}</h1>
              <HotelBenefits lines={[...HOTEL_ACCESS_LINES]} title={HOTEL_ACCESS_EYEBROW} layout="grid" />
              <p className="text-[11px] leading-snug text-white/70">{HOTEL_ACCESS_RESERVE}</p>
            </div>
          </div>
          <div data-hotel-recent="1">
            <p className="h-section px-1">Dernières recherches</p>
                  {recent.length ? (
                    recent.map((item) => {
                      const shifted = shiftStayForward(today, item.checkIn, item.checkOut);
                      return (
                        <button
                          key={recentKey(item)}
                          type="button"
                          onClick={() => void onSearch({ ...item, checkIn: shifted.checkIn, checkOut: shifted.checkOut })}
                          className="flex min-h-11 w-full items-center gap-3 px-1 py-2 text-left"
                        >
                          <Icon name="history_edu" className="h-4 w-4 shrink-0 text-[#C5A880]" strokeWidth={1.5} />
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] font-semibold leading-tight h-ink">{frenchCity(item.destination)}</span>
                            <span className="block truncate text-xs h-muted">
                              {formatDateRangeShort(shifted.checkIn, shifted.checkOut)} · {item.party}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="mt-2 px-1 text-sm h-muted">Aucune recherche pour le moment.</p>
                  )}
                </div>
                <div data-hotel-suggestions="1">
                  <ul className="flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Destinations suggérées">
                    {HOTEL_SEARCH_CITY_CHIPS.map((cityName) => (
                      <li key={cityName}>
                        <button type="button" className="h-pill h-press" onClick={() => openPlace(cityName)}>
                          {cityName}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                {highlights.length ? (
                  <section aria-label="Hôtels coups de cœur" data-hotel-highlights="1">
                    <h2 className="h-section px-1">Hôtels coups de cœur</h2>
                    <ul className="h-gallery mt-3 flex gap-3 overflow-x-auto px-1 pb-1">
                      {highlights.map((pick) => (
                        <li key={`${pick.hotelId || ""}-${pick.name}`} className="w-44 shrink-0">
                          <button
                            type="button"
                            onClick={() => openPlace(pick.name, pick.city, pick.hotelId)}
                            className="h-press w-full text-left"
                            aria-label={`Rechercher ${pick.name}${pick.city ? `, ${pick.city}` : ""}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- photo déjà enregistrée sur un séjour */}
                            <img
                              src={pick.photo}
                              alt=""
                              width={288}
                              height={192}
                              loading="lazy"
                              decoding="async"
                              className="h-24 w-full rounded-xl bg-[#0B192C] object-cover"
                            />
                            <span className="mt-1.5 block truncate text-sm font-semibold h-ink">{pick.name}</span>
                            {pick.city ? <span className="block truncate text-xs h-muted">{pick.city}</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
        </div>
      ) : null}
      <div className="space-y-5" aria-live="polite">
        {searching && hotels.length === 0 ? (
          <HotelWait
            place={destination.trim()}
            detail={[summaryDates, nightLabel, party].filter(Boolean).join(" · ")}
          />
        ) : null}
        {searched && hotels.length > 0 && layout === "carte" && canMap ? <HotelMap hotels={shown} onOpen={openHotel} /> : null}
        {layout === "liste" || !canMap
          ? visible.map((hotel, index) => (
              <HotelCard key={hotel.hotelKey} hotel={hotel} first={index === 0} onOpen={() => openHotel(hotel)} />
            ))
          : null}
        {(layout === "liste" || !canMap) && shown.length > visible.length ? (
          <button
            type="button"
            data-hotel-page="1"
            className="h-btn-line h-press flex h-12 w-full items-center justify-center text-sm font-semibold h-ink"
            onClick={() => {
              const next = page + 1;
              setPage(next);
              postHotelActivity({ kind: "page", page: next, total: shown.length, destination });
            }}
          >
            Voir la suite
          </button>
        ) : null}
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
            <button type="button" className="h-btn-line mt-3 text-sm font-semibold h-ink" onClick={() => applyFilters([])}>
              Retirer les filtres
            </button>
          </article>
        ) : null}
      </div>
      </>}

      {sheet && panel !== "when" && panel !== "who" ? (
        <div className="hotel-sheet h-search fixed inset-x-0 top-16 z-[60] flex flex-col bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:bottom-0" data-hotel-sheet="1" role="dialog" aria-modal="true" aria-label="Recherche de séjour">
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
                ref={destinationRef}
                value={destination}
                data-hotel-destination="1"
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
                          <span className="block truncate text-sm font-semibold h-ink">{frenchCity(item.destination)}</span>
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

            {note ? <p className="text-sm h-gold">{note}</p> : null}
          </div>
          <footer className="bg-white px-5 py-3 pb-8 shadow-[0_-12px_28px_rgba(11,25,44,0.06)] md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => void onSearch()} disabled={searching} className="h-btn h-search-go h-press flex h-14 w-full items-center justify-center gap-2 text-sm font-semibold disabled:opacity-60">
              <Icon name="search" className="h-4 w-4 text-[#C5A880]" strokeWidth={1.75} />
              <span>Rechercher</span>
            </button>
          </footer>
        </div>
      ) : null}
      {sheet && panel === "when" ? (
        <div className="hotel-sheet h-dates fixed inset-x-0 top-16 z-[60] flex flex-col bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:bottom-0" data-hotel-sheet="1" data-hotel-dates-sheet="1" role="dialog" aria-modal="true" aria-label="Dates du séjour">
          <header className="flex items-center justify-end px-3 py-2">
            <button type="button" aria-label="Fermer" onClick={() => setSheet(false)} className="grid h-11 w-11 place-items-center h-ink">
              <Icon name="close" className="h-5 w-5" />
            </button>
          </header>
          <div className="grid grid-cols-7 px-2 text-center text-[11px] font-semibold h-muted">
            {WEEKDAYS.map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
            {monthsFrom(today).map((month) => (
              <StayMonth
                key={`${month.year}-${month.month}`}
                year={month.year}
                month={month.month}
                today={today}
                checkIn={checkIn}
                checkOut={checkOut}
                onPick={pickDay}
              />
            ))}
          </div>
          <footer className="border-t border-[#e6e0d6] bg-white px-5 py-3 pb-8 text-center">
            <p className="text-sm h-ink">{confirmStayLine(checkIn, checkOut)}</p>
            <p className="mt-0.5 text-base font-semibold h-ink">{nightLabel || "Choisissez les dates"}</p>
            {note ? <p className="mt-1 text-sm h-gold">{note}</p> : null}
            <button
              type="button"
              className="h-btn h-search-go h-press mt-3 flex h-12 w-full items-center justify-center font-semibold"
              onClick={() => {
                if (!checkIn || !checkOut) {
                  setNote("Indiquez les dates du séjour.");
                  return;
                }
                setNote("");
                setSheet(false);
              }}
            >
              Confirmer les dates
            </button>
          </footer>
        </div>
      ) : null}
      {sheet && panel === "who" ? (
        <div
          className="fixed inset-x-0 top-0 z-[60] flex items-end bg-[#0B192C]/45 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:bottom-0"
          data-hotel-sheet="1"
          data-hotel-party-sheet="1"
          role="dialog"
          aria-modal="true"
          aria-label="Voyageurs et chambres"
          onClick={() => setSheet(false)}
        >
          <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-white px-5 pb-4 pt-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="h-serif text-[1.2rem] font-semibold h-ink">Voyageurs et chambres</p>
              <button type="button" aria-label="Fermer" onClick={() => setSheet(false)} className="grid h-11 w-11 place-items-center h-ink">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5">
              {rooms.map((room, index) => (
                <div key={index} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-semibold h-ink">Chambre {index + 1}</p>
                    {rooms.length > 1 ? (
                      <button
                        type="button"
                        className="text-sm font-semibold h-gold"
                        onClick={() => {
                          const next = rooms.filter((_, at) => at !== index);
                          setRooms(next);
                          noteParty(next);
                        }}
                      >
                        Retirer
                      </button>
                    ) : null}
                  </div>
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
            {rooms.length < 4 ? (
              <button type="button" className="mt-4 text-sm font-semibold underline h-ink" onClick={() => resizeRooms(rooms.length + 1)}>
                Ajouter une chambre
              </button>
            ) : null}
            <p className="mt-4 text-center text-sm h-muted">{barRooms} | {guestLine}</p>
            {note ? <p className="mt-2 text-sm h-gold">{note}</p> : null}
            <button
              type="button"
              className="h-btn h-search-go h-press mt-3 flex h-12 w-full items-center justify-center font-semibold"
              onClick={() => {
                if (!completeRooms(rooms)) {
                  setNote("Indiquez l’âge de chaque enfant.");
                  return;
                }
                setNote("");
                setSheet(false);
              }}
            >
              Confirmer les voyageurs
            </button>
          </div>
        </div>
      ) : null}
      {tool ? (
        <div
          className="fixed inset-x-0 top-0 z-[70] flex items-end bg-[#1a1a1a]/40 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:bottom-0"
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
                      if (key !== sort) postHotelActivity({ kind: "sort", sort: key, destination, count: shown.length });
                      setSort(key);
                      setPage(1);
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
                  <button type="button" className="text-sm font-semibold h-ink disabled:opacity-40" onClick={() => applyFilters([])} disabled={needs.length === 0}>
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
                              onClick={() => applyFilters(on ? needs.filter((item) => item !== perk.key) : [...needs, perk.key])}
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

function StayMonth({
  year,
  month,
  today,
  checkIn,
  checkOut,
  onPick,
}: {
  year: number;
  month: number;
  today: string;
  checkIn: string;
  checkOut: string;
  onPick: (iso: string) => void;
}) {
  return (
    <div className="mt-5">
      <p className="px-2 pb-2 text-center text-base font-semibold h-ink">{monthTitle(year, month)}</p>
      <div className="grid grid-cols-7">
        {monthCells(year, month).map((iso, index) => {
          if (!iso) return <span key={`empty-${year}-${month}-${index}`} />;
          const endpoint = iso === checkIn || iso === checkOut;
          const inside = Boolean(checkIn && checkOut && iso > checkIn && iso < checkOut);
          const past = iso < today;
          return (
            <button
              key={iso}
              type="button"
              data-date={iso}
              disabled={past}
              onClick={() => onPick(iso)}
              className={`h-day ${inside ? "h-range" : ""} ${past ? "h-faint" : "h-ink"}`}
            >
              <span className={endpoint ? "h-day-on" : undefined}>{Number(iso.slice(-2))}</span>
            </button>
          );
        })}
      </div>
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

/**
 * Résultat de la liste. Le nom et la ville sont sur la photo.
 * Juste en dessous : le tarif et « Voir l’hôtel ». Les avantages (`HotelBenefits`) ferment la carte.
 * Sans avantage lu, une seule ligne discrète (annulation gratuite) reste à cette place.
 */
function HotelCard({ hotel, first, onOpen }: { hotel: ClientHotel; first: boolean; onOpen: () => void }) {
  const hasBenefits = hotel.benefits.length > 0;
  const perk = hasBenefits ? "" : discreetSearchPerk(hotel.perks);
  return (
    <article className="hotel-rise h-result" data-hotel-card="1">
      <div className="h-cover" data-hotel-cover="1">
        <HotelPhotoStrip photo={hotel.photo} images={hotel.images} alt="" eager={first} onActivate={onOpen} />
        <div className="h-cover-fade" aria-hidden />
        <div className="h-cover-copy pointer-events-none z-[3]" data-hotel-title="1">
          <h3 className="h-serif line-clamp-2 text-[1.2rem] font-semibold leading-tight">{hotel.name}</h3>
          {hotel.city ? <p className="mt-0.5 text-sm text-white/80">{hotel.city}</p> : null}
        </div>
      </div>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-end justify-between gap-3 px-4 py-3" data-hotel-price="1">
          <p className="min-w-0 text-lg font-medium leading-tight h-ink">
            {euros(hotel.sellCents, hotel.currency)} TTC
            <span className="mt-0.5 block text-sm font-normal h-muted">{euros(hotel.perNightCents, hotel.currency)} / nuit</span>
          </p>
          <span className="mb-0.5 shrink-0 rounded-full border border-[#C5A880] px-3 py-1.5 text-sm font-semibold text-[#8c7352]">
            Voir l’hôtel
          </span>
        </div>
        {hotel.perks.freeCancellation || hotel.perks.breakfast ? (
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {hotel.perks.freeCancellation ? <span className="rounded-full bg-[#f4efe6] px-2.5 py-1 text-[12px] font-semibold text-[#8c7352]">Annulation gratuite</span> : null}
            {hotel.perks.breakfast ? <span className="rounded-full bg-[#f4efe6] px-2.5 py-1 text-[12px] font-semibold text-[#8c7352]">Petit-déjeuner inclus</span> : null}
          </div>
        ) : null}
        {hasBenefits ? (
          <div className="px-4 pb-4" data-hotel-benefits="1">
            <HotelBenefits lines={hotel.benefits} layout="icons" title="Vos avantages" />
          </div>
        ) : perk ? (
          <p className="px-4 pb-4 text-[12px] text-[#9a7b4f]">{perk}</p>
        ) : null}
      </button>
    </article>
  );
}
