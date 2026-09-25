import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { carnetVisible } from "@/lib/crm/carnet";
import { cancelRolzoChauffeur, chauffeurLegPlace, quoteRolzoCancellation } from "@/lib/crm/rolzo-apply";
import { RolzoError } from "@/lib/crm/rolzo";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return jsonError("Séjour introuvable", 404);
  const row = booking as CrmBooking;
  const { data: items } = await auth.supabase.from("crm_booking_items").select("*").eq("booking_id", row.id);
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(row, list)) return jsonError("Séjour introuvable", 404);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const { leg, place } = chauffeurLegPlace(body);
    if (body?.confirm !== true) {
      const quote = await quoteRolzoCancellation(list, leg, place);
      return NextResponse.json({ confirm: false, ...quote });
    }
    const shown = typeof body.shown === "string" && body.shown.trim() ? body.shown : null;
    const admin = createServiceClient();
    const item = await cancelRolzoChauffeur(admin, { booking: row, items: list, leg, place, shown });
    return NextResponse.json({ confirm: true, item });
  } catch (err) {
    if (err instanceof RolzoError) return jsonError(err.message, err.status);
    return jsonError("L’annulation n’a pas abouti.", 400);
  }
}
