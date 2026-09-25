import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { carnetVisible } from "@/lib/crm/carnet";
import { applyRolzoConfirmation, chauffeurLegPlace, refreshRolzoChauffeur } from "@/lib/crm/rolzo-apply";
import { assertRolzoBookingId, RolzoError } from "@/lib/crm/rolzo";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

async function load(auth: { supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>; customer: { id: string } }, reference: string) {
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return null;
  const row = booking as CrmBooking;
  const { data: items } = await auth.supabase.from("crm_booking_items").select("*").eq("booking_id", row.id);
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(row, list)) return null;
  return { booking: row, items: list };
}

function fail(err: unknown) {
  if (err instanceof RolzoError) return jsonError(err.message, err.status);
  return jsonError("La course chauffeur n’a pas pu être enregistrée.", 400);
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const loaded = await load(auth, reference);
  if (!loaded) return jsonError("Séjour introuvable", 404);
  const url = new URL(request.url);
  try {
    const { leg, place } = chauffeurLegPlace({
      leg: url.searchParams.get("leg"),
      place: url.searchParams.get("place"),
    });
    const admin = createServiceClient();
    const item = await refreshRolzoChauffeur(admin, { ...loaded, leg, place });
    return NextResponse.json({ item });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const loaded = await load(auth, reference);
  if (!loaded) return jsonError("Séjour introuvable", 404);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const { leg, place } = chauffeurLegPlace(body);
    const bookingId = assertRolzoBookingId(String(body?.bookingId || ""));
    const admin = createServiceClient();
    const item = await applyRolzoConfirmation(admin, {
      ...loaded,
      rolzoBookingId: bookingId,
      leg,
      place,
    });
    return NextResponse.json({ item });
  } catch (err) {
    return fail(err);
  }
}
