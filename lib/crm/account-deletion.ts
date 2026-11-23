import "server-only";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { agencyEmailHtml } from "@/lib/crm/email-html";
import { deletedAccountEmail, isDeletedAccountEmail } from "@/lib/crm/account-deletion-copy";
import { isStaffRoleValue } from "@/lib/crm/agency-access";
import { isUuid } from "@/lib/crm/ids";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { siteConfig } from "@/lib/site";

// Le client service role. La chaîne de filtres reste celle de supabase-js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DeletionDb = { from: (table: string) => any };

type DbError = { code?: string; message?: string; status?: number } | null;

export class AccountDeletionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AccountDeletionError";
    this.status = status;
  }
}

export function missingColumnName(error: DbError): string | null {
  if (!error) return null;
  if (error.code !== "42703" && error.code !== "PGRST204") return null;
  const message = error.message || "";
  const quoted = message.match(/'([a-z0-9_]+)'/i);
  if (quoted?.[1]) return quoted[1];
  const dotted = message.match(/\.([a-z0-9_]+) does not exist/i);
  return dotted?.[1] ?? null;
}

function isMissingRelation(error: DbError) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist|schema cache/i.test(error.message || "");
}

export function authUserAlreadyGone(error: DbError) {
  if (!error) return false;
  if (error.status === 404) return true;
  return /not found/i.test(error.message || "");
}

/** Le titulaire connecté est bien cette fiche. Un autre auth_user_id ne part pas. */
export function sessionMayDeleteCustomer(input: {
  sessionUserId: string;
  sessionEmail: string;
  customerAuthUserId: string | null;
  customerEmail: string | null;
}) {
  if (input.customerAuthUserId && input.customerAuthUserId === input.sessionUserId) return true;
  if (!input.customerAuthUserId) {
    const session = input.sessionEmail.trim().toLowerCase();
    const customer = (input.customerEmail || "").trim().toLowerCase();
    return Boolean(session) && session === customer;
  }
  return false;
}

function personalStoragePath(customerId: string, path: string) {
  return path.startsWith(`customers/${customerId}/`);
}

const REFUSED = "Ce compte ne peut pas être supprimé ici.";
const FAILED = "La suppression n’a pas pu être terminée. Réessayez.";

type CustomerRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  auth_user_id?: string | null;
  phone?: string | null;
  stripe_customer_id?: string | null;
  account_deleted_at?: string | null;
  company_name?: string | null;
};

function isAlreadyDeleted(row: CustomerRow) {
  return Boolean(row.account_deleted_at) || isDeletedAccountEmail(row.email);
}

/** Tables du compte (session, appareil, préférence, message, moyen de paiement). Pas les dossiers ni le grand livre. */
const PERSONAL_TABLES = [
  "crm_espace_devices",
  "crm_device_unlocks",
  "crm_live_activities",
  "crm_notification_preferences",
  "crm_access_resend_tokens",
  "crm_notifications",
  "crm_app_messages",
  "crm_app_threads",
  "crm_whatsapp_messages",
  "crm_customer_logins",
  "crm_payment_methods",
  "crm_hotel_search_offers",
  "crm_hotel_search_requests",
] as const;

async function readCustomer(admin: DeletionDb, customerId: string): Promise<{ row: CustomerRow | null; deletedColumn: boolean }> {
  const withColumn = await admin
    .from("crm_customers")
    .select(
      "id, first_name, last_name, email, auth_user_id, phone, stripe_customer_id, account_deleted_at, company_name"
    )
    .eq("id", customerId)
    .maybeSingle();
  if (!withColumn.error) return { row: (withColumn.data as CustomerRow | null) ?? null, deletedColumn: true };
  if (missingColumnName(withColumn.error) !== "account_deleted_at") {
    throw new AccountDeletionError(FAILED, 500);
  }
  const plain = await admin
    .from("crm_customers")
    .select("id, first_name, last_name, email, auth_user_id, phone, stripe_customer_id, company_name")
    .eq("id", customerId)
    .maybeSingle();
  if (plain.error) throw new AccountDeletionError(FAILED, 500);
  return { row: (plain.data as CustomerRow | null) ?? null, deletedColumn: false };
}

async function assertNotStaff(admin: DeletionDb, input: { authUserId: string; email: string | null; crmRole: unknown }) {
  if (isStaffRoleValue(input.crmRole)) throw new AccountDeletionError(REFUSED, 403);
  const byAuth = await admin.from("crm_staff").select("id").eq("auth_user_id", input.authUserId).maybeSingle();
  if (byAuth.error && !isMissingRelation(byAuth.error)) throw new AccountDeletionError(FAILED, 500);
  if (byAuth.data) throw new AccountDeletionError(REFUSED, 403);
  const email = (input.email || "").trim();
  if (!email || isDeletedAccountEmail(email)) return;
  const byEmail = await admin.from("crm_staff").select("id").ilike("email", email).maybeSingle();
  if (byEmail.error && !isMissingRelation(byEmail.error) && missingColumnName(byEmail.error) !== "email") {
    throw new AccountDeletionError(FAILED, 500);
  }
  if (byEmail.data) throw new AccountDeletionError(REFUSED, 403);
}

