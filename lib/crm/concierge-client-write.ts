import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "@/lib/crm/audit-events";
import { formatDateFr } from "@/lib/crm/dates";
import { greetingGivenName } from "@/lib/crm/identity";
import { LOYALTY_PROGRAMS, type LoyaltyKey } from "@/lib/crm/loyalty";
import { firstNameOnlyMatches, firstNamesMatch, lastNamesMatch, nameTokens } from "@/lib/crm/person-match";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { storedCompanionPhone } from "@/lib/crm/trip-share";
import { updateVoyageur } from "@/lib/crm/traveler-update";
import { scrubClientText, type ReplyLang } from "@/lib/crm/whatsapp-concierge";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export const CONCIERGE_WRITE_SOURCE = "whatsapp_concierge";

export type ConciergeTraveler = {
  voyageurId: string;
  bookingId: string;
  reference: string;
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  usageName: string | null;
  companionId: string | null;
  isHolder: boolean;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
};

type ContactIntent = {
  kind: "contact";
  name: string | null;
  self: boolean;
  reference: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
};

type PreferenceIntent = {
  kind: "preference";
  name: string | null;
  self: boolean;
  reference: string | null;
  program: LoyaltyKey;
  number: string;
};

type RequestIntent = {
  kind: "request";
  name: string | null;
  self: boolean;
  reference: string | null;
  text: string;
};

type PieceIntent = {
  kind: "piece";
  name: string | null;
  self: boolean;
  reference: string | null;
  docType: "passport" | "id_card" | "other";
};

export type ClientWriteIntent = ContactIntent | PreferenceIntent | RequestIntent | PieceIntent;

const MONTHS: Record<string, string> = {
  janvier: "01",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12",
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase();
}

/** Paiement, annulation, envoi à un tiers : le concierge ne les fait pas. */
export function clientWriteHandsOff(message: string) {
  const text = fold(message);
  if (/\b(annul\w*|cancel\w*|paiement|payer|virement|encaisse\w*|rembourse\w*|carte bancaire)\b/.test(text)) return true;
  if (/\b(envoy\w*|ecri\w*|transmet\w*)\b/.test(text) && /\b(hotel|fournisseur|chauffeur|tiers)\b/.test(text)) return true;
  if (/\b(reserv\w*|commande\w*|book)\b/.test(text) && /\b(chauffeur|transfert|hotel|chambre|vol)\b/.test(text)) return true;
  return false;
}

