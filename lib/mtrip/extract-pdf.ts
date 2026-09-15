import type { MtripGuideExtraction } from "./guide-types";

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(new Uint8Array(buffer), {
    mergePages: true,
  });
  return Array.isArray(text) ? text.join("\n") : String(text || "");
}

/** OCR image (capture confirmation) via tesseract. */
export async function extractTextFromImage(
  buffer: ArrayBuffer | Buffer
): Promise<string> {
  const input = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(new Uint8Array(buffer));

  let png: Buffer = input;
  try {
    const sharp = (await import("sharp")).default;
    png = await sharp(input, { failOn: "none", animated: false })
      .rotate()
      .resize({
        width: 2200,
        height: 2200,
        fit: "inside",
        withoutEnlargement: false,
      })
      .normalize()
      .png()
      .toBuffer();
  } catch {
    // keep original bytes
  }

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(png);
    return (text || "").trim();
  } catch {
    return "";
  } finally {
    await worker.terminate();
  }
}

function detectKind(text: string, fileName: string): "flight" | "hotel" | "other" {
  const t = `${fileName}\n${text}`.toLowerCase();
  if (
    t.includes("billet") ||
    t.includes("e-ticket") ||
    t.includes("électronique") ||
    t.includes("electronique") ||
    t.includes("award ticket") ||
    t.includes("billet prime") ||
    t.includes("your booking reference") ||
    t.includes("itinéraire") ||
    t.includes("itinerary") ||
    t.includes("air france") ||
    t.includes("copa") ||
    t.includes("flight") ||
    t.includes("pnr") ||
    t.includes("boarding") ||
    t.includes("vol aller") ||
    t.includes("vol retour") ||
    (/\bdirect\b/.test(t) &&
      /\b(cdg|ory|rak|pty|nce|lys|sjo|mia)\b/.test(t) &&
      (t.match(/\b[a-z]{3}\b/g) || []).length >= 2)
  ) {
    return "flight";
  }
  if (
    t.includes("booking.com") ||
    t.includes("booking reference") ||
    t.includes("reservation details") ||
    t.includes("little emperors") ||
    t.includes("check in") ||
    t.includes("check-in") ||
    t.includes("hôtel") ||
    t.includes("hotel") ||
    t.includes("hébergement") ||
    t.includes("hebergement") ||
    t.includes("resort") ||
    t.includes("chambre") ||
    t.includes("airbnb") ||
    t.includes("expedia") ||
    t.includes("hotels.com") ||
    t.includes("marriott") ||
    t.includes("hilton") ||
    t.includes("waldorf") ||
    t.includes("hyatt") ||
    t.includes("riads") ||
    t.includes("riads ") ||
    t.includes("nuit") ||
    t.includes("voucher") ||
    /r[ée]servation\s+\d+/i.test(t)
  ) {
    return "hotel";
  }
  if (
    t.includes("transfert") ||
    t.includes("transfer") ||
    t.includes("chauffeur") ||
    t.includes("taxi") ||
    t.includes("location de voiture") ||
    t.includes("car rental")
  ) {
    return "other";
  }
  return "other";
}

const IATA_CITY: Record<string, string> = {
  CDG: "Paris",
  ORY: "Paris",
  RAK: "Marrakech",
  CMF: "Chambéry",
  NCE: "Nice",
  LYS: "Lyon",
  MRS: "Marseille",
  TLS: "Toulouse",
  BOD: "Bordeaux",
  PTY: "Panama",
  JFK: "New York",
  LHR: "Londres",
  DXB: "Dubaï",
  CMN: "Casablanca",
  AGA: "Agadir",
  SJO: "San José",
  MIA: "Miami",
  BOC: "Bocas del Toro",
  DAV: "David",
  CTA: "Catania",
  TLV: "Tel Aviv",
  AMS: "Amsterdam",
  LAX: "Los Angeles",
  EWR: "New York",
  FCO: "Rome",
  MAD: "Madrid",
  BCN: "Barcelone",
};

const EN_MONTH_ABBR: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

