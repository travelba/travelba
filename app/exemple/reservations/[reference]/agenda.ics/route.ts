import { NextResponse } from "next/server";
import { calendarHttpResponse } from "@/lib/crm/calendar-http";
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
  return calendarHttpResponse({
    request,
    booking: session.booking,
    items: session.items,
    itemId,
  });
}
