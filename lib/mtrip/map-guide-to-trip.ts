/**
 * Mappe extraction + devis CRM → segments mTrip (vols, dest, prix, activités).
 * Objectif : maximiser les options app (pas un squelette minimal).
 */
import type {
  AgencyMtripGuide,
  MtripGuidePassenger,
  QuoteLine,
} from "./guide-types";
import type {
  MtripActivity,
  MtripDestination,
  MtripFlight,
  MtripPriceLine,
  MtripTraveler,
} from "./types";

const AIRLINE_IATA: Record<string, string> = {
  "air france": "AF",
  af: "AF",
  klm: "KL",
  "british airways": "BA",
  lufthansa: "LH",
  emirates: "EK",
  qatar: "QR",
  "qatar airways": "QR",
  turkish: "TK",
  "turkish airlines": "TK",
  iberia: "IB",
  easyjet: "U2",
  ryanair: "FR",
  "copa airlines": "CM",
  copa: "CM",
  delta: "DL",
  united: "UA",
  american: "AA",
  "american airlines": "AA",
  swiss: "LX",
  tap: "TP",
  "tap air portugal": "TP",
  latam: "LA",
  "royal air maroc": "AT",
  ram: "AT",
};

/** Hints aéroport → ville / pays / locode / geo approx */
const AIRPORT_META: Record<
  string,
  {
    city: string;
    country: string;
    locode?: string;
    lat?: number;
    lng?: number;
  }
> = {
  CDG: {
    city: "Paris",
    country: "FR",
    locode: "FRPAR",
    lat: 49.0097,
    lng: 2.5479,
  },
  ORY: {
    city: "Paris",
    country: "FR",
    locode: "FRPAR",
    lat: 48.7233,
    lng: 2.3794,
  },
  RAK: {
    city: "Marrakech",
    country: "MA",
    locode: "MARAK",
    lat: 31.6069,
    lng: -8.0363,
  },
  CMN: {
    city: "Casablanca",
    country: "MA",
    locode: "MACAS",
    lat: 33.3675,
    lng: -7.5898,
  },
  PTY: {
    city: "Panama City",
    country: "PA",
    locode: "PAPTY",
    lat: 8.9824,
    lng: -79.5199,
  },
  BOC: {
    city: "Bocas del Toro",
    country: "PA",
    locode: "PABOC",
    lat: 9.3408,
    lng: -82.2508,
  },
  JFK: {
    city: "New York",
    country: "US",
    locode: "USNYC",
    lat: 40.6413,
    lng: -73.7781,
  },
  LHR: {
    city: "London",
    country: "GB",
    locode: "GBLON",
    lat: 51.47,
    lng: -0.4543,
  },
  MAD: {
    city: "Madrid",
    country: "ES",
    locode: "ESMAD",
    lat: 40.4983,
    lng: -3.5676,
  },
  FCO: {
    city: "Rome",
    country: "IT",
    locode: "ITROM",
    lat: 41.8003,
    lng: 12.2389,
  },
  DXB: {
    city: "Dubai",
    country: "AE",
    locode: "AEDXB",
    lat: 25.2532,
    lng: 55.3657,
  },
  BCN: {
    city: "Barcelona",
    country: "ES",
    locode: "ESBCN",
    lat: 41.2971,
    lng: 2.0785,
  },
  GVA: {
    city: "Geneva",
    country: "CH",
    locode: "CHGVA",
    lat: 46.2381,
    lng: 6.1089,
  },
  NCE: {
    city: "Nice",
    country: "FR",
    locode: "FRNCE",
    lat: 43.6584,
    lng: 7.2159,
  },
  LYS: {
    city: "Lyon",
    country: "FR",
    locode: "FRLYS",
    lat: 45.7256,
    lng: 5.0811,
  },
};

/** Contexte destination du voyage — sert à valider les matches LE. */
export type TripDestinationContext = {
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  /** Tokens lowercase pour matcher location LE (ville, pays, alias). */
  aliases: string[];
};

