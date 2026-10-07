import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { createTransactionSchema, isIsoDate, parseBody } from "@/lib/crm/admin-schemas";
import { BookingIssuesError, collectPublishIssues } from "@/lib/crm/booking-issues";
import {
  bookingMetaPatch,
  setCarnetPublished,
  syncBookingLedger,
  syncBookingTotalFromItems,
} from "@/lib/crm/bookings";
import { customerEmailError, normalizeCustomerEmail, otherCustomerEmailBlock, CUSTOMER_EMAIL_COPY } from "@/lib/crm/customer-email";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import { extraMomentOf, extraPlaceOf, extraServiceLeg } from "@/lib/crm/extras";
import { applyRevolutToCustomer } from "@/lib/crm/revolut-match";
import { applyStripeToCustomer } from "@/lib/crm/stripe-match";
import {
  BOOKING_STATUSES,
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
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_FOLDED: Record<string, BookingStatus> = {
  draft: "draft",
  quoted: "quoted",
  confirmed: "confirmed",
  travelling: "travelling",
  completed: "completed",
  cancelled: "cancelled",
  "a l'etude": "draft",
  devis: "quoted",
  confirmee: "confirmed",
  "en voyage": "travelling",
  terminee: "completed",
  annulee: "cancelled",
};

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

function fold(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
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
  if ("statut" in input && input.statut != null && String(input.statut).trim()) {
    const status = STATUS_FOLDED[fold(String(input.statut))];
    if (!status || !(BOOKING_STATUSES as readonly string[]).includes(status)) {
      throw new McpWriteError("Statut de dossier inconnu.");
    }
    body.status = status;
  }
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
  const patch = bookingMetaPatch(body);
  if (!Object.keys(patch).length) throw new McpWriteError("Rien à modifier.");
  return { ...target, patch };
}

export function prepareServiceConfirm(input: Record<string, unknown>) {
  return {
    dossierId: uuid(input.dossier_id, "Dossier"),
    carteId: uuid(input.carte_id, "Carte"),
  };
}

export function prepareEmailAction(input: Record<string, unknown>) {
  const action = input.action === "rattacher" || input.action === "refuser" ? input.action : "";
  if (!action) throw new McpWriteError("Action inconnue.");
  const id = uuid(input.id, "E-mail");
  const dossierId = action === "rattacher" ? uuid(input.dossier_id, "Dossier") : "";
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

export function prepareClientUpdate(input: Record<string, unknown>) {
  const id = uuid(input.id, "Client");
  const body: Record<string, unknown> = {};
  for (const [from, key] of Object.entries(CLIENT_FIELDS)) {
    if (from in input) body[key] = input[from];
  }
  const { patch, error } = customerPatchFromBody(body, { allowEmail: true });
  if (error) throw new McpWriteError(error);
  if (!Object.keys(patch).length) throw new McpWriteError("Rien à modifier.");
  return { id, patch };
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

export async function updateBooking(input: Record<string, unknown>, admin?: McpAdmin) {
  const { id, reference, patch } = prepareBookingUpdate(input);
  const db = client(admin);
  const prev = await loadBooking(db, { id, reference });
  const { data, error } = await db
    .from("crm_bookings")
    .update(patch)
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
  const saved = (await db.from("crm_bookings").select("id, reference, status, start_date, end_date, notes_client, notes_internal").eq("id", booking.id).maybeSingle()).data as
    | Pick<CrmBooking, "id" | "reference" | "status" | "start_date" | "end_date" | "notes_client" | "notes_internal">
    | null;
  const row = saved || booking;
  return {
    id: row.id,
    reference: row.reference,
    statut: row.status,
    date_depart: row.start_date,
    date_retour: row.end_date,
    notes_client: row.notes_client,
    notes_internes: row.notes_internal,
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
  if (!row.extract) throw new McpWriteError("Extrait introuvable.");
  const booking = await loadBooking(db, { id: action.dossierId, reference: "" });
  const { parseExtractPayloadSafe, isCancellationExtract } = await import("@/lib/crm/ingest-types");
  const { loadEmailIngestFiles } = await import("@/lib/crm/email-ingest");
  const { applyCancellationToBooking, applyReplacementToBooking } = await import("@/lib/crm/ingest-booking");
  const extract = parseExtractPayloadSafe(row.extract);
  const files = await loadEmailIngestFiles(row);
  try {
    if (isCancellationExtract(extract)) {
      await applyCancellationToBooking({
        bookingId: booking.id,
        customerId: booking.customer_id,
        extract,
        files,
        visibleToClient: false,
        itemId: null,
      });
    } else {
      await applyReplacementToBooking({
        bookingId: booking.id,
        customerId: booking.customer_id,
        extract,
        files,
        visibleToClient: false,
        applyStayFields: false,
        emailIngestId: row.id,
        replaceItemId: null,
      });
    }
  } catch (err) {
    raise(err, "E-mail non traité.");
  }
  const { error: attachedError } = await db
    .from("crm_email_ingest")
    .update({ status: "attached", created_booking_id: booking.id })
    .eq("id", row.id);
  if (attachedError) failDb(attachedError, "E-mail non traité.");
  return { id: row.id, statut: "attached" as const, dossier_id: booking.id };
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
  return {
    id: row.id,
    nom: customerFullName(row),
    email: row.email,
    invite: false,
  };
}

export async function updateClient(input: Record<string, unknown>, admin?: McpAdmin) {
  const { id, patch } = prepareClientUpdate(input);
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
  const { data, error } = await db
    .from("crm_customers")
    .update(patch)
    .eq("id", id)
    .select("id, first_name, last_name, email, phone, company_name")
    .single();
  if (error || !data) failDb(error, "Client non enregistré.");
  const row = data as Pick<CrmCustomer, "id" | "first_name" | "last_name" | "email" | "phone" | "company_name">;
  return {
    id: row.id,
    nom: customerFullName(row),
    email: row.email,
    telephone: row.phone,
    societe: row.company_name,
  };
}
