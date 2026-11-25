import { NextResponse } from "next/server";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { isUuid } from "@/lib/crm/ids";
import { isInheritedTicketingFee } from "@/lib/crm/ticketing-review";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = await assertStaffPermission(auth.staff, "edit_dossiers");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const itemId = typeof body?.item_id === "string" ? body.item_id : "";
  if (body?.action !== "garder") return jsonError("Action inconnue.");
  if (!isUuid(itemId)) return jsonError("Ligne introuvable.", 404);
  const { data: item, error } = await auth.supabase
    .from("crm_booking_items")
    .select("id, kind, details, lifecycle")
    .eq("id", itemId)
    .maybeSingle();
  if (error) return jsonError("Ligne introuvable.", 404);
  if (!item || !isInheritedTicketingFee(item)) return jsonError("Cette ligne n’est pas un frais de billeterie automatique.");
  const details = { ...(item.details || {}), fee_kept: true };
  const { error: writeError } = await auth.supabase.from("crm_booking_items").update({ details }).eq("id", itemId);
  if (writeError) return jsonError("Enregistrement impossible.", 400);
  return NextResponse.json({ ok: true, conserve: true });
}