const TITLE_DEST_HINTS: Array<{
  re: RegExp;
  city: string;
  country: string;
  lat: number;
  lng: number;
  aliases: string[];
}> = [
  {
    re: /marrakech|marrakesh|\brak\b/i,
    city: "Marrakech",
    country: "MA",
    lat: 31.6295,
    lng: -7.9811,
    aliases: ["marrakech", "marrakesh", "morocco", "maroc", "ma"],
  },
  {
    re: /casablanca|\bcmn\b/i,
    city: "Casablanca",
    country: "MA",
    lat: 33.5731,
    lng: -7.5898,
    aliases: ["casablanca", "morocco", "maroc", "ma"],
  },
  {
    re: /panama/i,
    city: "Panama City",
    country: "PA",
    lat: 8.9824,
    lng: -79.5199,
    aliases: ["panama", "pa"],
  },
  {
    re: /\bparis\b|\bcdg\b|\bory\b/i,
    city: "Paris",
    country: "FR",
    lat: 48.8566,
    lng: 2.3522,
    aliases: ["paris", "france", "fr"],
  },
];

const COUNTRY_ALIASES: Record<string, string[]> = {
  MA: ["morocco", "maroc", "marruecos", "ma"],
  FR: ["france", "fr"],
  PA: ["panama", "pa"],
  US: ["united states", "usa", "u.s.", "america", "us"],
  GB: ["united kingdom", "uk", "england", "britain", "gb"],
  ES: ["spain", "españa", "espana", "es"],
  IT: ["italy", "italia", "it"],
  AE: ["uae", "dubai", "emirates", "ae"],
  CH: ["switzerland", "suisse", "ch"],
};

/**
 * Dérive ville/pays attendus depuis vols (arrivée) puis titre guide.
 * Ex. CDG→RAK ⇒ Marrakech / MA.
 */
export function inferTripDestinationContext(
  guide: AgencyMtripGuide,
  flights: MtripFlight[]
): TripDestinationContext {
  for (const f of flights) {
    const iata = f.arrival_airport_iata?.toUpperCase();
    if (iata && AIRPORT_META[iata]) {
      const m = AIRPORT_META[iata];
      const aliases = [
        m.city.toLowerCase(),
        ...(COUNTRY_ALIASES[m.country] || [m.country.toLowerCase()]),
      ];
      return {
        city: m.city,
        country: m.country,
        lat: m.lat,
        lng: m.lng,
        aliases,
      };
    }
  }

  const title = guide.title || "";
  for (const hint of TITLE_DEST_HINTS) {
    if (hint.re.test(title)) {
      return {
        city: hint.city,
        country: hint.country,
        lat: hint.lat,
        lng: hint.lng,
        aliases: hint.aliases,
      };
    }
  }

  // Routes dans extraction vols
  for (const raw of guide.extraction?.flights || []) {
    const routes = Array.isArray(raw.routes) ? raw.routes : [];
    for (const r of routes) {
      if (!r || typeof r !== "object") continue;
      const to = String((r as { to?: unknown }).to || "").toUpperCase();
      if (to && AIRPORT_META[to]) {
        const m = AIRPORT_META[to];
        return {
          city: m.city,
          country: m.country,
          lat: m.lat,
          lng: m.lng,
          aliases: [
            m.city.toLowerCase(),
            ...(COUNTRY_ALIASES[m.country] || []),
          ],
        };
      }
    }
  }

  return { aliases: [] };
}

function airlineToIata(airline: string | null | undefined, code?: string) {
  if (code && /^[A-Z0-9]{2}\d/i.test(code)) {
    return code.replace(/\d.*/, "").toUpperCase();
  }
  if (!airline) return undefined;
  const key = airline.trim().toLowerCase();
  return AIRLINE_IATA[key] || airline.slice(0, 2).toUpperCase();
}

function parseFlightCode(code: string): {
  iata?: string;
  number?: string;
} {
  const m = code.trim().match(/^([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)$/i);
  if (!m) return {};
  return { iata: m[1].toUpperCase(), number: m[2] };
}

function dateOnly(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const m = String(value).match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : fallback;
  }
  return d.toISOString().slice(0, 10);
}

