import { isActiveItem } from "./types";
import { placeFromPreposition, placeWithPreposition } from "./stay-phrase";

/** Accueil VIP réservé par l’agence. Distinct du VIP Airport que le client demande. */

export type AccueilVipService = "arrival" | "departure" | "roundtrip";
export type AccueilVipRole = "arrival" | "departure";

export type AccueilVipLeg = {
  role: AccueilVipRole;
  flight_id: string;
  airport_iata: string;
  airport_city: string;
  at: string;
  flight_number: string;
  timezone: string;
};

export type AccueilVipFlight = {
  id: string;
  kind?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
};

export type AccueilVipCard = {
  kind: "accueil_vip";
  title: string;
  supplier: string | null;
  confirmation_ref: string | null;
  start_at: string | null;
  end_at: string | null;
  amount: number | null;
  details: Record<string, unknown>;
};

type ComposeOk = { ok: true; card: AccueilVipCard };
type ComposeNo = { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseAccueilVipService(value: unknown): AccueilVipService | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (raw === "arrival" || raw === "arrivee") return "arrival";
  if (raw === "departure" || raw === "depart") return "departure";
  if (raw === "roundtrip" || raw === "aller-retour" || raw === "aller_retour" || raw === "allerretour") {
    return "roundtrip";
  }
  return null;
}

