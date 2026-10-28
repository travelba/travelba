import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { createTransactionSchema, isIsoDate, parseBody } from "@/lib/crm/admin-schemas";
import {
  agencyFeeForBooking,
  agencyFeeRateColumn,
  agencyFeeRateField,
  formatAgencyFeePercent,
} from "@/lib/crm/agency-fee-rate";
import { BookingIssuesError, collectPublishIssues } from "@/lib/crm/booking-issues";
import { toAuditRow } from "@/lib/crm/audit-events";
import { bookingCoverPlan, catalogCoverChoice, catalogPhotoFromPlan } from "@/lib/crm/covers";
import {
  classifyProvidedCover,
  coverCreditText,
  materializeProvidedCover,
  providedCoverFailure,
  type ProvidedCoverImage,
} from "@/lib/crm/cover-provided";
import {
  bookingMetaPatch,
  setCarnetPublished,
  syncBookingLedger,
  syncBookingTotalFromItems,
  syncInheritedAgencyFees,
} from "@/lib/crm/bookings";
import { deleteEmptyBillingCompany, upsertBillingCompany, type BillingCompanyInput } from "@/lib/crm/billing-companies";
import { customerEmailError, normalizeCustomerEmail, otherCustomerEmailBlock, CUSTOMER_EMAIL_COPY } from "@/lib/crm/customer-email";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import { extraMomentOf, extraPlaceOf, extraServiceLeg } from "@/lib/crm/extras";
import { bookingBelongsToCustomer, revolutExpenseError } from "@/lib/crm/revolut-debit";
import { applyRevolutToCustomer } from "@/lib/crm/revolut-match";
import { applyStripeToCustomer } from "@/lib/crm/stripe-match";
import {
  EMAIL_INBOX_QUEUE_STATUSES,
  customerFullName,
  type BookingStatus,
  type CrmBooking,
  type CrmBookingItem,
  type CrmCustomer,
  type CrmEmailIngest,
  type CrmRevolutTransaction,
  type CrmStripeTransaction,
} from "@/lib/crm/types";
import { staffStayLabel } from "@/lib/crm/staff-stay";
import { attachOutgoing, TripCostError } from "@/lib/crm/trip-costs-db";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Refus métier renvoyé tel quel à Grok. Le détail technique reste dans les logs. */
export class McpWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpWriteError";
  }
}

export type McpAdmin = SupabaseClient;

function client(admin?: McpAdmin) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function failDb(error: DbErrorLike, fallback: string): never {
  console.error("[mcp]", error?.code ?? "?");
  throw new McpWriteError(dbErrorMessage(error, fallback));
}

function raise(err: unknown, fallback: string): never {
  if (err instanceof McpWriteError) throw err;
  if (err instanceof BookingIssuesError) {
    const message = err.issues.map((issue) => issue.message).filter(Boolean).join(" ");
    throw new McpWriteError(message || err.message);
  }
  console.error("[mcp]", err instanceof Error ? err.message : "error");
  throw new McpWriteError(fallback);
}

function uuid(value: unknown, label: string) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(id)) throw new McpWriteError(`${label} invalide.`);
  return id;
}

function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string") throw new McpWriteError(`${label} invalide.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new McpWriteError(`${label} : ${max} caractères maximum.`);
  return trimmed;
}

/** Même saisie que l’espace agence : virement crédit seulement. */
export function prepareManualCredit(input: Record<string, unknown>) {
  const parsed = parseBody(createTransactionSchema, {
    customer_id: input.client_id,
    booking_id: input.dossier_id,
    amount: input.montant,
    currency: input.devise,
    occurred_on: input.date,
    label: input.libelle,
    kind: input.type,
    direction: input.sens,
  });
  if (parsed.error !== null || !parsed.data) throw new McpWriteError(parsed.error || "Crédit impossible.");
  const credit = parsed.data;
  const wantsOtherKind = Boolean(credit.kind) && credit.kind !== "transfer";
  const wantsDebit = credit.direction === "debit";
  if (wantsOtherKind || wantsDebit) {
    throw new McpWriteError("L’espace agence n’enregistre que les virements crédit.");
  }
  return credit;
}

export function prepareRevolutCredit(input: Record<string, unknown>) {
  return {
    virementId: uuid(input.virement_id, "Virement"),
    clientId: uuid(input.client_id, "Client"),
  };
}

export function prepareRevolutExpense(input: Record<string, unknown>) {
  return {
    depenseId: uuid(input.depense_id, "Dépense"),
    clientId: uuid(input.client_id, "Client"),
    dossierId: uuid(input.dossier_id, "Dossier"),
  };
}

export function prepareStripeCredit(input: Record<string, unknown>) {
  return {
    paiementId: uuid(input.paiement_id, "Paiement"),
    clientId: uuid(input.client_id, "Client"),
  };
}

