import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { cancelRolzoChauffeur, chauffeurLegPlace, quoteRolzoCancellation } from "@/lib/crm/rolzo-apply";
import { RolzoError } from "@/lib/crm/rolzo";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data: booking } = await auth.supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  const { data: items } = await auth.supabase.from("crm_booking_items").select("*").eq("booking_id", id);
  const list = (items || []) as CrmBookingItem[];
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const { leg, place } = chauffeurLegPlace(body);
    if (body?.confirm !== true) {
      const quote = await quoteRolzoCancellation(list, leg, place);
      return NextResponse.json({ confirm: false, ...quote });
    }
    const shown = typeof body.shown === "string" && body.shown.trim() ? body.shown : null;
    const item = await cancelRolzoChauffeur(auth.supabase, {
      booking: booking as CrmBooking,
      items: list,
      leg,
      place,
      shown,
    });
    return NextResponse.json({ confirm: true, item });
  } catch (err) {
    if (err instanceof RolzoError) return jsonError(err.message, err.status);
    return jsonError("L’annulation n’a pas abouti.", 400);
  }
}
