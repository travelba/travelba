import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { boardingSegments } from "@/lib/crm/boarding-pass-groups";
import { clientBoardingView, scopeBoardingOffer } from "@/lib/crm/client-boarding-pass";
import { loadClientBoardingOffer, visibleClientBookingByReference } from "@/lib/crm/client-boarding-pass-load";
import { groupedBoardingPasses } from "@/lib/crm/preview-files";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Cartes d’embarquement du séjour, une par passager, plus le PDF entier s’il a plusieurs pages.
 * La lecture du PDF attend le clic : elle ne bloque pas la page.
 * Même accès que /api/mon-compte/cartes : séjour visible du client, cartes seulement.
 */
export async function GET(request: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const client = await requireCustomer();
  if (client instanceof NextResponse) return client;

  const booking = await visibleClientBookingByReference(client.customer, reference);
  if (!booking) return jsonError("Introuvable", 404);

  const vols = [...new URL(request.url).searchParams.getAll("vol")].filter((id) =>
    /^[0-9a-f-]{36}$/i.test(id)
  );
  try {
    const bundle = await loadClientBoardingOffer(booking.id);
    const segments = boardingSegments(bundle.flights, { clientVisible: true });
    const offer = scopeBoardingOffer(bundle.offer, vols);
    const groups = groupedBoardingPasses({
      cards: offer.cards,
      full: offer.full,
      segments,
      travelers: bundle.travelers,
    });
    return NextResponse.json({
      ...clientBoardingView(offer),
      groups,
      foldPast: vols.length === 0,
    });
  } catch {
    return jsonError("Introuvable", 404);
  }
}
