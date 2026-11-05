import { NextResponse } from "next/server";
import {
  buildBookingIcs,
  calendarClearDownloadCookie,
  calendarDownloadRequested,
  calendarResponsePlan,
  googleCalendarHref,
  icsFileName,
  icsHttpHeaders,
} from "@/lib/crm/calendar-ics";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

/** Android (une carte) : Google Agenda crée l’événement. iPhone et bureau : fichier .ics, un ou plusieurs événements, sans flux. Le nom de fichier est toujours là : sans lui, iOS affiche le texte brut. L’écran d’accueil iOS pose `tb_ics_dl` pour recevoir le fichier en pièce jointe. */
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
  const forced = calendarDownloadRequested(opts.request.headers.get("cookie"));
  const response = new NextResponse(body, {
    headers: icsHttpHeaders(icsFileName(opts.booking, itemId), {
      disposition: forced ? "attachment" : plan.disposition,
    }),
  });
  if (forced) {
    const secure = new URL(opts.request.url).protocol === "https:";
    response.headers.append("Set-Cookie", calendarClearDownloadCookie(secure));
  }
  return response;
}
