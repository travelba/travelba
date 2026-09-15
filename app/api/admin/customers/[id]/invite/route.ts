import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const service = createServiceClient();
  const { data: customer } = await service.from("crm_customers").select("id,email,auth_user_id").eq("id", id).maybeSingle();
  if (!customer) return jsonError("Client introuvable", 404);
  if (customer.auth_user_id) return jsonError("Le portail est déjà activé pour ce client", 409);
  const origin = new URL(request.url).origin;
  const { data, error } = await service.auth.admin.inviteUserByEmail(customer.email, { redirectTo: `${origin}/auth/callback?next=/mon-compte` });
  if (error || !data.user) return jsonError(error?.message || "Invitation impossible", 400);
  const { error: updateError } = await service.from("crm_customers").update({ auth_user_id: data.user.id }).eq("id", id).is("auth_user_id", null);
  if (updateError) return jsonError(updateError.message, 400);
  await service.from("crm_audit_events").insert({ actor_user_id: auth.user.id, actor_staff_id: auth.staff.id, customer_id: id, entity_type: "customer", entity_id: id, action: "portal_invited" });
  return NextResponse.json({ ok: true });
}
