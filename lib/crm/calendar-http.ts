import { NextResponse } from "next/server";
import {
  buildBookingIcs,
  calendarResponsePlan,
  googleCalendarHref,
  icsFileName,
  icsHttpHeaders,
} from "@/lib/crm/calendar-ics";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

/** Android (une carte) : Google Agenda crée l’événement. iPhone et bureau : fichier .ics, un ou plusieurs événements, sans flux. */
export function calendarHttpResponse(opts: {
  request: Request;
  booking: CrmBooking;
  items: CrmBookingItem[];
  itemId?: string | null;
}) {
  const itemId = opts.itemId || null;
  const body = buildBookingIcs({ booking: opts.booking, items: opts.items, itemId });
  if (!body.includes("BEGIN:VEVENT")) {
    return new NextResponse("Aucune date à ajouter à l’agenda.", { status: 400 });
  }
  const item = itemId ? opts.items.find((row) => row.id === itemId) || null : null;
  const plan = calendarResponsePlan({
    ua: opts.request.headers.get("user-agent") || "",
    googleHref: item ? googleCalendarHref(item, opts.booking) : null,
  });
  if (plan.kind === "redirect") {
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: plan.url,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return new NextResponse(body, {
    headers: icsHttpHeaders(icsFileName(opts.booking, itemId), { handoff: plan.handoff }),
  });
}