export function prepareCarnetTarget(input: Record<string, unknown>) {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  const reference = typeof input.reference === "string" ? input.reference.trim() : "";
  if (!id && !reference) throw new McpWriteError("Indiquez l’identifiant ou la référence du dossier.");
  if (id && !UUID.test(id)) throw new McpWriteError("Dossier invalide.");
  return { id, reference };
}

/** Garde-fous de « Montrer au client », avant toute écriture. */
export function publishBlock(
  booking: { archived_at?: string | null; visible_to_client?: boolean | null },
  items: { kind: string; lifecycle?: string | null }[]
) {
  if (booking.archived_at) {
    throw new McpWriteError("Réactivez le dossier avant de le montrer au client.");
  }
  if (booking.visible_to_client) return { deja_montre: true as const };
  const issues = collectPublishIssues(items);
  if (issues.length) throw new McpWriteError(issues.map((issue) => issue.message).join(" "));
  return { deja_montre: false as const };
}

export function prepareBookingUpdate(input: Record<string, unknown>) {
  const target = prepareCarnetTarget(input);
  const body: Record<string, unknown> = {};
  if ("notes_client" in input) body.notes_client = text(input.notes_client, "Notes client", 5000);
  if ("notes_internes" in input) body.notes_internal = text(input.notes_internes, "Notes internes", 5000);
  if ("date_depart" in input) {
    const raw = text(input.date_depart ?? "", "Date de départ", 40);
    if (raw && !isIsoDate(raw)) throw new McpWriteError("Date de départ invalide (AAAA-MM-JJ).");
    body.start_date = raw;
  }
  if ("date_retour" in input) {
    const raw = text(input.date_retour ?? "", "Date de retour", 40);
    if (raw && !isIsoDate(raw)) throw new McpWriteError("Date de retour invalide (AAAA-MM-JJ).");
    body.end_date = raw;
  }
  if ("commission_agence" in input) {
    const parsed = agencyFeeRateField(input.commission_agence);
    if ("error" in parsed) throw new McpWriteError(parsed.error);
    body.agency_fee_rate = parsed.rate;
  }
  if ("titre" in input) {
    const title = text(input.titre, "Titre", 200);
    if (!title) throw new McpWriteError("Le titre est vide.");
    body.title = title;
  }
  const patch = bookingMetaPatch(body);
  let cover: { clear: true } | { photo: string } | { image: ProvidedCoverImage; credit: string } | null = null;
  if ("couverture" in input && input.couverture != null) {
    if (typeof input.couverture !== "string") throw new McpWriteError("Couverture invalide.");
    const provided = classifyProvidedCover(input.couverture);
    if ("error" in provided) throw new McpWriteError(provided.error);
    if (provided.kind === "catalog") {
      const choice = catalogCoverChoice(input.couverture);
      if ("error" in choice) throw new McpWriteError(choice.error);
      cover = choice;
      patch.cover_image_path = null;
      patch.cover_credit = null;
    } else {
      const credit = coverCreditText(input.credit);
      if ("error" in credit) throw new McpWriteError(credit.error);
      const image: ProvidedCoverImage =
        provided.source === "url"
          ? { source: "url", url: provided.url }
          : { source: "file", bytes: provided.bytes, mime: provided.mime };
      cover = { image, credit: credit.credit };
    }
  }
  let particulier = false;
  let societeId = "";
  if ("particulier" in input && input.particulier != null && input.particulier !== "") {
    if (input.particulier !== true && input.particulier !== false) {
      throw new McpWriteError("Particulier : vrai ou faux.");
    }
    particulier = input.particulier === true;
  }
  if ("societe_id" in input && input.societe_id != null && String(input.societe_id).trim() !== "") {
    societeId = uuid(input.societe_id, "Société");
  }
  if (particulier && societeId) {
    throw new McpWriteError("Un séjour particulier ne se facture pas à une société.");
  }
  const billing = particulier || societeId ? { particulier, societeId } : null;
  if (!Object.keys(patch).length && !billing && !cover) throw new McpWriteError("Rien à modifier.");
  return { ...target, patch, billing, cover };
}

export function prepareServiceConfirm(input: Record<string, unknown>) {
  return {
    dossierId: uuid(input.dossier_id, "Dossier"),
    carteId: uuid(input.carte_id, "Carte"),
  };
}

export function prepareEmailAction(input: Record<string, unknown>) {
  const action =
    input.action === "rattacher" ||
    input.action === "mettre_a_jour" ||
    input.action === "refuser" ||
    input.action === "creer_dossier"
      ? input.action
      : "";
  if (!action) throw new McpWriteError("Action inconnue.");
  const id = uuid(input.id, "E-mail");
  const dossierId =
    action === "rattacher" || action === "mettre_a_jour" ? uuid(input.dossier_id, "Dossier") : "";
  return { action, id, dossierId };
}

export function prepareClientCreate(input: Record<string, unknown>) {
  const email = normalizeCustomerEmail(String(input.email || ""));
  const emailErr = customerEmailError(email);
  if (emailErr) throw new McpWriteError(emailErr);
  const firstName = text(input.prenom, "Prénom", 80);
  const lastName = text(input.nom, "Nom", 80);
  if (!firstName || !lastName) throw new McpWriteError("Prénom et nom requis");
  const phone = input.telephone == null || input.telephone === "" ? null : text(input.telephone, "Téléphone", 40);
  return { email, firstName, lastName, phone };
}