function parseDdMmm(token: string, year: number): string | null {
  const m = token.toUpperCase().match(/^(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/);
  if (!m) return null;
  const mm = EN_MONTH_ABBR[m[2]];
  if (!mm) return null;
  return `${year}-${mm}-${m[1].padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function extractIssueYear(text: string): number {
  const m =
    text.match(
      /(?:Date et lieu d['’]émission|Date and place of issue)\s*[:\s]*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i
    ) || text.match(/\b(20\d{2})\b/);
  if (m && m[3]) return Number(m[3]);
  if (m && m[1] && /^\d{4}$/.test(m[1])) return Number(m[1]);
  return new Date().getFullYear();
}

function extractRouteAirports(text: string): Array<{ from: string; to: string }> {
  const routes: Array<{ from: string; to: string }> = [];
  const known = new Set(Object.keys(IATA_CITY));
  // CDG … RAK on same block / nearby
  const re =
    /\b([A-Z]{3})\b[\s\S]{0,80}?(?:\→|->|–|-|—|vers|to)?[\s\S]{0,40}?\b([A-Z]{3})\b/g;
  for (const m of text.toUpperCase().matchAll(re)) {
    const from = m[1];
    const to = m[2];
    if (from === to) continue;
    if (!known.has(from) && !/^(CDG|ORY|RAK|PTY|JFK|LHR|NCE|LYS|MRS|SJO|MIA)$/.test(from))
      continue;
    if (!known.has(to) && !/^(CDG|ORY|RAK|PTY|JFK|LHR|NCE|LYS|MRS|SJO|MIA)$/.test(to))
      continue;
    routes.push({ from, to });
  }
  // Explicit known pair CDG + RAK anywhere
  if (/\bCDG\b/i.test(text) && /\bRAK\b/i.test(text)) {
    if (!routes.some((r) => r.from === "CDG" && r.to === "RAK")) {
      routes.unshift({ from: "CDG", to: "RAK" });
    }
  }
  return routes;
}

function extractAirline(text: string): string | null {
  if (/air\s*france|\bAF\b/i.test(text)) return "Air France";
  if (/\bKLM\b/i.test(text)) return "KLM";
  if (/copa/i.test(text)) return "Copa";
  if (/lufthansa|\bLH\b/i.test(text)) return "Lufthansa";
  if (/british\s*airways|\bBA\b/i.test(text)) return "British Airways";
  if (/emirates|\bEK\b/i.test(text)) return "Emirates";
  if (/qatar|\bQR\b/i.test(text)) return "Qatar Airways";
  if (/easyjet/i.test(text)) return "easyJet";
  if (/transavia/i.test(text)) return "Transavia";
  return null;
}

type FlightSegmentHint = {
  flight_code: string;
  from: string;
  to: string;
  from_city?: string | null;
  to_city?: string | null;
  dep_time?: string | null;
  arr_time?: string | null;
  date?: string | null;
  arr_date?: string | null;
  cabin?: string | null;
  booking_class?: string | null;
  seat?: string | null;
  baggage?: string | null;
  day_plus?: number;
};

/** Billet électronique Air France / KLM (ITINÉRAIRE / ITINERARY). */
function extractAirFranceETicket(text: string): Array<Record<string, unknown>> {
  const isAfTicket =
    /ITIN[ÉE]RAIRE\s*\/\s*ITINERARY/i.test(text) ||
    /YOUR BOOKING REFERENCE/i.test(text) ||
    /R[ÉE]F[ÉE]RENCE DE VOTRE R[ÉE]SERVATION/i.test(text) ||
    /BILLET PRIME|AWARD TICKET|billet[s]?\s*[ée]lectronique/i.test(text);

  if (!isAfTicket) return [];

  const year = extractIssueYear(text);
  const pnr =
    text.match(/YOUR BOOKING REFERENCE\s+([A-Z0-9]{5,8})/i)?.[1]?.toUpperCase() ||
    text.match(
      /R[ÉE]F[ÉE]RENCE DE VOTRE R[ÉE]SERVATION[\s\S]{0,80}?([A-Z0-9]{6})\b/i
    )?.[1]?.toUpperCase() ||
    null;

  const ticketRaw =
    text.match(/(\d{3})\s+(\d{3})\s+(\d{3})\s+(\d{3})\s+(\d)\b/) ||
    text.match(/\b(\d{3})-(\d{10})\b/);
  const ticket = ticketRaw
    ? ticketRaw[0].includes("-")
      ? ticketRaw[0]
      : `${ticketRaw[1]}-${ticketRaw[2]}${ticketRaw[3]}${ticketRaw[4]}${ticketRaw[5]}`
    : null;

  const passengers = [
    ...text.matchAll(
      /([A-ZÀ-Ÿ][A-ZÀ-Ÿ\- ]{1,40})\s*\((?:Adulte|Adult|Enfant|Child|Infant|B[ée]b[ée])[^)]*\)/gi
    ),
  ].map((m) => m[1].replace(/\s+/g, " ").trim());

  const segments = parseAfItinerarySegments(text, year);
  if (!segments.length) {
    // Fallback minimal
    const codes = [
      ...text.matchAll(/\b(AF|KL)\s*(\d{3,4})\b/gi),
    ].map((c) => `${c[1].toUpperCase()}${c[2]}`);
    const routes = extractRouteAirports(text);
    if (!codes.length && !pnr && !routes.length) return [];
    return [
      {
        flight_codes: codes,
        tickets: ticket ? [ticket] : [],
        pnrs: pnr ? [pnr] : [],
        routes,
        airline: extractAirline(text) || "Air France",
        passenger_hints: passengers,
        departure_date: null,
        arrival_date: null,
        cabin: null,
        seat: null,
        baggage: null,
        flight_details: null,
      },
    ];
  }

  return segments.map((seg) => {
    const detailParts = [
      passengers[0] ? `Passager ${passengers[0]}` : null,
      seg.dep_time && seg.arr_time
        ? `${seg.dep_time} → ${seg.arr_time}${seg.day_plus ? ` (J+${seg.day_plus})` : ""}`
        : null,
      seg.cabin
        ? `Cabine ${seg.cabin}${seg.booking_class ? ` ${seg.booking_class}` : ""}`
        : null,
      seg.seat ? `Siège ${seg.seat}` : null,
      seg.baggage ? `Bagages ${seg.baggage}` : null,
    ].filter(Boolean);

    return {
      flight_codes: [seg.flight_code],
      tickets: ticket ? [ticket] : [],
      pnrs: pnr ? [pnr] : [],
      routes: [{ from: seg.from, to: seg.to }],
      airline: extractAirline(text) || "Air France",
      passenger_hints: passengers,
      departure_date: seg.date,
      arrival_date: seg.arr_date || seg.date,
      cabin: seg.cabin,
      seat: seg.seat,
      baggage: seg.baggage,
      booking_class: seg.booking_class,
      flight_details: detailParts.join(" · ") || null,
      // Affiché comme « type » dans le CRM
      flight_type: [seg.flight_code, seg.cabin].filter(Boolean).join(" · ") || null,
    };
  });
}

function parseAfItinerarySegments(
  text: string,
  year: number
): FlightSegmentHint[] {
  const section =
    text.split(/ITIN[ÉE]RAIRE\s*\/\s*ITINERARY/i)[1]?.split(
      /(?:\(\*\)\s*OK\s*=|AIR FRANCE ET KLM|AVANT VOTRE|Ce document confirme|\*\*Total)/i
    )[0] || "";
  const lines = section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // drop bilingual headers
    .filter(
      (l) =>
        !/^(Date|Départ|Departure|Arrivée|Arrival|Vol|Flight|Fin enregistrement|Latest check-in|Total bagages|Total baggage|Cabine|Cabin|Classe|Class|Statut|Status)\*?$/i.test(
          l
        )
    );

  const segments: FlightSegmentHint[] = [];
  const dateRe = /^(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i;
  const timeRe = /^(\d{1,2}:\d{2})(?:\s*\(Jour\/Day\s*\+\s*(\d+)\))?$/i;
  const iataRe = /^[A-Z]{3}$/;
  const flightRe = /^(AF|KL|A[A-Z]|[A-Z]{2})\s*(\d{3,4})$/i;

  let i = 0;
  while (i < lines.length) {
    if (!dateRe.test(lines[i])) {
      i += 1;
      continue;
    }
    const dateToken = lines[i];
    const depDate = parseDdMmm(dateToken, year);
    i += 1;
    if (i >= lines.length || !timeRe.test(lines[i])) continue;
    const depTime = lines[i].match(timeRe)![1];
    i += 1;
    // city
    const fromCity = i < lines.length ? lines[i] : null;
    i += 1;
    // IATA
    while (i < lines.length && !iataRe.test(lines[i]) && !timeRe.test(lines[i])) {
      i += 1;
    }
    if (i >= lines.length || !iataRe.test(lines[i])) continue;
    const from = lines[i];
    i += 1;
    // skip airport name lines until arrival time
    while (i < lines.length && !timeRe.test(lines[i]) && !flightRe.test(lines[i])) {
      i += 1;
    }
    if (i >= lines.length || !timeRe.test(lines[i])) continue;
    const arrMatch = lines[i].match(timeRe)!;
    const arrTime = arrMatch[1];
    const dayPlus = arrMatch[2] ? Number(arrMatch[2]) : 0;
    i += 1;
    const toCity = i < lines.length ? lines[i] : null;
    i += 1;
    while (i < lines.length && !iataRe.test(lines[i]) && !flightRe.test(lines[i])) {
      i += 1;
    }
    if (i >= lines.length || !iataRe.test(lines[i])) continue;
    const to = lines[i];
    i += 1;
    while (i < lines.length && !flightRe.test(lines[i])) {
      i += 1;
    }
    if (i >= lines.length) continue;
    const fm = lines[i].match(flightRe)!;
    const flightCode = `${fm[1].toUpperCase()}${fm[2]}`;
    i += 1;
    // skip "Vol effectué par…"
    while (
      i < lines.length &&
      (/vol effectu|flight operated|par air france|by air france|by klm/i.test(
        lines[i]
      ) ||
        lines[i].endsWith("/"))
    ) {
      i += 1;
    }

    let cabin: string | null = null;
    let bookingClass: string | null = null;
    let baggage: string | null = null;
    let seat: string | null = null;

    // "18:05 2x32 Kg Business O" or "12:40 2x23 Kg Premium S OK"
    if (i < lines.length) {
      const meta = lines[i];
      const bag = meta.match(/(\d+x\d+\s*Kg)/i)?.[1];
      if (bag) baggage = bag.replace(/\s+/g, "");
      const cabinMatch = meta.match(
        /\b(La Première|First|Business|Premium|Economy|Eco)\b/i
      );
      if (cabinMatch) cabin = cabinMatch[1];
      const classMatch = meta.match(
        /\b(?:Business|Premium|Economy|Eco|First|La Première)\s+([A-Z])\b/i
      );
      if (classMatch) bookingClass = classMatch[1];
      if (!/si[eè]ge|seat/i.test(meta)) i += 1;
    }

    while (i < lines.length) {
      if (dateRe.test(lines[i])) break;
      const seatMatch = lines[i].match(/Si[eè]ge\s*\/\s*Seat\s*:\s*([A-Z0-9]+)/i);
      if (seatMatch) seat = seatMatch[1];
      if (/^OK$/i.test(lines[i])) {
        i += 1;
        break;
      }
      i += 1;
    }

    segments.push({
      flight_code: flightCode,
      from,
      to,
      from_city: fromCity,
      to_city: toCity,
      dep_time: depTime,
      arr_time: arrTime,
      date: depDate,
      arr_date: depDate
        ? addDaysIso(depDate, dayPlus || 0)
        : null,
      cabin,
      booking_class: bookingClass,
      seat,
      baggage,
      day_plus: dayPlus || 0,
    });
  }

  return segments;
}

function extractFlightHints(text: string) {
  const af = extractAirFranceETicket(text);
  if (af.length) return af;

  const flights: Array<Record<string, unknown>> = [];
  const codes = [
    ...text.matchAll(
      /\b(AF|CM|X1|AA|BA|LH|KL|EK|QR|TK|IB|VY|U2)\s*(\d{1,4})\b/gi
    ),
  ];
  const tickets = [...text.matchAll(/\b(\d{3}-\d{7,12})\b/g)];
  const pnrs = [
    ...text.matchAll(
      /Référence du dossier compagnie\s+([A-Z0-9]+)\/([A-Z0-9]+)/gi
    ),
    ...text.matchAll(/Referencedudossier([A-Z0-9]{5,8})/g),
    ...text.matchAll(/\bPNR[:\s]+([A-Z0-9]{5,8})\b/gi),
    ...text.matchAll(/YOUR BOOKING REFERENCE\s+([A-Z0-9]{5,8})/gi),
  ];
  const routes = extractRouteAirports(text);
  const airline = extractAirline(text);
  const isItinerary =
    /vol\s+aller|vol\s+retour|\bdirect\b|aller[\s\S]{0,40}retour/i.test(text) ||
    routes.length > 0;

  if (codes.length || tickets.length || pnrs.length || isItinerary) {
    flights.push({
      flight_codes: codes.map((c) => `${c[1].toUpperCase()}${c[2]}`),
      tickets: tickets.map((t) => t[1]),
      pnrs: pnrs.map((p) => (p[2] ? `${p[1]}/${p[2]}` : p[1])),
      routes,
      airline,
      passenger_hints: extractPassengerHints(text),
      itinerary_ui: isItinerary,
    });
  }
  return flights;
}

function extractPassengerHints(text: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /Passager[^\n]*\n-?\s*([A-Za-zÀ-ÿ\- ]{2,60})\s+\d{3}-\d+/gi,
    /Booking name\s*\n?\s*([A-Za-zÀ-ÿ\- ]{2,60})/gi,
    /Voyageur[s]?\s*[:\n]\s*([A-Za-zÀ-ÿ\- ]{2,60})/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const n = m[1].replace(/\s+/g, " ").trim();
      if (n.length > 2) names.add(n);
    }
  }
  return [...names];
}

function extractHotelHints(text: string) {
  const hotels: Array<Record<string, unknown>> = [];

  // Ne pas confondre billet AF/KLM avec confirmation hôtel (mentions check-in)
  if (
    /ITIN[ÉE]RAIRE\s*\/\s*ITINERARY/i.test(text) ||
    /YOUR BOOKING REFERENCE/i.test(text) ||
    /BILLET PRIME|AWARD TICKET/i.test(text)
  ) {
    return hotels;
  }

  // --- Little Emperors / Booking details (EN) ---
  if (
    /Reservation Details/i.test(text) ||
    /Check[\s-]*in/i.test(text) ||
    /Little Emperors/i.test(text)
  ) {
    const leHotels = extractLittleEmperorsHotels(text);
    if (leHotels.length) return leHotels;
  }

  // --- Devis TAAP / Expedia agency (FR) ---
  if (
    /propos[ée]\s+par\s+/i.test(text) ||
    /Les tarifs et la disponibilit[ée]/i.test(text) ||
    /1\s+chambre\s+x\s+\d+\s+nuits/i.test(text) ||
    /Aper[çc]u du devis\s*TAAP/i.test(text)
  ) {
    const taap = extractTaapQuoteHotel(text);
    if (taap.length) return taap;
  }

  // --- Voucher FR (Travel Booking Agency / partenaire) ---
  if (
    /R[ée]servation\s+\d+/i.test(text) ||
    /Cet h[ée]bergement est r[ée]serv[ée]/i.test(text) ||
    (/Arriv[ée]e/i.test(text) && /D[ée]part/i.test(text))
  ) {
    const fr = extractFrenchVoucherHotel(text);
    if (fr.length) return fr;
  }

  // --- Fallback générique ---
  const booking =
    text.match(/Booking Reference\s*\n?\s*([A-Z0-9;]+)/i)?.[1] ||
    text.match(/Confirmation[:\s#n°]*([A-Z0-9\-]{5,})/i)?.[1] ||
    text.match(
      /réf(?:érence)?\.?\s*(?:de\s*)?(?:résa|réservation|booking)[:\s]*([A-Z0-9\-]+)/i
    )?.[1] ||
    text.match(/R[ée]servation\s+(\d{6,})/i)?.[1];

  const checkIn =
    text.match(/Check[\s-]*in\s*\n?\s*([^\n]+)/i)?.[1]?.trim() ||
    text.match(/Arriv[ée]e\s*\n?\s*([^\n,]+)/i)?.[1]?.trim();
  const checkOut =
    text.match(/Check[\s-]*out\s*\n?\s*([^\n]+)/i)?.[1]?.trim() ||
    text.match(/D[ée]part\s*:?\s*\n?\s*([^\n,]+)/i)?.[1]?.trim();

  let nameLine =
    text.match(/proposé par\s+([^,\n]+)/i)?.[1]?.trim() ||
    text.match(
      /(?:hôtel|hotel|établissement|property)\s*[:\-]\s*([^\n]{3,80})/i
    )?.[1]?.trim() ||
    text.match(/Booking details\s*-\s*([^,\n]+)/i)?.[1]?.trim() ||
    text.match(
      /\n([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9'’&\- .]{2,55}(?:resort|hotel|hôtel|palace|riads?|lodge|inn|suites?))\b/i
    )?.[1]?.trim();

  if (!nameLine) {
    const ranch = text.match(/\b(The Ranch resort)\b/i)?.[1];
    if (ranch) nameLine = ranch;
  }

  if (!nameLine) {
    nameLine = text
      .match(
        /Réservation confirmée[^\n]*\n+([A-Za-zÀ-ÿ0-9'’&\- ,]{5,80})/i
      )?.[1]
      ?.trim();
  }

  const room = extractRoomTypeGeneric(text);
  const details = extractRoomDetailsGeneric(text);

  if (booking || nameLine) {
    hotels.push({
      name: nameLine || null,
      booking_reference: booking || null,
      check_in: checkIn || null,
      check_out: checkOut || null,
      room_type: room,
      room_details: details,
      passenger_hints: extractPassengerHints(text),
      ...extractHotelMoney(text),
    });
  }
  return hotels;
}

function extractHotelMoney(text: string): {
  amount: number | null;
  currency: string | null;
} {
  const eur =
    text.match(
      /Total\s*\n?\s*[€]?\s*([\d][\d\s.,]{1,16})\s*\*?\s*(?:EUR|€)?/i
    ) || text.match(/[€]\s*([\d][\d\s.,]{1,16})/);
  const usd =
    text.match(/Total\s*\n?\s*\$\s*([\d][\d\s.,]{1,16})/i) ||
    text.match(/\$\s*([\d][\d\s.,]{1,16})/);
  const parseAmt = (raw: string) => {
    let s = raw.replace(/\s/g, "");
    // 1,208.21 (US) ou 1.208,21 (EU)
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
      s = s.replace(/,/g, "");
    } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (/^\d+,\d{2}$/.test(s)) {
      s = s.replace(",", ".");
    }
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };
  if (eur?.[1] && /€|EUR/i.test(text)) {
    const amount = parseAmt(eur[1]);
    if (amount && amount > 1) return { amount, currency: "EUR" };
  }
  if (usd?.[1] && /\$|USD/i.test(text)) {
    const amount = parseAmt(usd[1]);
    if (amount && amount > 1) return { amount, currency: "USD" };
  }
  if (eur?.[1]) {
    const amount = parseAmt(eur[1]);
    if (amount && amount > 1) return { amount, currency: "EUR" };
  }
  return { amount: null, currency: null };
}

/** Confirmations Little Emperors « Booking details / Reservation Details ». */
function extractLittleEmperorsHotels(text: string) {
  const hotels: Array<Record<string, unknown>> = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let name = "";
  const resIdx = lines.findIndex((l) => /Reservation Details/i.test(l));
  if (resIdx > 0) {
    // Nom = lignes avant ville/région puis « Reservation Details »
    const before = lines.slice(0, resIdx);
    // Exclure titres de section
    const nameParts = before.filter(
      (l) =>
        !/^(Address|Check|Booking|Adults|Children|IATA)/i.test(l) &&
        l.length > 2
    );
    // Dernières lignes avant Reservation = souvent Nom + Ville
    if (nameParts.length >= 2) {
      const cityLike = nameParts[nameParts.length - 1];
      const maybeName = nameParts.slice(0, -1).join(" ");
      // Si avant-dernière ressemble à une suite du nom (Hacienda Belen)
      name = maybeName || cityLike;
      // Cas « Costa Rica Marriott Hotel Hacienda » + « Belen »
      if (
        nameParts.length >= 2 &&
        /hotel|lodge|spa|marriott|resort|inn/i.test(nameParts.join(" "))
      ) {
        name = nameParts.slice(0, -1).join(" ");
        // Si le dernier fragment fait partie du nom (Belen)
        if (
          nameParts.length >= 2 &&
          nameParts[nameParts.length - 2].length < 40 &&
          !/^(Heredia|Bajos|Provincia|Alajuela)/i.test(cityLike)
        ) {
          // Belen est souvent la fin du nom d'hôtel Marriott
          if (/belen/i.test(cityLike) || cityLike.split(/\s+/).length <= 2) {
            const joined = nameParts.join(" ");
            if (/marriott.*belen|hacienda\s*belen/i.test(joined)) {
              name = nameParts.join(" ").replace(/\s+/g, " ");
              // Retirer la vraie ville si dupliquée : "… Belen Heredia" 
              name = name.replace(/\s+Heredia$/i, "").trim();
            }
          }
        }
      } else {
        name = nameParts[0];
      }
    } else if (nameParts.length === 1) {
      name = nameParts[0];
    }
  }

  // Fallback filename-like first line
  if (!name && lines[0] && !/Reservation|Check/i.test(lines[0])) {
    name = lines[0];
    if (lines[1] && !/Reservation|Check|Heredia|Bajos/i.test(lines[1])) {
      name = `${lines[0]} ${lines[1]}`.trim();
    }
  }

  // Nettoyage nom Marriott Belen
  if (/Costa Rica Marriott/i.test(text)) {
    name = "Costa Rica Marriott Hotel Hacienda Belen";
  }
  if (/El Silencio Lodge/i.test(text)) {
    name = "El Silencio Lodge & Spa";
  }

  const checkIn = text.match(/Check[\s-]*in\s*\n?\s*([^\n]+)/i)?.[1]?.trim();
  const checkOut = text.match(/Check[\s-]*out\s*\n?\s*([^\n]+)/i)?.[1]?.trim();
  const booking =
    text.match(/Booking Reference\s*\n?\s*([A-Z0-9;]+)/i)?.[1]?.trim() || null;
  const money = extractHotelMoney(text);

  // Blocs chambre : type de chambre suivi de Adults / Booking name
  const roomBlocks = splitLeRoomBlocks(text);
  if (roomBlocks.length) {
    roomBlocks.forEach((block, i) => {
      const roomType = block.roomType;
      const adults = block.adults;
      const children = block.children;
      const guest = block.bookingName;
      const detailParts = [
        adults != null ? `Adults ${adults}` : null,
        children ? `Children ${children}` : null,
        guest ? `Booking name ${guest}` : null,
        block.rate ? block.rate : null,
      ].filter(Boolean);
      const refs = booking?.split(";") || [];
      hotels.push({
        name,
        booking_reference: refs[i] || booking,
        check_in: checkIn || null,
        check_out: checkOut || null,
        room_type: roomType,
        room_details: detailParts.join(" · ") || null,
        amount: i === 0 ? money.amount : null,
        currency: money.currency,
        passenger_hints: guest ? [guest] : extractPassengerHints(text),
      });
    });
    return hotels;
  }

  hotels.push({
    name,
    booking_reference: booking,
    check_in: checkIn || null,
    check_out: checkOut || null,
    room_type: extractRoomTypeGeneric(text),
    room_details: extractRoomDetailsGeneric(text),
    ...money,
    passenger_hints: extractPassengerHints(text),
  });
  return hotels.filter((h) => h.name || h.booking_reference);
}

function splitLeRoomBlocks(text: string) {
  const blocks: Array<{
    roomType: string;
    adults: number | null;
    children: string | null;
    bookingName: string | null;
    rate: string | null;
  }> = [];

  // Découpe avant chaque type de chambre connu / ligne « Guest Room… »
  const re =
    /((?:Two Bedroom Suite|Guest Room[^\n]*|Deluxe[^\n]*|Suite[^\n]*|Superior[^\n]*|Standard[^\n]*Room[^\n]*))\s*\n+Adults\s*\n+(\d+)(?:\s*\n+Children\s*\n+([^\n]+))?\s*\n+Booking name\s*\n+([^\n]+)(?:\s*\n+(Best Available Rate|BAR|[^\n]*Rate))?/gi;

  for (const m of text.matchAll(re)) {
    blocks.push({
      roomType: m[1].replace(/\s+/g, " ").trim(),
      adults: Number(m[2]) || null,
      children: m[3]?.trim() || null,
      bookingName: m[4]?.trim() || null,
      rate: m[5]?.trim() || null,
    });
  }

  // Fallback plus souple
  if (!blocks.length) {
    const roomType =
      text.match(
        /\n((?:Two Bedroom Suite|Guest Room[^\n]{0,60}|[A-Z][^\n]{0,40}Suite))\s*\n+Adults/i
      )?.[1]?.trim() || null;
    if (roomType) {
      blocks.push({
        roomType,
        adults: Number(text.match(/Adults\s*\n+(\d+)/i)?.[1]) || null,
        children: text.match(/Children\s*\n+([^\n]+)/i)?.[1]?.trim() || null,
        bookingName:
          text.match(/Booking name\s*\n+([^\n]+)/i)?.[1]?.trim() || null,
        rate: /Best Available Rate/i.test(text) ? "Best Available Rate" : null,
      });
    }
  }
  return blocks;
}

function extractFrenchVoucherHotel(text: string) {
  const hotels: Array<Record<string, unknown>> = [];
  const booking =
    text.match(/R[ée]servation\s+(\d{6,})/i)?.[1] || null;

  // Nom = ligne après « réservé par notre partenaire » ou avant adresse FL/US
  let name =
    text.match(
      /partenaire\s*\n+([A-Za-z0-9'’&\- .]{3,80})\s*\n/i
    )?.[1]?.trim() ||
    text.match(
      /\n([A-Z][A-Za-z0-9'’&\- .]{2,60})\s*\n+(?:FL|CA|NY|US|\d{5})/i
    )?.[1]?.trim() ||
    null;

  const checkIn =
    text.match(/Arriv[ée]e\s*\n?\s*([\d.]+)/i)?.[1]?.trim() ||
    text.match(/Arriv[ée]e[^\d]*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i)?.[1]?.trim();
  const checkOut =
    text.match(/D[ée]part\s*:?\s*\n?\s*([\d.]+)/i)?.[1]?.trim() ||
    text.match(/D[ée]part[^\d]*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i)?.[1]?.trim();

  // Type + détails chambre (souvent un long paragraphe après Départ)
  const afterDates = text.split(/D[ée]part\s*:?/i)[1] || text;
  const roomParagraph =
    afterDates
      .match(
        /\b((?:Double|Simple|Triple|Twin|King|Queen|Suite|Chambre)\b[^\n]*(?:\n(?!Couchage|Clients|Remarque|Repas|Inclus|Conditions|GPS)[^\n]+)*)/i
      )?.[1]
      ?.replace(/\s+/g, " ")
      .trim() || null;

  let roomType: string | null = null;
  let roomDetails: string | null = null;
  if (roomParagraph) {
    const short = roomParagraph
      .split(/,\s*pour\s+/i)[0]
      ?.replace(/\s*\(le type de lit[\s\S]*$/i, "")
      .replace(/\s*\(Couchages[\s\S]*$/i, "")
      .trim();
    roomType = short || roomParagraph.slice(0, 100);
    roomDetails = roomParagraph;
  }

  const bed = text.match(/Couchage\s*:?\s*\n?\s*([^\n]+)/i)?.[1]?.trim();
  const clients = text
    .match(/Clients\s*:?\s*\n?([\s\S]*?)(?:Remarque|Repas|Inclus|Conditions)/i)?.[1]
    ?.replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
  const meals = text.match(/Repas\s*\n([^\n]+)/i)?.[1]?.trim();

  const detailParts = [
    bed ? `Couchage: ${bed}` : null,
    clients ? `Clients: ${clients}` : null,
    meals || null,
    text.match(/pour\s+(\d+\s+adultes?\s*(?:et\s+\d+\s*enfants?)?)/i)?.[1]
      ? `Occupancy: ${text.match(/pour\s+(\d+\s+adultes?\s*(?:et\s+\d+\s*enfants?)?)/i)?.[1]}`
      : null,
  ].filter(Boolean);

  if (!roomDetails && detailParts.length) {
    roomDetails = detailParts.join(" · ");
  } else if (roomDetails && detailParts.length) {
    roomDetails = `${roomDetails} · ${detailParts.filter((d) => d && !roomDetails!.includes(d.split(":")[0])).join(" · ")}`;
  }

  const money = extractHotelMoney(text);

  if (name || booking || roomType) {
    hotels.push({
      name: name || "Hébergement",
      booking_reference: booking,
      check_in: checkIn || null,
      check_out: checkOut || null,
      room_type: roomType,
      room_details: roomDetails,
      ...money,
      passenger_hints: extractPassengerHints(text),
    });
  }
  return hotels;
}

function extractRoomTypeGeneric(text: string): string | null {
  return (
    text.match(
      /\n((?:Two Bedroom Suite|Guest Room[^\n]{0,50}|Double suite[^\n]{0,80}|[A-Z][^\n]{0,40}Suite))\s*\n/i
    )?.[1]?.trim() ||
    text.match(
      /Type de chambre\s*[:\-]?\s*([^\n]{3,80})/i
    )?.[1]?.trim() ||
    text.match(
      /\n((?:Chambre|Suite|Villa|Appartement|Studio|Chalet)\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’ &\-]{1,40})\s*\n/i
    )?.[1]?.trim() ||
    null
  );
}

function extractRoomDetailsGeneric(text: string): string | null {
  const parts = [
    text.match(/Adults?\s*\n+(\d+)/i)
      ? `Adults ${text.match(/Adults?\s*\n+(\d+)/i)?.[1]}`
      : null,
    text.match(/Children\s*\n+([^\n]+)/i)
      ? `Children ${text.match(/Children\s*\n+([^\n]+)/i)?.[1]?.trim()}`
      : null,
    text.match(/Booking name\s*\n+([^\n]+)/i)
      ? `Booking name ${text.match(/Booking name\s*\n+([^\n]+)/i)?.[1]?.trim()}`
      : null,
    text.match(
      /(\d+\s+adultes?(?:\s*,\s*\d+\s+enfants?)?(?:\s*,\s*\d+\s+chambres?)?)/i
    )?.[1]
      ? text
          .match(
            /(\d+\s+adultes?(?:\s*,\s*\d+\s+enfants?)?(?:\s*,\s*\d+\s+chambres?)?)/i
          )?.[1]
          ?.trim()
      : null,
    text.match(
      /\n(\d+\s+(?:très\s+)?(?:grand|petit)?\s*lits?[^\n]{0,60})/i
    )?.[1]
      ? text
          .match(
            /\n(\d+\s+(?:très\s+)?(?:grand|petit)?\s*lits?[^\n]{0,60})/i
          )?.[1]
          ?.trim()
      : null,
    /Best Available Rate/i.test(text) ? "Best Available Rate" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Devis TAAP / portail agence Expedia (FR) :
 * « proposé par The Ranch resort » + « Chambre Confort » + lit/m².
 */
function extractTaapQuoteHotel(text: string) {
  const hotels: Array<Record<string, unknown>> = [];

  let name =
    text.match(
      /propos[ée]\s+par\s+([^,\n]{3,80})(?:,|\.|$)/i
    )?.[1]?.trim() ||
    text.match(
      /\n((?:The\s+)?[A-Z][A-Za-z0-9'’&\- ]{2,50}(?:resort|hotel|hôtel|lodge|riad|palace))\s*\n/i
    )?.[1]?.trim() ||
    null;

  if (name) {
    name = name.replace(/\s+/g, " ").replace(/\.$/, "").trim();
  }

  const yearHint =
    Number(text.match(/\b(20\d{2})\b/)?.[1]) || new Date().getFullYear();
  const rangeMatch = text.match(
    /(?:lun|mar|mer|jeu|ven|sam|dim)\.?\s+(\d{1,2})\s+(janv?|févr?|fev|mars|avr|mai|juin|juil|août|aout|sept?|oct|nov|déc|dec)\.?\s*[-–—à]+\s*(?:lun|mar|mer|jeu|ven|sam|dim)\.?\s+(\d{1,2})\s+(janv?|févr?|fev|mars|avr|mai|juin|juil|août|aout|sept?|oct|nov|déc|dec)\.?/i
  );
  let checkIn: string | null = null;
  let checkOut: string | null = null;
  if (rangeMatch) {
    const monthKey = (m: string) =>
      m
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .slice(0, 4);
    const mm: Record<string, string> = {
      jan: "01",
      janv: "01",
      fev: "02",
      fevr: "02",
      mar: "03",
      mars: "03",
      avr: "04",
      mai: "05",
      juin: "06",
      juil: "07",
      aou: "08",
      aout: "08",
      sep: "09",
      sept: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const m1 = mm[monthKey(rangeMatch[2])] || mm[monthKey(rangeMatch[2]).slice(0, 3)];
    const m2 = mm[monthKey(rangeMatch[4])] || mm[monthKey(rangeMatch[4]).slice(0, 3)];
    if (m1) {
      checkIn = `${yearHint}-${m1}-${rangeMatch[1].padStart(2, "0")}`;
    }
    if (m2) {
      checkOut = `${yearHint}-${m2}-${rangeMatch[3].padStart(2, "0")}`;
    }
  }

  const roomType =
    text.match(
      /\n((?:Chambre|Suite|Villa|Appartement|Studio|Chalet)\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’ &\-]{1,40})\s*\n/i
    )?.[1]?.trim() ||
    text.match(
      /\n(Chambre\s+[^\n]{2,50})\s*\n/i
    )?.[1]?.trim() ||
    null;

  const bedLine =
    text.match(
      /\n(\d+\s+(?:très\s+grand\s+lit|grand\s+lit|lits?|lit\s+queen|lit\s+king)[^\n]{0,80})/i
    )?.[1]?.trim() ||
    (roomType
      ? text
          .split(new RegExp(roomType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))[1]
          ?.match(/^\s*\n([^\n]{8,90})/)?.[1]
          ?.trim()
      : null);

  const occupancy = text
    .match(
      /(\d+\s+adultes?(?:\s*,\s*\d+\s+enfants?)?(?:\s*,\s*\d+\s+chambres?)?)/i
    )?.[1]
    ?.trim();

  const amenities = (() => {
    const after =
      roomType && bedLine
        ? text.split(bedLine)[1] || ""
        : roomType
          ? text.split(roomType)[1] || ""
          : "";
    return (
      after
        .match(
          /^\s*\n((?:Wi-?Fi|Climatisation|Service d['’]étage)[^\n]{0,100})/i
        )?.[1]
        ?.replace(/\s+/g, " ")
        .trim() || null
    );
  })();

  const cancel = text
    .match(/Conditions d['’]annulation\s*:\s*([^\n]+)/i)?.[1]
    ?.trim();

  const detailParts = [
    bedLine || null,
    occupancy || null,
    amenities && !bedLine?.includes(amenities.slice(0, 12)) ? amenities : null,
    cancel || null,
  ].filter(Boolean);

  const money = extractHotelMoney(text);

  if (name || roomType) {
    hotels.push({
      name: name || "Hébergement",
      booking_reference: null,
      check_in: checkIn,
      check_out: checkOut,
      room_type: roomType,
      room_details: detailParts.length ? detailParts.join(" · ") : null,
      ...money,
      passenger_hints: extractPassengerHints(text),
    });
  }

  return hotels;
}

const SCREENSHOT_NAME_RE =
  /capture\s*d['’]?\s*e[́e]?cran|screenshot|img[-_]?\d{6,}|image\s*\(/i;

/**
 * Titre métier à partir du contenu — jamais le nom de fichier Capture….
 */
export function titleFromConfirmationContent(
  text: string,
  kind: "flight" | "hotel" | "other",
  hotels: Array<Record<string, unknown>>,
  flights: Array<Record<string, unknown>>
): string {
  const hotelName = hotels
    .map((h) => (typeof h.name === "string" ? h.name.trim() : ""))
    .find((n) => n.length >= 3);
  if (hotelName) return hotelName;

  const airline =
    (flights.map((f) => f.airline).find((a) => typeof a === "string") as
      | string
      | undefined) || extractAirline(text);
  const routes = flights.flatMap((f) =>
    Array.isArray(f.routes)
      ? (f.routes as Array<{ from: string; to: string }>)
      : []
  );
  const route = routes[0] || extractRouteAirports(text)[0];
  const codes = flights.flatMap((f) =>
    Array.isArray(f.flight_codes) ? f.flight_codes.map(String) : []
  );

  if (route) {
    const carrier = airline || (codes[0] ? codes[0].replace(/\d+/g, "") : null);
    const label = carrier ? `Vol ${carrier}` : "Vol";
    return `${label} ${route.from}–${route.to}`;
  }

  if (codes.length) {
    const prefix = airline ? `Vol ${airline}` : `Vol ${codes.slice(0, 2).join(", ")}`;
    return airline && codes.length ? `${prefix} (${codes.slice(0, 2).join(", ")})` : prefix;
  }

  if (airline && (/vol\s+aller|vol\s+retour|direct/i.test(text) || kind === "flight")) {
    return `Vol ${airline}`;
  }

  const t = text.replace(/\s+/g, " ").trim();

  const bookingProp =
    text.match(
      /(?:vous séjournez à|hébergement|property name|nom de l['’]hôtel)\s*[:\-]?\s*([^\n.]{4,70})/i
    )?.[1]?.trim() ||
    text.match(/\b([A-ZÀ-Ÿ][^.\n]{2,50}(?:Hotel|Hôtel|Resort|Palace|Riad))\b/)?.[1]
      ?.trim();
  if (bookingProp && !SCREENSHOT_NAME_RE.test(bookingProp)) {
    return bookingProp;
  }

  if (kind === "flight") return airline ? `Vol ${airline}` : "Vol";
  if (kind === "hotel") return "Hébergement";

  for (const line of text.split(/\n+/).map((l) => l.trim())) {
    if (line.length < 4 || line.length > 70) continue;
    if (SCREENSHOT_NAME_RE.test(line)) continue;
    if (/^(http|www\.|total|prix|date|du |au |page\s*\d|modifier|direct)/i.test(line))
      continue;
    if (/^\d+([.,]\d+)?\s*€?$/.test(line)) continue;
    if (/travel business|travelba|confirme|confirmation de|vol aller|vol retour/i.test(line))
      continue;
    if (/[A-Za-zÀ-ÿ]{3,}/.test(line)) return line;
  }

  if (/airbnb/i.test(t)) return "Réservation Airbnb";
  if (/booking\.com/i.test(t)) return "Réservation Booking.com";
  if (/expedia/i.test(t)) return "Réservation Expedia";

  return "Confirmation de réservation";
}

function buildAnalysis(
  text: string,
  fileName: string,
  documentId: string
): {
  kind: "flight" | "hotel" | "other";
  text: string;
  title: string;
  extraction: Partial<MtripGuideExtraction>;
} {
  let flights = extractFlightHints(text);
  const hotels = extractHotelHints(text);
  let kindRaw = detectKind(text, fileName);

  // UI itinéraire AF (aller/retour + aéroports) sans numéro de vol
  if (
    !flights.length &&
    (/vol\s+aller|vol\s+retour|air\s*france/i.test(text) ||
      extractRouteAirports(text).length)
  ) {
    flights = extractFlightHints(text);
  }
  if (flights.length && kindRaw === "other") kindRaw = "flight";
  if (hotels.length && kindRaw === "other") kindRaw = "hotel";

  const kind: "flight" | "hotel" | "other" = kindRaw;
  const notes: string[] = [];
  if (!text.trim()) notes.push(`Aucun texte extractible: ${fileName}`);

  const title = titleFromConfirmationContent(text, kind, hotels, flights);

  if (hotels.length && !hotels[0].name) {
    hotels[0] = { ...hotels[0], name: title };
  } else if (!hotels.length && !flights.length && kind === "hotel") {
    hotels.push({ name: title, booking_reference: null });
  }

  // Garantir une entrée vol pour le devis même sans code AF#### 
  if (kind === "flight" && !flights.length) {
    flights = [
      {
        flight_codes: [],
        routes: extractRouteAirports(text),
        airline: extractAirline(text),
        itinerary_ui: true,
      },
    ];
  }

  return {
    kind,
    text,
    title,
    extraction: {
      flights: flights.length ? flights : [],
      hotels: hotels.length ? hotels : [],
      notes,
      raw_texts: [
        {
          document_id: documentId,
          preview: text.slice(0, 6000) || `[fichier] ${fileName}`,
        },
      ],
    },
  };
}

export async function analyzePdfBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  documentId: string
) {
  const text = await extractTextFromPdf(buffer);
  return buildAnalysis(text, fileName, documentId);
}

export async function analyzeImageBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  documentId: string
) {
  const text = await extractTextFromImage(buffer);
  return buildAnalysis(text, fileName, documentId);
}

export function mergeExtractions(
  current: MtripGuideExtraction,
  next: Partial<MtripGuideExtraction>
): MtripGuideExtraction {
  return {
    flights: [...(current.flights || []), ...(next.flights || [])],
    hotels: [...(current.hotels || []), ...(next.hotels || [])],
    notes: [...(current.notes || []), ...(next.notes || [])],
    raw_texts: [...(current.raw_texts || []), ...(next.raw_texts || [])].slice(
      -20
    ),
    extracted_at: new Date().toISOString(),
  };
}
