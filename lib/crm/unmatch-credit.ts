/**
 * Remet un crédit client (Revolut, Stripe, virement saisi) en non rattaché.
 * La ligne du grand livre passe en annulée et garde le paiement d’origine
 * (`external_id` suffixé) : le solde ne la compte plus, la trace reste.
 * Le paiement revient dans la file. Une facture MB3M imprimée ou en préparation bloque.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { eurosToAlertCents } from "@/lib/crm/agency-access";
import { customerFullName } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { currentMcpAccess } from "@/lib/crm/mcp-auth";

export const CREDIT_RELEASE_MARK = "#annule#";
const PREPARING_MS = 3 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RELEASE_SOURCES = new Set(["revolut", "stripe", "manual"]);
const RELEASE_KINDS = new Set(["transfer", "card_payment"]);

type Row = Record<string, unknown>;

// Le client Supabase et le faux des tests exposent les mêmes filtres.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnmatchAdmin = { from: (table: string) => any };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnmatchQuery = any;

export type CreditInvoicePiece = {
  piece_number?: string | null;
  printed_at?: string | null;
  credited_at?: string | null;
  transaction_ids?: string[] | null;
  attempt_status?: string | null;
  attempt_started_at?: string | null;
};

export type CreditAccountInvoice = {
  id: string;
  piece_number?: string | null;
  printed_at?: string | null;
};

export function isReleasableCredit(row: {
  direction?: string | null;
  kind?: string | null;
  source?: string | null;
  status?: string | null;
}) {
  return (
    row.direction === "credit" &&
    row.status === "posted" &&
    RELEASE_KINDS.has(row.kind || "") &&
    RELEASE_SOURCES.has(row.source || "")
  );
}

export function releasedExternalId(externalId: string, transactionId: string) {
  if (externalId.includes(CREDIT_RELEASE_MARK)) return externalId;
  return `${externalId}${CREDIT_RELEASE_MARK}${transactionId}`;
}

export function originalPaymentId(externalId: string | null | undefined) {
  if (!externalId) return null;
  const at = externalId.indexOf(CREDIT_RELEASE_MARK);
  return at === -1 ? externalId : externalId.slice(0, at);
}

/** Borne texte : le suffixe `#annule#…` est entre `#annule#` et `#annule$`. */
export function releaseExternalBounds(paymentId: string) {
  return { from: `${paymentId}${CREDIT_RELEASE_MARK}`, to: `${paymentId}#annule$` };
}

export function externalIdReleasesPayment(stored: string | null | undefined, paymentId: string) {
  if (!stored || !paymentId) return false;
  const bounds = releaseExternalBounds(paymentId);
  return stored >= bounds.from && stored < bounds.to;
}

export function creditInvoiceLock(
  input: {
    pieces: readonly CreditInvoicePiece[];
    accountInvoices: readonly CreditAccountInvoice[];
    transactionId: string;
  },
  now = Date.now()
) {
  for (const piece of input.pieces) {
    const ids = piece.transaction_ids || [];
    if (!ids.includes(input.transactionId)) continue;
    if (piece.printed_at && !piece.credited_at) {
      const number = (piece.piece_number || "").trim();
      return number
        ? `Ce crédit figure sur la facture MB3M n° ${number}, déjà imprimée. Il reste rattaché.`
        : "Ce crédit figure sur une facture MB3M déjà imprimée. Il reste rattaché.";
    }
    if (preparingLocks(piece, now)) {
      return "Ce crédit est sur une facture MB3M en cours de préparation. Il reste rattaché.";
    }
  }
  for (const invoice of input.accountInvoices) {
    if (!invoice.printed_at) continue;
    const number = (invoice.piece_number || "").trim();
    return number
      ? `Ce crédit figure sur la facture MB3M n° ${number}, déjà imprimée. Il reste rattaché.`
      : "Ce crédit figure sur une facture MB3M déjà imprimée. Il reste rattaché.";
  }
  return null;
}

function preparingLocks(piece: CreditInvoicePiece, now: number) {
  if (piece.attempt_status !== "preparing" || piece.printed_at || piece.credited_at) return false;
  if (!piece.attempt_started_at) return true;
  const started = Date.parse(piece.attempt_started_at);
  if (!Number.isFinite(started)) return true;
  const age = now - started;
  return age >= 0 && age < PREPARING_MS;
}

export type ClientCreditLine = {
  id: string;
  montant: string;
  montant_valeur: number;
  devise: string;
  source: string;
  libelle: string | null;
  date: string | null;
  paiement_id: string | null;
};

