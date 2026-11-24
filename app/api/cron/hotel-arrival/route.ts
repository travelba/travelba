import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { purgeClientStayCards } from "@/lib/crm/card-link-run";
import { advanceDirectStays } from "@/lib/crm/hotel-direct-run";
import { runHotelArrivals } from "@/lib/crm/hotel-arrival-run";
import { mayDeliverHotelPayRequest } from "@/lib/crm/hotel-auto";
import { deliverAgencyNotice, flushHotelAutoNotices } from "@/lib/crm/hotel-auto-run";
import { refreshHotelDesk } from "@/lib/crm/hotel-desk-run";
import { createServiceClient } from "@/lib/supabase/admin";

/** Toutes les 30 minutes. Les fils d’hôtel sont déjà relus par l’ingestion Gmail. */
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const admin = createServiceClient();
  const result = await runHotelArrivals(admin, {
    deliverPayRequest: async (mail) => {
      if (
        !mayDeliverHotelPayRequest({
          to: mail.to,
          live: process.env.HOTEL_AUTO_PAY_LIVE === "1",
          testInbox: process.env.HOTEL_DIRECT_TEST_TO || null,
        })
      ) {
        return false;
      }
      return deliverAgencyNotice(mail);
    },
  });
  const notices = await flushHotelAutoNotices(admin, deliverAgencyNotice).catch(() => ({ sent: 0, failed: 0 }));
  const desk = await refreshHotelDesk(admin);
  // Photos de cartes clients : effacées après la fermeture de la carte du séjour (B-04).
  const purgedClientCards = await purgeClientStayCards(admin).catch(() => 0);
  const direct = await advanceDirectStays().catch(() => 0);
  return NextResponse.json({ ...result, desk, purgedClientCards, direct, notices });
}
