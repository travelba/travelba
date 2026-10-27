import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { parseOnlineCheckinStatus } from "@/lib/crm/online-checkin";
import { saveCheckinStatus } from "@/lib/crm/online-checkin-db";

type Ctx = { params: Promise<{ id: string }> };

/** L’agence marque l’enregistrement d’un vol. L’auteur est l’agence. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { carte_id?: unknown; statut?: unknown } | null;
  const requested = parseOnlineCheckinStatus(body?.statut);
  const itemId = typeof body?.carte_id === "string" ? body.carte_id.trim() : "";
  if (!requested) return jsonError("Statut inconnu.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
    return jsonError("Vol introuvable.");
  }
  const saved = await saveCheckinStatus(auth.supabase, {
    bookingId: id,
    itemId,
    requested,
    actor: "agence",
    actorId: auth.staff.id,
  });
  if (!saved.ok) return jsonError(saved.error, 400);
  const line = saved.lines.find((row) => row.itemId === itemId);
  return NextResponse.json({
    ok: true,
    statut: line?.status || saved.write.status,
    libelle: line?.label || null,
    par: "Agence",
  });
}
