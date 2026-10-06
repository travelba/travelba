import { countryName } from "./countries";
import { formatDateFr } from "./dates";
import { formatDateRangeShort, formatMoney } from "./money";
import type { TravelDocType } from "./types";

/** Deux ouvertures de la même page dans cette fenêtre ne font qu’une ligne. */
export const VIEW_DEBOUNCE_MS = 90_000;

const ADDRESS_KEYS = new Set(["address_line", "postal_code", "city", "country"]);
const BILLING_KEYS = new Set([
  "company_name",
  "siret",
  "vat_number",
  "billing_email",
  "billing_address_line",
  "billing_postal_code",
  "billing_city",
  "billing_country",
]);

const PROFILE_LABELS: Record<string, string> = {
  first_name: "prénom",
  last_name: "nom",
  usage_name: "nom d’usage",
  email: "e-mail",
  phone: "téléphone",
  phone_secondary: "second téléphone",
  birth_date: "date de naissance",
  sex: "sexe",
  nationality: "nationalité",
  flying_blue: "Flying Blue",
  loyalty: "cartes de fidélité",
  iban: "IBAN",
};

const CORRIDOR_LABELS: Record<string, string> = {
  IL: "Israël",
  US: "les États-Unis",
  GB: "le Royaume-Uni",
};

export function cleanClientPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split("?")[0].split("#")[0].trim();
  if (!path.startsWith("/mon-compte") || path.includes("..") || path.length > 180) return null;
  return path.replace(/\/+$/, "") || "/mon-compte";
}

/** Libellé d’une page de l’espace. Null si le chemin n’est pas une page client. */
export function clientPathSummary(path: string): string | null {
  const clean = cleanClientPath(path);
  if (!clean) return null;
  if (clean === "/mon-compte") return "A ouvert l’accueil";
  if (clean === "/mon-compte/reservations") return "A ouvert ses séjours";
  const stay = clean.match(/^\/mon-compte\/reservations\/([^/]+)$/);
  if (stay) return `A ouvert le séjour ${decodeStay(stay[1])}`;
  if (clean === "/mon-compte/transactions") return "A ouvert ses transactions";
  if (clean === "/mon-compte/profil") return "A ouvert sa fiche";
  if (clean === "/mon-compte/profil/documents") return "A ouvert ses pièces";
  if (clean === "/mon-compte/profil/compagnons") return "A ouvert ses voyageurs";
  if (clean === "/mon-compte/profil/facturation") return "A ouvert sa facturation";
  if (clean === "/mon-compte/bienvenue") return "A ouvert la bienvenue";
  if (clean === "/mon-compte/carnet") return "A ouvert son carnet";
  return null;
}

function decodeStay(reference: string) {
  try {
    return decodeURIComponent(reference);
  } catch {
    return reference;
  }
}

export function stayReferenceFromPath(path: string) {
  const clean = cleanClientPath(path);
  const stay = clean?.match(/^\/mon-compte\/reservations\/([^/]+)$/);
  return stay ? decodeStay(stay[1]) : null;
}

/** Nom lu par le client : le titre choisi, sinon la destination. */
export function stayDisplayName(title?: string | null, destination?: string | null) {
  return tidyName(title) || tidyName(destination);
}

/** « Tel-Aviv (TB-2026-0055) », ou la référence seule si le séjour n’a pas de nom. */
export function stayMention(reference: string, title?: string | null, destination?: string | null) {
  const ref = tidyName(reference);
  const name = stayDisplayName(title, destination);
  if (name && ref && !sameLabel(name, ref)) return `${name} (${ref})`;
  return name || ref;
}

export function openedStaySummary(reference: string, title?: string | null, destination?: string | null) {
  return `A ouvert le séjour ${stayMention(reference, title, destination)}`;
}

export function stayActivityDetail(input: {
  destination?: string | null;
  title?: string | null;
  start?: string | null;
  end?: string | null;
  /** Nom déjà écrit dans le libellé : on ne le répète pas. */
  shown?: string | null;
}) {
  const shown = tidyName(input.shown);
  const place = tidyName(input.destination);
  const title = tidyName(input.title);
  const extra =
    place && !sameLabel(place, shown) ? place : title && !sameLabel(title, shown) ? title : "";
  const dates = input.start || input.end ? formatDateRangeShort(input.start, input.end) : "";
  const when = dates && dates !== "Dates à confirmer" ? dates : "";
  const text = [extra, when].filter(Boolean).join(" · ");
  return text || null;
}

function sameLabel(a: string, b: string) {
  return a.localeCompare(b, "fr", { sensitivity: "accent" }) === 0;
}

function tidyName(value: string | null | undefined) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 80) return "";
  return text;
}

