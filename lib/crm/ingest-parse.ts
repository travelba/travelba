import { redactIngestText } from "./ingest-redact";
import type { BookingExtract } from "./ingest-types";
import { findMatchingItem, mergeExtractItems } from "./item-match";

export type ParsedAirport = { iata: string; city: string };

const AIRPORTS: { re: RegExp; iata: string; city: string }[] = [
  { re: /GELABERT|ALBROOK/i, iata: "PAC", city: "Panama" },
  { re: /ISLA COLON|BOCAS DEL TORO/i, iata: "BOC", city: "Bocas del Toro" },
  { re: /ENRIQUE MALEK/i, iata: "DAV", city: "David" },
  { re: /TOCUMEN/i, iata: "PTY", city: "Panama" },
];

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  janvier: "01",
  feb: "02",
  february: "02",
  fevrier: "02",
  févr: "02",
  mar: "03",
  march: "03",
  mars: "03",
  apr: "04",
  april: "04",
  avril: "04",
  may: "05",
  mai: "05",
  jun: "06",
  june: "06",
  juin: "06",
  jul: "07",
  july: "07",
  juillet: "07",
  aug: "08",
  august: "08",
  aout: "08",
  août: "08",
  sep: "09",
  september: "09",
  septembre: "09",
  oct: "10",
  october: "10",
  octobre: "10",
  nov: "11",
  november: "11",
  novembre: "11",
  dec: "12",
  december: "12",
  decembre: "12",
  décembre: "12",
};

export function inferAirportIata(label: string): ParsedAirport | null {
  for (const row of AIRPORTS) {
    if (row.re.test(label)) return { iata: row.iata, city: row.city };
  }
  return null;
}

function monthNum(token: string) {
  const key = token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "");
  return MONTHS[key] || MONTHS[key.slice(0, 3)] || null;
}

function itineraryYear(text: string): string | null {
  const weekday = text.match(
    /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+[a-zàâéèêëïîôùûüç.]+\s+(20\d{2})/i
  );
  return weekday?.[1] || null;
}

/** `10 August 2026`, `18 août 2026`, ou `03 August 09:45` + année de l’itinéraire. */
export function parseFrEnDate(chunk: string, yearHint?: string | null): string | null {
  const named = chunk.match(
    /(\d{1,2})\s+([A-Za-zàâéèêëïîôùûüç.]+)\s+(20\d{2})(?:\s+(\d{1,2})[h:](\d{2}))?/i
  );
  if (named) {
    const mm = monthNum(named[2]);
    if (!mm) return null;
    const day = named[1].padStart(2, "0");
    const iso = `${named[3]}-${mm}-${day}`;
    return named[4] ? `${iso}T${named[4].padStart(2, "0")}:${named[5]}:00` : iso;
  }
  const clock = chunk.match(
    /(\d{1,2})\s+([A-Za-zàâéèêëïîôùûüç.]+)\s+(\d{1,2})[h:](\d{2})/i
  );
  if (clock && yearHint) {
    const mm = monthNum(clock[2]);
    if (!mm) return null;
    return `${yearHint}-${mm}-${clock[1].padStart(2, "0")}T${clock[3].padStart(2, "0")}:${clock[4]}:00`;
  }
  const fr = chunk.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (fr) {
    return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  }
  return null;
}

