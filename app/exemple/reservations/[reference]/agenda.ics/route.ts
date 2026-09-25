import { NextResponse } from "next/server";
import { buildBookingIcs, icsFileName, icsHttpHeaders } from "@/lib/crm/calendar-ics";
import { carnetVisible } from "@/lib/crm/carnet";
import { EXAMPLE_REFERENCE, exampleSession, exampleSessionEnabled } from "@/lib/crm/example-session";

type Ctx = { params: Promise<{ reference: string }> };

export async function GET(request: Request, ctx: Ctx) {
  if (!exampleSessionEnabled()) return new NextResponse("Introuvable", { status: 404 });
  const { reference } = await ctx.params;
  if (reference !== EXAMPLE_REFERENCE) return new NextResponse("Introuvable", { status: 404 });
  const itemId = new URL(request.url).searchParams.get("item_id");
  const session = exampleSession();
  if (!carnetVisible(session.booking, session.items)) {
    return new NextResponse("Introuvable", { status: 404 });
  }
  const body = buildBookingIcs({ booking: session.booking, items: session.items, itemId });
  if (!body.includes("BEGIN:VEVENT")) {
    return new NextResponse("Aucune date à ajouter à l’agenda.", { status: 400 });
  }
  return new NextResponse(body, { headers: icsHttpHeaders(icsFileName(session.booking, itemId)) });
}
