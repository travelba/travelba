import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { LittleEmperorsError } from "@/lib/crm/little-emperors";
import { moveCarnetStep, moveSupplierReservation } from "@/lib/crm/le-reattach";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Aperçu ou déplacement d’une étape ou d’une réservation. Aucun message, aucun débit. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const kind = String(body?.kind || "");
  const shared = {
    dossierId: body?.dossier_id ? String(body.dossier_id) : null,
    dossierReference: body?.dossier_reference ? String(body.dossier_reference) : null,
    confirmer: body?.confirmer === true,
    accepterClient: body?.accepter_client === true,
    staffId: auth.staff.id,
  };
  try {
    const admin = createServiceClient();
    if (kind === "reservation") {
      return NextResponse.json(
        await moveSupplierReservation({ ...shared, reference: String(body?.reference || ""), fournisseur: body?.fournisseur ? String(body.fournisseur) : null }, { admin })
      );
    }
    if (kind === "etape") {
      return NextResponse.json(
        await moveCarnetStep({ ...shared, carteId: String(body?.carte_id || ""), sourceBookingId: id }, { admin })
      );
    }
    return jsonError("Déplacement inconnu.");
  } catch (err) {
    if (err instanceof LittleEmperorsError) return jsonError(err.message, err.status);
    const message = err instanceof Error ? err.message : "Déplacement impossible.";
    return jsonError(message, 500);
  }
}
