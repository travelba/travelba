import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { buildBookingIcs, icsFileName, icsHttpHeaders } from "@/lib/crm/calendar-ics";
import { carnetVisible } from "@/lib/crm/carnet";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ reference: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { reference } = await ctx.params;
  const itemId = new URL(request.url).searchParams.get("item_id");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Connexion requise", { status: 401 });
  const customer = await ensureCustomerForUser(user);
  if (!customer) return new NextResponse("Connexion requise", { status: 401 });

  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return new NextResponse("Introuvable", { status: 404 });
  const b = booking as CrmBooking;

  const { data: items } = await supabase
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", b.id)
    .order("sort_order");
  const rows = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, rows)) return new NextResponse("Introuvable", { status: 404 });

  const body = buildBookingIcs({ booking: b, items: rows, itemId });
  if (!body.includes("BEGIN:VEVENT")) {
    return new NextResponse("Aucune date à ajouter à l’agenda.", { status: 400 });
  }
  return new NextResponse(body, {
    headers: icsHttpHeaders(icsFileName(b, itemId)),
  });
}