export function clientCreditLines(
  rows: readonly {
    id: string;
    amount: number | string;
    currency?: string | null;
    source?: string | null;
    kind?: string | null;
    label?: string | null;
    occurred_on?: string | null;
    external_id?: string | null;
    status?: string | null;
    direction?: string | null;
  }[]
): ClientCreditLine[] {
  return rows.filter(isReleasableCredit).map((row) => {
    const currency = row.currency || "EUR";
    const amount = Number(row.amount);
    return {
      id: row.id,
      montant: formatMoney(amount, currency),
      montant_valeur: amount,
      devise: currency,
      source: row.source || "manual",
      libelle: row.label || null,
      date: row.occurred_on ? formatDateFr(row.occurred_on) : null,
      paiement_id: originalPaymentId(row.external_id),
    };
  });
}

type CreditRow = {
  id: string;
  customer_id: string;
  direction: string;
  kind: string;
  source: string;
  status: string;
  amount: number | string;
  currency: string;
  external_id: string | null;
  label: string | null;
};

type InboxRow = {
  table: "crm_revolut_transactions" | "crm_stripe_transactions";
  id: string;
  status: string;
  direction: string | null;
  matched_transaction_id: string | null;
  matched_customer_id: string | null;
};

export type UnmatchActor = { staffId: string | null; label: string };

export type UnmatchJournalEntry = {
  staffId: string | null;
  summary: string;
  entityId: string;
  amountCents: number | null;
  diff: Record<string, unknown>;
  path: string;
};

export type UnmatchOk = {
  ok: true;
  mouvement_id: string;
  client_id: string;
  client: string;
  montant: number;
  devise: string;
  source: string;
  paiement_id: string | null;
  file: "revolut_en_attente" | "stripe_en_attente" | null;
  motif: string | null;
  deja: boolean;
};

export type UnmatchResult = UnmatchOk | { ok: false; error: string };

const NOT_A_CREDIT = "Seuls les crédits Revolut, Stripe ou un virement saisi peuvent revenir en non rattaché.";
const LOCK_UNKNOWN = "La facture n’a pas pu être vérifiée. Le crédit reste rattaché.";
const ALREADY = "Ce crédit est déjà annulé.";
const NOT_ATTACHED = "Ce paiement n’est pas rattaché à un client.";
const NOT_CREDIT_PAYMENT = "Le rapprochement inverse ne porte que sur les crédits reçus.";

function asCredit(row: Row | null): CreditRow | null {
  if (!row || typeof row.id !== "string" || typeof row.customer_id !== "string") return null;
  return {
    id: row.id,
    customer_id: row.customer_id,
    direction: String(row.direction || ""),
    kind: String(row.kind || ""),
    source: String(row.source || ""),
    status: String(row.status || ""),
    amount: (row.amount as number | string) ?? 0,
    currency: String(row.currency || "EUR"),
    external_id: row.external_id == null ? null : String(row.external_id),
    label: row.label == null ? null : String(row.label),
  };
}

function asInbox(
  table: InboxRow["table"],
  row: Row | null
): InboxRow | null {
  if (!row || typeof row.id !== "string") return null;
  return {
    table,
    id: row.id,
    status: String(row.status || ""),
    direction: row.direction == null ? null : String(row.direction),
    matched_transaction_id: row.matched_transaction_id == null ? null : String(row.matched_transaction_id),
    matched_customer_id: row.matched_customer_id == null ? null : String(row.matched_customer_id),
  };
}

async function one(admin: UnmatchAdmin, table: string, column: string, value: string) {
  const { data, error } = await admin.from(table).select("*").eq(column, value).maybeSingle();
  if (error) {
    console.error("[unmatch]", error.code ?? "?");
    return { error: true as const, row: null };
  }
  return { error: false as const, row: (data as Row | null) || null };
}

async function many(query: UnmatchQuery) {
  const { data, error } = await query;
  if (error) {
    console.error("[unmatch]", error.code ?? "?");
    return { error: true as const, rows: [] as Row[] };
  }
  return { error: false as const, rows: (Array.isArray(data) ? data : []) as Row[] };
}

function fileOf(inbox: InboxRow | null): UnmatchOk["file"] {
  if (!inbox) return null;
  return inbox.table === "crm_revolut_transactions" ? "revolut_en_attente" : "stripe_en_attente";
}

function inboxBelongs(inbox: InboxRow, credit: CreditRow) {
  if (inbox.direction === "debit") return false;
  if (inbox.matched_transaction_id) return inbox.matched_transaction_id === credit.id;
  return inbox.matched_customer_id === credit.customer_id;
}