function textOf(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function wallClock(value: string | null | undefined) {
  const match = (value || "").trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return "";
  if (match[2] === "00" && match[3] === "00") return "";
  return `${match[1]}T${match[2]}:${match[3]}:00`;
}

function dayOf(value: string) {
  return value.slice(0, 10);
}

function citySide(title: string, role: AccueilVipRole) {
  const parts = title.split(/\s*(?:→|->)\s*/);
  if (parts.length !== 2) return "";
  const side = (role === "arrival" ? parts[1] : parts[0] || "").trim();
  if (!side || /^[A-Z]{3}$/.test(side)) return "";
  return side;
}

function flightCity(flight: AccueilVipFlight, role: AccueilVipRole) {
  const details = flight.details || {};
  const direct = role === "arrival" ? textOf(details, "city_to") : textOf(details, "city_from");
  if (direct) return direct;
  return citySide(flight.title || "", role);
}

function flightIata(flight: AccueilVipFlight, role: AccueilVipRole) {
  const details = flight.details || {};
  const code = (role === "arrival" ? textOf(details, "to") : textOf(details, "from")).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

function flightZone(flight: AccueilVipFlight, role: AccueilVipRole) {
  const details = flight.details || {};
  const key = role === "arrival" ? "arrival_timezone" : "departure_timezone";
  return textOf(details, key);
}

/** Aéroport et heure lus sur le vol lié. L’autre ville du trajet n’entre pas. */
export function legFromFlight(flight: AccueilVipFlight, role: AccueilVipRole): AccueilVipLeg | { error: string } {
  const at = wallClock(role === "arrival" ? flight.end_at : flight.start_at);
  if (!at) {
    return {
      error: role === "arrival" ? "Ce vol n’a pas d’heure d’arrivée." : "Ce vol n’a pas d’heure de départ.",
    };
  }
  const airport_iata = flightIata(flight, role);
  const airport_city = flightCity(flight, role);
  if (!airport_iata && !airport_city) {
    return { error: "Ce vol n’a pas d’aéroport pour cette étape." };
  }
  return {
    role,
    flight_id: flight.id,
    airport_iata,
    airport_city,
    at,
    flight_number: textOf(flight.details, "flight_number"),
    timezone: flightZone(flight, role),
  };
}

export function accueilVipTitle(service: AccueilVipService, legs: AccueilVipLeg[]) {
  const place = (leg: AccueilVipLeg) => leg.airport_city || leg.airport_iata;
  if (service === "arrival") {
    const leg = legs.find((row) => row.role === "arrival") || legs[0];
    if (!leg) return "Accueil VIP";
    if (!leg.airport_city) return `Accueil VIP à l'arrivée · ${leg.airport_iata}`;
    return `Accueil VIP à l'arrivée ${placeWithPreposition(leg.airport_city)}`;
  }
  if (service === "departure") {
    const leg = legs.find((row) => row.role === "departure") || legs[0];
    if (!leg) return "Accueil VIP";
    if (!leg.airport_city) return `Accueil VIP au départ · ${leg.airport_iata}`;
    return `Accueil VIP au départ ${placeFromPreposition(leg.airport_city)}`;
  }
  const cities: string[] = [];
  const codes: string[] = [];
  for (const leg of legs) {
    if (leg.airport_city && !cities.some((city) => city.toLowerCase() === leg.airport_city.toLowerCase())) {
      cities.push(leg.airport_city);
    } else if (!leg.airport_city && leg.airport_iata && !codes.includes(leg.airport_iata)) {
      codes.push(leg.airport_iata);
    }
  }
  if (cities.length === 1 && !codes.length) return `Accueil VIP ${placeWithPreposition(cities[0])}`;
  if (cities.length > 1) {
    return `Accueil VIP ${cities.map((city) => placeWithPreposition(city)).join(" et ")}`;
  }
  if (codes.length) return `Accueil VIP · ${codes.join(" · ")}`;
  const only = legs[0];
  return only ? `Accueil VIP · ${place(only)}` : "Accueil VIP";
}

export function accueilVipDayTitle(item: { title?: string | null; details?: Record<string, unknown> | null }, day: string) {
  const leg = accueilVipLegOnDay(item, day);
  if (!leg) return item.title || "Accueil VIP";
  return accueilVipTitle(leg.role === "arrival" ? "arrival" : "departure", [leg]);
}

export function readAccueilVipLegs(details: Record<string, unknown> | null | undefined): AccueilVipLeg[] {
  const raw = details?.legs;
  if (!Array.isArray(raw)) return [];
  const legs: AccueilVipLeg[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const leg = row as Record<string, unknown>;
    const role = leg.role === "departure" ? "departure" : leg.role === "arrival" ? "arrival" : null;
    const flight_id = typeof leg.flight_id === "string" ? leg.flight_id : "";
    if (!role || !flight_id) continue;
    legs.push({
      role,
      flight_id,
      airport_iata: typeof leg.airport_iata === "string" ? leg.airport_iata : "",
      airport_city: typeof leg.airport_city === "string" ? leg.airport_city : "",
      at: typeof leg.at === "string" ? leg.at : "",
      flight_number: typeof leg.flight_number === "string" ? leg.flight_number : "",
      timezone: typeof leg.timezone === "string" ? leg.timezone : "",
    });
  }
  return legs;
}

export function accueilVipLegOnDay(
  item: { details?: Record<string, unknown> | null },
  day: string | null | undefined
): AccueilVipLeg | null {
  if (!day) return readAccueilVipLegs(item.details)[0] || null;
  return readAccueilVipLegs(item.details).find((leg) => leg.at.slice(0, 10) === day) || null;
}

export function accueilVipTimelineDays(item: { kind?: string | null; details?: Record<string, unknown> | null; start_at?: string | null }) {
  if (item.kind !== "accueil_vip") return [] as string[];
  const days: string[] = [];
  for (const leg of readAccueilVipLegs(item.details)) {
    const day = dayOf(leg.at);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || days.includes(day)) continue;
    days.push(day);
  }
  return days.sort();
}

function activeFlight(flights: AccueilVipFlight[], id: string) {
  const flight = flights.find((row) => row.id === id && row.kind === "flight" && isActiveItem(row));
  return flight || null;
}

export type AccueilVipFields = {
  service: AccueilVipService;
  provider: string;
  arrivalFlightId: string;
  departureFlightId: string;
  passengers: number | null;
  bags: number | null;
  hotline: string;
  email: string;
  confirmation: string;
  clientInfo: string;
  amount: number | null;
  documentAmount?: number | null;
  documentCurrency?: string | null;
};

function countOf(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function readAccueilVipFields(item: {
  supplier?: string | null;
  confirmation_ref?: string | null;
  amount?: number | null;
  details?: Record<string, unknown> | null;
}): AccueilVipFields {
  const details = item.details || {};
  const legs = readAccueilVipLegs(details);
  const service = parseAccueilVipService(details.vip_service) || (legs.length > 1 ? "roundtrip" : legs[0]?.role || "arrival");
  return {
    service,
    provider: (item.supplier || "").trim(),
    arrivalFlightId: legs.find((leg) => leg.role === "arrival")?.flight_id || "",
    departureFlightId: legs.find((leg) => leg.role === "departure")?.flight_id || "",
    passengers: countOf(details.passenger_count),
    bags: countOf(details.bag_count),
    hotline: textOf(details, "phone"),
    email: textOf(details, "email"),
    confirmation: (item.confirmation_ref || "").trim(),
    clientInfo: textOf(details, "client_info"),
    amount: item.amount == null || item.amount === ("" as unknown) ? null : Number(item.amount),
    documentAmount: typeof details.document_amount === "number" ? details.document_amount : null,
    documentCurrency: textOf(details, "document_currency") || null,
  };
}

function wholeCount(value: number | null, label: string, min: number, max: number): number | ComposeNo {
  if (value == null || !Number.isInteger(value) || value < min || value > max) {
    return { ok: false, error: label };
  }
  return value;
}

export function composeAccueilVip(fields: AccueilVipFields, flights: AccueilVipFlight[]): ComposeOk | ComposeNo {
  const provider = fields.provider.trim();
  if (!provider) return { ok: false, error: "Indiquez le prestataire." };
  if (provider.length > 160) return { ok: false, error: "Prestataire : 160 caractères maximum." };
  const clientInfo = fields.clientInfo.trim();
  if (!clientInfo) return { ok: false, error: "Indiquez les informations à transmettre au client." };
  if (clientInfo.length > 8000) return { ok: false, error: "Informations : 8 000 caractères maximum." };
  const passengers = wholeCount(fields.passengers, "Indiquez le nombre de voyageurs.", 1, 99);
  if (typeof passengers !== "number") return passengers;
  const bags = wholeCount(fields.bags, "Indiquez le nombre de bagages.", 0, 99);
  if (typeof bags !== "number") return bags;
  const hotline = fields.hotline.trim();
  if (hotline.length > 40) return { ok: false, error: "Hotline : 40 caractères maximum." };
  const email = fields.email.trim();
  if (email && !EMAIL.test(email)) return { ok: false, error: "L’e-mail du prestataire est invalide." };
  if (email.length > 200) return { ok: false, error: "E-mail : 200 caractères maximum." };
  const confirmation = fields.confirmation.trim();
  if (confirmation.length > 80) return { ok: false, error: "Référence : 80 caractères maximum." };

  const wanted: AccueilVipRole[] =
    fields.service === "roundtrip" ? ["arrival", "departure"] : [fields.service];
  const ids: Record<AccueilVipRole, string> = {
    arrival: fields.arrivalFlightId.trim(),
    departure: fields.departureFlightId.trim(),
  };
  if (fields.service === "roundtrip" && ids.arrival && ids.arrival === ids.departure) {
    return { ok: false, error: "L’aller-retour se relie à deux vols différents." };
  }
  const legs: AccueilVipLeg[] = [];
  for (const role of wanted) {
    const id = ids[role];
    if (!id) {
      return {
        ok: false,
        error: role === "arrival" ? "Reliez l’arrivée à un vol du dossier." : "Reliez le départ à un vol du dossier.",
      };
    }
    const flight = activeFlight(flights, id);
    if (!flight) return { ok: false, error: "Ce vol n’est pas sur le dossier." };
    const leg = legFromFlight(flight, role);
    if ("error" in leg) return { ok: false, error: leg.error };
    legs.push(leg);
  }
  const times = legs.map((leg) => leg.at).sort();
  const details: Record<string, unknown> = {
    vip_service: fields.service,
    passenger_count: passengers,
    bag_count: bags,
    client_info: clientInfo,
    legs,
  };
  if (hotline) details.phone = hotline;
  if (email) details.email = email;
  if (fields.documentAmount != null) details.document_amount = fields.documentAmount;
  if (fields.documentCurrency) details.document_currency = fields.documentCurrency;
  const amount = fields.amount != null && Number.isFinite(fields.amount) && fields.amount > 0 ? fields.amount : null;
  return {
    ok: true,
    card: {
      kind: "accueil_vip",
      title: accueilVipTitle(fields.service, legs),
      supplier: provider,
      confirmation_ref: confirmation || null,
      start_at: times[0] || null,
      end_at: times[times.length - 1] || null,
      amount,
      details,
    },
  };
}

type LiveItem = {
  id: string;
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  amount?: number | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
};

/** Recalcule aéroport et heure depuis les vols présents. Un vol modifié met l’étape à jour. */
export function withLiveAccueilVip<T extends LiveItem>(items: T[]): T[] {
  const flights = items.filter((item) => item.kind === "flight");
  return items.map((item) => {
    if (item.kind !== "accueil_vip" || !isActiveItem(item)) return item;
    const fields = readAccueilVipFields(item);
    const composed = composeAccueilVip(fields, flights);
    if (!composed.ok) {
      return {
        ...item,
        details: {
          ...(item.details || {}),
          needs_review: true,
          review_reason: composed.error,
        },
      };
    }
    const previous = item.details || {};
    const details = { ...previous, ...composed.card.details };
    delete details.needs_review;
    delete details.review_reason;
    if (previous.client_hidden) details.client_hidden = previous.client_hidden;
    return {
      ...item,
      title: composed.card.title,
      supplier: composed.card.supplier,
      confirmation_ref: composed.card.confirmation_ref,
      start_at: composed.card.start_at,
      end_at: composed.card.end_at,
      amount: item.amount == null ? composed.card.amount : item.amount,
      details,
    };
  });
}

/** Colle l’accueil au vol du jour : avant un départ, après une arrivée. */
export function placeAccueilVipBesideFlights<T extends { id: string; kind?: string | null; details?: Record<string, unknown> | null }>(
  items: T[],
  day: string
): T[] {
  const movable = items.filter((item) => {
    if (item.kind !== "accueil_vip") return false;
    const leg = accueilVipLegOnDay(item, day);
    return Boolean(leg && items.some((row) => row.id === leg.flight_id));
  });
  if (!movable.length) return items;
  const out = items.filter((item) => !movable.includes(item));
  const departures = movable.filter((item) => accueilVipLegOnDay(item, day)?.role === "departure");
  const arrivals = movable.filter((item) => accueilVipLegOnDay(item, day)?.role === "arrival");
  for (const vip of departures) {
    const leg = accueilVipLegOnDay(vip, day);
    const index = out.findIndex((row) => row.id === leg?.flight_id);
    if (index < 0) out.push(vip);
    else out.splice(index, 0, vip);
  }
  for (const vip of [...arrivals].reverse()) {
    const leg = accueilVipLegOnDay(vip, day);
    const index = out.findIndex((row) => row.id === leg?.flight_id);
    if (index < 0) out.push(vip);
    else out.splice(index + 1, 0, vip);
  }
  return out;
}

export type ClientInfoBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

const BULLET = /^\s*(?:[-*•–—]|\d+[.)])\s+(.*)$/;

/** Paragraphes et listes à puces, dans l’ordre du texte saisi. */
export function clientInfoBlocks(text: string): ClientInfoBlock[] {
  const blocks: ClientInfoBlock[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (list?.length) blocks.push({ type: "list", items: list });
    list = null;
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(BULLET);
    if (bullet?.[1]?.trim()) {
      list = list || [];
      list.push(bullet[1].trim());
      continue;
    }
    flush();
    blocks.push({ type: "paragraph", text: line });
  }
  flush();
  return blocks;
}

export function accueilVipQuietLine(item: { details?: Record<string, unknown> | null }) {
  return readAccueilVipLegs(item.details)
    .map((leg) => {
      const when = leg.at.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      const clock = when ? `${when[3]}/${when[2]} ${when[4]}h${when[5]}` : "";
      const role = leg.role === "arrival" ? "Arrivée" : "Départ";
      const where = [leg.airport_city, leg.airport_iata].filter(Boolean).join(" ");
      return [role, clock, leg.flight_number, where].filter(Boolean).join(" ");
    })
    .join(" · ");
}

export function accueilVipPartyLine(details: Record<string, unknown> | null | undefined) {
  const passengers = countOf(details?.passenger_count);
  const bags = countOf(details?.bag_count);
  const parts: string[] = [];
  if (passengers != null && passengers > 0) {
    parts.push(passengers > 1 ? `${passengers} voyageurs` : "1 voyageur");
  }
  if (bags != null) {
    parts.push(bags === 0 ? "aucun bagage" : bags > 1 ? `${bags} bagages` : "1 bagage");
  }
  return parts.join(" · ");
}

/** Après une copie de dossier : les vols liés sont ceux de la copie. */
export function remapAccueilVipLinks(details: unknown, ids: Map<string, string>) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const record = details as Record<string, unknown>;
  const legs = readAccueilVipLegs(record);
  if (!legs.length) return null;
  let changed = false;
  const next = legs.map((leg) => {
    const id = ids.get(leg.flight_id);
    if (!id || id === leg.flight_id) return leg;
    changed = true;
    return { ...leg, flight_id: id };
  });
  if (!changed) return null;
  return { ...record, legs: next };
}

export function accueilVipSnapshotsDiffer(
  item: { title?: string | null; start_at?: string | null; end_at?: string | null; details?: Record<string, unknown> | null },
  next: { title?: string | null; start_at?: string | null; end_at?: string | null; details?: Record<string, unknown> | null }
) {
  if ((item.title || "") !== (next.title || "")) return true;
  if ((item.start_at || "") !== (next.start_at || "")) return true;
  if ((item.end_at || "") !== (next.end_at || "")) return true;
  return JSON.stringify(readAccueilVipLegs(item.details)) !== JSON.stringify(readAccueilVipLegs(next.details));
}
