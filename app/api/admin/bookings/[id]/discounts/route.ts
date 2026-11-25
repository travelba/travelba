import { NextResponse } from "next/server";
import {
  DISCOUNT_MIGRATION_MESSAGE,
  deleteBookingDiscounts,
  deleteDiscountLine,
  insertDiscountLine,
  updateDiscountLine,
} from "@/lib/crm/booking-discounts-db";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { ledgerWarning, refreshBookingLedger } from "@/lib/crm/bookings";
import { isUuid } from "@/lib/crm/ids";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { params: Promise<{ id: string }> };

async function bookingExists(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("crm_bookings").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

function failure(err: unknown) {
  const message = err instanceof Error ? err.message : "Remise non enregistrée.";
  return jsonError(message, message === DISCOUNT_MIGRATION_MESSAGE ? 503 : 400);
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Identifiant invalide");
  if (!(await bookingExists(auth.supabase, id))) return jsonError("Réservation introuvable", 404);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Remise invalide.");
  try {
    const line = await insertDiscountLine(id, body as Record<string, unknown>);
    const ledger_warning = await ledgerWarning("Remise enregistrée", () => refreshBookingLedger(auth.supabase, id));
    return NextResponse.json({ line, ledger_warning });
  } catch (err) {
    return failure(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Identifiant invalide");
  if (!(await bookingExists(auth.supabase, id))) return jsonError("Réservation introuvable", 404);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const lineId = typeof body?.id === "string" ? body.id : "";
  if (!isUuid(lineId)) return jsonError("Remise introuvable.");
  try {
    const line = await updateDiscountLine(id, lineId, body || {});
    const ledger_warning = await ledgerWarning("Remise enregistrée", () => refreshBookingLedger(auth.supabase, id));
    return NextResponse.json({ line, ledger_warning });
  } catch (err) {
    return failure(err);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Identifiant invalide");
  if (!(await bookingExists(auth.supabase, id))) return jsonError("Réservation introuvable", 404);
  const lineId = new URL(request.url).searchParams.get("lineId") || "";
  try {
    if (lineId === "toutes") await deleteBookingDiscounts(id);
    else if (isUuid(lineId)) await deleteDiscountLine(id, lineId);
    else return jsonError("Remise introuvable.");
    const ledger_warning = await ledgerWarning("Remise retirée", () => refreshBookingLedger(auth.supabase, id));
    return NextResponse.json({ ok: true, ledger_warning });
  } catch (err) {
    return failure(err);
  }
}
