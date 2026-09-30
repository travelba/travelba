import { NextResponse } from "next/server";
import { CALENDAR_STAY_KEY, buildBookingIcs, icsFileName, icsHttpHeaders, itemHasCalendarDate } from "@/lib/crm/calendar-ics";
import { calendarFeedSecret, calendarFeedSignatureValid } from "@/lib/crm/calendar-feed";
import { carnetVisible, clientVisibleItems } from "@/lib/crm/carnet";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ reference: string; itemId: string; sig: string }> };

/**
 * Flux lu par l’app Calendrier, sans cookie. La signature tient lieu d’accès :
 * séjour publié seulement, et uniquement le carnet (pas les pièces).
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { reference, itemId, sig } = await ctx.params;
  if (!calendarFeedSignatureValid(reference, itemId, sig, calendarFeedSecret())) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return new NextResponse("Introuvable", { status: 404 });
  }

  const { data: booking } = await admin.from("crm_bookings").select("*").eq("reference", reference).maybeSingle();
  if (!booking) return new NextResponse("Introuvable", { status: 404 });
  const row = booking as CrmBooking;

  const { data: itemRows } = await admin
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", row.id)
    .order("sort_order");
  const items = (itemRows || []) as CrmBookingItem[];
  if (!carnetVisible(row, items)) return new NextResponse("Introuvable", { status: 404 });

  const visible = clientVisibleItems(items);
  const one = itemId === CALENDAR_STAY_KEY ? null : itemId;
  if (one && !visible.some((item) => item.id === one && itemHasCalendarDate(item))) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  const body = buildBookingIcs({
    booking: row,
    items: visible,
    itemId: one,
    subscription: true,
  });
  if (!body.includes("BEGIN:VEVENT")) return new NextResponse("Introuvable", { status: 404 });

  return new NextResponse(body, {
    headers: {
      ...icsHttpHeaders(icsFileName(row, one), { handoff: true }),
      "Cache-Control": "private, max-age=300",
    },
  });
}
