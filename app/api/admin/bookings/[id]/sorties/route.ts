import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { TRIP_PROPOSAL_WAIT_MS, type OutgoingLine } from "@/lib/crm/trip-costs";
import { loadOutgoingQueue } from "@/lib/crm/trip-costs-db";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const BOOKING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sorties proposées pour un dossier. Lecture seule : la file Pliant et Revolut déjà en base,
 * et le calcul des rapprochements. Aucun appel au fournisseur, aucune écriture.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!BOOKING_ID.test(id)) return jsonError("Dossier introuvable.", 404);

  const result = await Promise.race([
    loadOutgoingQueue({ bookingId: id }, createServiceClient())
      .then((proposed) => ({ ok: true as const, proposed }))
      .catch((error: unknown) => {
        console.error("[sorties]", error instanceof Error ? error.message : error);
        return { ok: false as const, expired: false };
      }),
    new Promise<{ ok: false; expired: true }>((resolve) => {
      setTimeout(() => resolve({ ok: false, expired: true }), TRIP_PROPOSAL_WAIT_MS);
    }),
  ]);
  if (!result.ok) {
    return jsonError(
      result.expired ? "La recherche des paiements a expiré." : "La recherche des paiements n’a pas abouti.",
      result.expired ? 504 : 500
    );
  }
  const proposed: OutgoingLine[] = result.proposed;
  return NextResponse.json({ proposed });
}
