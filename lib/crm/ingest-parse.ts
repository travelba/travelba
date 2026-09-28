import { inferAirlineIata } from "./brand-marks";
import { extractHotelEmail, extractHotelPhone, extractHotelWebsite } from "./hotel-contact";
import { redactIngestText } from "./ingest-redact";
import { detectCancellationDocument, type BookingExtract } from "./ingest-types";
import { isPlaceholderTraveler } from "./person-match";
import { findMatchingItem, mergeExtractItems } from "./item-match";

export type ParsedAirport = { iata: string; city: string };

const AIRPORTS: { re: RegExp; iata: string; city: string }[] = [
  { re: /GELABERT|ALBROOK/i, iata: "PAC", city: "Panama" },
  { re: /ISLA COLON|BOCAS DEL TORO/i, iata: "BOC", city: "Bocas del Toro" },
  { re: /ENRIQUE MALEK/i, iata: "DAV", city: "David" },
  { re: /TOCUMEN/i, iata: "PTY", city: "Panama" },
  { re: /CHARLES-DE-GAULLE|CHARLES DE GAULLE/i, iata: "CDG", city: "Paris" },
  { re: /\bORLY\b/i, iata: "ORY", city: "Paris" },
  { re: /JOHN F\.? KENNEDY|KENNEDY INTL/i, iata: "JFK", city: "New York" },
  { re: /LAGUARDIA/i, iata: "LGA", city: "New York" },
  { re: /A[ÉE]ROPORT DE MIAMI|\bMIAMI INTL\b/i, iata: "MIA", city: "Miami" },
  { re: /M[ÉE]NARA/i, iata: "RAK", city: "Marrakech" },
  { re: /TEL AVIV|BEN GOURION|BEN GURION/i, iata: "TLV", city: "Tel Aviv" },
  { re: /A[ÉE]ROPORT DE GEN[ÈE]VE|GEN[ÈE]VE GEN[ÈE]VE/i, iata: "GVA", city: "Genève" },
  { re: /HEATHROW/i, iata: "LHR", city: "Londres" },
  { re: /MARSEILLE PROVENCE/i, iata: "MRS", city: "Marseille" },
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

const CURRENCY_CODE: Record<string, string> = {
  "€": "EUR",
  eur: "EUR",
  $: "USD",
  usd: "USD",
  "£": "GBP",
  gbp: "GBP",
  chf: "CHF",
};

function parsePrintedAmount(raw: string): number | null {
  const compact = raw.replace(/[\s\u00a0]/g, "");
  if (!compact) return null;
  const normalized = /,\d{1,2}$/.test(compact)
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(/,/g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Montant visible sur un PDF/photo (total imprimé). Ignore les lignes NET fournisseur. */
export function parseDocumentMoney(text: string): { amount: number; currency: string } | null {
  const lines = text.split(/\n+/);
  const scored: { amount: number; currency: string; score: number }[] = [];
  const pattern =
    /(?:(total|tarif|montant|fare|amount|prix)[^\n]{0,80}?)?([€$£]|USD|EUR|CHF|GBP)?\s*\b([0-9]{1,3}(?:,[0-9]{3})+\.[0-9]{2}|[0-9]{1,3}(?:[.\s\u00a0][0-9]{3})+[.,][0-9]{2}|[0-9]{2,}[.,][0-9]{2})\s*(USD|EUR|CHF|GBP|€|\$|£)?/gi;

  for (const line of lines) {
    if (/\bNET\b/i.test(line) && !/\btotal\b/i.test(line)) continue;
    if (/total forfaits|total mat[eé]riel|total prestations|total assurances/i.test(line)) {
      continue;
    }
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      const amount = parsePrintedAmount(match[3] || "");
      if (!amount) continue;
      const code = (match[4] || match[2] || "").trim();
      const currency = CURRENCY_CODE[code.toLowerCase()] || CURRENCY_CODE[code] || "EUR";
      const labeled = Boolean(match[1]);
      scored.push({ amount, currency, score: labeled ? 2 : 1 });
    }
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || b.amount - a.amount);
  return { amount: scored[0].amount, currency: scored[0].currency };
}

function withDocumentPrice<T extends { details?: Record<string, unknown> | null }>(
  item: T,
  money: { amount: number; currency: string } | null
): T {
  if (!money) return item;
  return {
    ...item,
    details: {
      ...(item.details || {}),
      document_amount: money.amount,
      document_currency: money.currency,
    },
  };
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

/** `10 August 2026`, `18 août 2026`, `Pickup on 18 Septembre 2026 at 16:00`, ou `03 August 09:45` + année. */
export function parseFrEnDate(chunk: string, yearHint?: string | null): string | null {
  const named = chunk.match(/(\d{1,2})\s+([A-Za-zàâéèêëïîôùûüç.]+)\s+(20\d{2})/i);
  if (named) {
    const mm = monthNum(named[2]);
    if (!mm) return null;
    const day = named[1].padStart(2, "0");
    const iso = `${named[3]}-${mm}-${day}`;
    const rest = chunk.slice((named.index || 0) + named[0].length);
    const time = rest.match(/^(?:\s+(?:at|à))?\s*(\d{1,2})[h:](\d{2})/i);
    return time ? `${iso}T${time[1].padStart(2, "0")}:${time[2]}:00` : iso;
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

/** Confirmation Leela : `14-SEP-26`. */
export function parseDdMonYy(chunk: string): string | null {
  const m = chunk.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2})\b/);
  if (!m) return null;
  const mm = monthNum(m[2]);
  if (!mm) return null;
  const yy = Number(m[3]);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return `${year}-${mm}-${m[1].padStart(2, "0")}`;
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
  terminal: string | null;
  seat: string | null;
};

function pieceCountPhrase(count: number) {
  if (count <= 0) return "Aucun bagage en soute inclus";
  if (count === 1) return "1 pièce en soute";
  return `${count} pièces en soute`;
}

function eurLabel(raw: string) {
  const value = Number(raw.replace(/\s/g, "").replace(/EUR/i, "").replace(",", "."));
  if (!Number.isFinite(value)) return raw.trim();
  if (Number.isInteger(value)) return `${value} €`;
  return `${value.toFixed(2).replace(".", ",")} €`;
}

/** Poids de la pièce principale. Les lignes « OR » (golf, ski, média) ne remplacent pas la valise. */
function pieceKilos(chunk: string) {
  const checked = chunk.match(/CHECKED BAG\s+1PC OF\s+(\d+)\s*KG/i);
  if (checked) return Number(checked[1]);
  const head = chunk.split(/\bOR\b/i)[0] || "";
  const upto = head.match(/UPTO\d+\s*LB\s+(\d+)\s*KG/i);
  return upto ? Number(upto[1]) : null;
}

type BaggagePiece = { kg: number | null; free: boolean; amount: string | null };

function formatBaggagePolicy(
  pieces: BaggagePiece[],
  cabin: { count: number; kg: number | null } | null
) {
  const parts: string[] = [];
  const free = pieces.filter((piece) => piece.free);
  const paid = pieces.filter((piece) => !piece.free);
  if (free.length) {
    const kg = free.every((piece) => piece.kg && piece.kg === free[0].kg) ? free[0].kg : null;
    const noun = free.length > 1 ? "bagages en soute" : "bagage en soute";
    parts.push(kg ? `${free.length} ${noun} ${kg} kg inclus` : `${free.length} ${noun} inclus`);
  }
  paid.forEach((piece, index) => {
    const n = free.length + index + 1;
    const rank = n === 1 ? "1er" : `${n}e`;
    const weight = piece.kg ? `${piece.kg} kg ` : "";
    const price = piece.amount ? eurLabel(piece.amount) : "";
    parts.push(`${rank} en soute ${weight}${price}`.replace(/\s+/g, " ").trim());
  });
  if (cabin) {
    const noun = cabin.count > 1 ? "bagages cabine" : "bagage cabine";
    parts.push(cabin.kg ? `${cabin.count} ${noun} ${cabin.kg} kg` : `${cabin.count} ${noun}`);
  }
  if (!parts.length) return null;
  return `${parts.join(" · ")} par personne`;
}

/** Franchise par segment (CDGJFK, LGAMIA…) lue dans POLITIQUE BAGAGE, pas le code « 2PC ». */
export function amadeusBaggageByRoute(text: string) {
  const flat = text.replace(/\s+/g, " ");
  const out = new Map<string, string>();
  const policyAt = flat.search(/POLITIQUE BAGAGE/i);
  if (policyAt < 0) return out;
  const cabinAt = flat.search(/Bagage cabine\s*:/i);
  const legendAt = flat.search(/LB = Poids/i);
  const checked = flat.slice(policyAt, cabinAt > policyAt ? cabinAt : policyAt + 4000);
  const cabinText =
    cabinAt >= 0 ? flat.slice(cabinAt, legendAt > cabinAt ? legendAt : cabinAt + 1200) : "";
  const marks = [...checked.matchAll(/\b([A-Z]{6})\s+(?=CHECKED BAG|UPTO)/g)];
  marks.forEach((mark, index) => {
    const route = mark[1];
    const from = (mark.index || 0) + mark[0].length;
    const to = marks[index + 1]?.index ?? checked.length;
    const block = checked.slice(from, to);
    const pieces: BaggagePiece[] = [];
    const re = /(1er|2e|2ème|2eme|3e|3ème)\s+enregistré\s+(Sans frais|\d+[.,]\d{2}\s*EUR)/gi;
    let last = 0;
    for (const found of block.matchAll(re)) {
      const chunk = block.slice(last, found.index || 0);
      const free = /sans frais/i.test(found[2]);
      pieces.push({
        kg: pieceKilos(chunk),
        free,
        amount: free ? null : found[2],
      });
      last = (found.index || 0) + found[0].length;
    }
    const cabin = cabinText.match(
      new RegExp(
        `${route}\\s*:\\s*MAX\\s+(\\d+)\\s*PC\\s+Sans frais\\s+CARRY(?:\\s+ON)?(?:\\s+(\\d+)\\s*KG)?`,
        "i"
      )
    );
    const phrase = formatBaggagePolicy(
      pieces,
      cabin ? { count: Number(cabin[1]), kg: cabin[2] ? Number(cabin[2]) : null } : null
    );
    if (phrase) out.set(route, phrase);
  });
  return out;
}

function parseAmadeusSegment(
  block: string,
  gds: string,
  companyPnr: string | null,
  issuer: string | null,
  yearHint: string | null,
  operated: RegExpMatchArray
): ParsedAmadeusFlight {
  const year = itineraryYear(block) || yearHint;
  const clock = /(\d{1,2}\s+[A-Za-zàâéèêëïîôùûüç.]+\s+\d{1,2}:\d{2})/i;
  const dep = block.match(new RegExp(clock.source + "([\\s\\S]{0,160}?)D[eé]part", "i"));
  const afterDep = dep?.index != null ? block.slice(dep.index + dep[0].length) : block;
  const arr = afterDep.match(
    new RegExp(clock.source + "([\\s\\S]{0,160}?)Arriv[eé]e", "i")
  );
  const cabin = block.match(/([A-Za-z]+) \(([A-Z])\)\s*Classe/i);
  const bags = block.match(/Bagages autoris[eé]s\s+(\d+)\s*PC/i);
  const terminal = (dep?.[2] || "").match(/Terminal\s*:\s*([A-Z0-9]+)/i);
  const seat = block.match(/Si[eè]ge\s+(\d{1,2}[A-Z])\b/i);
  const depText = `${dep?.[1] || ""} ${dep?.[2] || ""}`;
  const arrText = `${arr?.[1] || ""} ${arr?.[2] || ""}`;
  const fromApt = inferAirportIata(depText);
  const toApt = inferAirportIata(arrText);
  const operating = operated[4]?.trim() || null;
  const marketing = operated[1]?.trim() || null;
  return {
    confirmation_ref: gds,
    pnr: companyPnr,
    supplier: (issuer || marketing || "").replace(/\s+/g, " ").trim() || null,
    airline: operating,
    flight_number: `${operated[2]} ${operated[3]}`,
    from: fromApt?.iata || null,
    to: toApt?.iata || null,
    city_from: fromApt?.city || null,
    city_to: toApt?.city || null,
    start_at: parseFrEnDate(dep?.[1] || depText, year),
    end_at: parseFrEnDate(arr?.[1] || arrText, year),
    cabin: cabin ? `${cabin[1]} (${cabin[2]})` : null,
    baggage: bags ? pieceCountPhrase(Number(bags[1])) : null,
    terminal: terminal?.[1] || null,
    seat: seat?.[1] || null,
  };
}

/** Tous les segments d’un e-ticket (aller + retour dans le même PDF). */
export function parseAmadeusFlights(text: string): ParsedAmadeusFlight[] {
  if (!/Reçu de Billet Electronique/i.test(text)) return [];
  const gds = text.match(
    /R[eé]f[eé]rence du dossier(?!\s+compagnie)\s+([A-Z0-9]{6})\b/i
  );
  if (!gds) return [];
  const company = text.match(
    /R[eé]f[eé]rence du dossier compagnie\s+([A-Z0-9]{2})\/([A-Z0-9]{5,6})/i
  );
  const issuer = text.match(/Compagnie [eé]mettrice\s*:\s*([A-Z][A-Z ]+)/i);
  const opRe =
    /([A-Z][A-Za-z0-9 .]+?)\s+([A-Z0-9]{1,3})\s+(\d{1,4})\s+\(Op[eé]r[eé] Par\s+([^,]+),/gi;
  const ops = [...text.matchAll(opRe)];
  if (!ops.length) return [];
  const companyAt = text.search(/R[eé]f[eé]rence du dossier compagnie/i);
  const yearHint = itineraryYear(text);
  const policies = amadeusBaggageByRoute(text);
  const onlyPolicy = policies.size === 1 ? [...policies.values()][0] : null;
  return ops.map((op, i) => {
    const from = Math.max(0, (op.index || 0) - 120);
    const next = ops[i + 1]?.index;
    const to =
      next != null
        ? next
        : companyAt > (op.index || 0)
          ? companyAt
          : (op.index || 0) + 900;
    const flight = parseAmadeusSegment(
      text.slice(from, to),
      gds[1].toUpperCase(),
      company?.[2]?.toUpperCase() || null,
      issuer?.[1]?.trim() || null,
      yearHint,
      op
    );
    const route = flight.from && flight.to ? `${flight.from}${flight.to}` : "";
    flight.baggage = (route && policies.get(route)) || onlyPolicy || flight.baggage;
    return flight;
  });
}

export function parseAmadeusReceipt(text: string): ParsedAmadeusFlight | null {
  return parseAmadeusFlights(text)[0] || null;
}

function titleCasePerson(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-zà-ÿ])/g, (_match, sep: string, ch: string) => sep + ch.toUpperCase());
}