function referenceOf(message: string) {
  const match = message.match(/\bTB-\d{4}-\d{4}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function phoneOf(message: string) {
  const match = message.match(/(?:\+\d{1,3}|00\d{1,3}|0[1-9])(?:[\s.\u00a0-]?\d){8,14}/);
  if (!match) return null;
  const stored = storedCompanionPhone(match[0]);
  return stored.ok ? stored.phone : null;
}

function emailOf(message: string) {
  const match = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function birthOf(message: string) {
  const iso = message.match(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];
  const numeric = message.match(/\b(\d{1,2})[./](\d{1,2})[./]((?:19|20)\d{2})\b/);
  if (numeric) {
    const day = numeric[1].padStart(2, "0");
    const month = numeric[2].padStart(2, "0");
    const value = `${numeric[3]}-${month}-${day}`;
    return Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31 ? value : null;
  }
  const spoken = fold(message).match(
    /\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+((?:19|20)\d{2})\b/
  );
  if (!spoken) return null;
  const month = MONTHS[spoken[2]];
  return month ? `${spoken[3]}-${month}-${spoken[1].padStart(2, "0")}` : null;
}

function personName(message: string) {
  const patterns = [
    /\b(?:de|pour|d'|d’)\s+([A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]+){0,3})/u,
    /\b([A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]+){0,2})\s+(?:au|son|sa|le|un)\s+(?:t[eé]l[eé]phone|num[eé]ro|e-?mail|passeport)/iu,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const name = match?.[1]?.trim();
    if (!name) continue;
    if (/^(t[eé]l[eé]phone|num[eé]ro|mail|naissance|demande|pr[eé]f[eé]rence)$/i.test(name)) continue;
    return name;
  }
  return null;
}

function selfAsked(message: string) {
  return /\b(mon|ma|mes)\b/.test(fold(message));
}

function programOf(message: string): { program: LoyaltyKey; number: string } | null {
  const text = fold(message);
  for (const program of LOYALTY_PROGRAMS) {
    const label = fold(program.label);
    if (!text.includes(label) && !text.includes(program.key.replace(/_/g, " "))) continue;
    const number = message.match(/\b[A-Z0-9][A-Z0-9-]{4,}\b/i);
    if (!number) return null;
    return { program: program.key, number: number[0] };
  }
  return null;
}

function requestText(message: string) {
  const match = message.match(
    /(?:demande sp[eé]ciale|demande particuli[eè]re|note[rz]* que|à noter|a noter)\s*[:,]?\s*(.+)$/i
  );
  const text = (match?.[1] || "").replace(/[.!?]+$/g, "").trim();
  return safeClientNote(text);
}

function safeClientNote(value: string) {
  const lines = value.split(/\n/).filter((line) => {
    const compact = line.replace(/\s/g, "");
    return !/^[A-Z0-9<]{20,}$/.test(compact);
  });
  return scrubClientText(lines.join(" ")).slice(0, 400);
}

/**
 * Ce que le client pourrait faire dans son espace : contact, préférence,
 * demande, pièce. Null si ce n’est pas un geste, ou si l’agence doit valider.
 */
export function parseClientSpaceWrite(message: string, opts?: { hasFile?: boolean }): ClientWriteIntent | null {
  const raw = message.trim();
  if (!raw || clientWriteHandsOff(raw)) return null;
  const text = fold(raw);
  const reference = referenceOf(raw);
  const name = personName(raw);
  const self = selfAsked(raw);
  const verb = /\b(ajout\w*|met(?:s|tez|tre)?|enregistr\w*|modifi\w*|chang\w*|indiqu\w*|renseign\w*|not\w*)\b/.test(text);
  const phone = phoneOf(raw);
  const email = emailOf(raw);
  const birth = birthOf(raw);
  const contactTopic = /telephone|numero|e-?mail|courriel|naissance|nee le|ne\(e\)/.test(text);
  if (verb && (contactTopic || phone || email || birth) && (phone || email || birth)) {
    return { kind: "contact", name, self, reference, phone, email, birthDate: birth };
  }
  const preference = programOf(raw);
  if (verb && preference && /fidel|preference|programme|carte|flying|bonvoy|accor|skywards/.test(text)) {
    return { kind: "preference", name, self, reference, program: preference.program, number: preference.number };
  }
  const note = requestText(raw);
  if (verb && note && /demande|note/.test(text)) {
    return { kind: "request", name, self, reference, text: note };
  }
  if (opts?.hasFile && /passeport|piece d'identite|carte d'identite/.test(text)) {
    const docType = /carte d'identite/.test(text) ? "id_card" : /passeport/.test(text) ? "passport" : "other";
    return { kind: "piece", name, self, reference, docType };
  }
  return null;
}

function travelerMatches(query: string, row: ConciergeTraveler) {
  const tokens = nameTokens(query);
  if (tokens.length <= 1) {
    return firstNameOnlyMatches(query, row.firstName) || firstNamesMatch(query, row.firstName);
  }
  const given = tokens.slice(0, -1).join(" ");
  const last = tokens[tokens.length - 1];
  const givenOk = firstNameOnlyMatches(given, row.firstName) || firstNamesMatch(given, row.firstName);
  const lastOk = lastNamesMatch(last, row.lastName) || lastNamesMatch(last, row.usageName);
  return givenOk && lastOk;
}

export function spokenPhone(value: string) {
  const parsed = parsePhoneNumberFromString(value);
  return parsed?.formatInternational() || value;
}

export type PlannedClientWrite = {
  intent: ClientWriteIntent;
  traveler: ConciergeTraveler | null;
  customerId: string;
  bookingId: string | null;
  reference: string | null;
};

export function matchClientWrite(
  intent: ClientWriteIntent,
  party: ConciergeTraveler[]
): { ok: true; plan: PlannedClientWrite } | { ok: false; message: string } {
  let rows = party;
  if (intent.reference) {
    rows = rows.filter((row) => row.reference.toUpperCase() === intent.reference);
    if (!rows.length) return { ok: false, message: "Ce séjour n’est pas sur votre dossier." };
  }
  if (intent.kind === "request" && !intent.name && !intent.self) {
    const stays = [...new Map(rows.map((row) => [row.bookingId, row])).values()];
    if (stays.length !== 1) return { ok: false, message: "Sur quel séjour dois-je noter cette demande ?" };
    return {
      ok: true,
      plan: {
        intent,
        traveler: null,
        customerId: stays[0].customerId,
        bookingId: stays[0].bookingId,
        reference: stays[0].reference,
      },
    };
  }
  const named = intent.self && !intent.name ? rows.filter((row) => row.isHolder) : rows.filter((row) => intent.name && travelerMatches(intent.name, row));
  if (!intent.name && !intent.self) return { ok: false, message: "De qui s’agit-il ?" };
  if (!named.length) {
    const who = intent.name || "cette personne";
    return { ok: false, message: `Je ne trouve pas ${who} sur vos séjours.` };
  }
  const ids = [...new Set(named.map((row) => row.voyageurId))];
  if (ids.length > 1) return { ok: false, message: "Plusieurs voyageurs correspondent. Précisez le nom." };
  const traveler = named[0];
  return {
    ok: true,
    plan: {
      intent,
      traveler,
      customerId: traveler.customerId,
      bookingId: traveler.bookingId,
      reference: traveler.reference,
    },
  };
}

function given(traveler: ConciergeTraveler | null, fallback: string | null) {
  return greetingGivenName(traveler?.firstName) || fallback || "ce voyageur";
}

export function clientWriteSummary(
  lang: ReplyLang,
  plan: PlannedClientWrite,
  before?: { phone?: string | null; email?: string | null }
) {
  const who = given(plan.traveler, plan.intent.name);
  const intent = plan.intent;
  if (intent.kind === "contact") return contactSummary(lang, who, intent, before);
  if (intent.kind === "preference") {
    const program = LOYALTY_PROGRAMS.find((row) => row.key === intent.program)?.label || "le programme";
    if (lang === "en") return `I’ve noted ${program} for ${who}.`;
    if (lang === "he") return `${program} : ${who}.`;
    return `J’ai noté ${program} pour ${who}.`;
  }
  if (intent.kind === "request") {
    if (lang === "en") return `I’ve noted the request: ${intent.text}.`;
    if (lang === "he") return intent.text;
    return `J’ai noté la demande : ${intent.text}.`;
  }
  const piece = intent.docType === "passport" ? "passeport" : intent.docType === "id_card" ? "carte d’identité" : "pièce";
  if (lang === "en") return `I’ve saved ${who}’s document in your papers.`;
  if (lang === "he") return who;
  return `J’ai enregistré le ${piece} de ${who} dans le coffre.`;
}

function contactSummary(
  lang: ReplyLang,
  who: string,
  intent: ContactIntent,
  before?: { phone?: string | null; email?: string | null }
) {
  if (lang === "fr" && intent.phone && before?.phone && before.phone === intent.phone && !intent.email && !intent.birthDate) {
    return `Le numéro de ${who} est déjà celui-ci : ${spokenPhone(intent.phone)}.`;
  }
  const parts: string[] = [];
  if (intent.phone) {
    const shown = spokenPhone(intent.phone);
    if (lang === "en") parts.push(`${before?.phone ? "updated" : "added"} ${who}’s number: ${shown}`);
    else if (lang === "he") parts.push(`${who} : ${shown}`);
    else parts.push(`${before?.phone ? "mis à jour" : "ajouté"} le numéro de ${who} : ${shown}`);
  }
  if (intent.email) {
    if (lang === "en") parts.push(`added ${who}’s email: ${intent.email}`);
    else if (lang === "he") parts.push(intent.email);
    else parts.push(intent.phone ? `son e-mail : ${intent.email}` : `ajouté l’e-mail de ${who} : ${intent.email}`);
  }
  if (intent.birthDate) {
    const shown = formatDateFr(intent.birthDate);
    if (lang === "en") parts.push(`noted ${who}’s date of birth: ${shown}`);
    else if (lang === "he") parts.push(shown);
    else parts.push(intent.phone || intent.email ? `sa date de naissance : ${shown}` : `noté la date de naissance de ${who} : ${shown}`);
  }
  if (!parts.length) return lang === "en" ? "I couldn’t update that." : "Je n’ai pas pu modifier ce voyageur.";
  if (lang === "en") return `I’ve ${parts.join(", ")}.`;
  if (lang === "he") return parts.join(", ");
  return `J’ai ${parts.join(", ")}.`;
}

export async function commitClientChange(
  admin: SupabaseClient,
  input: {
    plan: PlannedClientWrite;
    staffId?: string | null;
    piecePath?: string | null;
  }
) {
  const { plan } = input;
  const traveler = plan.traveler;
  try {
    if (plan.intent.kind === "contact" || plan.intent.kind === "preference") {
      if (!traveler) return { ok: false as const, message: "Je ne trouve pas ce voyageur sur vos séjours." };
      const saved = await updateVoyageur(
        {
          voyageur_id: traveler.voyageurId,
          telephone: plan.intent.kind === "contact" ? plan.intent.phone : null,
          email: plan.intent.kind === "contact" ? plan.intent.email : null,
          date_naissance: plan.intent.kind === "contact" ? plan.intent.birthDate : null,
          programme: plan.intent.kind === "preference" ? plan.intent.program : null,
          numero_fidelite: plan.intent.kind === "preference" ? plan.intent.number : null,
        },
        admin,
        { customerId: plan.customerId, bookingIds: plan.bookingId ? [plan.bookingId] : null }
      );
      const summary = clientWriteSummary("fr", plan, { phone: traveler.phone, email: traveler.email });
      await journalConciergeChange(admin, {
        summary,
        customerId: saved.client_id,
        bookingId: saved.dossier_id,
        staffId: input.staffId,
        voyageurId: saved.voyageur_id,
        champs: saved.champs,
      });
      return { ok: true as const, summary, bookingId: saved.dossier_id, customerId: saved.client_id };
    }
    if (plan.intent.kind === "request") {
      if (!plan.bookingId) return { ok: false as const, message: "Sur quel séjour dois-je noter cette demande ?" };
      await noteStayRequest(admin, plan.bookingId, plan.intent.text);
      const summary = clientWriteSummary("fr", plan);
      await journalConciergeChange(admin, {
        summary,
        customerId: plan.customerId,
        bookingId: plan.bookingId,
        staffId: input.staffId,
        voyageurId: traveler?.voyageurId || null,
        champs: ["demande"],
      });
      return { ok: true as const, summary, bookingId: plan.bookingId, customerId: plan.customerId };
    }
    const summary = clientWriteSummary("fr", plan);
    if (input.piecePath && traveler) {
      await linkPiece(admin, {
        path: input.piecePath,
        customerId: plan.customerId,
        companionId: traveler.isHolder ? null : traveler.companionId,
        docType: plan.intent.docType,
        firstName: traveler.firstName,
        lastName: traveler.lastName,
      });
    }
    await journalConciergeChange(admin, {
      summary,
      customerId: plan.customerId,
      bookingId: plan.bookingId,
      staffId: input.staffId,
      voyageurId: traveler?.voyageurId || null,
      champs: ["piece"],
      piece: plan.intent.docType,
    });
    return { ok: true as const, summary, bookingId: plan.bookingId, customerId: plan.customerId };
  } catch (err) {
    const message = err instanceof McpWriteError ? err.message : "Je n’ai pas pu enregistrer ce changement.";
    return { ok: false as const, message };
  }
}

async function noteStayRequest(admin: SupabaseClient, bookingId: string, text: string) {
  const { data: hotels } = await admin
    .from("crm_booking_items")
    .select("id, details")
    .eq("booking_id", bookingId)
    .eq("kind", "hotel");
  const rows = (hotels || []) as { id: string; details: Record<string, unknown> | null }[];
  if (rows.length === 1) {
    const details = { ...(rows[0].details || {}) };
    const current = typeof details.special_requests === "string" ? details.special_requests.trim() : "";
    details.special_requests = current && !current.includes(text) ? `${current}\n${text}` : current || text;
    const { error } = await admin.from("crm_booking_items").update({ details }).eq("id", rows[0].id);
    if (error) throw new McpWriteError("La demande n’a pas été notée.");
    return;
  }
  const { data: booking } = await admin.from("crm_bookings").select("notes_client").eq("id", bookingId).maybeSingle();
  const current = typeof booking?.notes_client === "string" ? booking.notes_client.trim() : "";
  const next = current && !current.includes(text) ? `${current}\n${text}` : current || text;
  const { error } = await admin.from("crm_bookings").update({ notes_client: next }).eq("id", bookingId);
  if (error) throw new McpWriteError("La demande n’a pas été notée.");
}

async function linkPiece(
  admin: SupabaseClient,
  input: {
    path: string;
    customerId: string;
    companionId: string | null;
    docType: string;
    firstName: string | null;
    lastName: string | null;
  }
) {
  const { error } = await admin
    .from("crm_travel_documents")
    .update({
      companion_id: input.companionId,
      doc_type: input.docType,
      first_name: input.firstName,
      last_name: input.lastName,
    })
    .eq("storage_path", input.path)
    .eq("customer_id", input.customerId);
  if (error) throw new McpWriteError("La pièce n’a pas été reliée.");
}

export async function journalConciergeChange(
  admin: SupabaseClient,
  input: {
    summary: string;
    customerId: string;
    bookingId: string | null;
    staffId?: string | null;
    voyageurId: string | null;
    champs: string[];
    piece?: string;
  }
) {
  const summary = input.summary.replace(/\s+/g, " ").trim().slice(0, 180);
  const row = toAuditRow({
    actorKind: input.staffId ? "human" : "auto",
    actorId: input.staffId || input.customerId,
    action: "concierge_client",
    bookingId: input.bookingId,
    customerId: input.customerId,
    summary,
    source: CONCIERGE_WRITE_SOURCE,
    detail: {
      source: CONCIERGE_WRITE_SOURCE,
      voyageur_id: input.voyageurId,
      champs: input.champs,
      ...(input.piece ? { doc_type: input.piece } : {}),
    },
  });
  const audit = await admin.from("crm_audit_events").insert(row);
  const missingSource =
    audit.error &&
    (audit.error.code === "42703" ||
      audit.error.code === "PGRST204" ||
      /schema cache|column .*source|source .*does not exist/i.test(audit.error.message || ""));
  if (missingSource) {
    const { source: _source, ...rest } = row;
    await admin.from("crm_audit_events").insert(rest);
  }
  const activity = {
    customer_id: input.customerId,
    auth_user_id: null,
    action: "concierge",
    summary: `Le concierge : ${summary}`.slice(0, 180),
    detail: summary,
    booking_id: input.bookingId,
  };
  await admin.from("crm_customer_activity").insert(activity);
}
