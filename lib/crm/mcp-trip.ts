import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { createBookingSchema, isIsoDate, parseBody } from "@/lib/crm/admin-schemas";
import { dossierFlightStamp, timezoneForIata } from "@/lib/crm/airport-time";
import { inferAirlineIata } from "@/lib/crm/brand-marks";
import { addStaffBookingCard, patchStaffBookingCard } from "@/lib/crm/booking-item-write";
import { createStaffBooking, StaffWriteError, type StaffBookingInput } from "@/lib/crm/booking-create";
import { ledgerWarning, refreshTicketingFee } from "@/lib/crm/bookings";
import { resolveBillingCustomerId } from "@/lib/crm/company-role";
import { customerEmailError, normalizeCustomerEmail } from "@/lib/crm/customer-email";
import { addIsoDays } from "@/lib/crm/dates";
import { resolveNationality } from "@/lib/crm/countries";
import { companionKey, holderKey } from "@/lib/crm/household";
import { itemTicketCount } from "@/lib/crm/item-match";
import { parseMoney } from "@/lib/crm/money";
import { type PayerCompany } from "@/lib/crm/payer";
import { sameRecordedTraveler } from "@/lib/crm/person-match";
import { staffStayLabel, withoutHomeCity } from "@/lib/crm/staff-stay";
import { storedCompanionPhone } from "@/lib/crm/trip-share";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import { cloneTravelDocument, insertTravelDocument } from "@/lib/crm/travel-document-write";
import type { CrmBooking, CrmCustomer } from "@/lib/crm/types";
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

