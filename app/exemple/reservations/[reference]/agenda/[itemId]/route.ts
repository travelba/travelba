import { NextResponse } from "next/server";
import { calendarHttpResponse } from "@/lib/crm/calendar-http";
import { calendarItemIdFromSegment } from "@/lib/crm/calendar-ics";
import { carnetVisible } from "@/lib/crm/carnet";
import { EXAMPLE_REFERENCE, exampleSession, exampleSessionEnabled } from "@/lib/crm/example-session";

type Ctx = { params: Promise<{ reference: string; itemId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  if (!exampleSessionEnabled()) return new NextResponse("Introuvable", { status: 404 });
  const { reference, itemId: segment } = await ctx.params;
  if (reference !== EXAMPLE_REFERENCE) return new NextResponse("Introuvable", { status: 404 });
  const itemId = calendarItemIdFromSegment(segment);
  if (!itemId) return new NextResponse("Introuvable", { status: 404 });
  const session = exampleSession();
  if (!carnetVisible(session.booking, session.items)) {
    return new NextResponse("Introuvable", { status: 404 });
  }
  if (!session.items.some((row) => row.id === itemId)) {
    return new NextResponse("Introuvable", { status: 404 });
  }
  return calendarHttpResponse({
    request,
    booking: session.booking,
    items: session.items,
    itemId,
  });
}