async function deleteEq(admin: DeletionDb, table: string, column: string, value: string) {
  const { error } = await admin.from(table).delete().eq(column, value);
  if (error && !isMissingRelation(error)) {
    console.error("[compte] suppression", table, error.code || "");
    throw new AccountDeletionError(FAILED, 500);
  }
}

async function updateFlexible(
  admin: DeletionDb,
  table: string,
  payload: Record<string, unknown>,
  apply: (query: { eq: (column: string, value: unknown) => unknown; in: (column: string, values: unknown[]) => unknown; is: (column: string, value: unknown) => unknown }) => PromiseLike<{ error: DbError }>
) {
  const current = { ...payload };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await apply(admin.from(table).update(current));
    if (!error || isMissingRelation(error)) return;
    const missing = missingColumnName(error);
    if (!missing || !(missing in current)) {
      console.error("[compte] mise à jour", table, error.code || "");
      throw new AccountDeletionError(FAILED, 500);
    }
    delete current[missing];
    if (!Object.keys(current).length) return;
  }
  throw new AccountDeletionError(FAILED, 500);
}

async function collectPersonalPaths(admin: DeletionDb, customerId: string, listFiles: (prefix: string) => Promise<string[]>) {
  const paths = new Set<string>();
  const docs = await admin.from("crm_travel_documents").select("storage_path").eq("customer_id", customerId);
  if (docs.error && !isMissingRelation(docs.error)) throw new AccountDeletionError(FAILED, 500);
  for (const row of docs.data || []) {
    if (typeof row?.storage_path === "string") paths.add(row.storage_path);
  }
  const messages = await admin.from("crm_app_messages").select("attachment_path").eq("customer_id", customerId);
  if (messages.error && !isMissingRelation(messages.error)) throw new AccountDeletionError(FAILED, 500);
  for (const row of messages.data || []) {
    if (typeof row?.attachment_path === "string") paths.add(row.attachment_path);
  }
  const listed = await listFiles(`customers/${customerId}`);
  for (const path of listed) paths.add(path);
  return [...paths].filter((path) => personalStoragePath(customerId, path));
}

async function purgeAccountRows(admin: DeletionDb, customerId: string, email: string | null) {
  for (const table of PERSONAL_TABLES) {
    await deleteEq(admin, table, "customer_id", customerId);
  }
  await deleteEq(admin, "crm_travel_documents", "customer_id", customerId);
  await deleteEq(admin, "crm_customer_twins", "customer_a", customerId);
  await deleteEq(admin, "crm_customer_twins", "customer_b", customerId);
  const address = (email || "").trim();
  if (address && !isDeletedAccountEmail(address)) {
    const { error } = await admin.from("crm_entry_links").delete().ilike("email", address);
    if (error && !isMissingRelation(error) && missingColumnName(error) !== "email") {
      throw new AccountDeletionError(FAILED, 500);
    }
  }
}

async function anonymizeLinkedPeople(admin: DeletionDb, customerId: string, bookingIds: string[]) {
  await updateFlexible(
    admin,
    "crm_travel_companions",
    {
      first_name: "Voyageur",
      last_name: "retiré",
      usage_name: null,
      birth_date: null,
      sex: null,
      nationality: null,
      relationship: null,
      phone: null,
      email: null,
      loyalty: null,
    },
    (query) => query.eq("customer_id", customerId) as PromiseLike<{ error: DbError }>
  );
  await updateFlexible(admin, "crm_bookings", { notes_client: null }, (query) => query.eq("customer_id", customerId) as PromiseLike<{ error: DbError }>);
  if (!bookingIds.length) return;
  await updateFlexible(admin, "crm_visa_requests", { answers: {} }, (query) => query.in("booking_id", bookingIds) as PromiseLike<{ error: DbError }>);
  await updateFlexible(
    admin,
    "crm_esta_checks",
    { esta_passport_last3: null },
    (query) => query.in("booking_id", bookingIds) as PromiseLike<{ error: DbError }>
  );
  await updateFlexible(
    admin,
    "crm_uk_eta_checks",
    { passport_last3: null },
    (query) => query.in("booking_id", bookingIds) as PromiseLike<{ error: DbError }>
  );
}

