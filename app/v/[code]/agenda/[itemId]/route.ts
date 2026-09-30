import { NextResponse } from "next/server";
import { calendarHttpResponse } from "@/lib/crm/calendar-http";
import { calendarItemIdFromSegment } from "@/lib/crm/calendar-ics";
import { loadPublishedTripShare } from "@/lib/crm/trip-share-load";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string; itemId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { code, itemId: segment } = await ctx.params;
  const itemId = calendarItemIdFromSegment(segment);
  if (!itemId) return new NextResponse("Introuvable", { status: 404 });
  const trip = await loadPublishedTripShare(code);
  if (!trip) return new NextResponse("Introuvable", { status: 404 });
  if (!trip.items.some((row) => row.id === itemId)) {
    return new NextResponse("Introuvable", { status: 404 });
  }
  return calendarHttpResponse({
    request,
    booking: trip.booking,
    items: trip.items,
    itemId,
  });
}