async function findInbox(admin: UnmatchAdmin, credit: CreditRow): Promise<InboxRow | null | "error"> {
  const revolutByTx = await one(admin, "crm_revolut_transactions", "matched_transaction_id", credit.id);
  if (revolutByTx.error) return "error";
  const revolutHit = asInbox("crm_revolut_transactions", revolutByTx.row);
  if (revolutHit && inboxBelongs(revolutHit, credit)) return revolutHit;
  const stripeByTx = await one(admin, "crm_stripe_transactions", "matched_transaction_id", credit.id);
  if (stripeByTx.error) return "error";
  const stripeHit = asInbox("crm_stripe_transactions", stripeByTx.row);
  if (stripeHit && inboxBelongs(stripeHit, credit)) return stripeHit;
  const paymentId = originalPaymentId(credit.external_id);
  if (credit.source === "revolut" && paymentId) {
    const byExternal = await one(admin, "crm_revolut_transactions", "revolut_transaction_id", paymentId);
    if (byExternal.error) return "error";
    const hit = asInbox("crm_revolut_transactions", byExternal.row);
    if (hit && inboxBelongs(hit, credit)) return hit;
  }
  if (credit.source === "stripe" && paymentId) {
    const byExternal = await one(admin, "crm_stripe_transactions", "stripe_payment_intent_id", paymentId);
    if (byExternal.error) return "error";
    const hit = asInbox("crm_stripe_transactions", byExternal.row);
    if (hit && inboxBelongs(hit, credit)) return hit;
  }
  return null;
}

async function loadCredit(admin: UnmatchAdmin, id: string): Promise<{ credit: CreditRow; inbox: InboxRow | null } | { error: string }> {
  if (UUID.test(id)) {
    const direct = await one(admin, "crm_transactions", "id", id);
    if (direct.error) return { error: "Annulation impossible." };
    const credit = asCredit(direct.row);
    if (credit) {
      const inbox = await findInbox(admin, credit);
      if (inbox === "error") return { error: "Annulation impossible." };
      return { credit, inbox };
    }
    const revolut = await one(admin, "crm_revolut_transactions", "id", id);
    if (revolut.error) return { error: "Annulation impossible." };
    if (revolut.row) return creditFromInbox(admin, "crm_revolut_transactions", revolut.row);
    const stripe = await one(admin, "crm_stripe_transactions", "id", id);
    if (stripe.error) return { error: "Annulation impossible." };
    if (stripe.row) return creditFromInbox(admin, "crm_stripe_transactions", stripe.row);
  }
  const revolutExternal = await one(admin, "crm_revolut_transactions", "revolut_transaction_id", id);
  if (revolutExternal.error) return { error: "Annulation impossible." };
  if (revolutExternal.row) return creditFromInbox(admin, "crm_revolut_transactions", revolutExternal.row);
  const stripeExternal = await one(admin, "crm_stripe_transactions", "stripe_payment_intent_id", id);
  if (stripeExternal.error) return { error: "Annulation impossible." };
  if (stripeExternal.row) return creditFromInbox(admin, "crm_stripe_transactions", stripeExternal.row);
  return { error: "Crédit introuvable." };
}

async function creditFromInbox(
  admin: UnmatchAdmin,
  table: InboxRow["table"],
  row: Row
): Promise<{ credit: CreditRow; inbox: InboxRow | null } | { error: string }> {
  const inbox = asInbox(table, row);
  if (!inbox) return { error: "Crédit introuvable." };
  if (inbox.direction === "debit") return { error: NOT_CREDIT_PAYMENT };
  if (inbox.status !== "matched" || !inbox.matched_transaction_id) return { error: NOT_ATTACHED };
  const loaded = await one(admin, "crm_transactions", "id", inbox.matched_transaction_id);
  if (loaded.error) return { error: "Annulation impossible." };
  const credit = asCredit(loaded.row);
  if (!credit) return { error: "Crédit introuvable." };
  return { credit, inbox };
}

