import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { appOrigin } from "@/lib/crm/invite";
import { mustSetPassword } from "@/lib/crm/session";
import { sendSpaceAccessWhatsapp } from "@/lib/crm/space-access";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Renvoie le lien d’accès (magique, par WhatsApp) quand le mot de passe est déjà enregistré. Ne le repose pas. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const admin = createServiceClient();
  const { data: customer } = await admin
    .from("crm_customers")
    .select("id, email, phone, first_name, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!customer?.id || !customer.auth_user_id || !customer.email) {
    return jsonError("Client introuvable", 404);
  }

  const { data: staffRow } = await admin
    .from("crm_staff")
    .select("id")
    .eq("auth_user_id", customer.auth_user_id)
    .maybeSingle();
  if (staffRow) return jsonError("Réservé à un client", 403);

  const { data: userWrap } = await admin.auth.admin.getUserById(customer.auth_user_id);
  if (!userWrap.user || mustSetPassword(userWrap.user)) {
    return jsonError("Le mot de passe n’est pas encore défini : renvoyez l’invitation.", 409);
  }
  if (!customer.phone?.trim()) {
    return jsonError("Ajoutez un téléphone à la fiche : le lien d’accès part par WhatsApp.", 409);
  }

  const result = await sendSpaceAccessWhatsapp({
    customerId: customer.id,
    email: customer.email,
    phone: customer.phone,
    firstName: customer.first_name,
    origin: appOrigin(request),
    repeat: true,
  });
  if (result !== "sent") return jsonError("Message WhatsApp non envoyé. Réessayez dans un instant.", 502);
  return NextResponse.json({ ok: true });
}
