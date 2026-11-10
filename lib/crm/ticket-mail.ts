/** Lecture simple d’un e-mail ou d’un PDF de billet. Pas d’import Gmail. */

import { parseTransaviaConfirmation } from "@/lib/crm/ingest-parse";

export type TicketSegment = {
  flightNumber: string;
  from: string | null;
  to: string | null;
  cityFrom: string | null;
  cityTo: string | null;
  departureAt: string | null;
  arrivalAt: string | null;
};

export type TicketMailRead = {
  pnr: string | null;
  ticketNumber: string | null;
  passenger: { firstName: string; lastName: string } | null;
  passengers?: { firstName: string; lastName: string }[];
  segments?: TicketSegment[];
  price: number | null;
  currency: string | null;
};

export type TicketRowDraft = {
  title: string;
  confirmation_ref: string | null;
  start_at: string | null;
  end_at: string | null;
  supplier: string | null;
  details: Record<string, unknown>;
};

function decodeQuotedPrintable(value: string) {
  const folded = value.replace(/=\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < folded.length; index += 1) {
    const hex = folded.slice(index + 1, index + 3);
    if (folded[index] === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(folded.charCodeAt(index) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

const PNR_LABEL =
  /(?:num[eé]ro de r[eé]servation|booking number|code de r[eé]servation|r[eé]f[eé]rence du dossier(?!\s+compagnie)|record locator|booking reference|pnr|r[eé]f\.?\s*amadeus)\s*[:\s]+([A-Z0-9]{5,6})\b/i;

export function emlToText(raw: string) {
  const text = raw.replace(/\r\n/g, "\n");
  const plain = text.match(/Content-Type:\s*text\/plain[^\n]*\n(?:[^\n]*\n)*?\n([\s\S]*?)(?:\n--|\s*$)/i);
  let body = decodeQuotedPrintable(plain?.[1] || text);
  if (/<html|<body|<p[\s>]/i.test(body)) {
    body = body.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  }
  return body.replace(/\s+/g, " ").trim();
}

function money(raw: string) {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** PNR, numéro de billet, passagers, segments et prix fournisseur. Pas de code agence à 8 chiffres. */
export function parseTicketMail(text: string): TicketMailRead {
  const flat = text.replace(/\s+/g, " ").trim();
  const transavia = parseTransaviaConfirmation(text);
  const labeled = flat.match(PNR_LABEL)?.[1]?.toUpperCase() || null;
  const pnr = (transavia?.confirmation_ref || labeled || "").replace(/^\d{8}$/, "") || null;
  const ticket =
    flat.match(/\b(\d{3})[-\s]?(\d{10})\b/)?.[0]?.replace(/[-\s]/g, "") ||
    null;
  const named = (transavia?.travelers || []).map((person) => ({
    firstName: person.first_name,
    lastName: person.last_name,
  }));
  const slash = flat.match(
    /(?:passager|passenger|voyageur)s?\s*[:\s]+([A-Z][A-Z' -]{1,40})\/([A-Z][A-Z' -]{1,40})/i
  );
  const words = flat.match(/(?:passager|passenger|voyageur)s?\s*[:\s]+([A-Za-zÀ-ÿ' -]{3,80})/i);
  let passenger: TicketMailRead["passenger"] = named[0] || null;
  if (!passenger && slash) {
    passenger = {
      firstName: titleName(slash[2]),
      lastName: titleName(slash[1]),
    };
  } else if (!passenger && words && !/\|/.test(words[1])) {
    const parts = words[1].trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      passenger = { firstName: titleName(parts.slice(0, -1).join(" ")), lastName: titleName(parts.at(-1) || "") };
    }
  }
  const passengers = named.length ? named : passenger ? [passenger] : [];
  const segments: TicketSegment[] = (transavia?.flights || []).map((flight) => ({
    flightNumber: flight.flight_number || "",
    from: flight.from,
    to: flight.to,
    cityFrom: flight.city_from,
    cityTo: flight.city_to,
    departureAt: flight.start_at,
    arrivalAt: flight.end_at,
  }));
  const euro = flat.match(/\bTotal\s+([0-9][0-9 .]{0,12}[.,][0-9]{2})\s*(?:€|EUR)(?!\w)/i);
  const priced = flat.match(
    /(?:total|montant|prix|fare)\s*[:\s]*(?:EUR|€|USD|\$)?\s*([0-9][0-9 .]{0,12}[.,][0-9]{2})\s*(EUR|€|USD|\$)?/i
  );
  const price = transavia?.ticket_total?.amount ?? (euro ? money(euro[1]) : priced ? money(priced[1]) : null);
  const mark = `${euro?.[0] || ""} ${priced?.[2] || ""} ${priced?.[0] || ""}`;
  const currency = price == null ? null : /\$|USD/i.test(mark) && !/€|\bEUR\b/i.test(mark) ? "USD" : "EUR";
  return {
    pnr: pnr && !/^\d{8}$/.test(pnr) ? pnr : null,
    ticketNumber: ticket && ticket.length === 13 ? ticket : null,
    passenger,
    passengers,
    segments,
    price,
    currency,
  };
}

/** Une ligne de vol par segment. Le total reste le prix fournisseur du premier trajet. */
export function ticketRowsFromRead(read: TicketMailRead): TicketRowDraft[] {
  const people = (read.passengers?.length ? read.passengers : read.passenger ? [read.passenger] : []).map((person) => ({
    first_name: person.firstName,
    last_name: person.lastName,
  }));
  const segments = read.segments?.length
    ? read.segments
    : [null];
  return segments.map((segment, index) => {
    const details: Record<string, unknown> = {};
    if (read.pnr) details.pnr = read.pnr;
    if (read.ticketNumber) details.ticket_number = read.ticketNumber;
    if (people.length) details.passengers = people;
    if (segment) {
      details.airline = "Transavia";
      details.flight_number = segment.flightNumber;
      details.from = segment.from;
      details.to = segment.to;
      details.city_from = segment.cityFrom;
      details.city_to = segment.cityTo;
    }
    if (index === 0 && read.price != null) {
      details.document_amount = read.price;
      details.document_currency = read.currency || "EUR";
    }
    const title = segment
      ? [segment.cityFrom, segment.cityTo].filter(Boolean).join(" → ") || segment.flightNumber || "Vol"
      : "Vol";
    return {
      title,
      confirmation_ref: read.pnr,
      start_at: segment?.departureAt || null,
      end_at: segment?.arrivalAt || null,
      supplier: segment ? "Transavia" : null,
      details,
    };
  });
}

function titleName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-zà-ÿ])/g, (_match, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function ticketFlightPatch(
  current: { confirmation_ref?: string | null; amount?: number | string | null; details?: Record<string, unknown> | null },
  read: TicketMailRead
) {
  const details: Record<string, unknown> = { ...(current.details || {}) };
  const patch: { confirmation_ref?: string; amount?: number; details: Record<string, unknown> } = { details };
  if (read.pnr) {
    patch.confirmation_ref = read.pnr;
    details.pnr = read.pnr;
  }
  if (read.ticketNumber) details.ticket_number = read.ticketNumber;
  const named = read.passengers?.length ? read.passengers : read.passenger ? [read.passenger] : [];
  if (named.length) {
    const existing = Array.isArray(details.passengers) ? details.passengers : [];
    if (!existing.length) {
      details.passengers = named.map((person) => ({ first_name: person.firstName, last_name: person.lastName }));
    }
  }
  if (read.price != null) {
    details.document_amount = read.price;
    if (read.currency) details.document_currency = read.currency;
  }
  const leg = ticketRowsFromRead(read)[0];
  if (leg?.start_at) {
    return {
      ...patch,
      confirmation_ref: patch.confirmation_ref || leg.confirmation_ref || undefined,
      details: { ...leg.details, ...details },
    };
  }
  return patch;
}