async function invoiceLockFor(admin: UnmatchAdmin, transactionId: string, now: number) {
  const pieces = await many(
    admin
      .from("crm_mb3m_pieces")
      .select("piece_number, printed_at, credited_at, transaction_ids, attempt_status, attempt_started_at")
      .overlaps("transaction_ids", [transactionId])
  );
  if (pieces.error) return LOCK_UNKNOWN;
  const lines = await many(
    admin.from("crm_mb3m_account_lines").select("invoice_id").eq("transaction_id", transactionId)
  );
  if (lines.error) return LOCK_UNKNOWN;
  const invoiceIds = [...new Set(lines.rows.map((row) => String(row.invoice_id || "")).filter(Boolean))];
  let accountInvoices: CreditAccountInvoice[] = [];
  if (invoiceIds.length) {
    const invoices = await many(
      admin
        .from("crm_mb3m_account_invoices")
        .select("id, piece_number, printed_at")
        .in("id", invoiceIds)
    );
    if (invoices.error) return LOCK_UNKNOWN;
    accountInvoices = invoices.rows.flatMap((row) =>
      typeof row.id === "string" ? [{ id: row.id, piece_number: row.piece_number as string | null, printed_at: row.printed_at as string | null }] : []
    );
  }
  return creditInvoiceLock(
    {
      pieces: pieces.rows as CreditInvoicePiece[],
      accountInvoices,
      transactionId,
    },
    now
  );
}

async function releaseInbox(admin: UnmatchAdmin, inbox: InboxRow) {
  const { error } = await admin
    .from(inbox.table)
    .update({
      status: "unmatched",
      matched_customer_id: null,
      matched_transaction_id: null,
    })
    .eq("id", inbox.id);
  if (error) {
    console.error("[unmatch]", error.code ?? "?");
    return false;
  }
  return true;
}

async function customerName(admin: UnmatchAdmin, customerId: string) {
  const loaded = await one(admin, "crm_customers", "id", customerId);
  if (loaded.error || !loaded.row) return "Client";
  const row = loaded.row;
  return customerFullName({
    first_name: String(row.first_name || ""),
    last_name: String(row.last_name || ""),
  });
}

function okResult(credit: CreditRow, inbox: InboxRow | null, name: string, motif: string, deja: boolean): UnmatchOk {
  const amount = Number(credit.amount);
  return {
    ok: true,
    mouvement_id: credit.id,
    client_id: credit.customer_id,
    client: name,
    montant: Number.isFinite(amount) ? amount : 0,
    devise: credit.currency || "EUR",
    source: credit.source,
    paiement_id: originalPaymentId(credit.external_id),
    file: fileOf(inbox),
    motif: motif || null,
    deja,
  };
}

async function defaultJournal(entry: UnmatchJournalEntry) {
  const { recordAgencyJournal } = await import("@/lib/crm/agency-log");
  await recordAgencyJournal({
    staffId: entry.staffId,
    action: "update",
    entityType: "finance",
    entityId: entry.entityId,
    summary: entry.summary,
    diff: entry.diff,
    amountCents: entry.amountCents,
    sensitive: "payment",
    path: entry.path,
  });
}

