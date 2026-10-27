import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { createBookingSchema, isIsoDate, parseBody } from "@/lib/crm/admin-schemas";
import { dossierFlightStamp, timezoneForIata } from "@/lib/crm/airport-time";
import { inferAirlineIata } from "@/lib/crm/brand-marks";
import { clearPrintedIataDoubt } from "@/lib/crm/flight-route";
import { composeAccueilVip, parseAccueilVipService, readAccueilVipLegs, type AccueilVipFlight } from "@/lib/crm/accueil-vip";
import { resyncAccueilVip } from "@/lib/crm/accueil-vip-sync";
import { addStaffBookingCard, patchStaffBookingCard } from "@/lib/crm/booking-item-write";
import { createStaffBooking, StaffWriteError, type StaffBookingInput } from "@/lib/crm/booking-create";
import {
  bookingChargeExternalId,
  isStayAmountKind,
  itemIncludedInLedger,
  ledgerWarning,
  refreshBookingLedger,
  refreshTicketingFee,
} from "@/lib/crm/bookings";
import { toAuditRow } from "@/lib/crm/audit-events";
import { noteCarnetAdditions } from "@/lib/crm/carnet-addition";
import { detailsForCardVisibility, keptHiddenFromClient } from "@/lib/crm/carnet";
import { resolveBillingCustomerId } from "@/lib/crm/company-role";
import { customerEmailError, normalizeCustomerEmail } from "@/lib/crm/customer-email";
import { addIsoDays } from "@/lib/crm/dates";
import { resolveNationality } from "@/lib/crm/countries";
import { companionKey, holderKey } from "@/lib/crm/household";
import { joinConfirmationRefs, statedTicketCount } from "@/lib/crm/item-match";
import { leCardFill, loadLeReservation } from "@/lib/crm/mcp-le";
import { McpReadError } from "@/lib/crm/mcp-passport";
import { parseMoney } from "@/lib/crm/money";
import { defaultBillingCompany, type PayerCompany } from "@/lib/crm/payer";
import { addedTravelerNames, holderMatchesAddedTraveler, sameAddedTraveler, type PersonIdentity } from "@/lib/crm/person-match";
import { isAutoTicketingExpense, TICKETING_FEE_OFF } from "@/lib/crm/ticketing-fee";
import { staffStayLabel, withoutHomeCity } from "@/lib/crm/staff-stay";
import { storedCompanionPhone } from "@/lib/crm/trip-share";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import { cloneTravelDocument, insertTravelDocument } from "@/lib/crm/travel-document-write";
import { countsAsCarnetCard, isActiveItem, isLedgerExpenseKind, type CrmBooking, type CrmCustomer } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";
import { McpWriteError } from "@/lib/crm/mcp-write";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

const CURRENCY_ALIASES: Record<string, string> = {
  EUR: "EUR",
  EURO: "EUR",
  EUROS: "EUR",
  "€": "EUR",
  USD: "USD",
  DOLLAR: "USD",
  DOLLARS: "USD",
  $: "USD",
  US$: "USD",
  CHF: "CHF",
  GBP: "GBP",
  "£": "GBP",
  THB: "THB",
  BAHT: "THB",
};

const MALE = new Set(["m", "h", "homme", "mr", "monsieur"]);
const FEMALE = new Set(["f", "femme", "mme", "madame", "mlle", "mademoiselle", "mrs", "ms"]);
const OTHER = new Set(["x", "autre", "mx"]);
const ISO_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

type Admin = SupabaseClient;

export type FlightPassenger = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  companion_id: string | null;
  is_account_holder: boolean;
};

function client(admin?: Admin) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function uuid(value: unknown, label: string) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(id)) throw new McpWriteError(`${label} invalide.`);
  return id;
}

function optionalId(value: unknown, label: string) {
  if (value == null || value === "") return "";
  return uuid(value, label);
}

function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string") throw new McpWriteError(`${label} invalide.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new McpWriteError(`${label} : ${max} caractères maximum.`);
  return trimmed;
}

function optionalText(value: unknown, label: string, max: number) {
  if (value == null || value === "") return null;
  return text(value, label, max) || null;
}

function requiredText(value: unknown, label: string, max: number) {
  const trimmed = text(value, label, max);
  if (!trimmed) throw new McpWriteError(`${label} requis.`);
  return trimmed;
}

function isoDay(value: unknown, label: string) {
  if (value == null || value === "") return null;
  const raw = typeof value === "string" ? value.trim().slice(0, 10) : "";
  if (!isIsoDate(raw)) throw new McpWriteError(`${label} invalide (AAAA-MM-JJ).`);
  return raw;
}

/** Devise ISO, sans repli euro : THB reste THB. */
export function isoCurrencyCode(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const alias = CURRENCY_ALIASES[raw.toUpperCase()] || CURRENCY_ALIASES[raw];
  const code = alias || raw.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || !ISO_CURRENCIES.has(code)) return null;
  return code;
}

function currencyOf(value: unknown) {
  if (value == null || value === "") return null;
  const code = isoCurrencyCode(value);
  if (!code) throw new McpWriteError("Devise invalide (3 lettres, ex. EUR ou THB).");
  return code;
}

/** Prix vendu facultatif. Zéro est un prix (billet offert). Un montant négatif est refusé. */
function optionalMoney(value: unknown, label: string) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new McpWriteError(`${label} : indiquez un montant positif ou nul.`);
    return Math.round(value * 100) / 100;
  }
  if (typeof value !== "string") throw new McpWriteError(`${label} invalide.`);
  if (value.trim().startsWith("-")) throw new McpWriteError(`${label} : indiquez un montant positif ou nul.`);
  const amount = parseMoney(value);
  if (amount == null) throw new McpWriteError(`${label} invalide.`);
  return amount;
}

function flag(value: unknown, label: string) {
  if (value == null || value === "") return false;
  if (value === true) return true;
  if (value === false) return false;
  throw new McpWriteError(`${label} : vrai ou faux.`);
}

/** Horloge locale telle qu’elle est écrite, sans fuseau. */
export function localDateTime(value: unknown, label: string) {
  if (typeof value !== "string") throw new McpWriteError(`${label} invalide (AAAA-MM-JJTHH:mm).`);
  const match = value.trim().match(LOCAL);
  if (!match || !isIsoDate(match[1])) throw new McpWriteError(`${label} invalide (AAAA-MM-JJTHH:mm).`);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = match[4] ? Number(match[4]) : 0;
  if (hour > 23 || minute > 59 || second > 59) throw new McpWriteError(`${label} invalide (AAAA-MM-JJTHH:mm).`);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${match[1]}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function dayGap(start: string, end: string) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Décollage et arrivée locaux. Un décalage ne s’ajoute que si l’arrivée est encore le jour du départ. */
export function flightSchedule(depart: unknown, arrivee: unknown, decalage: unknown) {
  const start = localDateTime(depart, "Départ");
  let end = localDateTime(arrivee, "Arrivée");
  let offset = 0;
  if (decalage != null && decalage !== "") {
    if (typeof decalage !== "number" || !Number.isInteger(decalage) || decalage < 0 || decalage > 3) {
      throw new McpWriteError("Décalage d’arrivée invalide (0 à 3 jours).");
    }
    offset = decalage;
  }
  const startDay = start.slice(0, 10);
  if (offset > 0 && end.slice(0, 10) === startDay) {
    const shifted = addIsoDays(startDay, offset);
    end = `${shifted}${end.slice(10)}`;
  }
  const gap = dayGap(startDay, end.slice(0, 10));
  if (gap < 0) throw new McpWriteError("L’arrivée est avant le départ.");
  return { start_at: start, end_at: end, notes: gap > 0 ? `J+${gap}` : null };
}

export function travelerSex(value: unknown): "M" | "F" | "X" | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError("Sexe invalide (M, F ou X).");
  const key = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\./g, "");
  if (!key) return null;
  if (MALE.has(key)) return "M";
  if (FEMALE.has(key)) return "F";
  if (OTHER.has(key)) return "X";
  throw new McpWriteError("Sexe invalide (M, F ou X).");
}

function sexFrom(input: Record<string, unknown>) {
  const civilite = input.civilite == null || input.civilite === "" ? null : travelerSex(input.civilite);
  const sexe = input.sexe == null || input.sexe === "" ? null : travelerSex(input.sexe);
  if (civilite && sexe && civilite !== sexe) throw new McpWriteError("La civilité et le sexe ne correspondent pas.");
  return sexe || civilite;
}

function nationalityOf(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError("Nationalité invalide.");
  const code = resolveNationality(value);
  if (!code) throw new McpWriteError("Nationalité inconnue.");
  return code;
}

function phoneOf(value: unknown) {
  if (value == null || value === "") return null;
  const stored = storedCompanionPhone(value);
  if (!stored.ok || !stored.phone) throw new McpWriteError("Téléphone invalide.");
  return stored.phone;
}

function emailOf(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError("E-mail invalide.");
  const email = normalizeCustomerEmail(value);
  const error = customerEmailError(email);
  if (error) throw new McpWriteError(error);
  return email;
}

function iata(value: unknown, label: string) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(code)) throw new McpWriteError(`${label} : code IATA sur 3 lettres.`);
  return code;
}