function isoLocal(date: string, time = "12:00:00") {
  const d = dateOnly(date, date);
  return `${d}T${time}`;
}

type FlightHint = {
  flight_codes?: unknown;
  pnrs?: unknown;
  tickets?: unknown;
  routes?: unknown;
  airline?: unknown;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).filter(Boolean);
}

function asRoutes(v: unknown): Array<{ from: string; to: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const o = r as { from?: unknown; to?: unknown };
      if (typeof o.from === "string" && typeof o.to === "string") {
        return { from: o.from.toUpperCase(), to: o.to.toUpperCase() };
      }
      return null;
    })
    .filter(Boolean) as Array<{ from: string; to: string }>;
}

/**
 * Construit des segments vol mTrip depuis extraction + lignes devis.
 * Round-trip (2 codes / A/R) → 2 segments avec dates aller/retour.
 */
export function buildFlightsFromGuide(
  guide: AgencyMtripGuide,
  travelers: MtripTraveler[],
  tripStart: string,
  tripEnd: string
): MtripFlight[] {
  const flights: MtripFlight[] = [];
  const hints = (guide.extraction?.flights || []) as FlightHint[];
  const flightLines = (guide.quote_lines || []).filter((l) => l.kind === "flight");

  const travelerIds = travelers
    .map((t) => t.identifier)
    .filter(Boolean) as string[];

  let position = 1;

  const pushSegment = (opts: {
    from: string;
    to: string;
    code?: string;
    airline?: string | null;
    pnr?: string | null;
    date: string;
    time?: string;
  }) => {
    const parsed = opts.code ? parseFlightCode(opts.code) : {};
    const iata =
      parsed.iata || airlineToIata(opts.airline || undefined, opts.code);
    const fromMeta = AIRPORT_META[opts.from];
    const toMeta = AIRPORT_META[opts.to];
    const airlineName =
      opts.airline ||
      (iata === "AF" ? "Air France" : iata ? iata : undefined);

    flights.push({
      identifier: `flt-${position}`,
      airline_iata: iata,
      airline: airlineName,
      flight_number: parsed.number || opts.code?.replace(/^[A-Z]{2}/i, ""),
      departure_airport_iata: opts.from,
      arrival_airport_iata: opts.to,
      departure_city: fromMeta?.city || opts.from,
      arrival_city: toMeta?.city || opts.to,
      departure_date: isoLocal(opts.date, opts.time || "10:00:00"),
      arrival_date: isoLocal(opts.date, opts.time ? addHours(opts.time, 3) : "13:00:00"),
      booking_reference: opts.pnr || undefined,
      position: position++,
      active_for_every_traveler: true,
      skip_sync_flight_details: true,
      comments: airlineName
        ? `Vol ${airlineName} ${opts.from}–${opts.to}`
        : `Vol ${opts.from}–${opts.to}`,
      flights_travelers_details: travelerIds.map((id) => ({
        traveler_identifier: id,
        reservation_reference: opts.pnr || undefined,
        class: "Economy",
      })),
    });
  };

  for (const hint of hints) {
    const codes = asStringArray(hint.flight_codes);
    const pnrs = asStringArray(hint.pnrs);
    const routes = asRoutes(hint.routes);
    const airline =
      typeof hint.airline === "string" ? hint.airline : null;
    const pnr = pnrs[0] || flightLines[0]?.confirmation || null;
    const start = dateOnly(flightLines[0]?.start_date, tripStart);
    const end = dateOnly(flightLines[0]?.end_date, tripEnd);

    if (routes.length >= 1) {
      // Aller
      pushSegment({
        from: routes[0].from,
        to: routes[0].to,
        code: codes[0],
        airline,
        pnr,
        date: start,
        time: "10:00:00",
      });
      // Retour : reverse route ou 2e route ; 2e code
      if (codes.length >= 2 || routes.length >= 2 || start !== end) {
        const ret =
          routes[1] || { from: routes[0].to, to: routes[0].from };
        pushSegment({
          from: ret.from,
          to: ret.to,
          code: codes[1] || codes[0],
          airline,
          pnr,
          date: end,
          time: "16:00:00",
        });
      }
      continue;
    }

    if (codes.length) {
      // Sans aéroports IATA : segment minimal (cie + n° + dates) — pas d’XXX/YYY fictifs
      for (let i = 0; i < Math.min(codes.length, 2); i++) {
        const parsed = parseFlightCode(codes[i]);
        const iata =
          parsed.iata || airlineToIata(airline || undefined, codes[i]);
        flights.push({
          identifier: `flt-${position}`,
          airline_iata: iata,
          airline: airline || undefined,
          flight_number: parsed.number,
          departure_date: isoLocal(i === 0 ? start : end, i === 0 ? "10:00:00" : "16:00:00"),
          arrival_date: isoLocal(
            i === 0 ? start : end,
            i === 0 ? "13:00:00" : "19:00:00"
          ),
          booking_reference: pnr || undefined,
          position: position++,
          active_for_every_traveler: true,
          skip_sync_flight_details: true,
          comments: airline
            ? `Vol ${airline}${parsed.number ? ` ${iata}${parsed.number}` : ""}`
            : `Vol ${codes[i]}`,
          flights_travelers_details: travelerIds.map((id) => ({
            traveler_identifier: id,
            reservation_reference: pnr || undefined,
            class: "Economy",
          })),
        });
      }
    }
  }

  // Fallback devis seul (titre type « Vol Air France CDG–RAK »)
  if (!flights.length) {
    for (const line of flightLines) {
      const routeMatch = line.title.match(
        /\b([A-Z]{3})\s*[–\-→]\s*([A-Z]{3})\b/
      );
      const airlineMatch = line.title.match(/Vol\s+(.+?)(?:\s+[A-Z]{3}|$)/i);
      const airline = airlineMatch?.[1]?.trim() || null;
      if (routeMatch) {
        const start = dateOnly(line.start_date, tripStart);
        const end = dateOnly(line.end_date, tripEnd);
        pushSegment({
          from: routeMatch[1],
          to: routeMatch[2],
          airline,
          pnr: line.confirmation,
          date: start,
        });
        if (start !== end) {
          pushSegment({
            from: routeMatch[2],
            to: routeMatch[1],
            airline,
            pnr: line.confirmation,
            date: end,
            time: "16:00:00",
          });
        }
      } else {
        const iata = airlineToIata(airline || undefined);
        flights.push({
          identifier: `flt-${position}`,
          airline_iata: iata,
          airline: airline || undefined,
          departure_date: isoLocal(
            dateOnly(line.start_date, tripStart),
            "10:00:00"
          ),
          arrival_date: isoLocal(
            dateOnly(line.end_date || line.start_date, tripEnd),
            "13:00:00"
          ),
          booking_reference: line.confirmation || undefined,
          position: position++,
          active_for_every_traveler: true,
          skip_sync_flight_details: true,
          comments: line.title,
          flights_travelers_details: travelerIds.map((id) => ({
            traveler_identifier: id,
            reservation_reference: line.confirmation || undefined,
            class: "Economy",
          })),
        });
      }
    }
  }

  return flights.filter(
    (f) =>
      f.airline_iata ||
      f.flight_number ||
      f.departure_airport_iata ||
      f.comments
  );
}