async function writeTombstone(
  admin: DeletionDb,
  customerId: string,
  payload: Record<string, unknown>,
  originalEmail: string | null,
  deletedColumn: boolean
) {
  const current = { ...payload };
  let column = deletedColumn;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let query = admin.from("crm_customers").update(current).eq("id", customerId);
    if (column && "account_deleted_at" in current) query = query.is("account_deleted_at", null);
    else if (originalEmail) query = query.eq("email", originalEmail);
    const { data, error } = await query.select("id");
    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      return rows.length > 0;
    }
    const missing = missingColumnName(error);
    if (!missing || !(missing in current)) throw new AccountDeletionError(FAILED, 500);
    if (missing === "account_deleted_at") column = false;
    delete current[missing];
  }
  throw new AccountDeletionError(FAILED, 500);
}

async function ensureAudit(admin: DeletionDb, customerId: string) {
  const existing = await admin
    .from("crm_customer_activity")
    .select("id")
    .eq("customer_id", customerId)
    .eq("action", "account_deleted")
    .limit(1);
  if (existing.error && !isMissingRelation(existing.error)) throw new AccountDeletionError(FAILED, 500);
  if (existing.data?.length) return;
  const { error } = await admin.from("crm_customer_activity").insert({
    customer_id: customerId,
    auth_user_id: null,
    action: "account_deleted",
    summary: "Compte supprimé",
    detail: "Profil, pièces d’identité et appareils effacés. Dossiers, factures et règlements conservés.",
    path: null,
    booking_id: null,
  });
  if (error && !isMissingRelation(error)) throw new AccountDeletionError(FAILED, 500);
}

async function finishAuth(admin: DeletionDb, customerId: string, authUserId: string, deleteAuthUser: DeleteClientAccountInput["deleteAuthUser"]) {
  if (authUserId) {
    const { error } = await deleteAuthUser(authUserId);
    if (error && !authUserAlreadyGone(error)) throw new AccountDeletionError(FAILED, 500);
  }
  const { error } = await admin.from("crm_customers").update({ auth_user_id: null }).eq("id", customerId);
  if (error) throw new AccountDeletionError(FAILED, 500);
}

export type DeleteClientAccountInput = {
  admin: DeletionDb;
  customerId: string;
  authUserId: string;
  sessionEmail: string;
  crmRole: unknown;
  deleteAuthUser: (userId: string) => Promise<{ error: DbError }>;
  listFiles: (prefix: string) => Promise<string[]>;
  removeFiles: (paths: string[]) => Promise<void>;
  notifyAgency?: (notice: { name: string; email: string; customerId: string }) => Promise<void>;
  forgetStripeCustomer?: (stripeCustomerId: string) => Promise<void>;
};

/**
 * Efface le compte tout de suite.
 * Le profil, les pièces d’identité, les préférences et les appareils partent.
 * Les dossiers, factures et règlements restent, sur une fiche sans identité.
 * Un compte d’agence est refusé. Un second appel ne renvoie pas l’e-mail.
 * L’utilisateur Auth n’est retiré qu’une fois la fiche marquée, pour qu’un échec se réessaie.
 */
export async function deleteClientAccount(input: DeleteClientAccountInput) {
  if (!isUuid(input.customerId)) throw new AccountDeletionError("Identifiant invalide");
  const { row, deletedColumn } = await readCustomer(input.admin, input.customerId);
  if (!row) throw new AccountDeletionError("Compte client introuvable", 404);

  const originalEmail = typeof row.email === "string" ? row.email : "";
  await assertNotStaff(input.admin, {
    authUserId: input.authUserId,
    email: originalEmail,
    crmRole: input.crmRole,
  });
  if (
    !sessionMayDeleteCustomer({
      sessionUserId: input.authUserId,
      sessionEmail: input.sessionEmail,
      customerAuthUserId: typeof row.auth_user_id === "string" ? row.auth_user_id : null,
      customerEmail: originalEmail,
    })
  ) {
    throw new AccountDeletionError(REFUSED, 403);
  }

  const authUserId = (typeof row.auth_user_id === "string" && row.auth_user_id) || input.authUserId;
  const paths = await collectPersonalPaths(input.admin, row.id, input.listFiles);

  if (isAlreadyDeleted(row)) {
    await purgeAccountRows(input.admin, row.id, null);
    await input.removeFiles(paths);
    await ensureAudit(input.admin, row.id);
    await finishAuth(input.admin, row.id, authUserId, input.deleteAuthUser);
    return { ok: true as const, already: true };
  }

  const name = [row.first_name, row.last_name].filter((part) => typeof part === "string" && part.trim()).join(" ").trim();
  if (row.stripe_customer_id && input.forgetStripeCustomer) {
    try {
      await input.forgetStripeCustomer(row.stripe_customer_id);
    } catch {
      console.error("[compte] client Stripe non retiré");
    }
  }

  await purgeAccountRows(input.admin, row.id, originalEmail);
  await deleteEq(input.admin, "crm_customer_activity", "customer_id", row.id);
  await input.removeFiles(paths);

  const bookings = await input.admin.from("crm_bookings").select("id").eq("customer_id", row.id);
  if (bookings.error && !isMissingRelation(bookings.error)) throw new AccountDeletionError(FAILED, 500);
  const bookingIds = (bookings.data || [])
    .map((booking: { id?: string }) => booking.id)
    .filter((id: string | undefined): id is string => typeof id === "string");
  await anonymizeLinkedPeople(input.admin, row.id, bookingIds);

  const wrote = await writeTombstone(
    input.admin,
    row.id,
    {
      account_deleted_at: new Date().toISOString(),
      first_name: "Compte",
      last_name: "supprimé",
      usage_name: null,
      email: deletedAccountEmail(row.id),
      phone: null,
      phone_secondary: null,
      whatsapp: null,
      birth_date: null,
      sex: null,
      nationality: null,
      address_line: null,
      postal_code: null,
      city: null,
      country: null,
      flying_blue: null,
      loyalty: null,
      iban: null,
      stripe_customer_id: null,
      whatsapp_opt_in_at: null,
      whatsapp_opt_out_at: null,
    },
    originalEmail || null,
    deletedColumn
  );
  if (!wrote) {
    await ensureAudit(input.admin, row.id);
    await finishAuth(input.admin, row.id, authUserId, input.deleteAuthUser);
    return { ok: true as const, already: true };
  }

  await ensureAudit(input.admin, row.id);
  await (input.notifyAgency ?? sendDeletionMail)({
    name,
    email: originalEmail,
    customerId: row.id,
  });
  await finishAuth(input.admin, row.id, authUserId, input.deleteAuthUser);
  return { ok: true as const, already: false };
}

