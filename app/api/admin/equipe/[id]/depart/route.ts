import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/crm/ids";
import { loadAssignableColleagues } from "@/lib/crm/dossier-responsables";
import { countOwnedBookings, departColleague } from "@/lib/crm/staff-departure";
import { StaffTeamError } from "@/lib/crm/staff-directory";
import { STAFF_COPY } from "@/lib/crm/staff-team";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Dossiers en charge du collègue et les collègues qui peuvent les reprendre. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(STAFF_COPY.notFound, 404);
  const admin = createServiceClient({ allowPreview: true });
  const [owned, colleagues] = await Promise.all([countOwnedBookings(admin, id), loadAssignableColleagues(admin)]);
  return NextResponse.json({
    owned,
    colleagues: colleagues.filter((row) => row.id !== id).map((row) => ({ id: row.id, name: row.name })),
  });
}

/**
 * `{ couper: true, reassign_to: uuid | null }`. Couper ferme l’accès et les sessions ; `reassign_to`
 * donne ses dossiers en charge à un collègue (null : ils restent à prendre). Chaque geste est journalisé.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(STAFF_COPY.notFound, 404);
  const body = (await request.json().catch(() => null)) as { couper?: unknown; reassign_to?: unknown } | null;
  const reassignTo = typeof body?.reassign_to === "string" && body.reassign_to ? body.reassign_to : null;
  if (reassignTo && !isUuid(reassignTo)) return jsonError("Collègue introuvable.");
  const cutAccess = body?.couper === true;
  if (!cutAccess && !reassignTo) return jsonError("Choisissez un geste : couper l’accès ou réattribuer les dossiers.");
  const admin = createServiceClient({ allowPreview: true });
  if (reassignTo) {
    const colleagues = await loadAssignableColleagues(admin);
    if (!colleagues.some((row) => row.id === reassignTo)) return jsonError("Ce collègue ne peut pas être en charge.");
  }
  try {
    const result = await departColleague(admin, { staffId: id, actorId: auth.staff.id, reassignTo, cutAccess });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof StaffTeamError) return jsonError(err.message, err.status);
    console.error("[equipe/depart] échec");
    return jsonError("Opération impossible. Réessayez.", 500);
  }
}
