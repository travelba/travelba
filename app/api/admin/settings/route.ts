import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";

const ALLOWED_KEYS = new Set(["agency_identity", "email_templates", "client_preferences"]);

export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (auth.staff.role !== "admin") return jsonError("Action réservée aux administrateurs", 403);
  const body = await request.json().catch(() => null);
  const key = String(body?.key || "");
  if (!ALLOWED_KEYS.has(key) || !body?.value || typeof body.value !== "object") return jsonError("Paramètre invalide");
  const { data, error } = await auth.supabase
    .from("crm_agency_settings")
    .upsert({ key, label: String(body.label || key), value: body.value, updated_by: auth.staff.id })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  await createServiceClient().from("crm_audit_events").insert({ actor_user_id: auth.user.id, actor_staff_id: auth.staff.id, entity_type: "settings", entity_id: key, action: "updated" });
  return NextResponse.json({ setting: data });
}
