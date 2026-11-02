import { hotelDirectLive, type HotelAccessCustomer } from "./hotel-access";
import type { HotelRoomOccupancy } from "./hotel-search";

/** Gestes de la rubrique Hôtels. Le préfixe isole le filtre « Recherches hôtels ». */
export const HOTEL_ACTIVITY_ACTIONS = [
  "hotel_search",
  "hotel_suggest",
  "hotel_view",
  "hotel_room",
  "hotel_sort",
  "hotel_page",
  "hotel_filter",
  "hotel_request",
  "hotel_error",
] as const;

export type HotelActivityAction = (typeof HOTEL_ACTIVITY_ACTIONS)[number];

export type HotelActivityMode = "essai" | "réel";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const FILTER_LABELS: Record<string, string> = {
  breakfast: "petit-déjeuner",
  freeCancellation: "annulation gratuite",
  upgrade: "surclassement",
  credit: "crédit hôtel",
  earlyCheckIn: "arrivée anticipée",
  lateCheckOut: "départ tardif",
};

const SORT_LABELS = {
  prix: "prix",
  avantages: "privilèges",
} as const;

/** Hôtels montrés avant « Voir la suite ». */
export const HOTEL_RESULT_PAGE = 12;

export function hotelActivityMode(customer: HotelAccessCustomer | null | undefined): HotelActivityMode {
  return hotelDirectLive(customer) ? "réel" : "essai";
}

export function isHotelClientActivity(row: { action: string; path?: string | null }) {
  if ((HOTEL_ACTIVITY_ACTIONS as readonly string[]).includes(row.action)) return true;
  const path = (row.path || "").split("?")[0].replace(/\/+$/, "");
  return row.action === "view" && path === "/mon-compte/hotels";
}