/** Champs touchés, jamais leurs valeurs. */
export function profileActivitySummary(keys: string[], billingCompanies = false) {
  const labels: string[] = [];
  let address = false;
  let billing = false;
  for (const key of keys) {
    if (ADDRESS_KEYS.has(key)) {
      address = true;
      continue;
    }
    if (BILLING_KEYS.has(key)) {
      billing = true;
      continue;
    }
    const label = PROFILE_LABELS[key];
    if (label && !labels.includes(label)) labels.push(label);
  }
  if (address) labels.push("adresse");
  if (billing || billingCompanies) labels.push("facturation");
  if (!labels.length) return "A mis à jour sa fiche";
  return `A mis à jour sa fiche : ${labels.join(", ")}`;
}

/** Valeurs saisies. L’IBAN n’est jamais recopié. */
export function profileActivityDetail(
  values: Record<string, string | null | undefined>,
  ibanTouched = false
) {
  const parts: string[] = [];
  const name = [tidyName(values.first_name), tidyName(values.last_name)].filter(Boolean).join(" ");
  if (name) parts.push(name);
  if (tidyName(values.usage_name)) parts.push(`nom d’usage ${tidyName(values.usage_name)}`);
  if (tidyName(values.phone)) parts.push(`téléphone ${tidyName(values.phone)}`);
  if (tidyName(values.phone_secondary)) parts.push(`second téléphone ${tidyName(values.phone_secondary)}`);
  if (tidyName(values.email)) parts.push(tidyName(values.email));
  if (values.birth_date) parts.push(`né(e) le ${formatDateFr(values.birth_date)}`);
  if (values.sex === "F") parts.push("femme");
  else if (values.sex === "M") parts.push("homme");
  if (values.nationality) parts.push(countryName(values.nationality));
  const cityLine = [tidyName(values.postal_code), tidyName(values.city)].filter(Boolean).join(" ");
  const address = [tidyName(values.address_line), cityLine, values.country ? countryName(values.country) : ""]
    .filter(Boolean)
    .join(", ");
  if (address) parts.push(address);
  if (tidyName(values.flying_blue)) parts.push(`Flying Blue ${tidyName(values.flying_blue)}`);
  if (tidyName(values.company_name)) parts.push(tidyName(values.company_name));
  if (ibanTouched || values.iban) parts.push("IBAN modifié");
  const text = parts.join(" · ");
  return text ? text.slice(0, 400) : null;
}

export function pieceActivityDetail(piece: {
  first_name?: string | null;
  last_name?: string | null;
  issuing_country?: string | null;
  expires_on?: string | null;
} | null | undefined) {
  if (!piece) return null;
  const who = [tidyName(piece.first_name), tidyName(piece.last_name)].filter(Boolean).join(" ");
  const country = piece.issuing_country ? countryName(piece.issuing_country) : "";
  const expiry = piece.expires_on ? `expire le ${formatDateFr(piece.expires_on)}` : "";
  const text = [who, country, expiry].filter(Boolean).join(" · ");
  return text || null;
}

const DOC_PHRASES: Record<TravelDocType, string> = {
  passport: "un passeport",
  id_card: "une carte d’identité",
  visa: "un visa",
  insurance: "une assurance",
  other: "une pièce",
};

export function documentActivitySummary(
  change: "add" | "remove" | "reuse" | "scan",
  docType?: string | null,
  stay?: string | null
) {
  const where = tidyName(stay);
  const onStay = where ? ` sur le séjour ${where}` : "";
  if (change === "scan") {
    const phrase = docType && docType in DOC_PHRASES ? DOC_PHRASES[docType as TravelDocType] : "une pièce";
    return `A lancé la lecture d’${phrase}`;
  }
  if (change === "remove") return "A retiré une pièce";
  if (change === "reuse") return where ? `A repris une pièce sur le séjour ${where}` : "A repris une pièce sur un séjour";
  const phrase = docType && docType in DOC_PHRASES ? DOC_PHRASES[docType as TravelDocType] : "une pièce";
  return `A ajouté ${phrase}${onStay}`;
}

export function companionActivitySummary(change: "add" | "edit" | "remove", name?: string | null) {
  const who = tidyName(name);
  if (change === "remove") return who ? `A retiré le voyageur ${who}` : "A retiré un voyageur";
  if (change === "edit") return who ? `A modifié le voyageur ${who}` : "A modifié un voyageur";
  return who ? `A ajouté le voyageur ${who}` : "A ajouté un voyageur";
}

const RELATION_LABELS: Record<string, string> = {
  conjoint: "conjoint(e)",
  enfant: "enfant",
  parent: "parent",
  famille: "famille",
  ami: "ami(e)",
  autre: "autre",
};

