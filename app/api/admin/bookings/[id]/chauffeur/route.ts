import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import {
  applyRolzoConfirmation,
  chauffeurLegPlace,
  refreshRolzoChauffeur,
} from "@/lib/crm/rolzo-apply";
import { assertRolzoBookingId, RolzoError } from "@/lib/crm/rolzo";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

function fail(err: unknown) {
  if (err instanceof RolzoError) return jsonError(err.message, err.status);
  return jsonError("La course chauffeur n’a pas pu être enregistrée.", 400);
}

async function load(supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>, id: string) {
  const { data: booking } = await supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) return null;
  const { data: items } = await supabase.from("crm_booking_items").select("*").eq("booking_id", id);
  return { booking: booking as CrmBooking, items: (items || []) as CrmBookingItem[] };
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const loaded = await load(auth.supabase, id);
  if (!loaded) return jsonError("Réservation introuvable", 404);
  const url = new URL(request.url);
  try {
    const { leg, place } = chauffeurLegPlace({
      leg: url.searchParams.get("leg"),
      place: url.searchParams.get("place"),
    });
    const item = await refreshRolzoChauffeur(auth.supabase, { ...loaded, leg, place });
    return NextResponse.json({ item });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const loaded = await load(auth.supabase, id);
  if (!loaded) return jsonError("Réservation introuvable", 404);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const { leg, place } = chauffeurLegPlace(body);
    const bookingId = assertRolzoBookingId(String(body?.bookingId || ""));
    const item = await applyRolzoConfirmation(auth.supabase, {
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