function splitPersonName(raw: string) {
  const parts = titleCasePerson(raw).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts[parts.length - 1],
  };
}

function parseDmyClock(date: string, time: string) {
  const day = date.match(/^(\d{2})-(\d{2})-(20\d{2})$/);
  const clock = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!day || !clock) return null;
  return `${day[3]}-${day[2]}-${day[1]}T${clock[1].padStart(2, "0")}:${clock[2]}:00`;
}

export type ParsedTransavia = {
  confirmation_ref: string;
  flights: ParsedAmadeusFlight[];
  travelers: { first_name: string; last_name: string }[];
  title: string | null;
  destination: string | null;
};

/** Confirmation Transavia : vols aller/retour + passagers imprimés, une fois chacun. */
export function parseTransaviaConfirmation(text: string): ParsedTransavia | null {
  if (!/transavia/i.test(text) || !/num[eé]ro de r[eé]servation/i.test(text)) return null;
  const ref = text.match(/Num[eé]ro de r[eé]servation\s+([A-Z0-9]{5,6})\b/i);
  if (!ref) return null;
  const confirmation_ref = ref[1].toUpperCase();
  const flightRe =
    /Num[eé]ro de vol\s+([A-Z0-9]{2})\s*(\d{2,4})\s+Date\s+(\d{2}-\d{2}-20\d{2})\s+Heure de d[eé]part\s+(\d{1,2}:\d{2})\s+Heure d['’]arriv[eé]e\s+(\d{1,2}:\d{2})/gi;
  const specs = [...text.matchAll(flightRe)];
  if (!specs.length) return null;
  const routes = [...text.matchAll(/Vol\s+[A-Za-zÀ-ÿ]+\s*:\s*([^\n]+?)\s[-–]\s*([^\n]+)/gi)].map(
    (match) => ({
      from: match[1].replace(/\s+/g, " ").trim(),
      to: match[2].replace(/\s+/g, " ").trim(),
    })
  );
  const baggage =
    /bagage à main/i.test(text) && /40\s*x\s*30\s*x\s*20/i.test(text)
      ? "1 bagage à main 40 × 30 × 20 cm"
      : null;
  const cabin = /tarif\s+Basic/i.test(text) ? "Basic" : null;
  const flights: ParsedAmadeusFlight[] = specs.map((spec, index) => {
    const route =
      routes[index] ||
      (index > 0 && routes[0] ? { from: routes[0].to, to: routes[0].from } : null);
    const fromApt = route ? inferAirportIata(route.from) : null;
    const toApt = route ? inferAirportIata(route.to) : null;
    return {
      confirmation_ref,
      pnr: confirmation_ref,
      supplier: "Transavia",
      airline: "Transavia",
      flight_number: `${spec[1].toUpperCase()} ${spec[2]}`,
      from: fromApt?.iata || null,
      to: toApt?.iata || null,
      city_from: fromApt?.city || route?.from || null,
      city_to: toApt?.city || route?.to || null,
      start_at: parseDmyClock(spec[3], spec[4]),
      end_at: parseDmyClock(spec[3], spec[5]),
      cabin,
      baggage,
      terminal: null,
      seat: null,
    };
  });
  const travelers: ParsedTransavia["travelers"] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(
    /\b(?:MR|MRS|MS|MISS|CHD|INF|MSTR)\s*\.\s*([A-Z][A-Z'’ -]{2,}?)\s*\(\s*\d{2}\/\d{2}\/\d{4}\s*\)/gi
  )) {
    const person = splitPersonName(match[1]);
    if (!person) continue;
    const key = `${person.first_name}|${person.last_name}`.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    travelers.push(person);
  }
  const destination =
    flights.map((flight) => flight.city_to).find((city) => city && !/^paris$/i.test(city)) ||
    flights[0]?.city_to ||
    null;
  return {
    confirmation_ref,
    flights,
    travelers,
    title: destination,
    destination,
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
  needs_review?: boolean;
  supplier?: string | null;
  occupancy?: string | null;
  board?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  source_family?: string | null;
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
    website: extractHotelWebsite(text),
    phone: null,
    email: null,
    source_family: "little_emperors",
  };
}

/** « Booking name » puis le nom, une ligne. Pas un libellé de chambre. */
export function parseLittleEmperorsGuests(text: string): BookingExtract["travelers"] {
  const travelers: BookingExtract["travelers"] = [];
  const seen = new Set<string>();
  const re = /Booking name\s*\n+\s*([^\n]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const raw = match[1].replace(/\s+/g, " ").trim();
    if (!raw || /^(adults?|guest room|check )/i.test(raw)) continue;
    const person = splitPersonName(raw);
    if (!person) continue;
    if (isPlaceholderTraveler(person.first_name, person.last_name)) continue;
    const key = `${person.first_name}|${person.last_name}`.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    travelers.push(person);
  }
  return travelers;
}

const STAY_LABEL =
  /^(n[°ºo]?\s*de voyage|itinerary(?:\s*(?:number|#|id))?|voyageurs?|guest(?:\s*names?)?|travell?ers?|h[oô]tel|hotel|property|h[eé]bergement|adresse|address|ville|city|arriv[eé]e|check[- ]?in|d[eé]part|check[- ]?out|chambre|room(?:\s*type)?|prix total|montant total|total|politique d['’]annulation|cancellation policy|conditions d['’]annulation|inclus|inclusions?)\s*[:：]?\s*(.*)$/i;

function stayLabelKey(label: string) {
  const key = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (/^n/.test(key) && /voyage|itinerary/.test(key)) return "ref";
  if (/^voyageur|^guest|^travell?er/.test(key)) return "guest";
  if (/hotel|hebergement|property/.test(key)) return "hotel";
  if (/adresse|address/.test(key)) return "address";
  if (/^ville|^city/.test(key)) return "city";
  if (/arrivee|check-?in/.test(key)) return "in";
  if (/depart|check-?out/.test(key)) return "out";
  if (/chambre|room/.test(key)) return "room";
  if (/prix|montant|^total/.test(key)) return "total";
  if (/annulation|cancellation|conditions/.test(key)) return "cancel";
  if (/inclus/.test(key)) return "included";
  return "";
}

function isGuestCountLine(value: string) {
  return /^\d+\s+(adultes?|adults?|guests?|voyageurs?|personnes?|children|enfants?|pax)\b/i.test(
    value.trim()
  );
}

function parseLooseStayDate(chunk: string): string | null {
  const fr = parseFrEnDate(chunk);
  if (fr) return fr.slice(0, 10);
  const us = chunk.match(/([A-Za-z.]+)\s+(\d{1,2}),?\s+(20\d{2})/);
  if (!us) return null;
  const mm = monthNum(us[1]);
  if (!mm) return null;
  return `${us[3]}-${mm}-${us[2].padStart(2, "0")}`;
}

type StayBlocks = Record<string, string[]>;

function readStayBlocks(text: string): StayBlocks {
  const blocks: StayBlocks = {};
  let current = "";
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    const labeled = trimmed.match(STAY_LABEL);
    if (labeled) {
      current = stayLabelKey(labeled[1]);
      const rest = (labeled[2] || "").trim();
      if (current && rest) {
        blocks[current] = blocks[current] || [];
        blocks[current].push(rest);
      }
      continue;
    }
    if (!current || !trimmed) {
      if (!trimmed) current = "";
      continue;
    }
    blocks[current] = blocks[current] || [];
    blocks[current].push(trimmed);
  }
  return blocks;
}

function firstBlock(blocks: StayBlocks, key: string) {
  return (blocks[key] || []).map((line) => line.trim()).find(Boolean) || null;
}

/** Confirmation Expedia TAAP : seulement les champs imprimés. */
export function parseExpediaTaap(text: string): {
  hotel: ParsedHotel;
  travelers: BookingExtract["travelers"];
  printed_cancellation: string | null;
  amount: number | null;
  currency: string | null;
} | null {
  if (!/(\btaap\b|\bexpedia\b)/i.test(text)) return null;
  if (/Reservation Details/i.test(text) && /Booking Reference/i.test(text)) return null;
  const blocks = readStayBlocks(text);
  const ref =
    (blocks.ref || []).join(" ").match(/\d{6,}/)?.[0] ||
    text.match(/n[°ºo]?\s*de voyage[^\d]{0,20}(\d{6,})/i)?.[1] ||
    null;
  const guestLines = (blocks.guest || []).filter(
    (line) => !isGuestCountLine(line) && !/[0-9:：]/.test(line) && line.length <= 80
  );
  const travelers: BookingExtract["travelers"] = [];
  const seen = new Set<string>();
  for (const line of guestLines) {
    const person = splitPersonName(line.replace(/\s+/g, " "));
    if (!person || isPlaceholderTraveler(person.first_name, person.last_name)) continue;
    const key = `${person.first_name}|${person.last_name}`.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    travelers.push(person);
  }
  const hotel_name = firstBlock(blocks, "hotel");
  const start_at = parseLooseStayDate((blocks.in || []).join(" "));
  const end_at = parseLooseStayDate((blocks.out || []).join(" "));
  if (!ref && !hotel_name && !travelers.length) return null;
  const room = firstBlock(blocks, "room");
  const guests =
    (blocks.room || []).find((line) => isGuestCountLine(line)) ||
    (blocks.guest || []).find((line) => isGuestCountLine(line)) ||
    text.match(/\b(\d+\s+adultes?)\b/i)?.[1] ||
    null;
  const totalLine = (blocks.total || []).join(" ");
  const money = totalLine ? parseDocumentMoney(totalLine) : null;
  const included = (blocks.included || [])
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter((line) => line && !isGuestCountLine(line))
    .slice(0, 8);
  const printed_cancellation = (blocks.cancel || []).join(" ").replace(/\s+/g, " ").trim().slice(0, 400) || null;
  return {
    hotel: {
      hotel_name,
      confirmation_ref: ref,
      city: firstBlock(blocks, "city"),
      address: (blocks.address || []).join(", ") || null,
      start_at,
      end_at,
      included,
      rooms: room || guests ? [{ room, guests }] : [],
      supplier: "Expedia TAAP",
      occupancy: guests,
      source_family: "expedia_taap",
    },
    travelers,
    printed_cancellation,
    amount: money?.amount ?? null,
    currency: money?.currency ?? null,
  };
}

export const SUPPLIER_CANCELLATION_NOTE =
  "Annulation fournisseur — à rattacher au dossier existant, sans créer de voyage.";

/** Le nom imprimé du voyageur devient le titulaire si le mail ne l’a pas recopié. */
export function applyPrintedGuestNames(extract: BookingExtract): BookingExtract {
  const first = (extract.customer_first_name || "").trim();
  const last = (extract.customer_last_name || "").trim();
  if (first && last) return extract;
  const person = (extract.travelers || []).find(
    (row) =>
      (row.first_name || "").trim() &&
      (row.last_name || "").trim() &&
      !isPlaceholderTraveler(row.first_name, row.last_name)
  );
  if (!person) return extract;
  return {
    ...extract,
    customer_first_name: first || person.first_name,
    customer_last_name: last || person.last_name,
  };
}

function dayOf(value: string | null | undefined) {
  const day = (value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

/** Dates et ville du séjour, seulement si un item les porte déjà. */
export function fillStayFromItems(extract: BookingExtract): BookingExtract {
  const items = extract.items || [];
  const starts = items.map((item) => dayOf(item.start_at)).filter(Boolean).sort();
  const ends = items
    .map((item) => dayOf(item.end_at) || dayOf(item.start_at))
    .filter(Boolean)
    .sort();
  const hotel = items.find((item) => item.kind === "hotel");
  const city = typeof hotel?.details?.city === "string" ? hotel.details.city.trim() : "";
  const hotelName =
    typeof hotel?.details?.hotel_name === "string" ? hotel.details.hotel_name.trim() : "";
  return {
    ...extract,
    start_date: (extract.start_date || "").trim() || starts[0] || extract.start_date,
    end_date: (extract.end_date || "").trim() || ends[ends.length - 1] || extract.end_date,
    destination: (extract.destination || "").trim() || city || extract.destination,
    title: (extract.title || "").trim() || hotelName || city || extract.title,
  };
}

/**
 * Une confirmation classée annulée seulement à cause de la note automatique
 * (politique d’annulation dans le mail) redevient une confirmation.
 */
export function reopenFalseSupplierCancellation(
  extract: BookingExtract,
  subject: string
): BookingExtract {
  const stamped = applyPrintedGuestNames(extract);
  const notes = (stamped.notes_client || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const onlyAutoNote = notes.length > 0 && notes.every((line) => line === SUPPLIER_CANCELLATION_NOTE);
  const confirmation = CONFIRMATION_SUBJECT.test(subject || "");
  if (
    stamped.document_status === "cancelled" &&
    onlyAutoNote &&
    confirmation &&
    !detectCancellationDocument(subject || "")
  ) {
    return { ...stamped, document_status: "confirmed", notes_client: null };
  }
  return stamped;
}

const CONFIRMATION_SUBJECT =
  /confirmation de voyage|booking confirmation|reservation confirmation/i;

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
    website: extractHotelWebsite(text),
    phone: extractHotelPhone(text),
    email: extractHotelEmail(text),
  };
}

/** The Leela / confirmation anglaise `14-SEP-26`. Pas les 14:00/12:00 de politique. */
export function parseHotelConfirmationLetter(text: string): ParsedHotel | null {
  if (parseLittleEmperorsHotel(text) || parseNantipaConfirmation(text)) return null;
  if (!/RESERVATION CONFIRMATION/i.test(text) && !/Reservation Status/i.test(text)) {
    return null;
  }
  const checkIn = text.match(/Check In\s+(\d{1,2}-[A-Z]{3}-\d{2})/i);
  const checkOut = text.match(/Check Out\s+(\d{1,2}-[A-Z]{3}-\d{2})/i);
  if (!checkIn) return null;
  const ref =
    text.match(/Reservation Number\s+(\d{5,})/i)?.[1] ||
    text.match(/CRS Reference Number\s+(\d{5,})/i)?.[1] ||
    null;
  const hotel_name =
    text.match(/The Leela [A-Za-z]+/i)?.[0]?.trim() ||
    text.match(/stay at ([^\n.]+)/i)?.[1]?.trim() ||
    null;
  const room = text.match(/Room Type\s+([^\n]+)/i);
  const adults = text.match(/Adults Per Room\s+(\d+)/i);
  const address = text.match(
    /((?:Sahar|[A-Z][a-z]+,)[^.\n]*Mumbai[^.\n]*)/i
  );
  const city = /Mumbai/i.test(text) ? "Mumbai" : null;
  return {
    hotel_name,
    confirmation_ref: ref,
    city,
    address: address?.[1]?.replace(/\s+/g, " ").trim() || null,
    start_at: parseDdMonYy(checkIn[1]),
    end_at: checkOut ? parseDdMonYy(checkOut[1]) : null,
    included: [],
    rooms: [
      {
        room: room?.[1]?.trim() || null,
        guests: adults ? `${adults[1]} adulte${adults[1] === "1" ? "" : "s"}` : null,
      },
    ],
    needs_review: /TENTATIVE/i.test(text),
    website: extractHotelWebsite(text),
    phone: extractHotelPhone(text),
    email: extractHotelEmail(text),
  };
}

export type ParsedCar = {
  confirmation_ref: string | null;
  supplier: string;
  vehicle: string | null;
  pickup: string | null;
  dropoff: string | null;
  start_at: string | null;
  end_at: string | null;
};

function joinLocation(block: string) {
  return block
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

export function parseSixtCar(text: string): ParsedCar | null {
  if (!/\bSIXT\b/i.test(text)) return null;
  const pickupOn = text.match(/Pickup on\s+([^\n]+)/i);
  const returnOn = text.match(/Return on\s+([^\n]+)/i);
  if (!pickupOn) return null;
  const pickupLoc = text.match(
    /Pickup on[^\n]+\n([\s\S]{0,160}?)(?:Voir l[’']itin[eé]raire|See map|Return on)/i
  );
  const dropLoc = text.match(
    /Return on[^\n]+\n([\s\S]{0,160}?)(?:See map|Afficher|Ajoutez|Ce que vous)/i
  );
  const category = text.match(/cat[eé]gorie r[eé]serv[eé]e est\s+([^\n]+)/i);
  const model = text.match(/cat[eé]gorie r[eé]serv[eé]e est[^\n]+\n([^\n]+ou similaire)/i);
  const vehicle = [category?.[1], model?.[1]]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" · ");
  const ref =
    text.match(/Num[eé]ro de r[eé]servation\s*:\s*(\d{8,})/i)?.[1] ||
    text.match(/confirm[eé]e\s*:\s*#(\d{8,})/i)?.[1] ||
    null;
  return {
    confirmation_ref: ref,
    supplier: "SIXT",
    vehicle: vehicle || null,
    pickup: pickupLoc ? joinLocation(pickupLoc[1]) : null,
    dropoff: dropLoc ? joinLocation(dropLoc[1]) : null,
    start_at: parseFrEnDate(pickupOn[1]),
    end_at: returnOn ? parseFrEnDate(returnOn[1]) : null,
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

export function isMaevaStay(text: string) {
  if (!/maeva\.com/i.test(text)) return false;
  return (
    /N[°ºo]?\s*DE DOSSIER/i.test(text) ||
    /VOS OPTIONS/i.test(text) ||
    /Forfaits Remont[ée]es M[ée]caniques/i.test(text) ||
    /Pierre\s*&\s*Vacances/i.test(text)
  );
}

const MAEVA_MONEY = /([0-9]{1,3}(?:[\s\u00a0.][0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2})\s*€/;

function tidyMaevaLabel(label: string) {
  return label
    .replace(/\(Forfaits?\s+\d+\s+[Jj]ours cons[eé]cutifs\)/gi, "")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMaevaDateOnly(chunk: string, yearHint?: string | null): string | null {
  const full = parseFrEnDate(chunk, yearHint);
  if (full) return full.slice(0, 10);
  const named = chunk.match(/(\d{1,2})\s+([A-Za-zàâéèêëïîôùûüç.]+)/i);
  if (!named || !yearHint) return null;
  const mm = monthNum(named[2]);
  if (!mm) return null;
  return `${yearHint}-${mm}-${named[1].padStart(2, "0")}`;
}

function isMaevaNoise(line: string) {
  return /cagnotte|r[eé]seaux sociaux|instagram|bon d['’][eé]change|compte voyageur|je t[eé]l[eé]charge|suivez-nous|vacances d['’][eé]t[eé]|#maeva|je fonce|c['’]est parti|modifier ma r[eé]servation|annuler ma r[eé]servation/i.test(
    line
  );
}

function maevaIncludedLine(label: string, qty: number) {
  const clean = tidyMaevaLabel(label);
  const adulte = clean.match(/Adulte de (\d+)\s+[àa]\s+(\d+)/i);
  if (adulte) return `${qty} × Adulte ${adulte[1]}–${adulte[2]} ans`;
  const enfant = clean.match(/Enfant de (\d+)\s+[àa]\s+(\d+)/i);
  if (enfant) return `${qty} × Enfant ${enfant[1]}–${enfant[2]} ans`;
  if (/casque enfant/i.test(clean)) return `${qty} × Casque enfant`;
  if (/cours collectifs/i.test(clean) || /ski journ[eé]e/i.test(clean)) {
    return `${qty} × Cours collectifs journée`;
  }
  return `${qty} × ${clean}`;
}

function parseMaevaOptionRows(block: string) {
  const raw = block
    .split(/\n/)
    .map((line) => line.replace(/[\t\u00a0]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const rows: { label: string; qty: number; amount: number }[] = [];
  let i = 0;
  while (i < raw.length) {
    if (isMaevaNoise(raw[i])) {
      i += 1;
      continue;
    }
    let end = i;
    let joined = raw[i];
    while (end < raw.length && !MAEVA_MONEY.test(joined)) {
      end += 1;
      if (end - i > 3 || end >= raw.length) break;
      if (isMaevaNoise(raw[end])) break;
      joined = `${joined} ${raw[end]}`;
    }
    if (!MAEVA_MONEY.test(joined)) {
      i += 1;
      continue;
    }
    const withQty = joined.match(
      new RegExp(String.raw`^(.*?)\s+(\d+)\s+${MAEVA_MONEY.source}\s*$`, "i")
    );
    const withoutQty = joined.match(
      new RegExp(String.raw`^(.*?)\s+${MAEVA_MONEY.source}\s*$`, "i")
    );
    const label = (withQty?.[1] || withoutQty?.[1] || "").replace(/\s+/g, " ").trim();
    const amount = parsePrintedAmount(withQty?.[3] || withoutQty?.[2] || "");
    const qty = withQty ? Number(withQty[2]) : 1;
    if (label && amount) rows.push({ label, qty: Number.isFinite(qty) ? qty : 1, amount });
    i = MAEVA_MONEY.test(raw[i]) ? i + 1 : end + 1;
  }
  return rows;
}

export type ParsedMaevaExtra = {
  kind: "activity" | "insurance";
  title: string;
  start_at: string | null;
  end_at: string | null;
  duration: string | null;
  included: string[];
  city: string | null;
};

export type ParsedMaevaStay = {
  hotel: ParsedHotel;
  extras: ParsedMaevaExtra[];
  destination: string | null;
  confirmed: boolean;
};

function parseMaevaHotelName(text: string): string | null {
  const skipNext =
    /^(arriv[eé]e|retour|d[eé]part|avoriaz|appartement|r[eé]sidences de prestige|n[°ºo]|votre|maeva)/i;
  const oneLine = text.match(
    /R[ée]sidence\s+Pierre\s*&\s*Vacances(?:\s+Premium)?\s+L['’]Amara(?:\s*\*{2,})?/i
  );
  if (oneLine) {
    return oneLine[0].replace(/\s*\*{2,}/g, "").replace(/\s+/g, " ").trim();
  }
  const head = text.match(/((?:R[ée]sidence(?:s)?\s+)?Pierre\s*&\s*Vacances[^\n]*)/i);
  if (!head || head.index == null) return null;
  let name = head[1].replace(/\s*\*{2,}/g, "").replace(/\s+/g, " ").trim();
  const after = text.slice(head.index + head[0].length);
  const next = after.match(/^\s*\n\s*([^\n]+)/);
  const nextLine = (next?.[1] || "").replace(/\s*\*{2,}/g, "").trim();
  if (nextLine && !skipNext.test(nextLine) && nextLine.length < 80) {
    name = `${name} ${nextLine}`.replace(/\s+/g, " ").trim();
  }
  return name || null;
}

function parseMaevaExtras(
  text: string,
  startAt: string | null,
  endAt: string | null,
  city: string | null
): ParsedMaevaExtra[] {
  const section = text.split(/VOS OPTIONS/i)[1] || "";
  const totalAt = section.search(/\n\s*TOTAL\s+[0-9]/i);
  const block = totalAt >= 0 ? section.slice(0, totalAt) : section;
  const rows = parseMaevaOptionRows(block);
  type Group = ParsedMaevaExtra & { key: "forfaits" | "gear" | "lessons" | "insurance" };
  const groups: Group[] = [];
  let current: Group | null = null;

  function ensure(key: Group["key"], title: string, kind: Group["kind"]): Group {
    const hit = groups.find((row) => row.key === key);
    if (hit) return hit;
    const created: Group = {
      key,
      kind,
      title,
      start_at: startAt,
      end_at: endAt,
      duration: null,
      included: [],
      city,
    };
    groups.push(created);
    return created;
  }

  for (const row of rows) {
    if (row.amount <= 0) {
      current = null;
      continue;
    }
    if (/frais de dossier/i.test(row.label)) continue;
    if (
      /^TOTAL$/i.test(row.label) ||
      /^D[ée]j[àa] r[ée]gl[ée]/i.test(row.label) ||
      /^Reste [àa] r[ée]gler/i.test(row.label)
    ) {
      break;
    }
    const durationHit = row.label.match(/(\d+)\s*[Jj]ours cons[eé]cutifs/i);
    const duration = durationHit ? `${durationHit[1]} jours consécutifs` : null;

    if (/^Total\s+Forfaits/i.test(row.label) || /remont[eé]es m[eé]caniques/i.test(row.label)) {
      current = ensure("forfaits", "Forfaits Remontées Mécaniques", "activity");
      if (duration) current.duration = current.duration || duration;
      continue;
    }
    if (/^Total\s+Mat[eé]riel/i.test(row.label) || /mat[eé]riel de glisse/i.test(row.label)) {
      current = ensure("gear", "Location matériel de ski", "activity");
      continue;
    }
    if (/^Total\s+/i.test(row.label)) {
      current = null;
      continue;
    }
    if (/casque/i.test(row.label)) {
      const gear = ensure("gear", "Location matériel de ski", "activity");
      gear.included.push(maevaIncludedLine(row.label, row.qty));
      continue;
    }
    if (/assurance/i.test(row.label)) {
      const ins = ensure("insurance", tidyMaevaLabel(row.label) || "Assurance", "insurance");
      if (!ins.included.length) ins.title = tidyMaevaLabel(row.label) || ins.title;
      continue;
    }
    if (/cours collectifs/i.test(row.label) || /ski journ[eé]e/i.test(row.label)) {
      const lessons = ensure("lessons", "Cours collectifs journée", "activity");
      lessons.included.push(maevaIncludedLine(row.label, row.qty));
      current = lessons;
      continue;
    }
    if (/forfait/i.test(row.label) || /portes du soleil/i.test(row.label)) {
      const forfaits = ensure("forfaits", "Forfaits Les Portes du Soleil", "activity");
      if (/portes du soleil/i.test(row.label)) {
        forfaits.title = "Forfaits Les Portes du Soleil";
      }
      if (duration) forfaits.duration = forfaits.duration || duration;
      forfaits.included.push(maevaIncludedLine(row.label, row.qty));
      current = forfaits;
      continue;
    }
    if (current) {
      current.included.push(maevaIncludedLine(row.label, row.qty));
    }
  }

  return groups.filter((group) => group.kind === "insurance" || group.included.length);
}

export function parseMaevaStay(text: string): ParsedMaevaStay | null {
  if (!isMaevaStay(text)) return null;
  const year =
    text.match(/arriv[eé]e le\s*:\s*\d{1,2}\s+[A-Za-zàâéèêëïîôùûüç.]+\s+(20\d{2})/i)?.[1] ||
    text.match(/\b(20\d{2})\b/)?.[1] ||
    null;
  const arrival =
    text.match(/arriv[eé]e le\s*:?\s*(\d{1,2}\s+[A-Za-zàâéèêëïîôùûüç.]+(?:\s+20\d{2})?)/i)?.[1] ||
    "";
  const departure =
    text.match(
      /(?:d[eé]part|retour) le\s*:?\s*(\d{1,2}\s+[A-Za-zàâéèêëïîôùûüç.]+(?:\s+20\d{2})?)/i
    )?.[1] || "";
  const start_at = parseMaevaDateOnly(arrival, year);
  const end_at = parseMaevaDateOnly(departure, year);
  const destination =
    text.match(/Votre r[eé]servation [àa]\s+([A-Za-zàâéèêëïîôùûüç -]+?)\s+est/i)?.[1]?.trim() ||
    text.match(/^([A-Za-zàâéèêëïîôùûüç -]+)\s+-\s+Haute[-\s]Savoie/im)?.[1]?.trim() ||
    null;
  const city = destination || (text.match(/\bAvoriaz\b/i)?.[0] ?? null);
  const room = text.match(
    /Appartement\s+\d+\s+personnes(?:\s*-\s*\d+\s+chambres?)?(?:\s*-\s*Balcon)?/i
  );
  const occupancy =
    room?.[0]?.match(/(\d+)\s+personnes/i)?.[0] ||
    text.match(/(\d+)\s+pers\.?/i)?.[0]?.replace(/pers\.?/i, "personnes") ||
    null;
  const board = /Logement seul/i.test(text) ? "Logement seul" : null;
  const ref = text.match(/N[°ºo]?\s*DE DOSSIER\s*:?\s*(\d{5,})/i)?.[1] || null;
  const hotel_name = parseMaevaHotelName(text);
  const extras = parseMaevaExtras(text, start_at, end_at, city);
  return {
    hotel: {
      hotel_name,
      confirmation_ref: ref,
      city,
      address: null,
      start_at,
      end_at,
      included: [],
      rooms: room
        ? [{ room: room[0].replace(/\s+/g, " ").trim(), guests: occupancy }]
        : [],
      supplier: "maeva.com",
      occupancy,
      board,
    },
    extras,
    destination: city,
    confirmed: /est confirm[ée]e|est valid[ée]e/i.test(text),
  };
}

export const INGEST_FAMILIES = [
  "amadeus",
  "little_emperors",
  "nantipa",
  "hotel_letter",
  "sixt",
  "transfer",
  "quote",
  "toucan",
  "maeva",
  "transavia",
  "expedia_taap",
  "identity",
  "unknown",
] as const;

export type IngestFamily = (typeof INGEST_FAMILIES)[number];

export const DENSE_VISION_THRESHOLD = 800;

export function classifyIngestFamily(text: string, filename = ""): IngestFamily {
  const name = filename.toLowerCase();
  if (/\bP<[A-Z]{3}/.test(text) || /\bP<[A-Z]{3}/.test(name)) return "identity";
  if (/passeport|passport/i.test(name) && /MRZ|TD[13]|IDFRA/i.test(text)) {
    return "identity";
  }
  if (isToucanActivities(text)) return "toucan";
  if (isMaevaStay(text)) return "maeva";
  if (/Reçu de Billet Electronique/i.test(text)) return "amadeus";
  if (
    /transavia/i.test(text) &&
    /num[eé]ro de r[eé]servation/i.test(text) &&
    /passagers/i.test(text)
  ) {
    return "transavia";
  }
  if (/\bSIXT\b/i.test(text) && /Pickup on/i.test(text)) return "sixt";
  if (
    (/TRANSFER CONFIRMATION/i.test(text) || /DROPOFF/i.test(text)) &&
    /Itin[eé]raire/i.test(text)
  ) {
    return "transfer";
  }
  if (/(\btaap\b|\bexpedia\b)/i.test(text) && /voyageur|guest name|n[°ºo]?\s*de voyage|itinerary/i.test(text)) {
    return "expedia_taap";
  }
  if (/NANTIPA/i.test(text) && /Reservation Number/i.test(text)) return "nantipa";
  if (/Reservation Details/i.test(text) && /Booking Reference/i.test(text)) {
    return isQuoteDocument(text) ? "quote" : "little_emperors";
  }
  if (isQuoteDocument(text)) return "quote";
  if (/RESERVATION CONFIRMATION/i.test(text) || /Reservation Status/i.test(text)) {
    return "hotel_letter";
  }
  return "unknown";
}

function isIata(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function flightItemComplete(item: BookingExtract["items"][number]) {
  return (
    item.kind === "flight" &&
    Boolean(item.details?.flight_number) &&
    Boolean(item.start_at) &&
    Boolean(item.confirmation_ref || item.details?.pnr) &&
    (isIata(item.details?.from) || Boolean(item.details?.city_from))
  );
}

export function parserItemsComplete(
  family: IngestFamily,
  items: BookingExtract["items"],
  travelers: BookingExtract["travelers"] = []
): boolean {
  if (!items.length) return false;
  if (family === "amadeus") return items.every(flightItemComplete);
  if (family === "transavia") {
    return items.every(flightItemComplete) && travelers.some((row) => row.first_name || row.last_name);
  }
  if (
    family === "little_emperors" ||
    family === "nantipa" ||
    family === "hotel_letter"
  ) {
    return items.some(
      (item) =>
        item.kind === "hotel" &&
        Boolean(item.details?.hotel_name || item.title) &&
        Boolean(item.start_at)
    );
  }
  if (family === "sixt") {
    return items.some(
      (item) => item.kind === "car" && Boolean(item.confirmation_ref) && Boolean(item.start_at)
    );
  }
  if (family === "transfer") {
    return items.some(
      (item) =>
        item.kind === "transfer" &&
        Boolean(item.details?.pickup || item.details?.dropoff)
    );
  }
  if (family === "maeva") {
    const hotelOk = items.some(
      (item) =>
        item.kind === "hotel" &&
        Boolean(item.details?.hotel_name || item.title) &&
        Boolean(item.start_at)
    );
    if (!hotelOk) return false;
    return items
      .filter((item) => item.kind === "activity" || item.kind === "insurance")
      .every((item) => Boolean(item.title) && Boolean(item.start_at));
  }
  return false;
}

export function shouldUseVision(opts: {
  denseChars: number;
  itemCount: number;
  family: IngestFamily;
  isImage: boolean;
  parserComplete: boolean;
}) {
  if (opts.parserComplete) return false;
  if (opts.family === "identity") return false;
  if (opts.isImage) return true;
  if (opts.denseChars < DENSE_VISION_THRESHOLD) return true;
  if (opts.itemCount === 0 && opts.family === "unknown") return true;
  return false;
}

export function structuredHintFromPdfText(text: string): string {
  const clean = redactIngestText(text);
  const bits: string[] = [];
  const flights = parseAmadeusFlights(clean);
  for (const flight of flights) bits.push(`VOL ${JSON.stringify(flight)}`);
  if (flights.length) {
    bits.push(
      "Plusieurs e-tickets du même vol (même n°, même jour) = UN item, details.ticket_count = nombre de billets. Prix unitaire saisi par l’agent. Aller-retour dans UN PDF = DEUX items. IATA 8 chiffres = code agence, pas un PNR. « Scan for check-in » n’est pas un hôtel. Ne pas extraire la carte fidélité. details.baggage = nombre et désignation du segment (pas « 2PC »)."
    );
  }
  const expedia = parseExpediaTaap(clean);
  const hotel =
    expedia?.hotel ||
    parseLittleEmperorsHotel(clean) ||
    parseNantipaConfirmation(clean) ||
    parseHotelConfirmationLetter(clean);
  if (expedia) {
    bits.push(
      `EXPEDIA ${JSON.stringify({
        hotel: expedia.hotel,
        travelers: expedia.travelers,
        total: expedia.amount,
        currency: expedia.currency,
      })}`
    );
    bits.push(
      "Expedia TAAP : le voyageur imprimé va dans travelers ET customer_first_name / customer_last_name. confirmation_ref = n° de voyage. Politique d’annulation ≠ cancelled. Phrase d’annulation imprimée → details.notes, sinon null."
    );
  }
  if (hotel) bits.push(`HOTEL ${JSON.stringify(hotel)}`);
  const transfer = parseTransferConfirmation(clean);
  if (transfer) bits.push(`TRANSFERT ${JSON.stringify(transfer)}`);
  const car = parseSixtCar(clean);
  if (car) {
    bits.push(`VOITURE ${JSON.stringify(car)}`);
    bits.push("SIXT = kind car. Pas de franchise, caution, TTC ni protection.");
  }
  if (isQuoteDocument(clean)) {
    bits.push("STATUT quote — ne pas extraire les montants NET ni les conditions d’annulation.");
  }
  if (isToucanActivities(clean)) {
    bits.push(
      "Toucan Discovery = activités. Les étapes hôtel du cadre ne sont pas des réservations."
    );
  }
  const transavia = parseTransaviaConfirmation(clean);
  if (transavia) {
    bits.push(
      `TRANSAVIA ${JSON.stringify({
        ref: transavia.confirmation_ref,
        flights: transavia.flights,
        travelers: transavia.travelers,
      })}`
    );
    bits.push(
      "Transavia : un item par vol. Les passagers imprimés vont dans travelers, une fois chacun. « Début de l’enregistrement » n’est pas l’heure du vol. Le total des services additionnels n’est pas le prix des billets."
    );
  }
  const maeva = parseMaevaStay(clean);
  if (maeva) {
    bits.push(`MAEVA ${JSON.stringify({ hotel: maeva.hotel, extras: maeva.extras })}`);
    bits.push(
      "maeva.com = résidence + prestations (forfaits, matériel, cours, assurance). confirmation_ref = n° de dossier sur l’hôtel seulement. Dates sans heure. Pas de frais de dossier ni de PAN."
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
      airline_iata: inferAirlineIata({
        airline: flight.airline,
        flight_number: flight.flight_number,
      }),
      flight_number: flight.flight_number,
      pnr: flight.pnr,
      from: flight.from,
      to: flight.to,
      city_from: flight.city_from,
      city_to: flight.city_to,
      cabin: flight.cabin,
      baggage: flight.baggage,
      terminal: flight.terminal,
      seat: flight.seat,
    },
  };
}

function hotelToItem(hotel: ParsedHotel): ExtractItem {
  return {
    kind: "hotel",
    title: hotel.hotel_name || "Hôtel",
    supplier:
      hotel.source_family === "little_emperors"
        ? hotel.supplier || "Little Emperors"
        : hotel.supplier || null,
    confirmation_ref: hotel.confirmation_ref,
    start_at: hotel.start_at,
    end_at: hotel.end_at,
    amount: null,
    details: {
      hotel_name: hotel.hotel_name,
      city: hotel.city,
      address: hotel.address,
      website: hotel.website || undefined,
      phone: hotel.phone || undefined,
      email: hotel.email || undefined,
      source_family: hotel.source_family || undefined,
      board: hotel.board || undefined,
      occupancy: hotel.occupancy || undefined,
      included: hotel.included,
      rooms: hotel.rooms,
      needs_review: hotel.needs_review || undefined,
    },
  };
}

function maevaExtraToItem(extra: ParsedMaevaExtra): ExtractItem {
  return {
    kind: extra.kind,
    title: extra.title,
    supplier: "maeva.com",
    confirmation_ref: null,
    start_at: extra.start_at,
    end_at: extra.end_at,
    amount: null,
    details: {
      city: extra.city,
      duration: extra.duration,
      included: extra.included,
      meeting_point: extra.city,
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

function carToItem(car: ParsedCar): ExtractItem {
  const title = [car.supplier, car.vehicle].filter(Boolean).join(" · ") || "Location";
  return {
    kind: "car",
    title,
    supplier: car.supplier,
    confirmation_ref: car.confirmation_ref,
    start_at: car.start_at,
    end_at: car.end_at,
    amount: null,
    details: {
      pickup: car.pickup,
      dropoff: car.dropoff,
      vehicle: car.vehicle,
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
  if (incoming.details?.airline_iata && !current.airline_iata) {
    current.airline_iata = incoming.details.airline_iata;
  }
  if (incoming.details?.pnr && !current.pnr) current.pnr = incoming.details.pnr;
  if (incoming.details?.city_from && !current.city_from) {
    current.city_from = incoming.details.city_from;
  }
  if (incoming.details?.city_to && !current.city_to) {
    current.city_to = incoming.details.city_to;
  }
  if (incoming.details?.cabin && !current.cabin) current.cabin = incoming.details.cabin;
  if (incoming.details?.baggage) {
    const currentBag = typeof current.baggage === "string" ? current.baggage.trim() : "";
    if (!currentBag || /^\d+\s*PC$/i.test(currentBag)) current.baggage = incoming.details.baggage;
  }
  if (incoming.details?.terminal && !current.terminal) {
    current.terminal = incoming.details.terminal;
  }
  if (incoming.details?.seat && !current.seat) current.seat = incoming.details.seat;
  if (incoming.details?.document_amount != null && current.document_amount == null) {
    current.document_amount = incoming.details.document_amount;
    current.document_currency =
      incoming.details.document_currency || current.document_currency;
  }
  if (incoming.kind === "hotel") {
    const roomsA = Array.isArray(current.rooms) ? current.rooms : [];
    const roomsB = Array.isArray(incoming.details?.rooms) ? incoming.details.rooms : [];
    if (roomsB.length && roomsA.length < roomsB.length) current.rooms = roomsB;
    const includedA = Array.isArray(current.included) ? current.included : [];
    const includedB = Array.isArray(incoming.details?.included) ? incoming.details.included : [];
    current.included = [...new Set([...includedA, ...includedB].filter(Boolean))];
    if (incoming.details?.hotel_name && !current.hotel_name) {
      current.hotel_name = incoming.details.hotel_name;
    }
    if (incoming.details?.city && !current.city) current.city = incoming.details.city;
    if (incoming.details?.address && !current.address) current.address = incoming.details.address;
    if (incoming.details?.website && !current.website) current.website = incoming.details.website;
    if (current.source_family === "little_emperors") {
      current.phone = null;
      current.email = null;
    } else if (
      incoming.details?.source_family === "little_emperors" &&
      !current.phone &&
      !current.email
    ) {
      current.source_family = "little_emperors";
      current.phone = null;
      current.email = null;
    } else {
      if (incoming.details?.phone && !current.phone) current.phone = incoming.details.phone;
      if (incoming.details?.email && !current.email) current.email = incoming.details.email;
    }
    if (incoming.details?.board && !current.board) current.board = incoming.details.board;
    if (incoming.details?.occupancy && !current.occupancy) {
      current.occupancy = incoming.details.occupancy;
    }
    if (incoming.details?.notes && !current.notes) current.notes = incoming.details.notes;
    if (incoming.supplier && !target.supplier) target.supplier = incoming.supplier;
    const hotelName =
      typeof current.hotel_name === "string" ? current.hotel_name.trim() : "";
    if (hotelName) target.title = hotelName;
  }
  if (incoming.kind === "activity" || incoming.kind === "insurance") {
    const includedA = Array.isArray(current.included) ? current.included : [];
    const includedB = Array.isArray(incoming.details?.included) ? incoming.details.included : [];
    current.included = [...new Set([...includedA, ...includedB].filter(Boolean))];
    if (incoming.details?.duration && !current.duration) {
      current.duration = incoming.details.duration;
    }
  }
  target.details = current;
}

function upsertHint(items: ExtractItem[], incoming: ExtractItem) {
  const hit = findMatchingItem(items, incoming);
  if (hit) overlayItem(hit, incoming);
  else items.push(incoming);
}

export function parsedItemsFromText(text: string): {
  items: ExtractItem[];
  status: BookingExtract["document_status"];
  notes: string[];
  travelers: BookingExtract["travelers"];
  title: string | null;
  destination: string | null;
} {
  const items: ExtractItem[] = [];
  const notes: string[] = [];
  let travelers: BookingExtract["travelers"] = [];
  let title: string | null = null;
  let destination: string | null = null;
  let status: BookingExtract["document_status"] = null;
  const clean = redactIngestText(text);
  const money = parseDocumentMoney(clean);
  const transavia = parseTransaviaConfirmation(clean);
  if (transavia) {
    for (const flight of transavia.flights) items.push(flightToItem(flight));
    travelers = transavia.travelers;
    title = transavia.title;
    destination = transavia.destination;
    status = "confirmed";
  }
  for (const flight of parseAmadeusFlights(clean)) {
    items.push(withDocumentPrice(flightToItem(flight), money));
  }
  const maeva = parseMaevaStay(clean);
  if (maeva) {
    items.push(withDocumentPrice(hotelToItem(maeva.hotel), money));
    for (const extra of maeva.extras) items.push(maevaExtraToItem(extra));
    if (maeva.confirmed) status = status || "confirmed";
  } else {
    const expedia = parseExpediaTaap(clean);
    const hotel =
      expedia?.hotel ||
      parseLittleEmperorsHotel(clean) ||
      parseNantipaConfirmation(clean) ||
      parseHotelConfirmationLetter(clean);
    if (hotel) {
      const item = withDocumentPrice(hotelToItem(hotel), money);
      if (expedia?.amount) {
        item.details = {
          ...(item.details || {}),
          document_amount: expedia.amount,
          document_currency: expedia.currency || item.details?.document_currency || "EUR",
        };
      }
      if (expedia?.printed_cancellation) {
        item.details = { ...(item.details || {}), notes: expedia.printed_cancellation };
      }
      items.push(item);
      if (hotel.needs_review) {
        notes.push("Hôtel : réservation provisoire (tentative), à confirmer.");
      }
      if (!travelers.length && expedia?.travelers.length) travelers = expedia.travelers;
      if (!travelers.length && hotel.source_family === "little_emperors") {
        const named = parseLittleEmperorsGuests(clean);
        if (named.length) travelers = named;
      }
    }
  }
  const transfer = parseTransferConfirmation(clean);
  if (transfer) items.push(withDocumentPrice(transferToItem(transfer), money));
  const car = parseSixtCar(clean);
  if (car) items.push(withDocumentPrice(carToItem(car), money));
  if (isQuoteDocument(clean)) {
    status = "quote";
    notes.push("Devis — tarifs non bloqués, à confirmer.");
  }
  if (detectCancellationDocument(clean)) {
    status = "cancelled";
    notes.push(SUPPLIER_CANCELLATION_NOTE);
  }
  if (isToucanActivities(clean)) {
    notes.push(
      "Toucan Discovery : activités uniquement ; les étapes du cadre ne sont pas des hôtels."
    );
  }
  if (travelers.length) {
    const passengers = travelers.map((row) => ({
      first_name: row.first_name,
      last_name: row.last_name,
    }));
    for (const item of items) {
      if (item.kind !== "flight") continue;
      item.details = { ...(item.details || {}), passengers };
    }
  }
  return { items: mergeExtractItems(items), status, notes, travelers, title, destination };
}

export function tagSourceFileName(items: ExtractItem[], name: string): ExtractItem[] {
  return items.map((item) => ({
    ...item,
    details: {
      ...(item.details || {}),
      source_file_name: item.details?.source_file_name || name,
    },
  }));
}

/** Complète / déduplique l’extract LLM avec les parseurs déterministes. */
export function applyStructuredHints(
  extract: BookingExtract,
  texts: string[]
): BookingExtract {
  const items: ExtractItem[] = [...(extract.items || [])];
  const extraNotes: string[] = [];
  let status = extract.document_status;
  let travelers = [...(extract.travelers || [])];
  let title = extract.title || "";
  let destination = extract.destination || "";

  for (const raw of texts) {
    const parsed = parsedItemsFromText(raw);
    for (const item of parsed.items) upsertHint(items, item);
    if (parsed.status === "cancelled") status = "cancelled";
    else if (parsed.status) status = status || parsed.status;
    extraNotes.push(...parsed.notes);
    if (!travelers.length && parsed.travelers.length) travelers = parsed.travelers;
    if (!title && parsed.title) title = parsed.title;
    if (!destination && parsed.destination) destination = parsed.destination;
  }

  const blob = texts.join("\n");
  if (blob.trim() && status === "cancelled" && !detectCancellationDocument(blob)) {
    status = "confirmed";
  }

  const notes =
    [extract.notes_client, ...extraNotes]
      .map((row) => (row || "").trim())
      .filter((row) => row && (status === "cancelled" || row !== SUPPLIER_CANCELLATION_NOTE))
      .filter((row, index, all) => all.indexOf(row) === index)
      .join("\n") || null;

  return applyPrintedGuestNames(
    fillStayFromItems({
      ...extract,
      document_status: status,
      title: title || extract.title,
      destination: destination || extract.destination,
      notes_client: notes,
      travelers,
      items: mergeExtractItems(items),
    })
  );
}
