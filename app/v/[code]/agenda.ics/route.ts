import { NextResponse } from "next/server";
import { calendarHttpResponse } from "@/lib/crm/calendar-http";
import { loadPublishedTripShare } from "@/lib/crm/trip-share-load";
import { publishedTripForCode } from "@/lib/crm/trip-share-example";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const trip = await publishedTripForCode(code, loadPublishedTripShare);
  if (!trip) return new NextResponse("Introuvable", { status: 404 });
  const itemId = new URL(request.url).searchParams.get("item_id");
  return calendarHttpResponse({
    request,
    booking: trip.booking,
    items: trip.items,
    itemId,
  });
}
