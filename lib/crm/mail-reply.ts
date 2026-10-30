/** Réponse à un message reçu. Le texte se prépare ici ; l’envoi attend la confirmation. */

import { HOTEL_DESK_FROM, cleanRecipients } from "./hotel-desk";

const CARD_RUN = /(?:\d[ -]?){13,19}/;
const MESSAGE_ID = /<[^<>\s]+>/g;

export type ReplyAddresses = {
  to: string[];
  cc: string[];
};

export type ThreadingHeaders = {
  "In-Reply-To": string;
  References: string;
};

function parisDay(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
}

function agencyAddress(email: string) {
  if (email === HOTEL_DESK_FROM) return true;
  const domain = email.split("@")[1] || "";
  return domain === "travelba.fr" || domain.endsWith(".travelba.fr");
}

/** À l’expéditeur. Les autres destinataires d’origine passent en copie. */
export function replyAddresses(input: { from: string; originals: string[] }): ReplyAddresses {
  const from = cleanRecipients([input.from]).filter((email) => !agencyAddress(email));
  const originals = cleanRecipients(input.originals).filter((email) => !agencyAddress(email));
  const sender = from[0] || "";
  if (!sender) return { to: originals, cc: [] };
  return { to: [sender], cc: originals.filter((email) => email !== sender) };
}

const SUPPLIER_SKIP = /little-?emperors|expedia|taap/i;
const AUTO_LOCAL = /^(mailer-daemon|postmaster|mail-daemon|noreply|no-reply|donotreply|notifications?)$/i;

/** Un tour du fil : l’expéditeur, les destinataires, les copies. */
export type ThreadParty = {
  /** Vrai pour une réponse de l’hôtel, pas pour une absence ni pour notre envoi. */
  inbound?: boolean;
  from?: string;
  fromName?: string;
  to?: string[];
  cc?: string[];
};

export type StoredThreadParty = {
  direction?: string | null;
  from_email?: string | null;
  counts_as_reply?: boolean | null;
  to_emails?: string[] | null;
  cc_emails?: string[] | null;
};

/** Adresse d’hôtel. L’agence, le fournisseur de plateforme et le client n’y entrent pas. */
export function supplierAddress(email: string, exclude: string[] = []) {
  const clean = cleanRecipients([email])[0] || "";
  if (!clean || agencyAddress(clean) || SUPPLIER_SKIP.test(clean)) return "";
  const local = clean.split("@")[0] || "";
  if (AUTO_LOCAL.test(local)) return "";
  const skipped = new Set(cleanRecipients(exclude));
  if (skipped.has(clean)) return "";
  return clean;
}

export function partiesFromThreadRows(rows: StoredThreadParty[]): ThreadParty[] {
  return rows.map((row) => ({
    inbound: row.direction === "in" && Boolean(row.counts_as_reply),
    from: row.from_email || "",
    to: row.to_emails || [],
    cc: row.cc_emails || [],
  }));
}