type CustomerAuth = {
  user: { id: string; email?: string | null; app_metadata?: object | null };
  customer: { id: string };
};

function crmRoleOf(user: CustomerAuth["user"]) {
  const meta = user.app_metadata;
  if (!meta || typeof meta !== "object" || !("crm_role" in meta)) return undefined;
  return (meta as { crm_role?: unknown }).crm_role;
}

export async function handleClientAccountDeletion(input: {
  requireCustomer: () => Promise<CustomerAuth | NextResponse>;
  /** Vrai quand la session est une ouverture agence (cookie desk), pas le téléphone du client. */
  isDesk: (userId: string) => boolean;
  admin: DeletionDb;
  deleteAuthUser: DeleteClientAccountInput["deleteAuthUser"];
  listFiles: DeleteClientAccountInput["listFiles"];
  removeFiles: DeleteClientAccountInput["removeFiles"];
  notifyAgency?: DeleteClientAccountInput["notifyAgency"];
  forgetStripeCustomer?: DeleteClientAccountInput["forgetStripeCustomer"];
}) {
  const auth = await input.requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (input.isDesk(auth.user.id)) return jsonError("Cette demande se fait depuis le compte du client.", 403);
  try {
    const result = await deleteClientAccount({
      admin: input.admin,
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      sessionEmail: auth.user.email || "",
      crmRole: crmRoleOf(auth.user),
      deleteAuthUser: input.deleteAuthUser,
      listFiles: input.listFiles,
      removeFiles: input.removeFiles,
      notifyAgency: input.notifyAgency,
      forgetStripeCustomer: input.forgetStripeCustomer,
    });
    return NextResponse.json({ ok: true, already: result.already });
  } catch (error) {
    if (error instanceof AccountDeletionError) return jsonError(error.message, error.status);
    console.error("[compte] suppression");
    return jsonError(FAILED, 500);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Prévenir l’agence. Le corps porte l’identité d’origine : la fiche, elle, ne la garde plus. */
export async function sendDeletionMail(input: { name: string; email: string; customerId: string }) {
  const apiKey = productionOnlySecret(process.env.RESEND_API_KEY);
  const to = (process.env.CONTACT_TO_EMAIL || siteConfig.contactEmail).trim();
  if (!apiKey || !to) return;
  const from = process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
  const who = input.name.trim() || "Un client";
  const body = `${who} a supprimé son compte. La connexion est coupée. Le profil, les pièces d’identité et les appareils sont effacés. Les dossiers, factures et règlements restent sur la fiche anonymisée.`;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: `${siteConfig.name} <${from}>`,
      to: [to],
      subject: "Compte client supprimé",
      html: agencyEmailHtml({
        title: "Compte supprimé",
        preheader: "Le compte client a été effacé.",
        bodyHtml: `<p style="margin:0 0 8px;line-height:1.5">${escapeHtml(body)}</p><p style="margin:0;line-height:1.5">E-mail d’origine : ${escapeHtml(input.email || "non renseigné")}<br>Fiche : ${escapeHtml(input.customerId)}</p>`,
      }),
    });
  } catch {
    console.error("[compte] avis de suppression non envoyé");
  }
}