function addHours(time: string, hours: number) {
  const [h, m, s] = time.split(":").map(Number);
  const total = ((h || 0) + hours) % 24;
  return `${String(total).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:${String(s || 0).padStart(2, "0")}`;
}

export type HotelStayInput = {
  name: string;
  booking_reference?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  city?: string | null;
  le_hotel_id?: number | null;
};

function normalizeHotelKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isNoiseHotelName(name: string) {
  const n = normalizeHotelKey(name);
  return (
    !n ||
    /^(hotel|hote|hebergement|accommodation|confirmation|confirmation de reservation|reservation|booking|booking\.com|airbnb)$/i.test(
      n
    ) ||
    n.length < 3
  );
}

function mapExtractionHotel(h: Record<string, unknown>): HotelStayInput | null {
  const name = String(h.name || "").trim();
  const booking_reference = h.booking_reference
    ? String(h.booking_reference)
    : null;
  if (isNoiseHotelName(name) && !booking_reference) return null;
  if (!name && !booking_reference) return null;
  return {
    name: name || "Hôtel",
    booking_reference,
    check_in: typeof h.check_in === "string" ? h.check_in : null,
    check_out: typeof h.check_out === "string" ? h.check_out : null,
    city: typeof h.city === "string" ? h.city : null,
    le_hotel_id:
      typeof h.le_hotel_id === "number"
        ? h.le_hotel_id
        : typeof h.hotel_id === "number"
          ? h.hotel_id
          : null,
  };
}

