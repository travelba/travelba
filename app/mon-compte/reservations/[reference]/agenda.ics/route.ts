import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { buildBookingIcs } from "@/lib/crm/calendar-ics";
import { carnetVisible } from "@/lib/crm/carnet";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ reference: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { reference } = await ctx.params;
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

  const body = buildBookingIcs(b, rows);
  const filename = `${b.reference.replace(/[^\w.-]+/g, "") || "sejour"}.ics`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
