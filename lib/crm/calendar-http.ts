import { NextResponse } from "next/server";
import {
  CALENDAR_STAY_KEY,
  buildBookingIcs,
  calendarResponsePlan,
  googleCalendarHref,
  icsFileName,
  icsHttpHeaders,
  originFromHeaders,
} from "@/lib/crm/calendar-ics";
import { webcalFeedUrl } from "@/lib/crm/calendar-feed";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

/** iPhone → app Calendrier. Android (une carte) → Google Agenda. Bureau → fichier .ics. */
export function calendarHttpResponse(opts: {
  request: Request;
  booking: CrmBooking;
  items: CrmBookingItem[];
  itemId?: string | null;
  allowPhoneFeed: boolean;
}) {
  const itemId = opts.itemId || null;
  const body = buildBookingIcs({ booking: opts.booking, items: opts.items, itemId });
  if (!body.includes("BEGIN:VEVENT")) {
    return new NextResponse("Aucune date à ajouter à l’agenda.", { status: 400 });
  }
  const item = itemId ? opts.items.find((row) => row.id === itemId) || null : null;
  const origin = originFromHeaders(opts.request.headers);
  const plan = calendarResponsePlan({
    ua: opts.request.headers.get("user-agent") || "",
    webcalHref: opts.allowPhoneFeed
      ? webcalFeedUrl(origin, opts.booking.reference, itemId || CALENDAR_STAY_KEY)
      : null,
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