const CLIENT_FIELDS = {
  prenom: "first_name",
  nom: "last_name",
  email: "email",
  telephone: "phone",
  societe: "company_name",
} as const;

/** Champs société de l’outil. `societe` et `raison_sociale` sont la même raison sociale. */
export function clientBillingInput(input: Record<string, unknown>): BillingCompanyInput | null {
  const body: BillingCompanyInput = {};
  let any = false;
  if ("societe" in input) {
    body.company_name = input.societe;
    any = true;
  }
  if ("raison_sociale" in input) {
    body.company_name = input.raison_sociale;
    any = true;
  }
  if ("siret" in input) {
    body.siret = input.siret;
    any = true;
  }
  if ("tva" in input) {
    body.vat_number = input.tva;
    any = true;
  }
  if ("adresse" in input) {
    body.billing_address_line = input.adresse;
    any = true;
  }
  if ("code_postal" in input) {
    body.billing_postal_code = input.code_postal;
    any = true;
  }
  if ("ville" in input) {
    body.billing_city = input.ville;
    any = true;
  }
  if ("pays" in input) {
    body.billing_country = input.pays;
    any = true;
  }
  return any ? body : null;
}

export function prepareClientUpdate(input: Record<string, unknown>) {
  const id = uuid(input.id, "Client");
  const body: Record<string, unknown> = {};
  for (const [from, key] of Object.entries(CLIENT_FIELDS)) {
    if (from in input) body[key] = input[from];
  }
  const company = clientBillingInput(input);
  const { patch, error } = customerPatchFromBody(body, { allowEmail: true });
  if (error) throw new McpWriteError(error);
  if ("commission_agence" in input) {
    const parsed = agencyFeeRateField(input.commission_agence);
    if ("error" in parsed) throw new McpWriteError(parsed.error);
    patch.agency_fee_rate = agencyFeeRateColumn(parsed.rate);
  }
  const removeCompanyId =
    input.supprimer_societe_id == null || input.supprimer_societe_id === ""
      ? ""
      : uuid(input.supprimer_societe_id, "Société");
  if (!Object.keys(patch).length && !company && !removeCompanyId) throw new McpWriteError("Rien à modifier.");
  return { id, patch, company, removeCompanyId };
}

