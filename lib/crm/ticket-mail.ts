/** Lecture simple d’un e-mail ou d’un PDF de billet. Pas d’import Gmail. */

export type TicketMailRead = {
  pnr: string | null;
  ticketNumber: string | null;
  passenger: { firstName: string; lastName: string } | null;
  price: number | null;
  currency: string | null;
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
  /(?:r[eé]f[eé]rence du dossier(?!\s+compagnie)|record locator|booking reference|pnr|r[eé]f\.?\s*amadeus)\s*[:\s]+([A-Z0-9]{5,6})\b/i;

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

/** PNR, numéro de billet, passager et prix, sans deviner un code agence à 8 chiffres. */
export function parseTicketMail(text: string): TicketMailRead {
  const flat = text.replace(/\s+/g, " ").trim();
  const pnr = flat.match(PNR_LABEL)?.[1]?.toUpperCase() || null;
  const ticket =
    flat.match(/\b(\d{3})[-\s]?(\d{10})\b/)?.[0]?.replace(/[-\s]/g, "") ||
    null;
  const slash = flat.match(
    /(?:passager|passenger|voyageur)\s*[:\s]+([A-Z][A-Z' -]{1,40})\/([A-Z][A-Z' -]{1,40})/i
  );
  const words = flat.match(/(?:passager|passenger|voyageur)\s*[:\s]+([A-Za-zÀ-ÿ' -]{3,80})/i);
  let passenger: TicketMailRead["passenger"] = null;
  if (slash) {
    passenger = {
      firstName: titleName(slash[2]),
      lastName: titleName(slash[1]),
    };
  } else if (words) {
    const parts = words[1].trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      passenger = { firstName: titleName(parts.slice(0, -1).join(" ")), lastName: titleName(parts.at(-1) || "") };
    }
  }
  const priced = flat.match(
    /(?:total|montant|prix|fare)\s*[:\s]*(?:EUR|€)?\s*([0-9][0-9 .]{0,12}[.,][0-9]{2})\s*(?:EUR|€)?/i
  );
  const currency = /€|\bEUR\b/i.test(priced?.[0] || "") ? "EUR" : priced ? "EUR" : null;
  return {
    pnr: pnr && !/^\d{8}$/.test(pnr) ? pnr : null,
    ticketNumber: ticket && ticket.length === 13 ? ticket : null,
    passenger,
    price: priced ? money(priced[1]) : null,
    currency,
  };
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
  if (read.passenger) {
    const existing = Array.isArray(details.passengers) ? details.passengers : [];
    if (!existing.length) {
      details.passengers = [{ first_name: read.passenger.firstName, last_name: read.passenger.lastName }];
    }
  }
  if (read.price != null) {
    details.document_amount = read.price;
    if (read.currency) details.document_currency = read.currency;
    const currentAmount = current.amount == null || current.amount === "" ? null : Number(current.amount);
    if (currentAmount == null || !Number.isFinite(currentAmount)) patch.amount = read.price;
  }
  return patch;
}
