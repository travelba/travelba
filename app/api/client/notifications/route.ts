import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { missingDbColumn } from "@/lib/crm/optional-column";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const FIELDS = ["push_travel", "push_documents", "push_payment"] as const;

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
  };
}

/** Préférences de notification de l’application. Sans ligne, les trois sont ouvertes. */
export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_notification_preferences")
    .select("push_travel, push_documents, push_payment")
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (error) {
    if (closed(error)) return NextResponse.json({ available: false, ...flags(null) });
    return dbError(error);
  }
  return NextResponse.json({ available: true, ...flags(data as PrefRow | null) });
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