/** Toutes les adresses d’hôtel vues dans le fil. */
export function threadSupplierEmails(parties: ThreadParty[], exclude: string[] = []) {
  const found: string[] = [];
  for (const party of parties) {
    if (party.inbound) found.push(party.from || "");
    found.push(...(party.to || []), ...(party.cc || []));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of cleanRecipients(found)) {
    const clean = supplierAddress(email, exclude);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * Relance : le destinataire d’origine reste À, les autres personnes du fil passent en copie.
 * Réponse : l’expéditeur du message reste À, le reste du fil en copie.
 */
export function threadPartyAddresses(input: {
  mode: "reply" | "followup";
  from?: string;
  originals: string[];
  parties: ThreadParty[];
  exclude?: string[];
}): ReplyAddresses {
  const exclude = input.exclude || [];
  const suppliers = threadSupplierEmails(input.parties, exclude);
  if (input.mode === "reply") {
    const base = replyAddresses({ from: input.from || "", originals: input.originals });
    const to = base.to.map((email) => supplierAddress(email, exclude)).filter(Boolean);
    const seen = new Set(to);
    const cc = cleanRecipients([...base.cc, ...suppliers]).filter((email) => {
      const clean = supplierAddress(email, exclude);
      return Boolean(clean) && !seen.has(clean);
    });
    if (to.length) return { to, cc };
    const fallback = suppliers.filter((email) => !cc.includes(email));
    return { to: fallback.slice(0, 1), cc: [...cc, ...fallback.slice(1)] };
  }
  const to = cleanRecipients(input.originals).map((email) => supplierAddress(email, exclude)).filter(Boolean);
  const seen = new Set(to);
  const cc = suppliers.filter((email) => !seen.has(email));
  if (!to.length && cc.length) return { to: [cc[0]], cc: cc.slice(1) };
  return { to, cc };
}

/**
 * Le brouillon peut décocher un destinataire d’origine.
 * Une personne apparue dans le fil (réponse ou copie) reste dans l’envoi.
 */
export function includeAppearedContacts(input: {
  mode: "reply" | "followup";
  from?: string;
  originals: string[];
  parties: ThreadParty[];
  postedTo: string[];
  postedCc?: string[];
  exclude?: string[];
}): ReplyAddresses {
  const planned = threadPartyAddresses(input);
  const originalSet = new Set(cleanRecipients(input.originals));
  const to = cleanRecipients(input.postedTo);
  const seen = new Set(to);
  if (input.mode === "reply") {
    for (const email of planned.to) {
      if (seen.has(email)) continue;
      to.unshift(email);
      seen.add(email);
    }
  }
  const cc = cleanRecipients(input.postedCc || []).filter((email) => !seen.has(email));
  const appeared = [...planned.to, ...planned.cc].filter((email) => !originalSet.has(email));
  for (const email of appeared) {
    if (seen.has(email) || cc.includes(email)) continue;
    cc.push(email);
    seen.add(email);
  }
  if (!to.length && cc.length) {
    const first = cc.shift();
    if (first) to.push(first);
  }
  return { to, cc };
}

function personName(value: string) {
  const trimmed = value.replace(/"/g, "").replace(/<[^>]*>/g, "").trim();
  if (!trimmed || trimmed.includes("@")) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: "", lastName: parts[0].slice(0, 80) };
  return { firstName: parts[0].slice(0, 80), lastName: parts.slice(1).join(" ").slice(0, 80) };
}

/** Adresses nouvelles du fil, avec le nom lu sur l’expéditeur quand il est écrit. */
export function threadContactCandidates(parties: ThreadParty[], exclude: string[] = []) {
  const byEmail = new Map<string, string>();
  for (const party of parties) {
    if (party.inbound && party.from) {
      const email = supplierAddress(party.from, exclude);
      if (email && !byEmail.has(email)) byEmail.set(email, party.fromName || "");
    }
    for (const raw of [...(party.to || []), ...(party.cc || [])]) {
      const email = supplierAddress(raw, exclude);
      if (email && !byEmail.has(email)) byEmail.set(email, "");
    }
  }
  return [...byEmail.entries()].map(([email, name]) => ({ email, name }));
}

/** Contacts à créer. Une adresse déjà sur l’hôtel, même avec un autre nom, ne revient pas. */
export function hotelContactsToAdd(input: {
  existing: string[];
  candidates: { email: string; name?: string }[];
  exclude?: string[];
}) {
  const have = new Set(cleanRecipients(input.existing));
  const added: { email: string; firstName: string; lastName: string }[] = [];
  for (const candidate of input.candidates) {
    const email = supplierAddress(candidate.email, input.exclude || []);
    if (!email || have.has(email)) continue;
    have.add(email);
    const name = personName(candidate.name || "");
    added.push({ email, firstName: name.firstName, lastName: name.lastName });
  }
  return added;
}

/** Citation courte, sans numéro de carte. */
export function replyQuote(body: string) {
  const lines: string[] = [];
  let size = 0;
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || CARD_RUN.test(trimmed)) continue;
    if (lines.length >= 8 || size + trimmed.length > 500) {
      lines.push("> …");
      break;
    }
    lines.push(`> ${trimmed}`);
    size += trimmed.length;
  }
  return lines.join("\n");
}

/**
 * Brouillon français. La citation précède la signature, pour que l’identité
 * du séjour se glisse avant « Bien à vous » sans couper la citation.
 */
export function replyDraftBody(input: { body: string; at?: string | null; speaker?: string | null }) {
  const quote = replyQuote(input.body);
  const when = parisDay(input.at);
  const speaker = (input.speaker || "").trim() || "L’hôtel";
  const wrote = when ? `Le ${when}, ${speaker} a écrit :` : `${speaker} a écrit :`;
  const lines = ["Bonjour,", "", "Nous faisons suite à votre message.", ""];
  if (quote) lines.push(wrote, quote, "");
  lines.push("Bien à vous,", "", "Travel Business Agency");
  return lines.join("\n");
}

function angleId(value: string) {
  const trimmed = value.trim();
  const found = trimmed.match(/<[^<>\s]+>/);
  if (found) return found[0];
  if (trimmed.includes("@") && !/\s/.test(trimmed)) return `<${trimmed.replace(/^<|>$/g, "")}>`;
  return "";
}

/** In-Reply-To vise ce message. References reprend la chaîne, puis cet identifiant. */
export function threadingHeaders(input: { messageId: string; references?: string; inReplyTo?: string }): ThreadingHeaders | null {
  const id = angleId(input.messageId);
  if (!id) return null;
  const prior = `${input.references || ""} ${input.inReplyTo || ""}`.match(MESSAGE_ID) || [];
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const item of [...prior, id]) {
    if (seen.has(item)) continue;
    seen.add(item);
    chain.push(item);
  }
  return { "In-Reply-To": id, References: chain.join(" ") };
}

/** Lien vers le bureau de l’hôtel, le brouillon de réponse déjà ouvert. */
export function replyHref(bookingId: string, itemId: string, threadId: string) {
  const params = new URLSearchParams({ hotel: itemId, repondre: threadId });
  return `/admin/reservations/${bookingId}?${params.toString()}`;
}