export function companionActivityDetail(input: {
  relationship?: string | null;
  birthDate?: string | null;
  nationality?: string | null;
  phone?: string | null;
}) {
  const parts = [
    input.relationship ? RELATION_LABELS[input.relationship] || "" : "",
    input.birthDate ? `né(e) le ${formatDateFr(input.birthDate)}` : "",
    input.nationality ? countryName(input.nationality) : "",
    tidyName(input.phone),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ").slice(0, 400) : null;
}

export function serviceActivitySummary(input: {
  change: "ask" | "cancel" | "decline" | "resume" | "address";
  kind: string;
  leg?: string | null;
  reference: string;
  title?: string | null;
  destination?: string | null;
}) {
  const service = serviceName(input.kind, input.leg);
  const stay = `le séjour ${stayMention(input.reference, input.title, input.destination)}`;
  if (input.change === "cancel") return `A annulé ${service} sur ${stay}`;
  if (input.change === "decline") return `A refusé ${service} sur ${stay}`;
  if (input.change === "resume") return `A repris ${service} sur ${stay}`;
  if (input.change === "address") return `A modifié l’adresse de ${service} sur ${stay}`;
  return `A demandé ${service} sur ${stay}`;
}

function serviceName(kind: string, leg?: string | null) {
  const side = leg === "departure" ? "à l’aller" : leg === "arrival" ? "au retour" : "";
  if (kind === "chauffeur") return side ? `un transfert ${side}` : "un transfert";
  if (kind === "greeter") return side ? `un accueil VIP ${side}` : "un accueil VIP";
  if (kind === "checkin") return "l’enregistrement en ligne";
  if (kind === "visa") return "une formalité";
  return "un service";
}

export function payActivitySummary(method: string, payer: "company" | "personal") {
  const part = payer === "company" ? "société" : "particulier";
  if (method === "revolut") return `A demandé un virement pour l’encours ${part}`;
  return `A commencé un règlement par carte de l’encours ${part}`;
}

export function payActivityDetail(amount: number, currency: string) {
  if (!Number.isFinite(amount)) return null;
  return formatMoney(amount, currency);
}

export function visaActivitySummary(
  reference: string,
  country: string,
  title?: string | null,
  destination?: string | null
) {
  const where = CORRIDOR_LABELS[country] || "une formalité";
  return `A validé la formalité pour ${where} sur le séjour ${stayMention(reference, title, destination)}`;
}

export function formalitiesActivitySummary(reference: string, title?: string | null, destination?: string | null) {
  return `A envoyé des pièces de formalité pour le séjour ${stayMention(reference, title, destination)}`;
}

export function shareActivitySummary(firstName: string, stay?: string | null) {
  const who = tidyName(firstName);
  const where = tidyName(stay);
  if (who && where) return `A envoyé le lien du séjour ${where} à ${who}`;
  if (where) return `A envoyé le lien du séjour ${where}`;
  return who ? `A envoyé le lien du séjour à ${who}` : "A envoyé le lien du séjour";
}

export function calendarActivitySummary(reference: string, title?: string | null, destination?: string | null) {
  return `A téléchargé le calendrier du séjour ${stayMention(reference, title, destination)}`;
}

export function billingActivitySummary(reference: string, title?: string | null, destination?: string | null) {
  return `A changé la facturation du séjour ${stayMention(reference, title, destination)}`;
}

export function shouldRecordView(previousAt: string | null, now: Date, windowMs = VIEW_DEBOUNCE_MS) {
  if (!previousAt) return true;
  const previous = new Date(previousAt).getTime();
  if (Number.isNaN(previous)) return true;
  return now.getTime() - previous > windowMs;
}

export type CustomerActivityInput = {
  customerId: string;
  authUserId: string;
  action: string;
  summary: string;
  path?: string | null;
  bookingId?: string | null;
  detail?: string | null;
};

/** Écrit une ligne d’activité. Une ouverture par l’agence n’est pas celle du client. */
export async function recordCustomerActivity(input: CustomerActivityInput) {
  const summary = input.summary.replace(/\s+/g, " ").trim().slice(0, 180);
  const detail = input.detail?.replace(/\s+/g, " ").trim().slice(0, 400) || null;
  const customerId = input.customerId.trim();
  const authUserId = input.authUserId.trim();
  if (!summary || !customerId || !authUserId) return;
  try {
    const { cookies } = await import("next/headers");
    const { DESK_COOKIE, deskBypass } = await import("./desk-mode");
    const jar = await cookies();
    if (deskBypass(jar.get(DESK_COOKIE)?.value, authUserId)) return;

    const { createServiceClient } = await import("@/lib/supabase/admin");
    const admin = createServiceClient();
    if (input.action === "view" && input.path) {
      const { data } = await admin
        .from("crm_customer_activity")
        .select("created_at")
        .eq("customer_id", customerId)
        .eq("action", "view")
        .eq("path", input.path)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const previousAt = typeof data?.created_at === "string" ? data.created_at : null;
      if (!shouldRecordView(previousAt, new Date())) return;
    }
    const { error } = await admin.from("crm_customer_activity").insert({
      customer_id: customerId,
      auth_user_id: authUserId,
      action: input.action,
      summary,
      detail,
      path: input.path || null,
      booking_id: input.bookingId || null,
    });
    if (error) throw new Error(error.message || "insert");
  } catch {
    console.error("[customer-activity] enregistrement impossible");
  }
}
