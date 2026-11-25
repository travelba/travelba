import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { staffAllows } from "@/lib/crm/agency-guard";
import { setCustomerTwin, TwinLinkError } from "@/lib/crm/customer-twins";
import { isUuid } from "@/lib/crm/ids";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Lie ou délie un compte jumeau. Sans confirmer : aperçu. Aucun message au client. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (!(await staffAllows(auth.staff, "edit_dossiers"))) {
    return jsonError("Cette action n’est pas ouverte pour votre rôle.", 403);
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Fiche introuvable.", 404);
  const body = (await request.json().catch(() => null)) as {
    jumeau_id?: unknown;
    action?: unknown;
    confirmer?: unknown;
  } | null;
  const twinId = typeof body?.jumeau_id === "string" ? body.jumeau_id : "";
  const action = body?.action === "delier" ? "delier" : "lier";
  try {
    const result = await setCustomerTwin(createServiceClient(), {
      clientId: id,
      twinId,
      action,
      confirmer: body?.confirmer === true,
      staff: { id: auth.staff.id, name: auth.staff.full_name || "Agence", path: `/admin/clients/${id}` },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TwinLinkError) return jsonError(error.message, 400);
    console.error("[crm] compte jumeau", error instanceof Error ? error.message : "error");
    return jsonError("Le jumelage n’a pas abouti.", 500);
  }
}