async function loadBooking(admin: McpAdmin, target: { id: string; reference: string }) {
  let query = admin.from("crm_bookings").select("*");
  query = target.id ? query.eq("id", target.id) : query.eq("reference", target.reference);
  const { data, error } = await query.limit(2);
  if (error) failDb(error, "Dossier introuvable.");
  const rows = (data || []) as CrmBooking[];
  if (!rows.length) throw new McpWriteError("Dossier introuvable.");
  if (rows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return rows[0];
}

export async function creditManualTransfer(input: Record<string, unknown>, admin?: McpAdmin) {
  const credit = prepareManualCredit(input);
  const db = client(admin);
  const { data: customer, error: customerError } = await db
    .from("crm_customers")
    .select("id")
    .eq("id", credit.customer_id)
    .maybeSingle();
  if (customerError) failDb(customerError, "Client introuvable.");
  if (!customer) throw new McpWriteError("Client introuvable.");
  if (credit.booking_id) {
    const { data: booking, error: bookingError } = await db
      .from("crm_bookings")
      .select("id")
      .eq("id", credit.booking_id)
      .maybeSingle();
    if (bookingError) failDb(bookingError, "Dossier introuvable.");
    if (!booking) throw new McpWriteError("Dossier introuvable.");
  }
  const { data, error } = await db
    .from("crm_transactions")
    .insert({
      customer_id: credit.customer_id,
      booking_id: credit.booking_id || null,
      direction: "credit",
      kind: "transfer",
      amount: credit.amount,
      currency: credit.currency,
      occurred_on: credit.occurred_on || undefined,
      label: credit.label || "Virement manuel",
      source: "manual",
      status: "posted",
    })
    .select("id, customer_id, booking_id, amount, currency, label, occurred_on")
    .single();
  if (error || !data) failDb(error, "Crédit impossible.");
  const row = data as {
    id: string;
    customer_id: string;
    booking_id: string | null;
    amount: number;
    currency: string;
    label: string | null;
    occurred_on: string | null;
  };
  return {
    mouvement: {
      id: row.id,
      client_id: row.customer_id,
      dossier_id: row.booking_id,
      montant: row.amount,
      devise: row.currency,
      libelle: row.label,
      date: row.occurred_on,
      source: "manual",
    },
  };
}

export async function creditRevolutTransfer(input: Record<string, unknown>, admin?: McpAdmin) {
  const { virementId, clientId } = prepareRevolutCredit(input);
  const db = client(admin);
  const { data: customer, error: customerError } = await db
    .from("crm_customers")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (customerError) failDb(customerError, "Client introuvable.");
  if (!customer) throw new McpWriteError("Client introuvable.");
  const { data: row, error } = await db
    .from("crm_revolut_transactions")
    .select("*")
    .eq("id", virementId)
    .maybeSingle();
  if (error) failDb(error, "Virement introuvable.");
  if (!row) throw new McpWriteError("Virement introuvable.");
  const movement = row as CrmRevolutTransaction;
  const result = await applyRevolutToCustomer(db, movement, clientId);
  if (!result.ok) {
    if (result.error === "already_matched") throw new McpWriteError("Déjà rapprochée.");
    if (result.error === "account_required") {
      throw new McpWriteError("Choisissez le compte : crédit ou Pro.");
    }
    if (result.error === "not_a_credit") {
      throw new McpWriteError("Le rapprochement ne porte que sur les crédits reçus.");
    }
    console.error("[mcp] revolut");
    throw new McpWriteError("Rapprochement impossible.");
  }
  const posted = result.transaction as { id?: string; amount?: number; currency?: string };
  return {
    mouvement: {
      id: posted.id ?? null,
      client_id: clientId,
      virement_id: virementId,
      montant: posted.amount ?? null,
      devise: posted.currency ?? movement.currency,
      source: "revolut",
    },
  };
}

/**
 * Sortie Revolut → coût du dossier désigné. Le client doit être celui du dossier (voyageur ou payeur).
 * Aucune ligne au grand livre : la sortie devient un coût rattaché au montant du séjour.
 */
export async function matchRevolutExpense(input: Record<string, unknown>, admin?: McpAdmin) {
  const { depenseId, clientId, dossierId } = prepareRevolutExpense(input);
  const db = client(admin);
  const { data: customer, error: customerError } = await db.from("crm_customers").select("id").eq("id", clientId).maybeSingle();
  if (customerError) failDb(customerError, "Client introuvable.");
  if (!customer) throw new McpWriteError(revolutExpenseError("customer_not_found"));
  const { data: row, error } = await db
    .from("crm_revolut_transactions")
    .select("*")
    .eq("id", depenseId)
    .maybeSingle();
  if (error) failDb(error, "Dépense introuvable.");
  if (!row) throw new McpWriteError("Dépense introuvable.");
  const movement = row as CrmRevolutTransaction & { matched_booking_id?: string | null; settled_at?: string | null };
  if (movement.direction !== "debit") throw new McpWriteError(revolutExpenseError("not_a_debit"));
  if (movement.status === "matched" || movement.matched_booking_id) throw new McpWriteError(revolutExpenseError("already_matched"));
  const { data: booking, error: bookingError } = await db
    .from("crm_bookings")
    .select("id, reference, customer_id, billing_customer_id")
    .eq("id", dossierId)
    .maybeSingle();
  if (bookingError) failDb(bookingError, "Dossier introuvable.");
  const stay = booking as { id: string; reference: string; customer_id: string; billing_customer_id: string | null } | null;
  if (!stay) throw new McpWriteError(revolutExpenseError("booking_not_found"));
  if (!bookingBelongsToCustomer(stay, clientId)) throw new McpWriteError(revolutExpenseError("booking_not_for_customer"));
  try {
    await attachOutgoing({ source: "revolut", sourceId: depenseId, bookingId: dossierId, actor: { label: "mcp" } }, db);
  } catch (err) {
    if (err instanceof TripCostError) throw new McpWriteError(err.message);
    throw err;
  }
  return {
    depense: {
      id: depenseId,
      client_id: clientId,
      dossier_id: dossierId,
      reference: stay.reference,
    },
  };
}

export function preparePliantReconcile(input: Record<string, unknown>) {
  return {
    mouvementId: uuid(input.mouvement_id, "Dépense"),
    dossierId: uuid(input.dossier_id, "Dossier"),
  };
}

/** Dépense Pliant → coût de la réservation désignée. Rien n’est écrit au grand livre du client. */
export async function reconcilePliantDebit(input: Record<string, unknown>, admin?: McpAdmin) {
  const { mouvementId, dossierId } = preparePliantReconcile(input);
  const db = client(admin);
  const { data: booking, error: bookingError } = await db
    .from("crm_bookings")
    .select("id, reference")
    .eq("id", dossierId)
    .maybeSingle();
  if (bookingError) failDb(bookingError, "Dossier introuvable.");
  const stay = booking as { id: string; reference: string } | null;
  if (!stay) throw new McpWriteError("Dossier introuvable.");
  let cost: Awaited<ReturnType<typeof attachOutgoing>>;
  try {
    cost = await attachOutgoing({ source: "pliant", sourceId: mouvementId, bookingId: dossierId, actor: { label: "mcp" } }, db);
  } catch (err) {
    if (err instanceof TripCostError) throw new McpWriteError(err.status === 409 ? "Déjà rapprochée." : err.message);
    throw err;
  }
  return {
    mouvement: {
      id: cost.id,
      depense_id: mouvementId,
      dossier_id: dossierId,
      reference: stay.reference,
      montant: cost.amountEur,
      devise: "EUR",
      sens: cost.amountEur < 0 ? "credit" : "debit",
      source: "pliant",
    },
  };
}

export async function creditStripePayment(input: Record<string, unknown>, admin?: McpAdmin) {
  const { paiementId, clientId } = prepareStripeCredit(input);
  const db = client(admin);
  const { data: customer, error: customerError } = await db
    .from("crm_customers")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (customerError) failDb(customerError, "Client introuvable.");
  if (!customer) throw new McpWriteError("Client introuvable.");
  const { data: row, error } = await db
    .from("crm_stripe_transactions")
    .select("*")
    .eq("id", paiementId)
    .maybeSingle();
  if (error) failDb(error, "Paiement introuvable.");
  if (!row) throw new McpWriteError("Paiement introuvable.");
  const movement = row as CrmStripeTransaction;
  const result = await applyStripeToCustomer(db, movement, clientId);
  if (!result.ok) {
    if (result.error === "already_matched") throw new McpWriteError("Déjà rapproché.");
    if (result.error === "not_a_credit") {
      throw new McpWriteError("Le rapprochement ne porte que sur les crédits reçus.");
    }
    if (result.error === "already_credited") {
      throw new McpWriteError("Ce paiement est déjà crédité à un autre client.");
    }
    console.error("[mcp] stripe");
    throw new McpWriteError("Rapprochement impossible.");
  }
  const posted = result.transaction as { id?: string; amount?: number; currency?: string };
  return {
    mouvement: {
      id: posted.id ?? null,
      client_id: clientId,
      paiement_id: paiementId,
      montant: posted.amount ?? null,
      devise: posted.currency ?? movement.currency,
      source: "stripe",
    },
  };
}

export async function publishCarnet(input: Record<string, unknown>, admin?: McpAdmin) {
  const target = prepareCarnetTarget(input);
  const db = client(admin);
  const booking = await loadBooking(db, target);
  const { data: items, error: itemsError } = await db
    .from("crm_booking_items")
    .select("kind, lifecycle")
    .eq("booking_id", booking.id);
  if (itemsError) failDb(itemsError, "Publication impossible.");
  const decision = publishBlock(booking, (items || []) as { kind: string; lifecycle?: string | null }[]);
  if (decision.deja_montre) {
    return { deja_montre: true, id: booking.id, reference: booking.reference };
  }
  try {
    await setCarnetPublished(db, booking.id, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    console.error("[mcp] publier", message || "error");
    throw new McpWriteError(message.startsWith("Ajoutez") ? message : "Publication impossible.");
  }
  const { notifyStayPublished, remindMissingPieces, safeConcierge } = await import("@/lib/crm/concierge-send");
  await safeConcierge(() => notifyStayPublished(booking.id));
  await safeConcierge(() => remindMissingPieces(booking.id));
  try {
    await syncBookingTotalFromItems(db, booking.id);
    const { data: priced, error: pricedError } = await db
      .from("crm_bookings")
      .select("*")
      .eq("id", booking.id)
      .maybeSingle();
    if (pricedError) failDb(pricedError, "Le grand livre n’a pas suivi cette écriture.");
    const next = (priced || { ...booking, visible_to_client: true }) as CrmBooking;
    await syncBookingLedger(db, next, booking.status);
  } catch (err) {
    if (err instanceof McpWriteError) throw err;
    console.error("[mcp] livre", err instanceof Error ? err.message : "error");
    throw new McpWriteError("Le carnet est montré, mais le grand livre n’a pas pu être mis à jour.");
  }
  return { montre: true, id: booking.id, reference: booking.reference };
}

function coverPhotoId(booking: CrmBooking, items: { kind?: string | null; title?: string | null; start_at?: string | null; end_at?: string | null; sort_order?: number | null; details?: Record<string, unknown> | null }[]) {
  const plan = bookingCoverPlan(booking, { items });
  return catalogPhotoFromPlan(plan);
}

export async function updateBooking(input: Record<string, unknown>, admin?: McpAdmin) {
  const { id, reference, patch, billing, cover } = prepareBookingUpdate(input);
  const db = client(admin);
  const prev = await loadBooking(db, { id, reference });
  const nextPatch = { ...patch };
  type StayCoverItem = {
    kind?: string | null;
    title?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    sort_order?: number | null;
    details?: Record<string, unknown> | null;
  };
  let stayItems: StayCoverItem[] | null = null;
  async function readStayItems(strict: boolean) {
    if (stayItems) return stayItems;
    const { data: itemRows, error: itemsError } = await db
      .from("crm_booking_items")
      .select("kind, title, start_at, end_at, sort_order, details, lifecycle")
      .eq("booking_id", prev.id);
    if (itemsError) {
      if (strict) failDb(itemsError, "Couverture non enregistrée.");
      console.error("[mcp] cartes couverture", itemsError.code ?? "?");
      stayItems = [];
      return stayItems;
    }
    stayItems = (itemRows || []) as StayCoverItem[];
    return stayItems;
  }
  if (cover && "image" in cover) {
    try {
      const stored = await materializeProvidedCover({ bookingId: prev.id, image: cover.image });
      nextPatch.cover_image_path = stored.path;
      nextPatch.cover_credit = cover.credit;
    } catch (err) {
      throw new McpWriteError(providedCoverFailure(err));
    }
  }
  if (cover && "photo" in cover) {
    const preview = {
      ...prev,
      ...(typeof nextPatch.title === "string" ? { title: nextPatch.title } : {}),
      cover_image_path: null,
      cover_credit: null,
    } as CrmBooking;
    const photo = coverPhotoId(preview, await readStayItems(true));
    if (photo !== cover.photo) {
      throw new McpWriteError(
        photo
          ? `La couverture de ce séjour est ${photo}. « catalogue » l’affiche.`
          : "Ce séjour n’a pas encore de photo de catalogue."
      );
    }
  }
  if (billing?.particulier) {
    nextPatch.payer_kind = "personal";
    nextPatch.billing_company_id = null;
  } else if (billing?.societeId) {
    const { data: companyRows, error: companyError } = await db
      .from("crm_billing_companies")
      .select("id")
      .eq("id", billing.societeId)
      .eq("customer_id", prev.customer_id);
    if (companyError) failDb(companyError, "Société introuvable.");
    if (!(companyRows || []).length) throw new McpWriteError("Cette société n’est pas sur la fiche du client.");
    nextPatch.payer_kind = "company";
    nextPatch.billing_company_id = billing.societeId;
  }
  const { data, error } = await db
    .from("crm_bookings")
    .update(nextPatch)
    .eq("id", prev.id)
    .select("*")
    .single();
  if (error || !data) failDb(error, "Dossier non enregistré.");
  const booking = data as CrmBooking;
  try {
    await syncBookingTotalFromItems(db, booking.id);
    const { data: priced } = await db.from("crm_bookings").select("*").eq("id", booking.id).maybeSingle();
    await syncBookingLedger(db, (priced || booking) as CrmBooking, prev.status as BookingStatus);
  } catch (err) {
    console.error("[mcp] livre", err instanceof Error ? err.message : "error");
    throw new McpWriteError("Le dossier est enregistré, mais le grand livre n’a pas pu être mis à jour.");
  }
  const saved = (await db.from("crm_bookings").select("id, reference, title, destination, status, visible_to_client, archived_at, start_date, end_date, notes_client, notes_internal, payer_kind, billing_company_id, cover_image_path, cover_credit").eq("id", booking.id).maybeSingle()).data as
    | Pick<
        CrmBooking,
        | "id"
        | "reference"
        | "title"
        | "destination"
        | "status"
        | "visible_to_client"
        | "archived_at"
        | "start_date"
        | "end_date"
        | "notes_client"
        | "notes_internal"
        | "payer_kind"
        | "billing_company_id"
        | "cover_image_path"
        | "cover_credit"
      >
    | null;
  const row = saved || booking;
  let societe: string | null = null;
  if (row.billing_company_id) {
    const { data: company } = await db
      .from("crm_billing_companies")
      .select("company_name")
      .eq("id", row.billing_company_id)
      .maybeSingle();
    societe = (company as { company_name?: string | null } | null)?.company_name || null;
  }
  const factureSociete = row.payer_kind === "company" || Boolean(row.billing_company_id);
  let commission_agence = "10 %";
  let commission_source: "dossier" | "compte" | "defaut" = "defaut";
  try {
    const fee = await agencyFeeForBooking(db, booking);
    commission_agence = formatAgencyFeePercent(fee.rate);
    commission_source = fee.source;
  } catch (err) {
    console.error("[mcp] commission", err instanceof Error ? err.message : "error");
  }
  const titleChanged = (prev.title || "") !== (row.title || "");
  const imageCover = Boolean(cover && "image" in cover);
  const coverChanged =
    imageCover || (Boolean(cover) && (prev.cover_image_path || "") !== (row.cover_image_path || ""));
  const coverItems = await readStayItems(false);
  if (titleChanged || coverChanged) {
    const photo = coverPhotoId(row as CrmBooking, coverItems);
    const { error: auditError } = await db.from("crm_audit_events").insert(
      toAuditRow({
        actorKind: "auto",
        action: "titre_couverture",
        bookingId: row.id,
        customerId: booking.customer_id,
        summary: "Titre ou couverture du dossier",
        detail: {
          reference: row.reference,
          ...(titleChanged ? { titre_avant: prev.title, titre_apres: row.title } : {}),
          ...(coverChanged
            ? imageCover
              ? { couverture: "image", credit: cover && "image" in cover ? cover.credit : null }
              : { couverture: photo, import_retire: true }
            : {}),
        },
      })
    );
    if (auditError) console.error("[mcp] journal titre", auditError.code ?? "?");
  }
  const shownPhoto = coverPhotoId(row as CrmBooking, coverItems);
  return {
    id: row.id,
    reference: row.reference,
    titre: row.title,
    couverture: row.cover_image_path ? null : shownPhoto,
    credit: row.cover_credit,
    statut: staffStayLabel(row),
    date_depart: row.start_date,
    date_retour: row.end_date,
    notes_client: row.notes_client,
    notes_internes: row.notes_internal,
    commission_agence,
    commission_source,
    paye_par: factureSociete ? ("société" as const) : ("particulier" as const),
    societe: factureSociete ? societe : null,
    societe_id: factureSociete ? row.billing_company_id || null : null,
  };
}

export async function confirmService(input: Record<string, unknown>, admin?: McpAdmin) {
  const { dossierId, carteId } = prepareServiceConfirm(input);
  const db = client(admin);
  const booking = await loadBooking(db, { id: dossierId, reference: "" });
  const { data: itemRows, error: itemsError } = await db
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", booking.id);
  if (itemsError) failDb(itemsError, "Service introuvable.");
  const items = (itemRows || []) as CrmBookingItem[];
  const target = items.find((item) => item.id === carteId);
  if (!target) throw new McpWriteError("Service introuvable.");
  const { confirmBookingExtra, confirmCheckinExtra } = await import("@/lib/crm/extras-write");
  try {
    if (target.kind === "checkin") {
      await confirmCheckinExtra(db, { booking, items });
    } else if (target.kind === "chauffeur" || target.kind === "greeter") {
      const { data: holder } = await db.from("crm_customers").select("*").eq("id", booking.customer_id).maybeSingle();
      await confirmBookingExtra(db, {
        booking,
        items,
        kind: target.kind,
        leg: extraServiceLeg(target),
        place: extraPlaceOf(target),
        moment: extraMomentOf(target),
        holder: (holder as CrmCustomer | null) || null,
      });
    } else {
      throw new McpWriteError("Seuls le chauffeur, VIP Airport et l’enregistrement se confirment.");
    }
  } catch (err) {
    if (err instanceof McpWriteError) throw err;
    if (err instanceof BookingIssuesError) {
      throw new McpWriteError(err.issues.map((issue) => issue.message).filter(Boolean).join(" ") || err.message);
    }
    console.error("[mcp] service", err instanceof Error ? err.message : "error");
    throw new McpWriteError("Confirmation impossible.");
  }
  return { confirme: true, dossier_id: booking.id, carte_id: carteId };
}

export async function settleEmail(input: Record<string, unknown>, admin?: McpAdmin) {
  const action = prepareEmailAction(input);
  if (action.action === "creer_dossier") {
    const { createDossierFromEmail } = await import("@/lib/crm/mcp-email");
    return createDossierFromEmail(input, admin);
  }
  const db = client(admin);
  const { data, error } = await db.from("crm_email_ingest").select("*").eq("id", action.id).maybeSingle();
  if (error) failDb(error, "E-mail introuvable.");
  const row = data as CrmEmailIngest | null;
  if (!row) throw new McpWriteError("E-mail introuvable.");
  if (!(EMAIL_INBOX_QUEUE_STATUSES as readonly string[]).includes(row.status)) {
    throw new McpWriteError("Cet e-mail est déjà traité.");
  }
  if (action.action === "refuser") {
    const { error: updateError } = await db.from("crm_email_ingest").update({ status: "refused" }).eq("id", row.id);
    if (updateError) failDb(updateError, "E-mail non traité.");
    return { id: row.id, statut: "refused" as const };
  }
  const booking = await loadBooking(db, { id: action.dossierId, reference: "" });
  const { depositEmailAttachments, markEmailAttached, attachFilesSummary, resolveEmailCardId } = await import(
    "@/lib/crm/email-attach-run"
  );
  const { parseExtractPayloadSafe } = await import("@/lib/crm/ingest-types");
  const extract = row.extract ? parseExtractPayloadSafe(row.extract) : null;
  let cardId: string | null = null;
  try {
    cardId = await resolveEmailCardId(db, booking.id, extract);
  } catch (err) {
    raise(err, "E-mail non traité.");
  }
  if (action.action === "rattacher" || action.action === "mettre_a_jour") {
    let deposited;
    try {
      deposited = await depositEmailAttachments(db, booking.id, row.id, row.attachments, cardId);
    } catch (err) {
      raise(err, "E-mail non traité.");
    }
    const message = attachFilesSummary(deposited, Boolean(cardId));
    try {
      await markEmailAttached(db, row, {
        bookingId: booking.id,
        customerId: booking.customer_id,
        actorId: null,
        summary: message,
        cards: false,
      });
    } catch (err) {
      raise(err, "E-mail non traité.");
    }
    return {
      id: row.id,
      statut: "attached" as const,
      dossier_id: booking.id,
      pieces: deposited.added,
      sans_piece: deposited.empty,
      carte_id: cardId,
      cartes: false as const,
    };
  }
  throw new McpWriteError("Action inconnue.");
}

export async function createClient(input: Record<string, unknown>, admin?: McpAdmin) {
  const draft = prepareClientCreate(input);
  const db = client(admin);
  const { data, error } = await db
    .from("crm_customers")
    .insert({
      email: draft.email,
      first_name: draft.firstName,
      last_name: draft.lastName,
      phone: draft.phone,
      language: "fr",
    })
    .select("id, first_name, last_name, email")
    .single();
  if (error || !data) {
    if (error?.code === "23505") throw new McpWriteError(CUSTOMER_EMAIL_COPY.taken);
    failDb(error, "Client non créé.");
  }
  const row = data as Pick<CrmCustomer, "id" | "first_name" | "last_name" | "email">;
  const company = clientBillingInput(input);
  let saved: { id: string; company_name: string | null; siret: string | null; vat_number: string | null } | null = null;
  if (company) {
    const result = await upsertBillingCompany(db, row.id, company);
    if ("error" in result) throw new McpWriteError(result.error);
    saved = result.company;
  }
  return {
    id: row.id,
    nom: customerFullName(row),
    email: row.email,
    invite: false,
    societe: saved?.company_name ?? null,
    societe_id: saved?.id ?? null,
    siret: saved?.siret ?? null,
    tva: saved?.vat_number ?? null,
  };
}

export async function updateClient(input: Record<string, unknown>, admin?: McpAdmin) {
  const { id, patch, company, removeCompanyId } = prepareClientUpdate(input);
  const db = client(admin);
  const { data: current, error: currentError } = await db
    .from("crm_customers")
    .select("id, email, auth_user_id, first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  if (currentError) failDb(currentError, "Client introuvable.");
  if (!current) throw new McpWriteError("Client introuvable.");
  const holder = current as Pick<CrmCustomer, "id" | "email" | "auth_user_id" | "first_name" | "last_name">;
  if ("email" in patch) {
    const email = String(patch.email || "");
    const { data: matches, error: matchError } = await db.from("crm_customers").select("id").eq("email", email);
    if (matchError) failDb(matchError, "Client non enregistré.");
    const taken = otherCustomerEmailBlock({
      customerId: id,
      matches: (matches || []) as { id: string }[],
    });
    if (taken) throw new McpWriteError(taken);
    if (holder.auth_user_id && holder.email !== email) {
      const { error: authError } = await db.auth.admin.updateUserById(holder.auth_user_id, {
        email,
        email_confirm: true,
      });
      if (authError) {
        const message = /already|exists|registered|duplicate/i.test(authError.message || "")
          ? CUSTOMER_EMAIL_COPY.taken
          : CUSTOMER_EMAIL_COPY.auth;
        throw new McpWriteError(message);
      }
    }
  }
  let row = holder as Pick<CrmCustomer, "id" | "first_name" | "last_name" | "email"> & {
    phone?: string | null;
    company_name?: string | null;
  };
  if (Object.keys(patch).length) {
    const { data, error } = await db
      .from("crm_customers")
      .update(patch)
      .eq("id", id)
      .select("id, first_name, last_name, email, phone, company_name")
      .single();
    if (error || !data) failDb(error, "Client non enregistré.");
    row = data as typeof row;
  }
  let saved: { id: string; company_name: string | null; siret: string | null; vat_number: string | null } | null = null;
  if (company) {
    const result = await upsertBillingCompany(db, id, company);
    if ("error" in result) throw new McpWriteError(result.error);
    saved = result.company;
  }
  let societeRetiree = false;
  if (removeCompanyId) {
    const removed = await deleteEmptyBillingCompany(db, id, removeCompanyId);
    if ("error" in removed) throw new McpWriteError(removed.error);
    societeRetiree = true;
    const refreshed = await db.from("crm_customers").select("company_name").eq("id", id).maybeSingle();
    if (!refreshed.error && refreshed.data) {
      row = { ...row, company_name: (refreshed.data as { company_name?: string | null }).company_name ?? null };
    }
  }
  if ("agency_fee_rate" in patch) {
    try {
      await syncInheritedAgencyFees(db, id);
    } catch (err) {
      console.error("[mcp] commission", err instanceof Error ? err.message : "error");
    }
  }
  const rateRead = await db.from("crm_customers").select("agency_fee_rate").eq("id", id).maybeSingle();
  const storedRate = rateRead.error
    ? "agency_fee_rate" in patch
      ? patch.agency_fee_rate
      : null
    : rateRead.data?.agency_fee_rate;
  const commission_agence = formatAgencyFeePercent(typeof storedRate === "number" ? storedRate : Number(storedRate));
  return {
    id: row.id,
    nom: customerFullName(row),
    email: row.email,
    telephone: row.phone ?? null,
    societe: saved?.company_name ?? row.company_name ?? null,
    societe_id: saved?.id ?? null,
    siret: saved?.siret ?? null,
    tva: saved?.vat_number ?? null,
    societe_retiree: societeRetiree,
    commission_agence,
  };
}