/** « Kim Atias a cherché… » à partir du libellé stocké « A cherché… ». */
export function hotelActivitySentence(name: string, summary: string) {
  const who = tidy(name, 80) || "Le client";
  const text = tidy(summary, 180);
  if (text.startsWith("A ")) return `${who} a ${text.slice(2)}`;
  if (!text) return who;
  return `${who} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** 12–19 juil. Même mois : un seul mois. L’année n’entre que si elle change. */
export function hotelStayDates(checkIn: string, checkOut: string) {
  const start = calendarDay(checkIn);
  const end = calendarDay(checkOut);
  if (!start || !end) return "";
  if (start.y === end.y && start.m === end.m) {
    if (start.d === end.d) return `${start.d} ${MONTHS[start.m]}`;
    return `${start.d}–${end.d} ${MONTHS[start.m]}`;
  }
  if (start.y === end.y) return `${start.d} ${MONTHS[start.m]}–${end.d} ${MONTHS[end.m]}`;
  return `${start.d} ${MONTHS[start.m]} ${start.y}–${end.d} ${MONTHS[end.m]} ${end.y}`;
}

/** « 2 adultes », ou « 2 chambres, 3 adultes, 1 enfant » dès qu’il y a plusieurs chambres. */
export function hotelPartyShort(rooms: HotelRoomOccupancy[]) {
  if (!rooms.length) return "";
  const adults = rooms.reduce((sum, room) => sum + room.adults, 0);
  const children = rooms.reduce((sum, room) => sum + room.children.length, 0);
  const parts: string[] = [];
  if (rooms.length > 1) parts.push(`${rooms.length} chambres`);
  parts.push(adults > 1 ? `${adults} adultes` : "1 adulte");
  if (children === 1) parts.push("1 enfant");
  else if (children > 1) parts.push(`${children} enfants`);
  return parts.join(", ");
}

export function hotelFilterLabels(value: unknown) {
  if (!Array.isArray(value)) return [];
  const labels: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const label = FILTER_LABELS[item];
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.slice(0, 8);
}

export type HotelGesture =
  | {
      kind: "search";
      destination: string;
      checkIn: string;
      checkOut: string;
      rooms: HotelRoomOccupancy[];
      count: number;
      filters: string[];
    }
  | { kind: "suggest"; label: string; placeKind: "ville" | "hotel" }
  | { kind: "view"; hotel: string; city?: string }
  | { kind: "room"; hotel: string; room: string; rate?: string }
  | { kind: "sort"; sort: "prix" | "avantages"; destination?: string; count?: number }
  | { kind: "page"; page: number; total?: number; destination?: string }
  | { kind: "filter"; filters: string[]; destination?: string }
  | {
      kind: "request";
      via: "offre" | "sejour" | "acces" | "annulation";
      hotel?: string;
      room?: string;
      repeat?: boolean;
      already?: boolean;
      pay?: "agence" | "carte";
    }
  | { kind: "error"; where: "recherche" | "fiche" | "demande" | "acces"; message: string; place?: string };

export function describeHotelGesture(
  gesture: HotelGesture,
  mode: HotelActivityMode
): { action: HotelActivityAction; summary: string; detail: string | null } | null {
  const described = phrase(gesture);
  if (!described) return null;
  return {
    action: described.action,
    summary: described.summary,
    detail: attachMode(described.detail, mode),
  };
}

/** Corps accepté du navigateur. Le libellé est recalculé ici. */
export function parseHotelActivityBody(body: unknown): HotelGesture | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  const kind = row.kind;
  if (kind === "suggest") {
    const label = place(row.label);
    if (!label || (row.placeKind !== "ville" && row.placeKind !== "hotel")) return null;
    return { kind: "suggest", label, placeKind: row.placeKind };
  }
  if (kind === "view") {
    const hotel = place(row.hotel);
    if (!hotel) return null;
    const city = place(row.city);
    return city ? { kind: "view", hotel, city } : { kind: "view", hotel };
  }
  if (kind === "room") {
    const hotel = place(row.hotel);
    const room = place(row.room);
    if (!hotel || !room) return null;
    const rate = place(row.rate);
    return rate ? { kind: "room", hotel, room, rate } : { kind: "room", hotel, room };
  }
  if (kind === "sort") {
    if (row.sort !== "prix" && row.sort !== "avantages") return null;
    return {
      kind: "sort",
      sort: row.sort,
      destination: place(row.destination) || undefined,
      count: countOf(row.count),
    };
  }
  if (kind === "page") {
    const page = countOf(row.page);
    if (!page || page < 1 || page > 40) return null;
    return {
      kind: "page",
      page,
      total: countOf(row.total),
      destination: place(row.destination) || undefined,
    };
  }
  if (kind === "filter") {
    return {
      kind: "filter",
      filters: hotelFilterLabels(row.filters),
      destination: place(row.destination) || undefined,
    };
  }
  return null;
}

export type HotelActivityLine = {
  id: string;
  client: string;
  client_id: string;
  fiche: string;
  quand: string;
  action: string;
  resume: string;
  detail: string | null;
};

export function presentHotelActivityLines(
  rows: {
    id: string;
    customer_id: string;
    action: string;
    summary: string;
    detail?: string | null;
    path?: string | null;
    created_at: string;
  }[],
  customers: { id: string; first_name: string | null; last_name: string | null }[]
): HotelActivityLine[] {
  const names = new Map(customers.map((row) => [row.id, personName(row.first_name, row.last_name)]));
  return rows
    .filter((row) => isHotelClientActivity(row) && row.summary.trim())
    .map((row) => {
      const client = names.get(row.customer_id) || "Client";
      return {
        id: row.id,
        client,
        client_id: row.customer_id,
        fiche: `/admin/clients/${row.customer_id}`,
        quand: row.created_at,
        action: row.action,
        resume: hotelActivitySentence(client, row.summary),
        detail: tidy(row.detail || "", 400) || null,
      };
    });
}

function phrase(gesture: HotelGesture): { action: HotelActivityAction; summary: string; detail: string | null } | null {
  if (gesture.kind === "search") {
    const destination = place(gesture.destination);
    if (!destination) return null;
    const bits = [destination, hotelStayDates(gesture.checkIn, gesture.checkOut), hotelPartyShort(gesture.rooms)].filter(Boolean);
    const count = Math.max(0, Math.min(500, Math.floor(gesture.count)));
    const countLabel = count === 0 ? "aucun hôtel" : count === 1 ? "1 hôtel" : `${count} hôtels`;
    const filters = gesture.filters.filter(Boolean).slice(0, 8);
    return {
      action: "hotel_search",
      summary: `A cherché ${bits.join(", ")}`,
      detail: [countLabel, filters.join(", ")].filter(Boolean).join(" · ") || null,
    };
  }
  if (gesture.kind === "suggest") {
    const label = place(gesture.label);
    if (!label) return null;
    return {
      action: "hotel_suggest",
      summary: gesture.placeKind === "hotel" ? `A choisi l’hôtel ${label}` : `A choisi la destination ${label}`,
      detail: gesture.placeKind === "hotel" ? "hôtel" : "destination",
    };
  }
  if (gesture.kind === "view") {
    const hotel = place(gesture.hotel);
    if (!hotel) return null;
    const city = place(gesture.city || "");
    return {
      action: "hotel_view",
      summary: `A ouvert l’hôtel ${hotel}`,
      detail: city && !same(city, hotel) ? city : null,
    };
  }
  if (gesture.kind === "room") {
    const hotel = place(gesture.hotel);
    const room = place(gesture.room);
    if (!hotel || !room) return null;
    const rate = place(gesture.rate || "");
    return {
      action: "hotel_room",
      summary: `A ouvert la chambre ${room}`,
      detail: [hotel, rate && !same(rate, room) ? rate : ""].filter(Boolean).join(" · ") || null,
    };
  }
  if (gesture.kind === "sort") {
    const where = place(gesture.destination || "");
    const count = gesture.count == null ? null : Math.max(0, Math.min(500, Math.floor(gesture.count)));
    const countLabel = count == null ? "" : count === 1 ? "1 hôtel" : `${count} hôtels`;
    return {
      action: "hotel_sort",
      summary: `A trié les hôtels par ${SORT_LABELS[gesture.sort]}`,
      detail: [where, countLabel].filter(Boolean).join(" · ") || null,
    };
  }
  if (gesture.kind === "page") {
    const where = place(gesture.destination || "");
    const total = gesture.total == null ? null : Math.max(0, Math.min(500, Math.floor(gesture.total)));
    return {
      action: "hotel_page",
      summary: `A affiché la page ${gesture.page} des hôtels`,
      detail: [where, total == null ? "" : `${Math.min(gesture.page * HOTEL_RESULT_PAGE, total)} sur ${total}`]
        .filter(Boolean)
        .join(" · ") || null,
    };
  }
  if (gesture.kind === "filter") {
    const where = place(gesture.destination || "");
    if (!gesture.filters.length) {
      return {
        action: "hotel_filter",
        summary: "A retiré les filtres des hôtels",
        detail: where || null,
      };
    }
    return {
      action: "hotel_filter",
      summary: `A filtré les hôtels : ${gesture.filters.join(", ")}`,
      detail: where || null,
    };
  }
  if (gesture.kind === "request") {
    const hotel = place(gesture.hotel || "");
    const room = place(gesture.room || "");
    if (gesture.via === "acces") {
      return {
        action: "hotel_request",
        summary: gesture.already
          ? "A demandé l’accès Hôtels, déjà ouvert"
          : gesture.repeat
            ? "A redemandé l’accès Hôtels"
            : "A demandé l’accès Hôtels",
        detail: null,
      };
    }
    if (gesture.via === "annulation") {
      return {
        action: "hotel_request",
        summary: hotel ? `A demandé l’annulation de ${hotel}` : "A demandé une annulation",
        detail: room || null,
      };
    }
    if (gesture.via === "sejour") {
      return {
        action: "hotel_request",
        summary: hotel ? `A demandé à l’agence de reprendre ${hotel}` : "A demandé à l’agence de reprendre le séjour",
        detail: room || null,
      };
    }
    const stay = [hotel, room ? `chambre ${room}` : ""].filter(Boolean).join(", ");
    const pay = gesture.pay === "carte" ? "règlement par carte" : gesture.pay === "agence" ? "règlement par l’agence" : "";
    return {
      action: "hotel_request",
      summary: stay ? `A envoyé une demande pour ${stay}` : "A envoyé une demande à l’agence",
      detail: pay || null,
    };
  }
  const message = tidy(gesture.message, 160);
  const where = place(gesture.place || "");
  const verb =
    gesture.where === "recherche"
      ? "en cherchant"
      : gesture.where === "fiche"
        ? "en ouvrant"
        : gesture.where === "demande"
          ? "en envoyant"
          : "en demandant l’accès";
  return {
    action: "hotel_error",
    summary: where ? `A rencontré une erreur ${verb} ${where}` : "A rencontré une erreur dans Hôtels",
    detail: message || null,
  };
}

function attachMode(detail: string | null, mode: HotelActivityMode) {
  const text = tidy(detail || "", 320);
  if (!text) return mode;
  if (text.endsWith(mode)) return text;
  return `${text} · ${mode}`.slice(0, 400);
}

function calendarDay(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { y: Number(match[1]), m: month, d: day };
}

function countOf(value: unknown) {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 0 || count > 500) return undefined;
  return count;
}

function place(value: unknown) {
  if (typeof value !== "string") return "";
  return tidy(value, 80);
}

function tidy(value: string, max: number) {
  return value
    .replace(/[A-Z0-9<]{20,}/gi, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\b\d[\d\s.,]*\s*€/g, " ")
    .replace(/\b(net|marge|commission)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function same(a: string, b: string) {
  return a.localeCompare(b, "fr", { sensitivity: "accent" }) === 0;
}

function personName(first: string | null, last: string | null) {
  return [first, last].map((part) => (part || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" ") || "Client";
}