/** Fusion extraction + devis, dédupliquée ; ignore noms bruit sans réf. */
export function hotelStaysFromGuide(guide: AgencyMtripGuide): HotelStayInput[] {
  const merged: HotelStayInput[] = [];
  const seenKeys = new Set<string>();
  const seenRefs = new Set<string>();

  const push = (stay: HotelStayInput) => {
    const ref = stay.booking_reference?.trim().toUpperCase();
    if (ref && seenRefs.has(ref)) {
      // Enrichir l’existant (meilleur nom / dates)
      const idx = merged.findIndex(
        (s) => s.booking_reference?.trim().toUpperCase() === ref
      );
      if (idx >= 0) {
        const cur = merged[idx];
        merged[idx] = {
          ...cur,
          name:
            !isNoiseHotelName(stay.name) && isNoiseHotelName(cur.name)
              ? stay.name
              : cur.name,
          check_in: cur.check_in || stay.check_in,
          check_out: cur.check_out || stay.check_out,
          city: cur.city || stay.city,
          le_hotel_id: cur.le_hotel_id || stay.le_hotel_id,
        };
      }
      return;
    }
    const key = normalizeHotelKey(stay.name);
    if (key && seenKeys.has(key)) return;
    if (ref) seenRefs.add(ref);
    if (key) seenKeys.add(key);
    merged.push(stay);
  };

  for (const h of guide.extraction?.hotels || []) {
    const stay = mapExtractionHotel(h);
    if (stay) push(stay);
  }

  for (const l of guide.quote_lines || []) {
    if (l.kind !== "hotel") continue;
    if (isNoiseHotelName(l.title) && !l.confirmation) continue;
    push({
      name: l.title,
      booking_reference: l.confirmation || null,
      check_in: l.start_date || null,
      check_out: l.end_date || null,
      city: null,
      le_hotel_id: null,
    });
  }

  return merged;
}

export function buildDestinations(opts: {
  title: string;
  tripStart: string;
  tripEnd: string;
  hotels: Array<{
    name: string;
    city?: string | null;
    check_in?: string | null;
    check_out?: string | null;
    cover?: string;
    lat?: number;
    lng?: number;
    country?: string;
  }>;
  flights: MtripFlight[];
  coverUrl?: string;
}): MtripDestination[] {
  const destinations: MtripDestination[] = [];
  let pos = 1;

  for (const h of opts.hotels) {
    const city = h.city || guessCityFromName(h.name) || opts.title;
    const start = dateOnly(h.check_in, opts.tripStart);
    const end = dateOnly(h.check_out, opts.tripEnd);
    const country = h.country || guessCountry(city, opts.flights);
    destinations.push({
      name: city,
      country_iso_code: country,
      start_date: `${start}T00:00:00`,
      end_date: `${end}T23:59:00`,
      position: pos++,
      picture_url: h.cover || opts.coverUrl,
      description: `<p>Séjour à <strong>${escape(city)}</strong> — ${escape(h.name)}.</p><p>Itinéraire préparé par Travel Business Agency.</p>`,
      location:
        h.lat != null && h.lng != null
          ? { latitude: h.lat, longitude: h.lng }
          : undefined,
      active_for_every_traveler: true,
    });
  }

  if (!destinations.length && opts.flights.length) {
    const arrival = opts.flights[0]?.arrival_airport_iata;
    const meta = arrival ? AIRPORT_META[arrival] : undefined;
    destinations.push({
      name: meta?.city || opts.title || "Destination",
      country_iso_code: meta?.country || "FR",
      locode: meta?.locode,
      start_date: `${opts.tripStart}T00:00:00`,
      end_date: `${opts.tripEnd}T23:59:00`,
      position: 1,
      picture_url: opts.coverUrl,
      description: `<p>Voyage <strong>${escape(opts.title)}</strong> préparé par Travel Business Agency.</p>`,
      location:
        meta?.lat != null && meta?.lng != null
          ? { latitude: meta.lat, longitude: meta.lng }
          : undefined,
      active_for_every_traveler: true,
    });
  }

  if (!destinations.length) {
    destinations.push({
      name: opts.title || "Destination",
      country_iso_code: "FR",
      start_date: `${opts.tripStart}T00:00:00`,
      end_date: `${opts.tripEnd}T23:59:00`,
      position: 1,
      picture_url: opts.coverUrl,
      description: `<p>Voyage préparé par Travel Business Agency pour ${escape(opts.title)}.</p>`,
      active_for_every_traveler: true,
    });
  }

  return destinations;
}