function positiveMoney(value: unknown, label: string) {
  if (value == null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") throw new McpWriteError(`${label} invalide.`);
  const amount = parseMoney(value);
  if (amount == null || amount <= 0) throw new McpWriteError(`${label} : indiquez un montant supérieur à zéro.`);
  return amount;
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

function lines(value: unknown, label: string) {
  if (value == null || value === "") return [];
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n+/) : null;
  if (!raw) throw new McpWriteError(`${label} invalide.`);
  return raw.map((item) => text(item, label, 200)).filter(Boolean);
}

/**
 * Société demandée, ou l’unique société du client.
 * Sans ces champs, le séjour reste particulier, même si une société est sur la fiche.
 */
export function dossierPayerChoice(input: {
  societeId: string;
  facturerSociete: boolean;
  companies: PayerCompany[];
}): { payer_kind: "company" | "personal"; billing_company_id: string | null } | { error: string } {
  if (input.societeId) {
    const match = input.companies.find((company) => company.id === input.societeId);
    if (!match) return { error: "Cette société n’est pas sur la fiche du client." };
    return { payer_kind: "company", billing_company_id: match.id };
  }
  if (input.facturerSociete) {
    if (!input.companies.length) {
      return { error: "Aucune société sur la fiche. Ajoutez-la avant de facturer le séjour." };
    }
    if (input.companies.length > 1) return { error: "Plusieurs sociétés sur la fiche. Indiquez societe_id." };
    return { payer_kind: "company", billing_company_id: input.companies[0].id };
  }
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
};

/** Prix vendu dans la devise du dossier. Une autre devise reste le prix du document, sans conversion. */
export function flightPrice(input: {
  prix: number | null;
  prixTotal: number | null;
  passengers: number;
  devise: string | null;
  dossierDevise: string;
}): PricePlan {
  const count = Math.max(1, input.passengers);
  const devise = input.devise || input.dossierDevise;
  let unit = input.prix;
  if (unit == null && input.prixTotal != null) {
    unit = Math.round((input.prixTotal / count) * 100) / 100;
  }
  if (unit != null && input.prixTotal != null) {
    const expected = Math.round(unit * count * 100) / 100;
    if (Math.abs(expected - input.prixTotal) > 0.05) {
      throw new McpWriteError("Le prix du billet et le total ne correspondent pas.");
    }
  }
  const total = input.prixTotal ?? (unit == null ? null : Math.round(unit * count * 100) / 100);
  const ticketCount = input.passengers > 0 ? input.passengers : null;
  if (devise !== input.dossierDevise) {
    return { amount: null, ticketCount, documentAmount: total, documentCurrency: devise, devise };
  }
  return { amount: unit, ticketCount, documentAmount: null, documentCurrency: null, devise };
}

export function hotelPrice(input: { prix: number | null; devise: string | null; dossierDevise: string }): PricePlan {
  const devise = input.devise || input.dossierDevise;
  if (input.prix == null) {
    return { amount: null, ticketCount: null, documentAmount: null, documentCurrency: null, devise };
  }
  if (devise !== input.dossierDevise) {
    return {
      amount: null,
      ticketCount: null,
      documentAmount: input.prix,
      documentCurrency: devise,
      devise,
    };
  }
  return { amount: input.prix, ticketCount: null, documentAmount: null, documentCurrency: null, devise };
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
  price: PricePlan;
  guests: FlightPassenger[];
}) {
  const details: Record<string, unknown> = { hotel_name: input.nom };
  if (input.ville) details.city = input.ville;
  if (input.pays) details.country = input.pays;
  if (input.chambre) details.room = input.chambre;
  if (input.pension) details.board = input.pension;
  if (input.inclus.length) details.included = input.inclus;
  if (input.annulation) details.notes = input.annulation;
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
  const tickets = price.ticketCount && price.ticketCount > 0 ? price.ticketCount : 1;
  return Math.round(price.amount * tickets * 100) / 100;
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
  return {
    id: item.id,
    dossier_id: booking.id,
    reference: booking.reference,
    titre: item.title,
    prix_vendu: sellingAmount(price),
    ...(tickets ? { prix_billet: price.amount, billets: tickets } : {}),
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
  const billCompany = facturerSociete(input.facturer_societe);
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
    const choice = dossierPayerChoice({ societeId, facturerSociete: billCompany, companies });
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

export async function addVoyageur(input: Record<string, unknown>, admin?: Admin) {
  const prenoms = requiredText(input.prenoms, "Prénoms", 120);
  const nom = requiredText(input.nom, "Nom", 80);
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
    .select("id, first_name, last_name, birth_date, sex, nationality, phone")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError || !customer) throw new McpWriteError("Client introuvable.");
  const holder = customer as Pick<CrmCustomer, "id" | "first_name" | "last_name"> & {
    birth_date?: string | null;
    sex?: string | null;
    nationality?: string | null;
    phone?: string | null;
  };
  const isHolder = sameRecordedTraveler(holder, { first_name: prenoms, last_name: nom });
  const { data: companions, error: companionError } = await db
    .from("crm_travel_companions")
    .select("id, first_name, last_name")
    .eq("customer_id", customerId);
  if (companionError) throw new McpWriteError("Voyageur non ajouté.");
  const known = ((companions || []) as { id: string; first_name: string | null; last_name: string | null }[]).find((row) =>
    sameRecordedTraveler(row, { first_name: prenoms, last_name: nom })
  );
  if (booking) {
    const { data: already, error: alreadyError } = await db
      .from("crm_booking_travelers")
      .select("first_name, last_name")
      .eq("booking_id", booking.id);
    if (alreadyError) throw new McpWriteError("Voyageur non ajouté.");
    if ((already || []).some((row) => sameRecordedTraveler(row, { first_name: prenoms, last_name: nom }))) {
      throw new McpWriteError("Ce voyageur est déjà sur le séjour.");
    }
  }
  let companionId: string | null = null;
  if (!isHolder) {
    if (known) {
      companionId = known.id;
      const patch: Record<string, unknown> = {};
      if (naissance) patch.birth_date = naissance;
      if (sex) patch.sex = sex;
      if (nationalite) patch.nationality = nationalite;
      if (telephone) patch.phone = telephone;
      if (Object.keys(patch).length) {
        const { error } = await db.from("crm_travel_companions").update(patch).eq("id", known.id).eq("customer_id", customerId);
        if (error) throw new McpWriteError("Voyageur non ajouté.");
      }
    } else {
      const { data, error } = await db
        .from("crm_travel_companions")
        .insert({
          customer_id: customerId,
          first_name: prenoms,
          last_name: nom,
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
        first_name: prenoms,
        last_name: nom,
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
        first_name: prenoms,
        last_name: nom,
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
  const prix = positiveMoney(input.prix, "Prix");
  const prixTotal = positiveMoney(input.prix_total, "Prix total");
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

  const hasVoyageurs = input.voyageurs != null && input.voyageurs !== "";
  const voyageurIds = hasVoyageurs ? idList(input.voyageurs, "Voyageur") : null;
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

  const prix = positiveMoney(input.prix, "Prix");
  const prixTotal = positiveMoney(input.prix_total, "Prix total");
  const count = passengers ? passengers.length : itemTicketCount({ kind: "flight", details });
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
  const saved = await patchStaffBookingCard(db, booking.id, carteId, patch);
  if ("error" in saved) throw new McpWriteError(saved.error);
  return cardReply(saved.item, booking, price, saved.ledgerWarning);
}

function priceFromFlight(item: Record<string, unknown>, details: Record<string, unknown>, booking: CrmBooking): PricePlan {
  const tickets = itemTicketCount({ kind: "flight", details });
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
    };
  }
  const amount = typeof item.amount === "number" ? item.amount : item.amount == null ? null : Number(item.amount);
  return {
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    ticketCount: tickets,
    documentAmount: null,
    documentCurrency: null,
    devise: dossierDevise,
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
  const prix = positiveMoney(input.prix, "Prix");
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
    price,
    guests,
  });
  const saved = await addStaffBookingCard(db, booking.id, body);
  if ("error" in saved) throw new McpWriteError(saved.error);
  return cardReply(saved.item, booking, price, saved.ledgerWarning);
}
