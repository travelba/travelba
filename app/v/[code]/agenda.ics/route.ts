import { NextResponse } from "next/server";
import { buildBookingIcs, icsFileName, icsHttpHeaders } from "@/lib/crm/calendar-ics";
import { loadPublishedTripShare } from "@/lib/crm/trip-share-load";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const trip = await loadPublishedTripShare(code);
  if (!trip) return new NextResponse("Introuvable", { status: 404 });
  const itemId = new URL(request.url).searchParams.get("item_id");
  const body = buildBookingIcs({ booking: trip.booking, items: trip.items, itemId });
  if (!body.includes("BEGIN:VEVENT")) {
    return new NextResponse("Aucune date à ajouter à l’agenda.", { status: 400 });
  }
  return new NextResponse(body, {
    headers: icsHttpHeaders(icsFileName(trip.booking, itemId)),
  });
}