function guessCityFromName(name: string) {
  if (/panama/i.test(name)) return "Panama City";
  if (/marrakech|rak/i.test(name)) return "Marrakech";
  if (/paris/i.test(name)) return "Paris";
  return null;
}

function guessCountry(city: string, flights: MtripFlight[]) {
  if (/panama/i.test(city)) return "PA";
  if (/marrakech|casablanca/i.test(city)) return "MA";
  if (/paris|lyon|nice/i.test(city)) return "FR";
  const iata = flights[0]?.arrival_airport_iata;
  if (iata && AIRPORT_META[iata]) return AIRPORT_META[iata].country;
  return "FR";
}

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildPricesFromQuoteLines(
  lines: QuoteLine[] | undefined
): { prices: MtripPriceLine[]; total: number; currency: string } {
  const priced = (lines || []).filter(
    (l) => typeof l.amount === "number" && (l.amount as number) > 0
  );
  const prices: MtripPriceLine[] = priced.map((l) => ({
    price: l.amount as number,
    text: l.title,
  }));
  const total = priced.reduce((s, l) => s + (l.amount || 0), 0);
  const currency = priced.find((l) => l.currency)?.currency || "EUR";
  return { prices, total, currency };
}

export function buildActivitiesFromQuoteLines(
  lines: QuoteLine[] | undefined,
  tripStart: string
): MtripActivity[] {
  const acts: MtripActivity[] = [];
  let pos = 1;
  for (const line of lines || []) {
    if (line.kind !== "transfer" && line.kind !== "other") continue;
    if (/confirmation de réservation/i.test(line.title)) continue;
    acts.push({
      identifier: `act-${pos}`,
      name: line.title,
      date: dateOnly(line.start_date, tripStart),
      position: pos++,
      comments: line.confirmation
        ? `Réf. ${line.confirmation}`
        : undefined,
      active_for_every_traveler: true,
      app_trip_screen: true,
      reviewable: true,
    });
  }
  return acts;
}

export function tripDescriptionHtml(
  guide: AgencyMtripGuide,
  passengers: MtripGuidePassenger[]
) {
  const names = passengers
    .map((p) => `${p.first_name} ${p.last_name}`.trim())
    .filter(Boolean)
    .join(", ");
  const lines = (guide.quote_lines || [])
    .map((l) => `<li>${escape(l.title)}</li>`)
    .join("");
  return [
    `<p><strong>${escape(guide.title)}</strong></p>`,
    names ? `<p>Voyageurs : ${escape(names)}.</p>` : "",
    `<p>Guide préparé et suivi par Travel Business Agency. Ouvrez chaque étape (vols, hôtels, documents) dans l’app pour le détail.</p>`,
    lines ? `<p>Inclus :</p><ul>${lines}</ul>` : "",
  ]
    .filter(Boolean)
    .join("");
}
