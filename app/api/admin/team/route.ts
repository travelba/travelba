import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";

function requireAdminRole(auth: Exclude<Awaited<ReturnType<typeof requireStaff>>, NextResponse>) {
  return auth.staff.role === "admin" ? null : jsonError("Action réservée aux administrateurs", 403);
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdminRole(auth);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const fullName = String(body?.full_name || "").trim();
  const role = body?.role === "admin" ? "admin" : "agent";
  if (!email || !fullName) return jsonError("Nom et e-mail requis");

  const service = createServiceClient();
  const origin = new URL(request.url).origin;
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/admin/login`,
    data: { full_name: fullName },
  });
  if (error || !data.user) return jsonError(error?.message || "Invitation impossible", 400);
  const { data: staff, error: insertError } = await service
    .from("crm_staff")
    .upsert({ auth_user_id: data.user.id, full_name: fullName, role, active: true }, { onConflict: "auth_user_id" })
    .select("*")
    .single();
  if (insertError) return jsonError(insertError.message, 400);
  await service.from("crm_audit_events").insert({ actor_user_id: auth.user.id, actor_staff_id: auth.staff.id, entity_type: "staff", entity_id: staff.id, action: "invited", metadata: { role } });
  return NextResponse.json({ staff });
}

export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdminRole(auth);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return jsonError("id requis");
  if (id === auth.staff.id && body?.active === false) return jsonError("Vous ne pouvez pas désactiver votre propre compte", 409);
  const payload = {
    ...(body?.role === "admin" || body?.role === "agent" ? { role: body.role } : {}),
    ...(typeof body?.active === "boolean" ? { active: body.active } : {}),
    ...(body?.permissions && typeof body.permissions === "object" ? { permissions: body.permissions } : {}),
  };
  const service = createServiceClient();
  const { data, error } = await service.from("crm_staff").update(payload).eq("id", id).select("*").single();
  if (error) return jsonError(error.message, 400);
  await service.from("crm_audit_events").insert({ actor_user_id: auth.user.id, actor_staff_id: auth.staff.id, entity_type: "staff", entity_id: id, action: "permissions_updated", metadata: payload });
  return NextResponse.json({ staff: data });
}
