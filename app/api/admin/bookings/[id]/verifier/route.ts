import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { clearBookingCardReview } from "@/lib/crm/clear-card-review";
import { isUuid } from "@/lib/crm/ids";
import { verifiedJournalSummary } from "@/lib/crm/review-doubt";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Lève la lecture douteuse. `tout` : toutes les cartes marquées du dossier.
 * `carte_ids` : une ou plusieurs cartes. La visibilité ne change pas. Aucun message.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Dossier introuvable.", 404);
  const body = (await request.json().catch(() => null)) as { tout?: unknown; carte_ids?: unknown } | null;
  const tout = body?.tout === true;
  const ids = Array.isArray(body?.carte_ids)
    ? body.carte_ids.map((value) => String(value || "")).filter((value) => isUuid(value))
    : [];
  if (!tout && !ids.length) return jsonError("Indiquez une carte ou tout le dossier.");
  const cleared = await clearBookingCardReview(auth.supabase, id, tout ? null : ids);
  if ("error" in cleared) return jsonError(cleared.error, cleared.status);
  if (cleared.cartes.length) {
    await recordAgencyJournal({
      staffId: auth.staff.id,
      action: "update",
      entityType: "dossier",
      entityId: id,
      summary: verifiedJournalSummary(cleared.cartes.map((row) => row.titre)),
      diff: { cartes: cleared.cartes.map((row) => ({ id: row.id, titre: row.titre })) },
      path: `/api/admin/bookings/${id}/verifier`,
    });
  }
  revalidatePath(`/admin/reservations/${id}`);
  return NextResponse.json({ ok: true, cartes: cleared.cartes });
}