function idList(value: unknown, label: string) {
  if (value == null || value === "") return [];
  if (!Array.isArray(value)) throw new McpWriteError(`${label} : liste d’identifiants attendue.`);
  const ids: string[] = [];
  for (const item of value) {
    const id = uuid(item, label);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function httpsPhoto(value: unknown, label: string) {
  const raw = text(typeof value === "string" ? value : "", label, 500);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new McpWriteError(`${label} : adresse https requise.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new McpWriteError(`${label} : adresse https requise.`);
  }
  return url.toString();
}

function hotelPhotoInput(value: unknown) {
  if (value == null || value === "") return [];
  if (!Array.isArray(value)) throw new McpWriteError("Photos : liste attendue.");
  if (value.length > 8) throw new McpWriteError("Huit photos au plus.");
  return value.map((entry, index) => {
    const label = `Photo ${index + 1}`;
    const row = typeof entry === "string" ? { url: entry } : entry;
    if (!row || typeof row !== "object") throw new McpWriteError(`${label} invalide.`);
    const url = httpsPhoto((row as { url?: unknown }).url, label);
    const caption = optionalText((row as { legende?: unknown }).legende, "Légende", 120) || "";
    return { url, thumb: url, caption, kind: "hotel" as const };
  });
}

function clockField(value: unknown, label: string) {
  if (value == null || value === "") return null;
  const raw = text(value, label, 5);
  if (!/^\d{2}:\d{2}$/.test(raw)) throw new McpWriteError(`${label} : HH:mm.`);
  const [hour, minute] = raw.split(":").map(Number);
  if (hour > 23 || minute > 59 || (hour === 0 && minute === 0)) {
    throw new McpWriteError(`${label} : une heure réelle.`);
  }
  return raw;
}

function lines(value: unknown, label: string) {
  if (value == null || value === "") return [];
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n+/) : null;
  if (!raw) throw new McpWriteError(`${label} invalide.`);
  return raw.map((item) => text(item, label, 200)).filter(Boolean);
}

/**
 * La société est le défaut dès qu’il y en a une sur la fiche.
 * Une seule société : elle. Plusieurs : la première, sauf si societe_id en désigne une.
 * particulier : le séjour reste particulier, même avec une société.
 */
export function dossierPayerChoice(input: {
  societeId: string;
  particulier: boolean;
  companies: PayerCompany[];
}): { payer_kind: "company" | "personal"; billing_company_id: string | null } | { error: string } {
  if (input.particulier && input.societeId) {
    return { error: "Un séjour particulier ne se facture pas à une société." };
  }
  if (input.particulier) return { payer_kind: "personal", billing_company_id: null };
  if (input.societeId) {
    const match = input.companies.find((company) => company.id === input.societeId);
    if (!match) return { error: "Cette société n’est pas sur la fiche du client." };
    return { payer_kind: "company", billing_company_id: match.id };
  }
  const primary = defaultBillingCompany(input.companies);
  if (primary) return { payer_kind: "company", billing_company_id: primary.id };
  return { payer_kind: "personal", billing_company_id: null };
}

function facturerSociete(value: unknown) {
  if (value == null || value === "") return false;
  if (value === true) return true;
  if (value === false) return false;
  throw new McpWriteError("facturer_societe : vrai ou faux.");
}

export function prepareDossier(input: Record<string, unknown>): StaffBookingInput {
  const parsed = parseBody(createBookingSchema, {
    customer_id: input.client_id,
    title: input.titre,
    destination: input.destination,
    start_date: input.date_depart,
    end_date: input.date_retour,
    notes_client: input.notes,
    notes_internal: input.notes_internes,
  });
  if (parsed.error !== null || !parsed.data) throw new McpWriteError(parsed.error || "Dossier impossible.");
  const currency = input.devise == null || input.devise === "" ? parsed.data.currency : currencyOf(input.devise);
  if (!currency) throw new McpWriteError("Devise invalide (3 lettres, ex. EUR ou THB).");
  return { ...parsed.data, currency, status: undefined };
}

type PricePlan = {
  amount: number | null;
  ticketCount: number | null;
  documentAmount: number | null;
  documentCurrency: string | null;
  devise: string;
  /** Vrai : `amount` (ou le prix du document) est le total du groupe, au centime. */
  amountIsTotal: boolean;
};

/** Prix vendu dans la devise du dossier. Une autre devise reste le prix du document, sans conversion. */
export function flightPrice(input: {
  prix: number | null;
  prixTotal: number | null;
  passengers: number;
  devise: string | null;
  dossierDevise: string;
}): PricePlan {
  const devise = input.devise || input.dossierDevise;
  const ticketCount = input.passengers > 0 ? input.passengers : null;
  if (input.prixTotal != null) {
    if (input.prix != null) {
      const count = ticketCount ?? 1;
      const expected = Math.round(input.prix * count * 100) / 100;
      if (Math.abs(expected - input.prixTotal) > 0.05) {
        throw new McpWriteError("Le prix du billet et le total ne correspondent pas.");
      }
    }
    if (devise !== input.dossierDevise) {
      return {
        amount: null,
        ticketCount,
        documentAmount: input.prixTotal,
        documentCurrency: devise,
        devise,
        amountIsTotal: true,
      };
    }
    return {
      amount: input.prixTotal,
      ticketCount,
      documentAmount: null,
      documentCurrency: null,
      devise,
      amountIsTotal: true,
    };
  }
  const unit = input.prix;
  const documentAmount = unit == null || !ticketCount ? unit : Math.round(unit * ticketCount * 100) / 100;
  if (devise !== input.dossierDevise) {
    return {
      amount: null,
      ticketCount,
      documentAmount,
      documentCurrency: unit == null ? null : devise,
      devise,
      amountIsTotal: false,
    };
  }
  return { amount: unit, ticketCount, documentAmount: null, documentCurrency: null, devise, amountIsTotal: false };
}

export function hotelPrice(input: { prix: number | null; devise: string | null; dossierDevise: string }): PricePlan {
  const devise = input.devise || input.dossierDevise;
  if (input.prix == null) {
    return { amount: null, ticketCount: null, documentAmount: null, documentCurrency: null, devise, amountIsTotal: false };
  }
  if (devise !== input.dossierDevise) {
    return {
      amount: null,
      ticketCount: null,
      documentAmount: input.prix,
      documentCurrency: devise,
      devise,
      amountIsTotal: false,
    };
  }
  return { amount: input.prix, ticketCount: null, documentAmount: null, documentCurrency: null, devise, amountIsTotal: false };
}

function partyKey(person: FlightPassenger) {
  if (person.is_account_holder) return holderKey();
  if (person.companion_id) return companionKey(person.companion_id);
  return "";
}

function personLine(person: FlightPassenger) {
  return [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
}

export function buildFlightCard(
  input: {
    compagnie: string;
    numero: string | null;
    depart: string;
    arrivee: string;
    villeDepart: string | null;
    villeArrivee: string | null;
    cabine: string | null;
    pnr: string | null;
    fournisseur: string | null;
    schedule: { start_at: string; end_at: string; notes: string | null };
    price: PricePlan;
  },
  passengers: FlightPassenger[]
) {
  const from = input.depart;
  const to = input.arrivee;
  const title =
    input.villeDepart && input.villeArrivee ? `${input.villeDepart} → ${input.villeArrivee}` : `${from} → ${to}`;
  const airlineIata = inferAirlineIata({ airline: input.compagnie, flight_number: input.numero });
  const details: Record<string, unknown> = {
    airline: input.compagnie,
    from,
    to,
  };
  if (airlineIata) details.airline_iata = airlineIata;
  if (input.numero) details.flight_number = input.numero;
  if (input.villeDepart) details.city_from = input.villeDepart;
  if (input.villeArrivee) details.city_to = input.villeArrivee;
  if (input.cabine) details.cabin = input.cabine;
  if (input.pnr) details.pnr = input.pnr;
  if (input.schedule.notes) details.notes = input.schedule.notes;
  const departureZone = timezoneForIata(from);
  const arrivalZone = timezoneForIata(to);
  if (departureZone) details.departure_timezone = departureZone;
  if (arrivalZone) details.arrival_timezone = arrivalZone;
  if (input.price.ticketCount) details.ticket_count = input.price.ticketCount;
  if (input.price.amountIsTotal) details.amount_is_total = true;
  if (input.price.documentAmount != null) details.document_amount = input.price.documentAmount;
  if (input.price.documentCurrency) details.document_currency = input.price.documentCurrency;
  if (passengers.length) {
    details.passengers = passengers.map((person) => ({
      first_name: person.first_name,
      last_name: person.last_name,
    }));
    const keys = passengers.map(partyKey).filter(Boolean);
    if (keys.length) details.party_keys = keys;
  }
  return {
    kind: "flight",
    title,
    supplier: input.fournisseur,
    confirmation_ref: input.pnr,
    start_at: input.schedule.start_at,
    end_at: input.schedule.end_at,
    amount: input.price.amount,
    details,
  };
}

export function buildHotelCard(input: {
  nom: string;
  ville: string | null;
  pays: string | null;
  arrivee: string;
  depart: string;
  chambre: string | null;
  pension: string | null;
  inclus: string[];
  confirmation: string | null;
  fournisseur: string | null;
  annulation: string | null;
  adresse?: string | null;
  arriveeHeure?: string | null;
  departHeure?: string | null;
  photos?: { url: string; thumb: string; caption: string; kind: "hotel" }[];
  price: PricePlan;
  guests: FlightPassenger[];
}) {
  const details: Record<string, unknown> = { hotel_name: input.nom };
  if (input.ville) details.city = input.ville;
  if (input.pays) details.country = input.pays;
  if (input.adresse) details.address = input.adresse;
  if (input.chambre) details.room = input.chambre;
  if (input.pension) details.board = input.pension;
  if (input.inclus.length) details.included = input.inclus;
  if (input.annulation) {
    details.notes = input.annulation;
    details.conditions = [input.annulation];
  }
  if (input.arriveeHeure) details.check_in_time = input.arriveeHeure;
  if (input.departHeure) details.check_out_time = input.departHeure;
  if (input.photos?.length) details.photos = input.photos;
  if (input.price.documentAmount != null) details.document_amount = input.price.documentAmount;
  if (input.price.documentCurrency) details.document_currency = input.price.documentCurrency;
  const guestLine = input.guests.map(personLine).filter(Boolean).join(", ");
  const keys = input.guests.map(partyKey).filter(Boolean);
  if (guestLine) details.guests = guestLine;
  if (input.chambre || guestLine || input.confirmation) {
    details.rooms = [
      {
        room: input.chambre,
        guests: guestLine || null,
        confirmation_ref: input.confirmation,
        ...(keys.length ? { party_keys: keys } : {}),
      },
    ];
  }
  return {
    kind: "hotel",
    title: input.nom,
    supplier: input.fournisseur,
    confirmation_ref: input.confirmation,
    start_at: input.arrivee,
    end_at: input.depart,
    amount: input.price.amount,
    details,
  };
}

async function loadBooking(db: Admin, target: { id: string; reference: string }) {
  let query = db.from("crm_bookings").select("*");
  query = target.id ? query.eq("id", target.id) : query.eq("reference", target.reference);
  const { data, error } = await query.limit(2);
  if (error) throw new McpWriteError("Dossier introuvable.");
  const rows = (data || []) as CrmBooking[];
  if (!rows.length) throw new McpWriteError("Dossier introuvable.");
  if (rows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return rows[0];
}

function dossierTarget(input: Record<string, unknown>) {
  const id = optionalId(input.dossier_id, "Dossier");
  const reference = optionalText(input.reference, "Référence", 80) || "";
  if (!id && !reference) throw new McpWriteError("Indiquez l’identifiant ou la référence du dossier.");
  return { id, reference };
}

async function passengersOf(db: Admin, bookingId: string, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await db
    .from("crm_booking_travelers")
    .select("id, first_name, last_name, companion_id, is_account_holder")
    .eq("booking_id", bookingId);
  if (error) throw new McpWriteError("Voyageur introuvable.");
  const byId = new Map(
    ((data || []) as FlightPassenger[]).map((row) => [row.id, row])
  );
  return ids.map((id) => {
    const row = byId.get(id);
    if (!row) throw new McpWriteError("Voyageur introuvable sur ce dossier.");
    return row;
  });
}

function sellingAmount(price: PricePlan) {
  if (price.amount == null) return null;
  if (price.amountIsTotal || !(price.ticketCount && price.ticketCount > 0)) return price.amount;
  return Math.round(price.amount * price.ticketCount * 100) / 100;
}

function detailText(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === "string" ? value : null;
}

function flightClocks(item: Record<string, unknown>) {
  const details = item.details && typeof item.details === "object" ? (item.details as Record<string, unknown>) : {};
  const depart = dossierFlightStamp(typeof item.start_at === "string" ? item.start_at : null, detailText(details, "from"), details.departure_timezone);
  const arrivee = dossierFlightStamp(typeof item.end_at === "string" ? item.end_at : null, detailText(details, "to"), details.arrival_timezone);
  return {
    ...(depart ? { horaire_depart: depart } : {}),
    ...(arrivee ? { horaire_arrivee: arrivee } : {}),
    ...(detailText(details, "departure_timezone") ? { fuseau_depart: detailText(details, "departure_timezone") } : {}),
    ...(detailText(details, "arrival_timezone") ? { fuseau_arrivee: detailText(details, "arrival_timezone") } : {}),
  };
}

function cardReply(item: Record<string, unknown>, booking: CrmBooking, price: PricePlan, warning: string | null) {
  const tickets = price.ticketCount && price.ticketCount > 0 ? price.ticketCount : null;
  const groupTotal = price.amountIsTotal === true;
  return {
    id: item.id,
    dossier_id: booking.id,
    reference: booking.reference,
    titre: item.title,
    prix_vendu: sellingAmount(price),
    ...(tickets && !groupTotal ? { prix_billet: price.amount, billets: tickets } : {}),
    ...(tickets && groupTotal ? { billets: tickets } : {}),
    prix_document: price.documentAmount,
    devise: price.devise,
    devise_dossier: booking.currency || "EUR",
    ...(item.kind === "flight" ? flightClocks(item) : {}),
    visible: item.visible_to_client === true,
    notifie: false,
    ...(warning ? { avertissement: warning } : {}),
  };
}

export async function createDossier(input: Record<string, unknown>, admin?: Admin) {
  const draft = prepareDossier(input);
  const societeId = optionalId(input.societe_id, "Société");
  const particulier = flag(input.particulier, "Particulier");
  const billCompany = facturerSociete(input.facturer_societe);
  if (particulier && (billCompany || societeId)) {
    throw new McpWriteError("Un séjour particulier ne se facture pas à une société.");
  }
  const db = client(admin);
  try {
    const { data: traveler, error: travelerError } = await db
      .from("crm_customers")
      .select("id, company_role, billing_parent_id, city")
      .eq("id", draft.customer_id)
      .maybeSingle();
    if (travelerError || !traveler) throw new McpWriteError("Client introuvable.");
    const billingCustomerId = resolveBillingCustomerId(
      traveler as { id: string; company_role: CrmCustomer["company_role"]; billing_parent_id: string | null }
    );
    const { data: companyRows, error: companyError } = await db
      .from("crm_billing_companies")
      .select("id, sort_order, company_name")
      .eq("customer_id", billingCustomerId);
    if (companyError) throw new McpWriteError("Société introuvable.");
    const companies = (companyRows || []) as (PayerCompany & { company_name?: string | null })[];
    if (billCompany && !companies.length) {
      throw new McpWriteError("Aucune société sur la fiche. Ajoutez-la avant de facturer le séjour.");
    }
    const choice = dossierPayerChoice({ societeId, particulier, companies });
    if ("error" in choice) throw new McpWriteError(choice.error);
    const home = typeof traveler.city === "string" ? traveler.city : "";
    const created = await createStaffBooking(
      db,
      {
        ...draft,
        title: withoutHomeCity(draft.title, home) || draft.title,
        destination: withoutHomeCity(draft.destination, home) || draft.destination,
        payer_kind: choice.payer_kind,
        billing_company_id: choice.billing_company_id ?? undefined,
      },
      db
    );
    const billed = companies.find((company) => company.id === created.booking.billing_company_id);
    return {
      id: created.booking.id,
      reference: created.booking.reference,
      statut: staffStayLabel(created.booking),
      visible: false,
      notifie: false,
      paye_par: created.booking.payer_kind === "company" ? "société" : "particulier",
      societe: created.booking.payer_kind === "company" ? billed?.company_name || null : null,
      societe_id: created.booking.billing_company_id,
      ...(created.ledgerWarning ? { avertissement: created.ledgerWarning } : {}),
    };
  } catch (err) {
    if (err instanceof McpWriteError) throw err;
    if (err instanceof StaffWriteError) throw new McpWriteError(err.message);
    console.error("[mcp]", err instanceof Error ? err.message : "error");
    throw new McpWriteError("Dossier non créé.");
  }
}

type CompanionRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  birth_date: string | null;
};

function personOf(row: {
  first_name?: string | null;
  last_name?: string | null;
  usage_name?: string | null;
  birth_date?: string | null;
}): PersonIdentity {
  return {
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    usage_name: row.usage_name ?? null,
    birth_date: row.birth_date ?? null,
  };
}

/** Plusieurs homonymes : le compagnon qui a un passeport, s’il est seul. */
function pickCompanion(matches: CompanionRow[], passportIds: Set<string>) {
  if (matches.length <= 1) return matches[0] || null;
  const withPassport = matches.filter((row) => passportIds.has(row.id));
  if (withPassport.length === 1) return withPassport[0];
  return null;
}

export async function addVoyageur(input: Record<string, unknown>, admin?: Admin) {
  const compagnonId = optionalId(input.compagnon_id, "Compagnon");
  const prenomsRaw = optionalText(input.prenoms, "Prénoms", 120);
  const nomRaw = optionalText(input.nom, "Nom", 80);
  if (!compagnonId && (!prenomsRaw || !nomRaw)) throw new McpWriteError("Prénoms et nom requis.");
  const prenoms = prenomsRaw || "";
  const nom = nomRaw || "";
  const sex = sexFrom(input);
  const naissance = isoDay(input.date_naissance, "Date de naissance");
  const lieu = optionalText(input.lieu_naissance, "Lieu de naissance", 120);
  const nationalite = nationalityOf(input.nationalite);
  const telephone = phoneOf(input.telephone);
  emailOf(input.email);
  const passeport = passportDraft(input.passeport);
  const clientId = optionalId(input.client_id, "Client");
  const hasDossier = Boolean(optionalId(input.dossier_id, "Dossier") || optionalText(input.reference, "Référence", 80));
  if (!clientId && !hasDossier) throw new McpWriteError("Indiquez le client ou le dossier.");
  const db = client(admin);
  const booking = hasDossier ? await loadBooking(db, dossierTarget(input)) : null;
  if (booking && clientId && booking.customer_id !== clientId) {
    throw new McpWriteError("Ce dossier n’appartient pas à ce client.");
  }
  const customerId = booking?.customer_id || clientId;
  const { data: customer, error: customerError } = await db
    .from("crm_customers")
    .select("id, first_name, last_name, usage_name, birth_date, sex, nationality, phone")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError || !customer) throw new McpWriteError("Client introuvable.");
  const holder = customer as Pick<CrmCustomer, "id" | "first_name" | "last_name" | "usage_name"> & {
    birth_date?: string | null;
    sex?: string | null;
    nationality?: string | null;
    phone?: string | null;
  };
  const query: PersonIdentity = {
    first_name: prenoms || null,
    last_name: nom || null,
    birth_date: naissance,
  };
  const { data: companionRows, error: companionError } = await db
    .from("crm_travel_companions")
    .select("id, first_name, last_name, usage_name, birth_date")
    .eq("customer_id", customerId);
  if (companionError) throw new McpWriteError("Voyageur non ajouté.");
  const companions = (companionRows || []) as CompanionRow[];
  const { data: documentRows, error: documentError } = await db
    .from("crm_travel_documents")
    .select("companion_id, doc_type")
    .eq("customer_id", customerId);
  if (documentError) throw new McpWriteError("Voyageur non ajouté.");
  const passportIds = new Set(
    ((documentRows || []) as { companion_id: string | null; doc_type: string | null }[])
      .filter((row) => row.doc_type === "passport" && row.companion_id)
      .map((row) => String(row.companion_id))
  );
  let known: CompanionRow | null = null;
  if (compagnonId) {
    known = companions.find((row) => row.id === compagnonId) || null;
    if (!known) throw new McpWriteError("Ce compagnon n’est pas sur la fiche du client.");
    if ((prenoms || nom) && !addedTravelerNames(personOf(known), query)) {
      throw new McpWriteError("Ce compagnon ne correspond pas au nom indiqué.");
    }
  }
  const isHolder = !known && Boolean(prenoms && nom) && holderMatchesAddedTraveler(personOf(holder), query);
  if (!known && !isHolder) {
    const matches = companions.filter((row) => sameAddedTraveler(personOf(row), query));
    known = pickCompanion(matches, passportIds);
    if (!known && matches.length > 1) {
      throw new McpWriteError("Plusieurs voyageurs correspondent. Indiquez compagnon_id.");
    }
  }
  const recordedFirst = (known?.first_name || (isHolder ? holder.first_name : prenoms) || "").trim();
  const recordedLast = (known?.last_name || (isHolder ? holder.last_name : nom) || "").trim();
  if (!recordedFirst || !recordedLast) throw new McpWriteError("Prénoms et nom requis.");
  if (booking) {
    const { data: already, error: alreadyError } = await db
      .from("crm_booking_travelers")
      .select("first_name, last_name, companion_id, is_account_holder")
      .eq("booking_id", booking.id);
    if (alreadyError) throw new McpWriteError("Voyageur non ajouté.");
    const present = (
      (already || []) as {
        first_name: string | null;
        last_name: string | null;
        companion_id: string | null;
        is_account_holder: boolean;
      }[]
    ).some((row) => {
      if (known && row.companion_id === known.id) return true;
      if (isHolder && row.is_account_holder) return true;
      const linked = row.companion_id ? companions.find((item) => item.id === row.companion_id) : null;
      const person = row.is_account_holder ? personOf(holder) : linked ? personOf(linked) : personOf(row);
      return sameAddedTraveler(person, known ? personOf(known) : query);
    });
    if (present) throw new McpWriteError("Ce voyageur est déjà sur le séjour.");
  }
  let companionId: string | null = null;
  if (!isHolder) {
    if (known) {
      companionId = known.id;
      // Sans compagnon_id, on rattache. On n’écrit pas sur la fiche d’un autre voyageur.
      if (compagnonId) {
        const patch: Record<string, unknown> = {};
        if (naissance) patch.birth_date = naissance;
        if (sex) patch.sex = sex;
        if (nationalite) patch.nationality = nationalite;
        if (telephone) patch.phone = telephone;
        if (Object.keys(patch).length) {
          const { error } = await db.from("crm_travel_companions").update(patch).eq("id", known.id).eq("customer_id", customerId);
          if (error) throw new McpWriteError("Voyageur non ajouté.");
        }
      }
    } else {
      const { data, error } = await db
        .from("crm_travel_companions")
        .insert({
          customer_id: customerId,
          first_name: recordedFirst,
          last_name: recordedLast,
          birth_date: naissance,
          sex,
          nationality: nationalite,
          phone: telephone,
        })
        .select("id")
        .single();
      if (error || !data) throw new McpWriteError("Voyageur non ajouté.");
      companionId = String((data as { id: string }).id);
    }
  } else {
    const patch: Record<string, unknown> = {};
    if (naissance) patch.birth_date = naissance;
    if (sex) patch.sex = sex;
    if (nationalite) patch.nationality = nationalite;
    if (telephone) patch.phone = telephone;
    if (Object.keys(patch).length) {
      const { error } = await db.from("crm_customers").update(patch).eq("id", customerId);
      if (error) throw new McpWriteError("Voyageur non ajouté.");
    }
  }
  let voyageurId = companionId || customerId;
  if (booking) {
    const { data, error } = await db
      .from("crm_booking_travelers")
      .insert({
        booking_id: booking.id,
        companion_id: isHolder ? null : companionId,
        is_account_holder: isHolder,
        first_name: recordedFirst,
        last_name: recordedLast,
      })
      .select("id")
      .single();
    if (error || !data) throw new McpWriteError("Voyageur non ajouté.");
    voyageurId = String((data as { id: string }).id);
  }
  let passeportEnregistre = false;
  if (passeport || lieu) {
    try {
      const vault = await insertTravelDocument(db, {
        customerId,
        companionId: isHolder ? null : companionId,
        docType: "passport",
        number: passeport?.numero,
        issuingCountry: passeport?.pays,
        issuedOn: passeport?.delivrance,
        expiresOn: passeport?.expiration,
        placeOfBirth: lieu,
        authority: passeport?.autorite,
        first_name: recordedFirst,
        last_name: recordedLast,
        birth_date: naissance,
        nationality: nationalite,
        sex,
        formalities: false,
      });
      passeportEnregistre = true;
      if (booking) {
        await cloneTravelDocument(db, vault.id, customerId, {
          bookingId: booking.id,
          travelerId: voyageurId,
          companionId: isHolder ? null : companionId,
          formalities: false,
        });
      }
    } catch (err) {
      console.error("[mcp]", err instanceof Error ? err.message : "error");
      throw new McpWriteError("Le voyageur est ajouté, mais le passeport n’a pas été enregistré.");
    }
  }
  if (booking) await reconcileCustomerParty(customerId, db);
  const warning = booking
    ? await ledgerWarning("Voyageur ajouté", () => refreshTicketingFee(db, booking.id))
    : null;
  return {
    voyageur_id: voyageurId,
    compagnon_id: companionId,
    titulaire: isHolder,
    client_id: customerId,
    dossier_id: booking?.id || null,
    passeport: passeportEnregistre,
    email_enregistre: false,
    notifie: false,
    ...(warning ? { avertissement: warning } : {}),
  };
}

type PassportDraft = {
  numero: string | null;
  delivrance: string | null;
  expiration: string | null;
  autorite: string | null;
  pays: string | null;
};

function passportDraft(value: unknown): PassportDraft | null {
  if (value == null || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new McpWriteError("Passeport invalide.");
  const body = value as Record<string, unknown>;
  const draft = {
    numero: optionalText(body.numero, "Numéro de passeport", 40),
    delivrance: isoDay(body.delivrance, "Date de délivrance"),
    expiration: isoDay(body.expiration, "Date d’expiration"),
    autorite: optionalText(body.autorite, "Autorité", 160),
    pays: optionalText(body.pays, "Pays de délivrance", 80),
  };
  if (!draft.numero && !draft.delivrance && !draft.expiration && !draft.autorite && !draft.pays) return null;
  return draft;
}

export async function addVol(input: Record<string, unknown>, admin?: Admin) {
  const target = dossierTarget(input);
  const compagnie = requiredText(input.compagnie, "Compagnie", 120);
  const numero = optionalText(input.numero, "Numéro de vol", 20);
  const depart = iata(input.depart_iata, "Départ");
  const arrivee = iata(input.arrivee_iata, "Arrivée");
  const villeDepart = optionalText(input.ville_depart, "Ville de départ", 80);
  const villeArrivee = optionalText(input.ville_arrivee, "Ville d’arrivée", 80);
  if (Boolean(villeDepart) !== Boolean(villeArrivee)) {
    throw new McpWriteError("Indiquez la ville de départ et la ville d’arrivée.");
  }
  const schedule = flightSchedule(input.depart, input.arrivee, input.decalage_jour);
  const cabine = optionalText(input.cabine, "Cabine", 80);
  const pnr = optionalText(input.pnr, "PNR", 40);
  const fournisseur = optionalText(input.fournisseur, "Fournisseur", 120);
  const prix = optionalMoney(input.prix, "Prix");
  const prixTotal = optionalMoney(input.prix_total, "Prix total");
  const sansFrais = flag(input.sans_frais, "Sans frais");
  const devise = currencyOf(input.devise);
  const voyageurs = idList(input.voyageurs, "Voyageur");
  const db = client(admin);
  const booking = await loadBooking(db, target);
  const passengers = await passengersOf(db, booking.id, voyageurs);
  const price = flightPrice({
    prix,
    prixTotal,
    passengers: passengers.length,
    devise,
    dossierDevise: booking.currency || "EUR",
  });
  const body = buildFlightCard(
    {
      compagnie,
      numero,
      depart,
      arrivee,
      villeDepart,
      villeArrivee,
      cabine,
      pnr,
      fournisseur,
      schedule,
      price,
    },
    passengers
  );
  if (sansFrais || (await freeFlights(db, booking.id, prix, prixTotal))) {
    await dismissTicketing(db, booking.id);
  }
  const saved = await addStaffBookingCard(db, booking.id, body);
  if ("error" in saved) throw new McpWriteError(saved.error);
  return cardReply(saved.item, booking, price, saved.ledgerWarning);
}

function stampFlightZones(details: Record<string, unknown>) {
  const departure = timezoneForIata(detailText(details, "from"));
  const arrival = timezoneForIata(detailText(details, "to"));
  if (departure) details.departure_timezone = departure;
  if (arrival) details.arrival_timezone = arrival;
}

function applyFlightPrice(details: Record<string, unknown>, price: PricePlan) {
  if (price.ticketCount) details.ticket_count = price.ticketCount;
  if (price.amountIsTotal) details.amount_is_total = true;
  else delete details.amount_is_total;
  if (price.documentAmount != null) details.document_amount = price.documentAmount;
  else delete details.document_amount;
  if (price.documentCurrency) details.document_currency = price.documentCurrency;
  else delete details.document_currency;
}

/** Corrige une carte vol : heure locale, fuseau d’aéroport, prix du groupe. Aucun message. */
export async function updateVol(input: Record<string, unknown>, admin?: Admin) {
  const target = dossierTarget(input);
  const carteId = uuid(input.carte_id, "Carte");
  const db = client(admin);
  const booking = await loadBooking(db, target);
  const { data, error } = await db
    .from("crm_booking_items")
    .select("*")
    .eq("id", carteId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (error || !data) throw new McpWriteError("Carte introuvable sur ce dossier.");
  const item = data as Record<string, unknown>;
  if (item.kind !== "flight") throw new McpWriteError("Cette carte n’est pas un vol.");
  const details: Record<string, unknown> = {
    ...(item.details && typeof item.details === "object" ? (item.details as Record<string, unknown>) : {}),
  };
  const patch: Record<string, unknown> = { details };

  if (input.depart_iata != null && input.depart_iata !== "") details.from = iata(input.depart_iata, "Départ");
  if (input.arrivee_iata != null && input.arrivee_iata !== "") details.to = iata(input.arrivee_iata, "Arrivée");
  if (input.compagnie != null && input.compagnie !== "") details.airline = requiredText(input.compagnie, "Compagnie", 120);
  if ("numero" in input) {
    const numero = optionalText(input.numero, "Numéro de vol", 20);
    if (numero) details.flight_number = numero;
    else delete details.flight_number;
  }
  if ("cabine" in input) {
    const cabine = optionalText(input.cabine, "Cabine", 80);
    if (cabine) details.cabin = cabine;
    else delete details.cabin;
  }
  if ("pnr" in input) {
    const pnr = optionalText(input.pnr, "PNR", 40);
    if (pnr) details.pnr = pnr;
    else delete details.pnr;
    patch.confirmation_ref = pnr;
  }
  if ("fournisseur" in input) patch.supplier = optionalText(input.fournisseur, "Fournisseur", 120);

  const villeDepart = "ville_depart" in input ? optionalText(input.ville_depart, "Ville de départ", 80) : undefined;
  const villeArrivee = "ville_arrivee" in input ? optionalText(input.ville_arrivee, "Ville d’arrivée", 80) : undefined;
  if (villeDepart !== undefined || villeArrivee !== undefined) {
    const fromCity = villeDepart !== undefined ? villeDepart : detailText(details, "city_from");
    const toCity = villeArrivee !== undefined ? villeArrivee : detailText(details, "city_to");
    if (Boolean(fromCity) !== Boolean(toCity)) {
      throw new McpWriteError("Indiquez la ville de départ et la ville d’arrivée.");
    }
    if (fromCity && toCity) {
      details.city_from = fromCity;
      details.city_to = toCity;
      patch.title = `${fromCity} → ${toCity}`;
    }
  }

  const hasDepart = input.depart != null && input.depart !== "";
  const hasArrivee = input.arrivee != null && input.arrivee !== "";
  const hasOffset = input.decalage_jour != null && input.decalage_jour !== "";
  if (hasDepart || hasArrivee || hasOffset) {
    const schedule = flightSchedule(
      hasDepart ? input.depart : item.start_at,
      hasArrivee ? input.arrivee : item.end_at,
      hasOffset ? input.decalage_jour : 0
    );
    patch.start_at = schedule.start_at;
    patch.end_at = schedule.end_at;
    if (schedule.notes) details.notes = schedule.notes;
    else delete details.notes;
  }

  const passengerInput =
    input.voyageur_ids != null && input.voyageur_ids !== "" ? input.voyageur_ids : input.voyageurs;
  const hasVoyageurs = passengerInput != null && passengerInput !== "";
  const voyageurIds = hasVoyageurs ? idList(passengerInput, "Voyageur") : null;
  if (voyageurIds && !voyageurIds.length) throw new McpWriteError("Indiquez au moins un voyageur.");
  const passengers = voyageurIds ? await passengersOf(db, booking.id, voyageurIds) : null;
  if (passengers) {
    details.passengers = passengers.map((person) => ({
      first_name: person.first_name,
      last_name: person.last_name,
    }));
    const keys = passengers.map(partyKey).filter(Boolean);
    if (keys.length) details.party_keys = keys;
    else delete details.party_keys;
    details.ticket_count = passengers.length;
  }

  const prix = optionalMoney(input.prix, "Prix");
  const prixTotal = optionalMoney(input.prix_total, "Prix total");
  const sansFrais = flag(input.sans_frais, "Sans frais");
  const count = passengers ? passengers.length : statedTicketCount({ kind: "flight", details }) ?? 0;
  let price = priceFromFlight(item, details, booking);
  if (prix != null || prixTotal != null) {
    const devise = input.devise == null || input.devise === "" ? price.devise : currencyOf(input.devise);
    price = flightPrice({
      prix,
      prixTotal,
      passengers: count,
      devise,
      dossierDevise: booking.currency || "EUR",
    });
    applyFlightPrice(details, price);
    patch.amount = price.amount;
  } else if (passengers) {
    price = { ...price, ticketCount: passengers.length };
  }

  stampFlightZones(details);
  clearPrintedIataDoubt(details);
  const routeFrom = detailText(details, "city_from");
  const routeTo = detailText(details, "city_to");
  const currentTitle = typeof patch.title === "string" ? patch.title : typeof item.title === "string" ? item.title : "";
  if (routeFrom && routeTo && !currentTitle.includes("→")) patch.title = `${routeFrom} → ${routeTo}`;
  if (flag(input.effacer_avertissement, "Effacer l’avertissement")) {
    delete details.needs_review;
    delete details.review_reason;
  }
  if (sansFrais || (await freeFlights(db, booking.id, prix, prixTotal, carteId))) {
    await dismissTicketing(db, booking.id);
  }
  const saved = await patchStaffBookingCard(db, booking.id, carteId, patch);
  if ("error" in saved) throw new McpWriteError(saved.error);
  await resyncAccueilVip(db, booking.id);
  return cardReply(saved.item, booking, price, saved.ledgerWarning);
}

function priceFromFlight(item: Record<string, unknown>, details: Record<string, unknown>, booking: CrmBooking): PricePlan {
  const tickets = statedTicketCount({ kind: "flight", details });
  const dossierDevise = booking.currency || "EUR";
  const documentCurrency = detailText(details, "document_currency");
  const documentAmount = typeof details.document_amount === "number" ? details.document_amount : null;
  if (documentCurrency && documentCurrency !== dossierDevise) {
    return {
      amount: null,
      ticketCount: tickets,
      documentAmount,
      documentCurrency,
      devise: documentCurrency,
      amountIsTotal: details.amount_is_total === true,
    };
  }
  const amount = typeof item.amount === "number" ? item.amount : item.amount == null ? null : Number(item.amount);
  return {
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    ticketCount: tickets,
    documentAmount: null,
    documentCurrency: null,
    devise: dossierDevise,
    amountIsTotal: details.amount_is_total === true,
  };
}

export async function addHotel(input: Record<string, unknown>, admin?: Admin) {
  const target = dossierTarget(input);
  const nom = requiredText(input.nom, "Hôtel", 160);
  const ville = optionalText(input.ville, "Ville", 80);
  const pays = optionalText(input.pays, "Pays", 80);
  const arrivee = isoDay(input.arrivee, "Arrivée");
  const depart = isoDay(input.depart, "Départ");
  if (!arrivee || !depart) throw new McpWriteError("Dates d’arrivée et de départ requises (AAAA-MM-JJ).");
  if (depart < arrivee) throw new McpWriteError("La date de départ est avant l’arrivée.");
  const chambre = optionalText(input.chambre, "Chambre", 120);
  const pension = optionalText(input.pension, "Pension", 120);
  const inclus = lines(input.inclus, "Inclus");
  const confirmation = optionalText(input.confirmation, "Confirmation", 80);
  const fournisseur = optionalText(input.fournisseur, "Fournisseur", 120);
  const annulation = optionalText(input.annulation, "Annulation", 2000);
  const adresse = optionalText(input.adresse, "Adresse", 240);
  const arriveeHeure = clockField(input.heure_arrivee, "Heure d’arrivée");
  const departHeure = clockField(input.heure_depart, "Heure de départ");
  const photos = hotelPhotoInput(input.photos);
  const prix = optionalMoney(input.prix, "Prix");
  const devise = currencyOf(input.devise);
  const voyageurs = idList(input.voyageurs, "Voyageur");
  const db = client(admin);
  const booking = await loadBooking(db, target);
  const guests = await passengersOf(db, booking.id, voyageurs);
  const price = hotelPrice({ prix, devise, dossierDevise: booking.currency || "EUR" });
  const body = buildHotelCard({
    nom,
    ville,
    pays,
    arrivee,
    depart,
    chambre,
    pension,
    inclus,
    confirmation,
    fournisseur,
    annulation,
    adresse,
    arriveeHeure,
    departHeure,
    photos,
    price,
    guests,
  });
  const saved = await addStaffBookingCard(db, booking.id, body);
  if ("error" in saved) throw new McpWriteError(saved.error);
  return cardReply(saved.item, booking, price, saved.ledgerWarning);
}

type SupplierNet = {
  supplier_net: number;
  supplier_currency: string;
  supplier_net_eur: number | null;
};

/**
 * Coût fournisseur. Une devise autre que l’euro garde le montant d’origine
 * et l’équivalent en euros s’il est indiqué. Aucun taux n’est calculé.
 * Sans montant, rien ne change.
 */
export function planSupplierNet(input: {
  prixNet: number | null;
  devise: string | null;
  prixNetEur: number | null;
  leNet: { amount: number; currency: string | null } | null;
}): SupplierNet | null {
  const le = input.leNet && input.leNet.amount != null ? input.leNet : null;
  const eurOnly = input.prixNetEur;
  if (input.prixNet == null && input.devise == null && eurOnly != null && !le) {
    return { supplier_net: eurOnly, supplier_currency: "EUR", supplier_net_eur: eurOnly };
  }
  if (input.prixNet == null && input.prixNetEur == null && input.devise == null && !le) return null;
  if (input.devise && input.prixNet == null && !le) throw new McpWriteError("Indiquez le coût net.");
  const currency = input.devise || (input.prixNet == null ? le?.currency : null) || "EUR";
  const amount = input.prixNet != null ? input.prixNet : le?.amount;
  if (amount == null) throw new McpWriteError("Indiquez le coût net.");
  if (currency === "EUR") {
    if (input.prixNetEur != null && Math.abs(input.prixNetEur - amount) > 0.05) {
      throw new McpWriteError("Le coût net en euros ne correspond pas.");
    }
    return { supplier_net: amount, supplier_currency: "EUR", supplier_net_eur: amount };
  }
  return { supplier_net: amount, supplier_currency: currency, supplier_net_eur: input.prixNetEur };
}

function priceFromHotel(item: Record<string, unknown>, details: Record<string, unknown>, booking: CrmBooking): PricePlan {
  const dossierDevise = booking.currency || "EUR";
  const documentCurrency = detailText(details, "document_currency");
  const documentAmount = typeof details.document_amount === "number" ? details.document_amount : null;
  if (documentCurrency && documentCurrency !== dossierDevise) {
    return {
      amount: null,
      ticketCount: null,
      documentAmount,
      documentCurrency,
      devise: documentCurrency,
      amountIsTotal: false,
    };
  }
  const amount = typeof item.amount === "number" ? item.amount : item.amount == null ? null : Number(item.amount);
  return {
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    ticketCount: null,
    documentAmount: null,
    documentCurrency: null,
    devise: dossierDevise,
    amountIsTotal: false,
  };
}

type HotelRoomDraft = {
  room: string | null;
  type: string | null;
  guests: string | null;
  confirmation_ref: string | null;
  board?: string;
  party_keys?: string[];
};

function hotelRoomDrafts(value: unknown): HotelRoomDraft[] | null {
  if (value == null || value === "") return null;
  if (!Array.isArray(value) || !value.length) throw new McpWriteError("Indiquez au moins une chambre.");
  return value.map((entry, index) => {
    const label = `Chambre ${index + 1}`;
    if (typeof entry === "string") {
      const room = requiredText(entry, label, 120);
      return { room, type: room, guests: null, confirmation_ref: null };
    }
    if (!entry || typeof entry !== "object") throw new McpWriteError(`${label} invalide.`);
    const row = entry as Record<string, unknown>;
    const room = optionalText(row.type ?? row.chambre, label, 120);
    const regime = optionalText(row.regime ?? row.pension, "Régime", 120);
    const confirmation = optionalText(row.confirmation, "Confirmation", 80);
    const guests = optionalText(row.voyageurs ?? row.voyageur, "Voyageurs", 240);
    return {
      room,
      type: room,
      guests,
      confirmation_ref: confirmation,
      ...(regime ? { board: regime } : {}),
    };
  });
}

function dayPrefix(value: unknown) {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function hotelReply(
  item: Record<string, unknown>,
  booking: CrmBooking,
  price: PricePlan,
  warning: string | null
) {
  const details = item.details && typeof item.details === "object" ? (item.details as Record<string, unknown>) : {};
  const net = typeof details.supplier_net === "number" ? details.supplier_net : null;
  const netEur = typeof details.supplier_net_eur === "number" ? details.supplier_net_eur : null;
  return {
    ...cardReply(item, booking, price, warning),
    hotel: detailText(details, "hotel_name") || (typeof item.title === "string" ? item.title : null),
    ville: detailText(details, "city"),
    arrivee: dayPrefix(item.start_at) || null,
    depart: dayPrefix(item.end_at) || null,
    confirmation: typeof item.confirmation_ref === "string" ? item.confirmation_ref : null,
    prix_net: net,
    devise_net: net != null ? detailText(details, "supplier_currency") : null,
    prix_net_eur: netEur,
  };
}

/** Corrige une carte hôtel. Le prix de vente ne change que si `prix` est indiqué. */
export async function updateHotel(input: Record<string, unknown>, admin?: Admin) {
  const target = dossierTarget(input);
  const carteId = uuid(input.carte_id, "Carte");
  const db = client(admin);
  const booking = await loadBooking(db, target);
  const { data, error } = await db
    .from("crm_booking_items")
    .select("*")
    .eq("id", carteId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (error || !data) throw new McpWriteError("Carte introuvable sur ce dossier.");
  const item = data as Record<string, unknown>;
  if (item.kind !== "hotel") throw new McpWriteError("Cette carte n’est pas un hôtel.");
  const details: Record<string, unknown> = {
    ...(item.details && typeof item.details === "object" ? (item.details as Record<string, unknown>) : {}),
  };
  const patch: Record<string, unknown> = { details };
  const referenceLe = optionalText(input.reference_le, "Référence Little Emperors", 80);
  let fill: ReturnType<typeof leCardFill> | null = null;
  if (referenceLe) {
    try {
      const loaded = await loadLeReservation({ confirmation: referenceLe }, db);
      fill = leCardFill(loaded.booking);
    } catch (err) {
      if (err instanceof McpReadError) throw new McpWriteError(err.message);
      throw err;
    }
  }
  if (fill?.nom) {
    details.hotel_name = fill.nom;
    patch.title = fill.nom;
  }
  if (fill?.ville) details.city = fill.ville;
  if (fill?.adresse) details.address = fill.adresse;
  if (fill?.arrivee) patch.start_at = fill.arrivee;
  if (fill?.depart) patch.end_at = fill.depart;
  if (fill?.pension) details.board = fill.pension;
  if (fill?.inclus.length) details.included = fill.inclus;
  if (fill?.conditions.length) details.conditions = fill.conditions;
  if (fill?.guests.length) details.guests = fill.guests.join(", ");
  if (fill?.rooms.length) details.rooms = fill.rooms;
  if (fill?.confirmation) {
    patch.confirmation_ref = joinConfirmationRefs(
      typeof item.confirmation_ref === "string" ? item.confirmation_ref : null,
      fill.confirmation
    );
  }
  if (fill?.leHotelId != null) details.le_hotel_id = fill.leHotelId;
  if (fill) {
    details.source_family = details.source_family || "little_emperors";
    if (!("fournisseur" in input)) patch.supplier = typeof item.supplier === "string" && item.supplier ? item.supplier : "Little Emperors";
  }

  if (input.nom != null && input.nom !== "") {
    const nom = requiredText(input.nom, "Hôtel", 160);
    details.hotel_name = nom;
    patch.title = nom;
  }
  const ville = optionalText(input.ville, "Ville", 80);
  if (ville) details.city = ville;
  const pays = optionalText(input.pays, "Pays", 80);
  if (pays) details.country = pays;
  const adresse = optionalText(input.adresse, "Adresse", 240);
  if (adresse) details.address = adresse;
  const arrivee = input.arrivee != null && input.arrivee !== "" ? isoDay(input.arrivee, "Arrivée") : null;
  const depart = input.depart != null && input.depart !== "" ? isoDay(input.depart, "Départ") : null;
  if (arrivee) patch.start_at = arrivee;
  if (depart) patch.end_at = depart;
  const startDay = dayPrefix(patch.start_at ?? item.start_at);
  const endDay = dayPrefix(patch.end_at ?? item.end_at);
  if (startDay && endDay && endDay < startDay) throw new McpWriteError("La date de départ est avant l’arrivée.");

  const pension = optionalText(input.pension ?? input.regime, "Régime", 120);
  if (pension) details.board = pension;
  const chambres = hotelRoomDrafts(input.chambres);
  const chambre = optionalText(input.chambre, "Chambre", 120);
  if (chambres) {
    details.rooms = chambres;
    const label = chambres.map((room) => room.room).filter(Boolean).join(" · ");
    if (label) details.room = label;
  } else if (chambre) {
    details.room = chambre;
    const current = Array.isArray(details.rooms) ? (details.rooms as Record<string, unknown>[]) : [];
    if (current.length <= 1) {
      const first = current[0] && typeof current[0] === "object" ? current[0] : {};
      details.rooms = [{ ...first, room: chambre, type: chambre }];
    }
  }
  const confirmations = lines(input.confirmations, "Confirmation");
  const confirmation = optionalText(input.confirmation, "Confirmation", 80);
  const confirmationParts = [...confirmations, ...(confirmation ? [confirmation] : [])];
  if (confirmationParts.length) {
    patch.confirmation_ref = confirmationParts.reduce<string | null>(
      (acc, ref) => joinConfirmationRefs(acc, ref),
      typeof patch.confirmation_ref === "string"
        ? patch.confirmation_ref
        : typeof item.confirmation_ref === "string"
          ? item.confirmation_ref
          : null
    );
    if (Array.isArray(details.rooms) && details.rooms.length === 1) {
      const room = details.rooms[0] as Record<string, unknown>;
      if (!room.confirmation_ref) room.confirmation_ref = confirmationParts[0];
    }
  }
  if ("fournisseur" in input) patch.supplier = optionalText(input.fournisseur, "Fournisseur", 120);
  const notes = optionalText(input.notes, "Notes", 2000);
  if (notes) details.notes = notes;
  const conditions = lines(input.annulation, "Annulation");
  if (conditions.length) details.conditions = conditions;
  const inclus = lines("avantages" in input ? input.avantages : input.inclus, "Avantages");
  if (inclus.length) details.included = inclus;

  const hasVoyageurs = input.voyageurs != null && input.voyageurs !== "";
  if (hasVoyageurs) {
    const ids = idList(input.voyageurs, "Voyageur");
    if (!ids.length) throw new McpWriteError("Indiquez au moins un voyageur.");
    const guests = await passengersOf(db, booking.id, ids);
    const guestLine = guests.map(personLine).filter(Boolean).join(", ");
    const keys = guests.map(partyKey).filter(Boolean);
    if (guestLine) details.guests = guestLine;
    else delete details.guests;
    if (keys.length) details.party_keys = keys;
    else delete details.party_keys;
    if (Array.isArray(details.rooms)) {
      details.rooms = (details.rooms as Record<string, unknown>[]).map((room, index) => {
        const next = { ...room };
        if (details.rooms && (details.rooms as unknown[]).length === 1) {
          next.guests = guestLine || null;
          if (keys.length) next.party_keys = keys;
        } else if (guests.length === (details.rooms as unknown[]).length) {
          next.guests = personLine(guests[index]) || null;
          const key = partyKey(guests[index]);
          if (key) next.party_keys = [key];
        }
        return next;
      });
    }
  }

  const prixNet = optionalMoney(input.prix_net, "Coût net");
  const prixNetEur = optionalMoney(input.prix_net_eur, "Coût net en euros");
  const deviseNet = input.devise_net == null || input.devise_net === "" ? null : currencyOf(input.devise_net);
  const net = planSupplierNet({
    prixNet,
    devise: deviseNet,
    prixNetEur,
    leNet: fill && fill.prixNet != null ? { amount: fill.prixNet, currency: fill.deviseNet } : null,
  });
  if (net) {
    if (prixNet == null && prixNetEur != null && !deviseNet && !fill?.prixNet && typeof details.supplier_net === "number") {
      details.supplier_net_eur = prixNetEur;
      if (detailText(details, "supplier_currency") === "EUR") details.supplier_net = prixNetEur;
    } else {
      const sameNet =
        details.supplier_net === net.supplier_net && detailText(details, "supplier_currency") === net.supplier_currency;
      details.supplier_net = net.supplier_net;
      details.supplier_currency = net.supplier_currency;
      if (net.supplier_net_eur != null) details.supplier_net_eur = net.supplier_net_eur;
      else if (!sameNet) delete details.supplier_net_eur;
    }
  }

  const hasPrix = input.prix != null && input.prix !== "";
  let price = priceFromHotel(item, details, booking);
  if (hasPrix) {
    const prix = optionalMoney(input.prix, "Prix");
    const devise = input.devise == null || input.devise === "" ? null : currencyOf(input.devise);
    price = hotelPrice({ prix, devise, dossierDevise: booking.currency || "EUR" });
    patch.amount = price.amount;
    if (price.documentAmount != null) details.document_amount = price.documentAmount;
    else delete details.document_amount;
    if (price.documentCurrency) details.document_currency = price.documentCurrency;
    else delete details.document_currency;
  }

  const asked = [
    "reference_le",
    "nom",
    "ville",
    "pays",
    "adresse",
    "arrivee",
    "depart",
    "chambre",
    "chambres",
    "pension",
    "regime",
    "confirmation",
    "confirmations",
    "voyageurs",
    "fournisseur",
    "notes",
    "annulation",
    "avantages",
    "inclus",
    "prix_net",
    "devise_net",
    "prix_net_eur",
    "prix",
    "devise",
  ].some((key) => input[key] != null && input[key] !== "");
  if (!asked) throw new McpWriteError("Rien à modifier.");

  const saved = await patchStaffBookingCard(db, booking.id, carteId, patch);
  if ("error" in saved) throw new McpWriteError(saved.error);
  const savedDetails =
    saved.item.details && typeof saved.item.details === "object" ? (saved.item.details as Record<string, unknown>) : details;
  return hotelReply(saved.item, booking, hasPrix ? price : priceFromHotel(saved.item, savedDetails, booking), saved.ledgerWarning);
}

function wholeInput(value: unknown, label: string) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  throw new McpWriteError(`${label} invalide.`);
}

/** Accueil VIP collé à un vol du dossier. L’aéroport et l’heure viennent de ce vol. Aucun message. */
export async function addAccueilVip(input: Record<string, unknown>, admin?: Admin) {
  const target = dossierTarget(input);
  const service = parseAccueilVipService(input.type);
  if (!service) throw new McpWriteError("Type d’accueil invalide (arrivée, départ ou aller-retour).");
  const provider = requiredText(input.fournisseur, "Prestataire", 160);
  const clientInfo = requiredText(input.informations, "Informations", 8000);
  const passengers = wholeInput(input.passagers, "Voyageurs");
  const bags = wholeInput(input.bagages, "Bagages");
  const hotline = optionalText(input.hotline, "Hotline", 40) || "";
  const email = optionalText(input.email, "E-mail", 200) || "";
  const confirmation = optionalText(input.confirmation, "Confirmation", 80) || "";
  const prix = optionalMoney(input.prix, "Prix");
  const devise = currencyOf(input.devise);
  const arrivalFlightId = optionalId(input.vol_arrivee, "Vol d’arrivée");
  const departureFlightId = optionalId(input.vol_depart, "Vol de départ");
  const documentId = optionalId(input.document_id, "Document");
  const db = client(admin);
  const booking = await loadBooking(db, target);
  const { data, error } = await db
    .from("crm_booking_items")
    .select("id, kind, title, start_at, end_at, lifecycle, details")
    .eq("booking_id", booking.id);
  if (error) throw new McpWriteError("Vol introuvable sur ce dossier.");
  const price = hotelPrice({ prix, devise, dossierDevise: booking.currency || "EUR" });
  const composed = composeAccueilVip(
    {
      service,
      provider,
      arrivalFlightId,
      departureFlightId,
      passengers,
      bags,
      hotline,
      email,
      confirmation,
      clientInfo,
      amount: price.amount,
      documentAmount: price.documentAmount,
      documentCurrency: price.documentCurrency,
    },
    (data || []) as AccueilVipFlight[]
  );
  if (!composed.ok) throw new McpWriteError(composed.error);
  const saved = await addStaffBookingCard(db, booking.id, {
    ...composed.card,
    title: composed.card.title,
    include_in_ledger: false,
  });
  if ("error" in saved) throw new McpWriteError(saved.error);
  if (documentId) {
    const { data: doc, error: docError } = await db
      .from("crm_booking_documents")
      .select("id")
      .eq("id", documentId)
      .eq("booking_id", booking.id)
      .maybeSingle();
    if (docError || !doc) throw new McpWriteError("Ce document n’est pas sur le dossier.");
    const itemId = String(saved.item.id);
    const { error: linkError } = await db.from("crm_booking_items").update({ source_document_id: documentId }).eq("id", itemId);
    if (linkError) throw new McpWriteError("Document non relié.");
    await db.from("crm_booking_documents").update({ booking_item_id: itemId }).eq("id", documentId);
  }
  const legs = readAccueilVipLegs(composed.card.details);
  return {
    ...cardReply(saved.item, booking, price, saved.ledgerWarning),
    prestataire: composed.card.supplier,
    etapes: legs.map((leg) => ({
      sens: leg.role === "arrival" ? "arrivée" : "départ",
      vol_id: leg.flight_id,
      vol: leg.flight_number,
      aeroport: leg.airport_iata,
      ville: leg.airport_city,
      horaire: leg.at,
    })),
  };
}

/** Un prix explicitement nul, et aucun autre vol du dossier à un prix vendu. */
async function freeFlights(
  db: Admin,
  bookingId: string,
  prix: number | null,
  prixTotal: number | null,
  exceptId?: string
) {
  const explicitZero = prix === 0 || prixTotal === 0;
  const explicitPositive = (prix != null && prix > 0) || (prixTotal != null && prixTotal > 0);
  if (!explicitZero || explicitPositive) return false;
  const { data, error } = await db
    .from("crm_booking_items")
    .select("id, kind, amount, lifecycle")
    .eq("booking_id", bookingId);
  if (error) throw new McpWriteError("Frais de billeterie non retirés.");
  return !(
    (data || []) as { id: string; kind: string | null; amount: number | null; lifecycle?: string | null }[]
  ).some((row) => {
    if (exceptId && row.id === exceptId) return false;
    if (row.kind !== "flight" || !isActiveItem(row)) return false;
    return Number(row.amount) > 0;
  });
}

async function dismissTicketing(db: Admin, bookingId: string) {
  const { error } = await db.from("crm_bookings").update({ fee_mode: TICKETING_FEE_OFF }).eq("id", bookingId);
  if (error) {
    console.error("[mcp] fee_mode", error.code);
    throw new McpWriteError("Frais de billeterie non retirés.");
  }
}

type PartyPerson = { id: string; first_name: string | null; last_name: string | null };

/** Remplace un compagnon sur les listes de la carte (vols, chambres). */
export function retargetCompanionDetails(
  details: Record<string, unknown>,
  fromId: string,
  to: PartyPerson
): Record<string, unknown> | null {
  const fromKey = companionKey(fromId);
  const toKey = companionKey(to.id);
  let changed = false;
  const next: Record<string, unknown> = { ...details };
  const keys = Array.isArray(details.party_keys) ? details.party_keys.map(String) : null;
  if (keys?.includes(fromKey)) {
    changed = true;
    next.party_keys = keys.map((key) => (key === fromKey ? toKey : key));
  }
  if (Array.isArray(details.passengers) && keys) {
    next.passengers = details.passengers.map((person, index) => {
      if (keys[index] !== fromKey || !person || typeof person !== "object") return person;
      changed = true;
      return { ...(person as Record<string, unknown>), first_name: to.first_name, last_name: to.last_name };
    });
  }
  if (Array.isArray(details.rooms)) {
    next.rooms = details.rooms.map((room) => {
      if (!room || typeof room !== "object") return room;
      const roomKeys = Array.isArray((room as { party_keys?: unknown }).party_keys)
        ? ((room as { party_keys: unknown[] }).party_keys.map(String))
        : null;
      if (!roomKeys?.includes(fromKey)) return room;
      changed = true;
      return { ...(room as Record<string, unknown>), party_keys: roomKeys.map((key) => (key === fromKey ? toKey : key)) };
    });
  }
  return changed ? next : null;
}

/** Retire un voyageur des listes de la carte. */
export function dropPartyFromDetails(details: Record<string, unknown>, partyKey: string): Record<string, unknown> | null {
  let changed = false;
  const next: Record<string, unknown> = { ...details };
  const keys = Array.isArray(details.party_keys) ? details.party_keys.map(String) : null;
  if (keys?.includes(partyKey)) {
    changed = true;
    const kept = keys
      .map((key, index) => ({ key, index }))
      .filter((entry) => entry.key !== partyKey);
    next.party_keys = kept.map((entry) => entry.key);
    if (Array.isArray(details.passengers)) {
      const passengers = details.passengers as unknown[];
      next.passengers = kept.map((entry) => passengers[entry.index]).filter((person) => person != null);
    }
    if (typeof details.ticket_count === "number") next.ticket_count = kept.length;
  }
  if (Array.isArray(details.rooms)) {
    next.rooms = details.rooms.map((room) => {
      if (!room || typeof room !== "object") return room;
      const roomKeys = Array.isArray((room as { party_keys?: unknown }).party_keys)
        ? ((room as { party_keys: unknown[] }).party_keys.map(String))
        : null;
      if (!roomKeys?.includes(partyKey)) return room;
      changed = true;
      return { ...(room as Record<string, unknown>), party_keys: roomKeys.filter((key) => key !== partyKey) };
    });
  }
  return changed ? next : null;
}

async function rewriteBookingParty(
  db: Admin,
  bookingId: string,
  rewrite: (details: Record<string, unknown>) => Record<string, unknown> | null
) {
  const { data, error } = await db
    .from("crm_booking_items")
    .select("id, details")
    .eq("booking_id", bookingId);
  if (error) throw new McpWriteError("Carte non mise à jour.");
  for (const row of (data || []) as { id: string; details: Record<string, unknown> | null }[]) {
    const details = row.details && typeof row.details === "object" ? row.details : {};
    const next = rewrite(details);
    if (!next) continue;
    const { error: updateError } = await db.from("crm_booking_items").update({ details: next }).eq("id", row.id);
    if (updateError) throw new McpWriteError("Carte non mise à jour.");
  }
}

function requiredFlag(value: unknown, label: string) {
  if (value === true || value === false) return value;
  throw new McpWriteError(`${label} : vrai ou faux.`);
}

function optionalFlag(value: unknown, label: string) {
  if (value == null || value === "") return null;
  return requiredFlag(value, label);
}

/** Même case que « Inclure dans les transactions ». Une dépense reste cochée. Le client qui règle son séjour ne débite pas l’hôtel ni le vol. */
function ledgerInclusion(
  item: { kind: string },
  requested: boolean,
  clientSettlesStay: boolean
) {
  if (isLedgerExpenseKind(item.kind)) {
    if (!requested) throw new McpWriteError("Une dépense reste dans les transactions.");
    return true;
  }
  if (clientSettlesStay && isStayAmountKind(item.kind)) {
    if (requested) throw new McpWriteError("Le client règle ce séjour. Cette carte ne va pas aux transactions.");
    return false;
  }
  return requested;
}

/** Même geste que Cacher / Montrer dans l’agence : le masquage n’existe que si on le choisit. */
export function cardVisibilityUpdate(
  item: { lifecycle?: string | null; details?: Record<string, unknown> | null },
  visible: boolean
): { error: string } | { visible_to_client: boolean; details: Record<string, unknown> } {
  if (visible && !isActiveItem(item)) {
    return { error: "Cette carte est archivée. Elle ne revient pas dans le carnet." as const };
  }
  const details = visible
    ? detailsForCardVisibility(item.details, true)
    : { ...(item.details || {}), client_hidden: true };
  return { visible_to_client: visible, details };
}

type LedgerRow = {
  id?: string;
  external_id?: string | null;
  status?: string | null;
  amount?: number | string | null;
  direction?: string | null;
};

function cardDebit(rows: LedgerRow[], bookingId: string, item: { id: string; kind?: string | null }) {
  const externalId = bookingChargeExternalId(bookingId, item);
  return rows.find((row) => row.external_id === externalId && row.direction === "debit") || null;
}

function debitPosted(row: LedgerRow | null) {
  return Boolean(row) && row?.status !== "void";
}

function ledgerSnapshot(row: LedgerRow | null): LedgerRow | null {
  if (!row) return null;
  return {
    id: row.id,
    external_id: row.external_id,
    status: row.status,
    amount: row.amount,
    direction: row.direction,
  };
}

function ledgerMove(before: LedgerRow | null, after: LedgerRow | null) {
  const was = debitPosted(before);
  const now = debitPosted(after);
  if (!before && !after) return "hors_livre" as const;
  if (!was && now && !before) return "ajoute" as const;
  if (!was && now) return "retabli" as const;
  if (was && !now) return "annule" as const;
  if (was && now && Number(before?.amount) !== Number(after?.amount)) return "mis_a_jour" as const;
  return "inchange" as const;
}

/**
 * Montre ou cache une seule carte, et coche ou décoche « Inclure dans les transactions ».
 * Aucun envoi, aucun publier_carnet. Sur un carnet déjà montré, un brouillon WhatsApp est préparé.
 * Le grand livre reprend la même ligne.
 */
export async function setCarteVisibilite(input: Record<string, unknown>, admin?: Admin) {
  const visible = optionalFlag(input.visible, "Visible");
  const include = optionalFlag(input.inclure_transactions, "Inclure dans les transactions");
  if (visible == null && include == null) throw new McpWriteError("Indiquez visible ou inclure_transactions.");
  const carteId = uuid(input.carte_id, "Carte");
  const db = client(admin);
  const booking = await loadBooking(db, dossierTarget(input));
  const { data, error } = await db
    .from("crm_booking_items")
    .select("id, kind, title, amount, details, lifecycle, visible_to_client, include_in_ledger")
    .eq("id", carteId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (error || !data) throw new McpWriteError("Carte introuvable sur ce dossier.");
  const item = data as {
    id: string;
    kind: string;
    title: string | null;
    amount: number | null;
    details: Record<string, unknown> | null;
    lifecycle: string | null;
    visible_to_client: boolean | null;
    include_in_ledger: boolean | null;
  };
  const next = visible == null ? null : cardVisibilityUpdate(item, visible);
  if (next && "error" in next) throw new McpWriteError(next.error);
  const includeNext =
    include == null ? null : ledgerInclusion(item, include, booking.client_settles_stay === true);
  const { data: beforeRows } = await db
    .from("crm_transactions")
    .select("id, external_id, status, amount, direction")
    .eq("booking_id", booking.id)
    .eq("direction", "debit");
  const before = ledgerSnapshot(cardDebit((beforeRows || []) as LedgerRow[], booking.id, item));
  const visibilityChanged =
    next != null &&
    visible != null &&
    (Boolean(item.visible_to_client) !== visible ||
      (visible ? item.details?.client_hidden === true : item.details?.client_hidden !== true));
  const ledgerChanged = includeNext != null && Boolean(item.include_in_ledger) !== includeNext;
  const patch: Record<string, unknown> = {};
  if (visibilityChanged && next && !("error" in next)) {
    patch.visible_to_client = next.visible_to_client;
    patch.details = next.details;
  }
  if (ledgerChanged) patch.include_in_ledger = includeNext;
  if (Object.keys(patch).length) {
    const { error: updateError } = await db
      .from("crm_booking_items")
      .update(patch)
      .eq("id", carteId)
      .eq("booking_id", booking.id);
    if (updateError) throw new McpWriteError("Carte non mise à jour.");
  }
  const noted: boolean[] = [];
  if (visibilityChanged && visible != null) {
    const { error: auditError } = await db.from("crm_audit_events").insert(
      toAuditRow({
        actorKind: "auto",
        action: "visibilite_carte",
        bookingId: booking.id,
        customerId: booking.customer_id,
        summary: visible ? "Carte montrée au client" : "Carte cachée au client",
        detail: { carte_id: carteId, kind: item.kind, visible },
      })
    );
    noted.push(!auditError);
    if (auditError) console.error("[mcp] journal visibilité", auditError.code ?? "?");
  }
  if (ledgerChanged) {
    const { error: auditError } = await db.from("crm_audit_events").insert(
      toAuditRow({
        actorKind: "auto",
        action: "transactions_carte",
        bookingId: booking.id,
        customerId: booking.customer_id,
        summary: includeNext ? "Carte incluse dans les transactions" : "Carte retirée des transactions",
        detail: { carte_id: carteId, kind: item.kind, inclure_transactions: includeNext },
      })
    );
    noted.push(!auditError);
    if (auditError) console.error("[mcp] journal transactions", auditError.code ?? "?");
  }
  const journal = noted.length > 0 && noted.every(Boolean);
  const warning = await ledgerWarning("Carte enregistrée", () => refreshBookingLedger(db, booking.id));
  await import("@/lib/crm/dossier-refresh")
    .then((mod) => mod.refreshBookingDerived(booking.id))
    .catch(() => undefined);
  const draft =
    visibilityChanged && visible === true
      ? await noteCarnetAdditions(db, booking.id, [{ id: carteId, kind: item.kind }])
      : { prepared: false as const };
  const { data: saved } = await db
    .from("crm_booking_items")
    .select("id, kind, title, visible_to_client, include_in_ledger, details")
    .eq("id", carteId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  const row = (saved || {
    ...item,
    visible_to_client: visibilityChanged && next && !("error" in next) ? next.visible_to_client : item.visible_to_client,
    details: visibilityChanged && next && !("error" in next) ? next.details : item.details,
    include_in_ledger: ledgerChanged ? includeNext : item.include_in_ledger,
  }) as {
    id: string;
    kind: string;
    title: string | null;
    visible_to_client: boolean | null;
    include_in_ledger: boolean | null;
    details: Record<string, unknown> | null;
  };
  const { data: afterRows } = await db
    .from("crm_transactions")
    .select("id, external_id, status, amount, direction")
    .eq("booking_id", booking.id)
    .eq("direction", "debit");
  const after = ledgerSnapshot(cardDebit((afterRows || []) as LedgerRow[], booking.id, item));
  const compte = debitPosted(after);
  return {
    carte_id: carteId,
    dossier_id: booking.id,
    reference: booking.reference,
    kind: row.kind,
    titre: row.title,
    visible: row.visible_to_client === true,
    notifie: false,
    message_pret: draft.prepared,
    sejour_visible: booking.visible_to_client === true,
    incluse_transactions: itemIncludedInLedger(
      { kind: row.kind, include_in_ledger: row.include_in_ledger },
      booking.client_settles_stay === true
    ),
    grand_livre: {
      compte,
      statut: !after ? "absent" : compte ? "compte" : "annule",
      montant: compte ? Number(after?.amount) : null,
      mouvement_id: after?.id || null,
      effet: ledgerMove(before, after),
    },
    journal,
    ...(warning ? { avertissement: warning } : {}),
  };
}

/**
 * Prépare à la main le WhatsApp « ajouté à votre carnet ».
 * Un seul brouillon. Rien n’est envoyé.
 */
export async function prepareCarnetMessage(input: Record<string, unknown>, admin?: Admin) {
  const db = client(admin);
  const booking = await loadBooking(db, dossierTarget(input));
  const asked = idList(input.carte_ids ?? input.cartes, "Carte");
  const { data, error } = await db
    .from("crm_booking_items")
    .select("id, kind, lifecycle, visible_to_client, details")
    .eq("booking_id", booking.id);
  if (error) throw new McpWriteError("Cartes du dossier illisibles.");
  const items = (data || []) as {
    id: string;
    kind: string;
    lifecycle: string | null;
    visible_to_client: boolean | null;
    details: Record<string, unknown> | null;
  }[];
  const wanted = asked.length ? new Set(asked) : null;
  if (wanted) {
    for (const id of wanted) {
      if (!items.some((item) => item.id === id)) throw new McpWriteError("Carte introuvable sur ce dossier.");
    }
  }
  const cards = items.filter((item) => {
    if (wanted && !wanted.has(item.id)) return false;
    if (!isActiveItem(item) || item.visible_to_client !== true || keptHiddenFromClient(item.details)) return false;
    return countsAsCarnetCard(item.kind);
  });
  if (wanted && cards.length !== wanted.size) {
    throw new McpWriteError("Cette prestation n’est pas montrée dans le carnet.");
  }
  const draft = await noteCarnetAdditions(
    db,
    booking.id,
    cards.map((item) => ({ id: item.id, kind: item.kind })),
    { replace: true }
  );
  if (!draft.prepared) throw new McpWriteError(draft.raison);
  return {
    dossier_id: booking.id,
    reference: booking.reference,
    envoye: false,
    notifie: false,
    message: draft.message,
    suivi_id: draft.suivi_id,
    prestations: draft.prestations,
  };
}

/** Retire une carte. Les frais de billeterie ne reviennent pas, et leur débit est annulé. Aucun message. */
export async function removeCarte(input: Record<string, unknown>, admin?: Admin) {
  const booking = await loadBooking(client(admin), dossierTarget(input));
  const carteId = uuid(input.carte_id, "Carte");
  const db = client(admin);
  const { data, error } = await db
    .from("crm_booking_items")
    .select("id, kind, title, details")
    .eq("id", carteId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (error || !data) throw new McpWriteError("Carte introuvable sur ce dossier.");
  const item = data as { id: string; kind: string; title: string | null; details: Record<string, unknown> | null };
  if (isAutoTicketingExpense(item) || (item.kind === "expense" && /^Frais de billeterie/.test(item.title || ""))) {
    await dismissTicketing(db, booking.id);
  }
  const { error: deleteError } = await db.from("crm_booking_items").delete().eq("id", carteId).eq("booking_id", booking.id);
  if (deleteError) throw new McpWriteError("Carte non retirée.");
  await resyncAccueilVip(db, booking.id);
  const warning = await ledgerWarning("Carte retirée", () => refreshBookingLedger(db, booking.id));
  await import("@/lib/crm/dossier-refresh")
    .then((mod) => mod.refreshBookingDerived(booking.id))
    .catch(() => undefined);
  return {
    carte_id: carteId,
    dossier_id: booking.id,
    reference: booking.reference,
    retiree: true,
    notifie: false,
    ...(warning ? { avertissement: warning } : {}),
  };
}

/** Retire un voyageur du séjour, et des cartes qui le citent. Aucun message. */
export async function removeVoyageur(input: Record<string, unknown>, admin?: Admin) {
  const db = client(admin);
  const booking = await loadBooking(db, dossierTarget(input));
  const voyageurId = optionalId(input.voyageur_id, "Voyageur");
  const compagnonId = optionalId(input.compagnon_id, "Compagnon");
  if (!voyageurId && !compagnonId) throw new McpWriteError("Indiquez le voyageur ou le compagnon.");
  let query = db
    .from("crm_booking_travelers")
    .select("id, companion_id, is_account_holder, first_name, last_name")
    .eq("booking_id", booking.id);
  if (voyageurId) query = query.eq("id", voyageurId);
  else query = query.eq("companion_id", compagnonId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new McpWriteError("Voyageur introuvable sur ce dossier.");
  const traveler = data as {
    id: string;
    companion_id: string | null;
    is_account_holder: boolean;
    first_name: string | null;
    last_name: string | null;
  };
  const party = traveler.is_account_holder ? holderKey() : traveler.companion_id ? companionKey(traveler.companion_id) : "";
  const { error: deleteError } = await db
    .from("crm_booking_travelers")
    .delete()
    .eq("id", traveler.id)
    .eq("booking_id", booking.id);
  if (deleteError) throw new McpWriteError("Voyageur non retiré.");
  if (party) await rewriteBookingParty(db, booking.id, (details) => dropPartyFromDetails(details, party));
  const warning = await ledgerWarning("Voyageur retiré", () => refreshTicketingFee(db, booking.id));
  return {
    voyageur_id: traveler.id,
    dossier_id: booking.id,
    reference: booking.reference,
    retire: true,
    notifie: false,
    ...(warning ? { avertissement: warning } : {}),
  };
}

/**
 * Reprend les séjours d’un compagnon sans passeport sur le compagnon conservé, puis retire le doublon.
 * Aucun message.
 */
export async function mergeCompagnon(input: Record<string, unknown>, admin?: Admin) {
  const keepId = uuid(input.garder_id, "Compagnon conservé");
  const dropId = uuid(input.retirer_id, "Compagnon retiré");
  if (keepId === dropId) throw new McpWriteError("Indiquez deux compagnons différents.");
  const db = client(admin);
  const { data: rows, error } = await db
    .from("crm_travel_companions")
    .select("id, customer_id, first_name, last_name, usage_name")
    .in("id", [keepId, dropId]);
  if (error) throw new McpWriteError("Compagnon introuvable.");
  const companions = (rows || []) as (CompanionRow & { customer_id: string })[];
  const keep = companions.find((row) => row.id === keepId);
  const drop = companions.find((row) => row.id === dropId);
  if (!keep || !drop) throw new McpWriteError("Compagnon introuvable.");
  if (keep.customer_id !== drop.customer_id) throw new McpWriteError("Ces compagnons ne sont pas sur la même fiche.");
  const { data: docs, error: docError } = await db
    .from("crm_travel_documents")
    .select("id, doc_type")
    .eq("companion_id", dropId);
  if (docError) throw new McpWriteError("Compagnon non fusionné.");
  if ((docs || []).length) throw new McpWriteError("Ce compagnon a une pièce. Il n’est pas retiré.");
  const { data: travelers, error: travelerError } = await db
    .from("crm_booking_travelers")
    .select("id, booking_id")
    .eq("companion_id", dropId);
  if (travelerError) throw new McpWriteError("Compagnon non fusionné.");
  const stays = (travelers || []) as { id: string; booking_id: string }[];
  for (const stay of stays) {
    const { data: kept, error: keptError } = await db
      .from("crm_booking_travelers")
      .select("id")
      .eq("booking_id", stay.booking_id)
      .eq("companion_id", keepId)
      .maybeSingle();
    if (keptError) throw new McpWriteError("Compagnon non fusionné.");
    if (kept) {
      const { error: deleteError } = await db.from("crm_booking_travelers").delete().eq("id", stay.id);
      if (deleteError) throw new McpWriteError("Compagnon non fusionné.");
      await rewriteBookingParty(db, stay.booking_id, (details) => dropPartyFromDetails(details, companionKey(dropId)));
    } else {
      const { error: updateError } = await db
        .from("crm_booking_travelers")
        .update({ companion_id: keepId, first_name: keep.first_name, last_name: keep.last_name })
        .eq("id", stay.id);
      if (updateError) throw new McpWriteError("Compagnon non fusionné.");
      await rewriteBookingParty(db, stay.booking_id, (details) => retargetCompanionDetails(details, dropId, keep));
    }
    await refreshTicketingFee(db, stay.booking_id);
  }
  const { error: deleteError } = await db.from("crm_travel_companions").delete().eq("id", dropId).eq("customer_id", drop.customer_id);
  if (deleteError) throw new McpWriteError("Compagnon non retiré.");
  return {
    compagnon_id: keepId,
    retire_id: dropId,
    client_id: keep.customer_id,
    sejours: stays.length,
    notifie: false,
  };
}