/** Nantipa / vouchers CR : `08/02/2026` = 2 août (MM/DD). */
export function parseUsMonthDayYear(chunk: string): string | null {
  const m = chunk.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export type ParsedAmadeusFlight = {
  confirmation_ref: string;
  pnr: string | null;
  supplier: string | null;
  airline: string | null;
  flight_number: string | null;
  from: string | null;
  to: string | null;
  city_from: string | null;
  city_to: string | null;
  start_at: string | null;
  end_at: string | null;
  cabin: string | null;
  baggage: string | null;
};

export function parseAmadeusReceipt(text: string): ParsedAmadeusFlight | null {
  if (!/Reçu de Billet Electronique/i.test(text)) return null;
  const gds = text.match(
    /R[eé]f[eé]rence du dossier(?!\s+compagnie)\s+([A-Z0-9]{6})\b/i
  );
  if (!gds) return null;
  const year = itineraryYear(text);
  const company = text.match(
    /R[eé]f[eé]rence du dossier compagnie\s+([A-Z0-9]{2})\/([A-Z0-9]{5,6})/i
  );
  const issuer = text.match(/Compagnie [eé]mettrice\s*:\s*([A-Z][A-Z ]+)/i);
  const operated = text.match(
    /([A-Z][A-Za-z0-9 .]+?)\s+([A-Z0-9]{1,3})\s+(\d{1,4})\s+\(Op[eé]r[eé] Par\s+([^,]+),/i
  );
  const clock = /(\d{1,2}\s+[A-Za-zàâéèêëïîôùûüç.]+\s+\d{1,2}:\d{2})/i;
  const dep = text.match(
    new RegExp(clock.source + "([\\s\\S]{0,160}?)D[eé]part", "i")
  );
  const afterDep = dep?.index != null ? text.slice(dep.index + dep[0].length) : text;
  const arr = afterDep.match(
    new RegExp(clock.source + "([\\s\\S]{0,160}?)Arriv[eé]e", "i")
  );
  const cabin = text.match(/([A-Za-z]+) \(([A-Z])\)\s*Classe/i);
  const bags = text.match(/Bagages autoris[eé]s\s+(\d+PC)/i);
  const depText = `${dep?.[1] || ""} ${dep?.[2] || ""}`;
  const arrText = `${arr?.[1] || ""} ${arr?.[2] || ""}`;
  const fromApt = inferAirportIata(depText) || inferAirportIata(text);
  const toApt = inferAirportIata(arrText);
  const start = parseFrEnDate(dep?.[1] || depText, year);
  const end = parseFrEnDate(arr?.[1] || arrText, year);
  const operating = operated?.[4]?.trim() || null;
  const marketing = operated?.[1]?.trim() || null;
  const flight = operated ? `${operated[2]} ${operated[3]}` : null;
  return {
    confirmation_ref: gds[1].toUpperCase(),
    pnr: company?.[2]?.toUpperCase() || null,
    supplier: (issuer?.[1] || marketing || "").replace(/\s+/g, " ").trim() || null,
    airline: operating,
    flight_number: flight,
    from: fromApt?.iata || null,
    to: toApt?.iata || null,
    city_from: fromApt?.city || null,
    city_to: toApt?.city || null,
    start_at: start,
    end_at: end,
    cabin: cabin ? `${cabin[1]} (${cabin[2]})` : null,
    baggage: bags?.[1] || null,
  };
}

export type ParsedHotel = {
  hotel_name: string | null;
  confirmation_ref: string | null;
  city: string | null;
  address: string | null;
  start_at: string | null;
  end_at: string | null;
  included: string[];
  rooms: { room: string | null; guests: string | null }[];
};

export function parseLittleEmperorsHotel(text: string): ParsedHotel | null {
  if (!/Reservation Details/i.test(text) || !/Booking Reference/i.test(text)) return null;
  const refs = text.match(/Booking Reference\s+([0-9]{5,}(?:\s*;\s*[0-9]{5,})*)/i);
  const checkIn = text.match(/Check in\s+([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i);
  const checkOut = text.match(/Check out\s+([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i);
  const head = text.split(/Reservation Details/i)[0];
  const lines = head
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const city = lines[lines.length - 1] || null;
  const hotel_name = lines.slice(0, -1).join(" ").replace(/\s+/g, " ").trim() || null;
  const address = text.match(/Address\s+([^\n]+(?:\n[^\n]+)?)/i);
  const included: string[] = [];
  if (/Daily breakfast/i.test(text) || /petit[- ]d[eé]j/i.test(text)) {
    included.push("Petit-déjeuner");
  }
  const rooms: ParsedHotel["rooms"] = [];
  const roomBlocks = text.split(/Booking name/i);
  for (const block of roomBlocks.slice(0, -1)) {
    const room = block.match(/(Guest Room[^\n]+|Deluxe[^\n]+|Suite[^\n]+|Villa[^\n]+)/i);
    const adults = block.match(/Adults\s+(\d+)/i);
    rooms.push({
      room: room?.[1]?.trim() || null,
      guests: adults ? `${adults[1]} adultes` : null,
    });
  }
  return {
    hotel_name,
    confirmation_ref: refs?.[1]?.replace(/\s+/g, "") || null,
    city,
    address: address?.[1]?.replace(/\s+/g, " ").trim() || null,
    start_at: checkIn ? parseFrEnDate(checkIn[1]) : null,
    end_at: checkOut ? parseFrEnDate(checkOut[1]) : null,
    included,
    rooms: rooms.length ? rooms : [],
  };
}

export function parseNantipaConfirmation(text: string): ParsedHotel | null {
  if (!/NANTIPA/i.test(text) || !/Reservation Number/i.test(text)) return null;
  const ref =
    text.match(/(\d{4,})\s*Reservation Number/i)?.[1] ||
    text.match(/Reservation Number:\s*(\d{4,})/i)?.[1] ||
    null;
  const dates = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
  const villa = text.match(/\b(VILLA[^\n$]{0,40}?5PAX|\bVilla[^\n]{0,40})/i);
  const city = /Santa Teresa/i.test(text) ? "Santa Teresa" : null;
  return {
    hotel_name: "Nantipa",
    confirmation_ref: ref,
    city,
    address: null,
    start_at: dates ? parseUsMonthDayYear(dates[1]) : null,
    end_at: dates ? parseUsMonthDayYear(dates[2]) : null,
    included: [],
    rooms: villa ? [{ room: villa[1].replace(/\s+/g, " ").trim(), guests: null }] : [],
  };
}

export type ParsedTransfer = {
  pickup: string | null;
  dropoff: string | null;
  vehicle: string | null;
  start_at: string | null;
};

export function parseTransferConfirmation(text: string): ParsedTransfer | null {
  if (!/TRANSFER CONFIRMATION/i.test(text) && !/DROPOFF/i.test(text)) return null;
  if (!/Itin[eé]raire/i.test(text)) return null;
  const route = text.match(/Itin[eé]raire\s*:\s*([^\n]+)/i);
  const [pickup, dropoff] = (route?.[1] || "").split(/\s*→\s*|\s*->\s*/);
  const vehicle = text.match(/Type de v[eé]hicule\s*:\s*([^\n]+)/i);
  const date = text.match(/Date\s*:\s*([^\n]+)/i);
  const time = text.match(/Heure de prise en charge\s*:\s*([^\n]+)/i);
  let start: string | null = date ? parseFrEnDate(date[1]) : null;
  const hm = time?.[1]?.match(/(\d{1,2})h(\d{2})/i);
  if (start && hm && !start.includes("T")) {
    start = `${start}T${hm[1].padStart(2, "0")}:${hm[2]}:00`;
  }
  return {
    pickup: pickup?.trim() || null,
    dropoff: dropoff?.trim() || null,
    vehicle: vehicle?.[1]?.trim() || null,
    start_at: start,
  };
}

export function isQuoteDocument(text: string) {
  return (
    /^Devis/im.test(text) ||
    /Passion Collection/i.test(text) ||
    /none are on hold/i.test(text)
  );
}

export function isToucanActivities(text: string) {
  return /TOUCAN DISCOVERY/i.test(text);
}

export function structuredHintFromPdfText(text: string): string {
  const clean = redactIngestText(text);
  const bits: string[] = [];
  const flight = parseAmadeusReceipt(clean);
  if (flight) {
    bits.push(`VOL ${JSON.stringify(flight)}`);
    bits.push(
      "Plusieurs e-tickets du même vol (même n°, même jour) = UN item. IATA 8 chiffres = code agence, pas un PNR. « Scan for check-in » n’est pas un hôtel."
    );
  }
  const hotel = parseLittleEmperorsHotel(clean) || parseNantipaConfirmation(clean);
  if (hotel) bits.push(`HOTEL ${JSON.stringify(hotel)}`);
  const transfer = parseTransferConfirmation(clean);
  if (transfer) bits.push(`TRANSFERT ${JSON.stringify(transfer)}`);
  if (isQuoteDocument(clean)) {
    bits.push("STATUT quote — ne pas extraire les montants NET ni les conditions d’annulation.");
  }
  if (isToucanActivities(clean)) {
    bits.push(
      "Toucan Discovery = activités. Les étapes hôtel du cadre ne sont pas des réservations."
    );
  }
  return bits.join("\n");
}

type ExtractItem = BookingExtract["items"][number];

function flightToItem(flight: ParsedAmadeusFlight): ExtractItem {
  const title =
    [flight.city_from, flight.city_to].filter(Boolean).join(" → ") ||
    flight.flight_number ||
    "Vol";
  return {
    kind: "flight",
    title,
    supplier: flight.supplier,
    confirmation_ref: flight.confirmation_ref,
    start_at: flight.start_at,
    end_at: flight.end_at,
    amount: null,
    details: {
      airline: flight.airline,
      flight_number: flight.flight_number,
      pnr: flight.pnr,
      from: flight.from,
      to: flight.to,
      city_from: flight.city_from,
      city_to: flight.city_to,
      cabin: flight.cabin,
      baggage: flight.baggage,
    },
  };
}

function hotelToItem(hotel: ParsedHotel): ExtractItem {
  return {
    kind: "hotel",
    title: hotel.hotel_name || "Hôtel",
    supplier: null,
    confirmation_ref: hotel.confirmation_ref,
    start_at: hotel.start_at,
    end_at: hotel.end_at,
    amount: null,
    details: {
      hotel_name: hotel.hotel_name,
      city: hotel.city,
      address: hotel.address,
      included: hotel.included,
      rooms: hotel.rooms,
    },
  };
}

function transferToItem(transfer: ParsedTransfer): ExtractItem {
  const title =
    [transfer.pickup, transfer.dropoff].filter(Boolean).join(" → ") || "Transfert";
  return {
    kind: "transfer",
    title,
    supplier: null,
    confirmation_ref: null,
    start_at: transfer.start_at,
    end_at: null,
    amount: null,
    details: {
      pickup: transfer.pickup,
      dropoff: transfer.dropoff,
      vehicle: transfer.vehicle,
    },
  };
}

function preferIata(
  current: unknown,
  parsed: string | null | undefined
): string | null | undefined {
  if (parsed && /^[A-Z]{3}$/.test(parsed)) {
    if (typeof current !== "string" || !/^[A-Z]{3}$/.test(current)) return parsed;
  }
  if (typeof current === "string" && current) return current;
  return parsed ?? null;
}

function overlayItem(target: ExtractItem, incoming: ExtractItem) {
  target.supplier = target.supplier || incoming.supplier;
  target.confirmation_ref = target.confirmation_ref || incoming.confirmation_ref;
  target.start_at = target.start_at || incoming.start_at;
  target.end_at = target.end_at || incoming.end_at;
  if (!target.title || target.title === "Vol" || target.title === "Hôtel") {
    target.title = incoming.title;
  }
  const current = { ...(incoming.details || {}), ...(target.details || {}) };
  current.from = preferIata(current.from, incoming.details?.from);
  current.to = preferIata(current.to, incoming.details?.to);
  if (incoming.details?.flight_number && !current.flight_number) {
    current.flight_number = incoming.details.flight_number;
  }
  if (incoming.details?.airline && !current.airline) {
    current.airline = incoming.details.airline;
  }
  if (incoming.details?.pnr && !current.pnr) current.pnr = incoming.details.pnr;
  if (incoming.details?.city_from && !current.city_from) {
    current.city_from = incoming.details.city_from;
  }
  if (incoming.details?.city_to && !current.city_to) {
    current.city_to = incoming.details.city_to;
  }
  if (incoming.kind === "hotel") {
    const roomsA = Array.isArray(current.rooms) ? current.rooms : [];
    const roomsB = Array.isArray(incoming.details?.rooms) ? incoming.details.rooms : [];
    if (roomsB.length && roomsA.length < roomsB.length) current.rooms = roomsB;
    const includedA = Array.isArray(current.included) ? current.included : [];
    const includedB = Array.isArray(incoming.details?.included) ? incoming.details.included : [];
    current.included = [...new Set([...includedA, ...includedB].filter(Boolean))];
  }
  target.details = current;
}

function upsertHint(items: ExtractItem[], incoming: ExtractItem) {
  const hit = findMatchingItem(items, incoming);
  if (hit) overlayItem(hit, incoming);
  else items.push(incoming);
}

/** Complète / déduplique l’extract LLM avec les parseurs déterministes. */
export function applyStructuredHints(
  extract: BookingExtract,
  texts: string[]
): BookingExtract {
  const items: ExtractItem[] = [...(extract.items || [])];
  const extraNotes: string[] = [];
  let status = extract.document_status;

  for (const raw of texts) {
    const text = redactIngestText(raw);
    const flight = parseAmadeusReceipt(text);
    if (flight) upsertHint(items, flightToItem(flight));
    const hotel = parseLittleEmperorsHotel(text) || parseNantipaConfirmation(text);
    if (hotel) upsertHint(items, hotelToItem(hotel));
    const transfer = parseTransferConfirmation(text);
    if (transfer) upsertHint(items, transferToItem(transfer));
    if (isQuoteDocument(text)) {
      status = status || "quote";
      extraNotes.push("Devis — tarifs non bloqués, à confirmer.");
    }
    if (isToucanActivities(text)) {
      extraNotes.push(
        "Toucan Discovery : activités uniquement ; les étapes du cadre ne sont pas des hôtels."
      );
    }
  }

  const notes = [extract.notes_client, ...extraNotes]
    .map((row) => (row || "").trim())
    .filter(Boolean)
    .filter((row, index, all) => all.indexOf(row) === index)
    .join("\n") || null;

  return {
    ...extract,
    document_status: status,
    notes_client: notes,
    items: mergeExtractItems(items),
  };
}
