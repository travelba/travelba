import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { missingDbColumn } from "@/lib/crm/optional-column";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const FIELDS = [
  "push_travel",
  "push_documents",
  "push_payment",
  "push_messages",
  "push_checkin",
  "push_flight_change",
  "push_departure",
  "push_balance",
] as const;

const CORE = "push_travel, push_documents, push_payment";
const WITH_MESSAGES = `${CORE}, push_messages`;
const FULL = `${WITH_MESSAGES}, push_checkin, push_flight_change, push_departure, push_balance`;

type PrefRow = Partial<Record<(typeof FIELDS)[number], boolean | null>>;

function closed(error: { code?: string; message?: string | null } | null) {
  if (!error) return false;
  return (
    missingDbColumn(error, "push_travel") ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    error.code === "PGRST205"
  );
}

function flags(row: PrefRow | null) {
  return {
    push_travel: row?.push_travel !== false,
    push_documents: row?.push_documents !== false,
    push_payment: row?.push_payment !== false,
    push_messages: row?.push_messages !== false,
    push_checkin: row?.push_checkin !== false,
    push_flight_change: row?.push_flight_change !== false,
    push_departure: row?.push_departure !== false,
    push_balance: row?.push_balance !== false,
  };
}

/** Préférences de notification de l’application. Sans ligne, les canaux sont ouverts. */
export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const admin = createServiceClient();
  const full = await admin.from("crm_notification_preferences").select(FULL).eq("customer_id", auth.customer.id).maybeSingle();
  let messages = true;
  let extended = true;
  let result = full;
  const columnGone = (error: { code?: string; message?: string | null } | null, column: string) =>
    Boolean(error && missingDbColumn(error, column));
  if (columnGone(full.error, "push_checkin")) {
    extended = false;
    result = await admin.from("crm_notification_preferences").select(WITH_MESSAGES).eq("customer_id", auth.customer.id).maybeSingle();
  } else if (columnGone(full.error, "push_messages")) {
    messages = false;
    result = await admin
      .from("crm_notification_preferences")
      .select(`${CORE}, push_checkin, push_flight_change, push_departure, push_balance`)
      .eq("customer_id", auth.customer.id)
      .maybeSingle();
  }
  if (result.error && columnGone(result.error, "push_messages")) {
    messages = false;
    result = await admin.from("crm_notification_preferences").select(CORE).eq("customer_id", auth.customer.id).maybeSingle();
  }
  if (result.error && columnGone(result.error, "push_checkin")) {
    extended = false;
    result = await admin.from("crm_notification_preferences").select(CORE).eq("customer_id", auth.customer.id).maybeSingle();
  }
  if (result.error) {
    if (closed(result.error)) {
      return NextResponse.json({ available: false, extended: false, messages: false, ...flags(null) });
    }
    return dbError(result.error);
  }
  return NextResponse.json({
    available: true,
    extended,
    messages,
    ...flags(result.data as PrefRow | null),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Record<string, boolean> = {};
  for (const field of FIELDS) {
    if (typeof body?.[field] === "boolean") patch[field] = body[field] as boolean;
  }
  if (!Object.keys(patch).length) return jsonError("Aucun réglage à enregistrer.");
  const admin = createServiceClient();
  const { error } = await admin.from("crm_notification_preferences").upsert(
    { customer_id: auth.customer.id, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "customer_id" }
  );
  if (error) {
    if (closed(error)) return jsonError("Les notifications de l’application ne sont pas encore ouvertes.", 503);
    return dbError(error);
  }
  return NextResponse.json({ ok: true, ...patch });
}
