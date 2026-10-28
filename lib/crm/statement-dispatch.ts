import type { SupabaseClient } from "@supabase/supabase-js";
import { loadClientLedger } from "./client-ledger";
import { dbErrorMessage, type DbErrorLike } from "./db-error";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey } from "./rate-limit";
import { buildStatement, STATEMENT_CUSTOMER_COLUMNS, statementHolderLines, type StatementAudience } from "./statement";
import { renderStatementPdf } from "./statement-pdf";
import { deliverStatementWhatsapp } from "./statement-send";
import { STATEMENT_SESSION_KEY, STATEMENT_TEMPLATE_KEY, type StatementDeliveryResult } from "./statement-whatsapp";
import { createServiceClient } from "@/lib/supabase/admin";
import { customerFullName, type CrmCustomer } from "./types";

const CUSTOMER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const SENT = new Set(["sent", "delivered", "read"]);

/** Deux envois réussis trop rapprochés : le second est refusé, sauf force. */
export const STATEMENT_REPEAT_WINDOW_MS = 5 * 60 * 1000;

export type StatementActor = { kind: "staff"; staffId: string } | { kind: "bot"; id: string };

export type StatementSendChannel = "whatsapp" | "email";

export type RecentStatementSend = {
  at: string;
  status: string;
  sid: string | null;
};

export type AccountStatementResult = {
  ok: boolean;
  statut: "sent" | "failed" | "refused";
  twilio_sid: string | null;
  message: string;
  code?: string;
  httpStatus: number;
  canal: StatementSendChannel | "invalid";
};

export type StatementPdfResult =
  | { ok: true; customer: CrmCustomer; pdf: Uint8Array; member: boolean }
  | { ok: false; httpStatus: number; message: string; code: "not_found" | "read" | "prepare" };

export type StatementSendDeps = {
  readCustomer?: (supabase: SupabaseClient, customerId: string) => Promise<StatementCustomerRead>;
  buildPdf?: (supabase: SupabaseClient, customer: CrmCustomer, audience: StatementAudience, now: Date) => Promise<StatementPdfBuilt>;
  deliver?: (input: Parameters<typeof deliverStatementWhatsapp>[0]) => Promise<StatementDeliveryResult>;
  findRecent?: (customerId: string, sinceIso: string) => Promise<RecentStatementSend | null>;
  limit?: (customerId: string) => Promise<boolean>;
};

type StatementCustomerRead =
  | { ok: true; customer: CrmCustomer }
  | { ok: false; httpStatus: number; message: string; code: "not_found" | "read" };

type StatementPdfBuilt = { pdf: Uint8Array; member: boolean };

/** `whatsapp` si le canal est vide. `email` est reconnu, puis refusé : la route ne l’envoie pas. */
export function statementChannelOf(value: string | null | undefined): StatementSendChannel | "invalid" {
  if (value == null || value.trim() === "") return "whatsapp";
  const channel = value.trim().toLowerCase();
  if (channel === "whatsapp") return "whatsapp";
  if (channel === "email") return "email";
  return "invalid";
}

/** Nom du jeton MCP. Un texte hors format retombe sur `mcp`. */
export function statementBotId(value: string) {
  const id = value.trim().toLowerCase();
  return ACTOR.test(id) ? id : "mcp";
}

/**
 * Vrai quand un envoi déjà réussi est encore dans la fenêtre.
 * À la borne exacte, un nouvel envoi est permis.
 */
export function statementRecentSendBlocks(
  recent: RecentStatementSend | null,
  now: Date,
  windowMs: number,
  force: boolean
) {
  if (force || windowMs <= 0 || !recent) return false;
  if (!SENT.has(recent.status)) return false;
  const at = Date.parse(recent.at);
  if (!Number.isFinite(at)) return true;
  return now.getTime() - at < windowMs;
}

function refused(
  message: string,
  code: string,
  httpStatus: number,
  canal: AccountStatementResult["canal"],
  sid: string | null = null
): AccountStatementResult {
  return { ok: false, statut: "refused", twilio_sid: sid, message, code, httpStatus, canal };
}

export async function readStatementCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<StatementCustomerRead> {
  if (!CUSTOMER_ID.test(customerId)) {
    return { ok: false, httpStatus: 404, message: "Client introuvable.", code: "not_found" };
  }
  const { data, error } = await supabase
    .from("crm_customers")
    .select(STATEMENT_CUSTOMER_COLUMNS)
    .eq("id", customerId)
    .maybeSingle();
  if (error) {
    console.error("[releve]", (error as DbErrorLike)?.code ?? "?");
    return {
      ok: false,
      httpStatus: 500,
      message: dbErrorMessage(error as DbErrorLike, "Le relevé n’a pas pu être préparé."),
      code: "read",
    };
  }
  if (!data) return { ok: false, httpStatus: 404, message: "Client introuvable.", code: "not_found" };
  return { ok: true, customer: data as CrmCustomer };
}

export async function buildCustomerStatementPdf(
  supabase: SupabaseClient,
  customer: CrmCustomer,
  audience: StatementAudience,
  now: Date
): Promise<StatementPdfBuilt> {
  const view = await loadClientLedger(supabase, customer, audience);
  const pdf = await renderStatementPdf(
    buildStatement({
      view,
      holderName: customerFullName(customer),
      holderLines: statementHolderLines(customer),
      issuedAt: now,
    })
  );
  return { pdf, member: view.member };
}