export async function unmatchClientCredit(
  admin: UnmatchAdmin,
  input: { id: string; motif?: string | null },
  deps?: {
    actor?: UnmatchActor;
    journal?: (entry: UnmatchJournalEntry) => Promise<void>;
    now?: number;
    path?: string;
  }
): Promise<UnmatchResult> {
  const id = input.id.trim();
  if (!id || id.length > 80) return { ok: false, error: "Indiquez le crédit ou le paiement." };
  const motif = (input.motif || "").trim().slice(0, 300);
  const found = await loadCredit(admin, id);
  if ("error" in found) return { ok: false, error: found.error };
  const { credit } = found;
  let inbox = found.inbox;

  if (credit.status === "void") {
    if (inbox && inbox.status === "matched" && inboxBelongs(inbox, credit)) {
      const released = await releaseInbox(admin, inbox);
      if (!released) return { ok: false, error: "Le crédit est annulé, mais le paiement n’est pas revenu dans la file. Réessayez." };
      inbox = { ...inbox, status: "unmatched", matched_customer_id: null, matched_transaction_id: null };
      const name = await customerName(admin, credit.customer_id);
      return okResult(credit, inbox, name, motif, true);
    }
    return { ok: false, error: ALREADY };
  }

  if (!isReleasableCredit(credit)) return { ok: false, error: NOT_A_CREDIT };

  const lock = await invoiceLockFor(admin, credit.id, deps?.now ?? Date.now());
  if (lock) return { ok: false, error: lock };

  const nextExternal = credit.external_id ? releasedExternalId(credit.external_id, credit.id) : null;
  const { data: voided, error: voidError } = await admin
    .from("crm_transactions")
    .update({
      status: "void",
      external_id: nextExternal,
      updated_at: new Date(deps?.now ?? Date.now()).toISOString(),
    })
    .eq("id", credit.id)
    .eq("status", "posted")
    .select("id")
    .maybeSingle();
  if (voidError) {
    console.error("[unmatch]", voidError.code ?? "?");
    return { ok: false, error: "Annulation impossible." };
  }
  if (!voided) {
    const again = await one(admin, "crm_transactions", "id", credit.id);
    const fresh = asCredit(again.row);
    if (fresh?.status === "void") {
      if (inbox && inbox.status === "matched" && inboxBelongs(inbox, fresh)) {
        const released = await releaseInbox(admin, inbox);
        if (!released) {
          return { ok: false, error: "Le crédit est annulé, mais le paiement n’est pas revenu dans la file. Réessayez." };
        }
      }
      const name = await customerName(admin, fresh.customer_id);
      return okResult(fresh, inbox && inboxBelongs(inbox, fresh) ? { ...inbox, status: "unmatched" } : inbox, name, motif, true);
    }
    return { ok: false, error: "Annulation impossible." };
  }

  if (inbox && inboxBelongs(inbox, credit) && inbox.status !== "unmatched") {
    const released = await releaseInbox(admin, inbox);
    if (!released) {
      return { ok: false, error: "Le crédit est annulé, mais le paiement n’est pas revenu dans la file. Réessayez." };
    }
    inbox = { ...inbox, status: "unmatched", matched_customer_id: null, matched_transaction_id: null };
  }

  const name = await customerName(admin, credit.customer_id);
  const result = okResult({ ...credit, external_id: nextExternal, status: "void" }, inbox, name, motif, false);
  const actor = deps?.actor ?? { staffId: null, label: "agence" };
  const money = formatMoney(result.montant, result.devise);
  const summary = actor.staffId
    ? `Crédit remis en non rattaché · ${money} · ${name}`
    : `Crédit remis en non rattaché · ${money} · ${name} · ${actor.label}`;
  const entry: UnmatchJournalEntry = {
    staffId: actor.staffId,
    summary: summary.slice(0, 500),
    entityId: credit.id,
    amountCents: eurosToAlertCents(result.montant),
    diff: {
      client_id: credit.customer_id,
      montant: result.montant,
      devise: result.devise,
      source: credit.source,
      motif: motif || null,
      paiement_id: result.paiement_id,
      file: result.file,
    },
    path: deps?.path ?? "/api/admin/transactions",
  };
  try {
    await (deps?.journal ?? defaultJournal)(entry);
  } catch (err) {
    console.error("[unmatch] journal", err instanceof Error ? err.message : "journal");
  }
  return result;
}

export function prepareUnmatchCredit(input: Record<string, unknown>): { id: string; motif: string } | { error: string } {
  const raw = [input.id, input.mouvement_id, input.virement_id, input.paiement_id].find(
    (value) => typeof value === "string" && value.trim()
  );
  if (typeof raw !== "string") return { error: "Indiquez le crédit ou le paiement." as const };
  const id = raw.trim();
  if (!id || id.length > 80) return { error: "Identifiant invalide." as const };
  const motif = typeof input.motif === "string" ? input.motif.trim().slice(0, 300) : "";
  return { id, motif };
}

/** Outil MCP `remettre_non_rattache`. */
export async function releaseMatchedCredit(
  input: Record<string, unknown>,
  admin?: SupabaseClient,
  deps?: { journal?: (entry: UnmatchJournalEntry) => Promise<void> }
): Promise<UnmatchResult> {
  const prepared = prepareUnmatchCredit(input);
  if ("error" in prepared) return { ok: false, error: prepared.error };
  const db = (admin ?? (await serviceAdmin())) as unknown as UnmatchAdmin;
  const actor = currentMcpAccess().actor || "mcp";
  return unmatchClientCredit(db, { id: prepared.id, motif: prepared.motif }, {
    actor: { staffId: null, label: actor },
    journal: deps?.journal,
    path: "/api/mcp",
  });
}

async function serviceAdmin() {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  return createServiceClient();
}

/** Un crédit déjà remis en file ne doit pas être recrédité par la synchro ou le webhook. */
export async function paymentCreditReleased(admin: UnmatchAdmin, source: "stripe" | "revolut", paymentId: string) {
  if (!paymentId) return false;
  const bounds = releaseExternalBounds(paymentId);
  try {
    const { data, error } = await admin
      .from("crm_transactions")
      .select("id")
      .eq("source", source)
      .eq("status", "void")
      .gte("external_id", bounds.from)
      .lt("external_id", bounds.to)
      .limit(1);
    if (error || !data) return false;
    return (Array.isArray(data) ? data : []).length > 0;
  } catch {
    return false;
  }
}
