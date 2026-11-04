import { NextResponse } from "next/server";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { REVOLUT_MANUAL_LOOKBACK_MS } from "@/lib/crm/sync-delta";
import { syncRevolutWindow } from "@/lib/crm/revolut-delta";
import { autoMatchUnmatchedRevolut } from "@/lib/crm/revolut-match";
import type { CrmRevolutTransaction } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const KNOWN_REVOLUT_ERRORS = [
  "Revolut n’est pas configuré",
  "Revolut n’est pas connecté",
  "Refresh token Revolut manquant",
];

function revolutErrorMessage(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : "";
  return KNOWN_REVOLUT_ERRORS.includes(message) ? message : fallback;
}

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_revolut_transactions")
    .select("*")
    .eq("direction", "credit")
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) return dbError(error, 500);
  return NextResponse.json({ transactions: data as CrmRevolutTransaction[] });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = await assertStaffPermission(auth.staff, "edit_finances");
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  // L’échange du code OAuth ne passe que par GET /api/admin/revolut/oauth, avec le state.
  if (body?.action === "sync") {
    try {
      const synced = await syncRevolutWindow(REVOLUT_MANUAL_LOOKBACK_MS, { stripeRefresh: true });
      const auto = await autoMatchUnmatchedRevolut();
      return NextResponse.json({
        fetched: synced.fetched,
        inserted: synced.inserted,
        written: synced.written,
        auto_matched: auto.matched,
      });
    } catch (err) {
      console.error("[revolut] sync:", err);
      return jsonError(
        revolutErrorMessage(err, "Synchronisation Revolut impossible. Réessayez."),
        502
      );
    }
  }
  return jsonError("Action inconnue");
}