/** PDF du relevé, la même lecture que le bouton admin. */
export async function customerStatementPdf(
  supabase: SupabaseClient,
  customerId: string,
  audience: StatementAudience = "staff",
  now = new Date(),
  deps?: Pick<StatementSendDeps, "readCustomer" | "buildPdf">
): Promise<StatementPdfResult> {
  const read = await (deps?.readCustomer ?? readStatementCustomer)(supabase, customerId);
  if (!read.ok) return read;
  try {
    const built = await (deps?.buildPdf ?? buildCustomerStatementPdf)(supabase, read.customer, audience, now);
    return { ok: true, customer: read.customer, pdf: built.pdf, member: built.member };
  } catch (err) {
    console.error("[releve]", err instanceof Error ? err.message : "error");
    return { ok: false, httpStatus: 502, message: "Le relevé n’a pas pu être préparé.", code: "prepare" };
  }
}

async function findRecentStatementSend(customerId: string, sinceIso: string): Promise<RecentStatementSend | null> {
  try {
    const admin = createServiceClient();
    const found = await admin
      .from("crm_whatsapp_messages")
      .select("twilio_sid, status, created_at")
      .eq("customer_id", customerId)
      .in("template_key", [STATEMENT_TEMPLATE_KEY, STATEMENT_SESSION_KEY])
      .in("status", ["sent", "delivered", "read"])
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1);
    if (found.error || !found.data?.length) return null;
    const row = found.data[0] as { twilio_sid: string | null; status: string; created_at: string };
    return { at: row.created_at, status: row.status, sid: row.twilio_sid };
  } catch (err) {
    console.error("[releve] doublon", err instanceof Error ? err.message : "error");
    return null;
  }
}

function limitStatementSend(customerId: string) {
  return rateLimit({
    key: rateLimitKey("releve:whatsapp", customerId),
    limit: 8,
    windowSeconds: 60 * 60,
  });
}

function actorFields(actor: StatementActor) {
  if (actor.kind === "staff") return { staffId: actor.staffId, botId: null as string | null };
  return { staffId: null as string | null, botId: statementBotId(actor.id) };
}

/**
 * Même envoi que POST /api/admin/clients/[id]/releve :
 * PDF, coffre, WhatsApp (modèle TWILIO_CONTENT_RELEVE hors 24 h), journal y compris l’échec.
 * `repeatWindowMs` refuse un second envoi réussi trop proche, sauf `force`.
 * Le clic agence laisse la fenêtre à 0 : il peut renvoyer.
 */
export async function sendAccountStatement(
  input: {
    supabase: SupabaseClient;
    customerId: string;
    channel?: string | null;
    audience: StatementAudience;
    actor: StatementActor;
    force?: boolean;
    repeatWindowMs?: number;
    now?: Date;
  },
  deps?: StatementSendDeps
): Promise<AccountStatementResult> {
  const canal = statementChannelOf(input.channel);
  if (canal === "invalid") {
    return refused("Canal : whatsapp ou email.", "channel", 400, "invalid");
  }
  if (canal === "email") {
    return refused("Le relevé part sur WhatsApp. L’envoi par e-mail n’est pas ouvert.", "email", 400, "email");
  }

  const now = input.now ?? new Date();
  const read = await (deps?.readCustomer ?? readStatementCustomer)(input.supabase, input.customerId);
  if (!read.ok) {
    return {
      ok: false,
      statut: "refused",
      twilio_sid: null,
      message: read.message,
      code: read.code,
      httpStatus: read.httpStatus,
      canal,
    };
  }

  const windowMs = input.repeatWindowMs ?? 0;
  if (windowMs > 0 && input.force !== true) {
    const since = new Date(now.getTime() - windowMs).toISOString();
    const recent = await (deps?.findRecent ?? findRecentStatementSend)(read.customer.id, since);
    if (statementRecentSendBlocks(recent, now, windowMs, false)) {
      return refused(
        "Un relevé a déjà été envoyé à ce client il y a quelques minutes. Relancez avec force pour en envoyer un autre.",
        "duplicate",
        409,
        canal,
        recent?.sid ?? null
      );
    }
  }

  const allowed = await (deps?.limit ?? limitStatementSend)(read.customer.id);
  if (!allowed) return refused(RATE_LIMITED_MESSAGE, "rate", 429, canal);

  let built: StatementPdfBuilt;
  try {
    built = await (deps?.buildPdf ?? buildCustomerStatementPdf)(input.supabase, read.customer, input.audience, now);
  } catch (err) {
    console.error("[releve]", err instanceof Error ? err.message : "error");
    return {
      ok: false,
      statut: "failed",
      twilio_sid: null,
      message: "Le relevé n’a pas pu être préparé.",
      code: "prepare",
      httpStatus: 502,
      canal,
    };
  }

  const actor = actorFields(input.actor);
  const delivered = await (deps?.deliver ?? deliverStatementWhatsapp)({
    customerId: read.customer.id,
    phone: read.customer.phone,
    firstName: read.customer.first_name,
    member: built.member,
    pdf: built.pdf,
    audience: input.audience,
    optOutAt: read.customer.whatsapp_opt_out_at,
    staffId: actor.staffId,
    botId: actor.botId,
  });
  if (!delivered.ok) {
    return {
      ok: false,
      statut: "failed",
      twilio_sid: null,
      message: delivered.message,
      code: delivered.code,
      httpStatus: delivered.status,
      canal,
    };
  }
  return {
    ok: true,
    statut: "sent",
    twilio_sid: delivered.sid,
    message: delivered.message,
    httpStatus: 200,
    canal,
  };
}
