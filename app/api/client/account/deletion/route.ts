import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { requestAccountDeletion } from "@/lib/crm/account-deletion";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/desk-mode";
import { customerFullName } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Enregistre une demande de suppression. Ne retire aucun séjour. */
export async function POST() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const jar = await cookies();
  if (deskBypass(jar.get(DESK_COOKIE)?.value, auth.user.id)) {
    return jsonError("Cette demande se fait depuis le compte du client.", 403);
  }
  const result = await requestAccountDeletion({
    admin: createServiceClient(),
    customerId: auth.customer.id,
    authUserId: auth.user.id,
    name: customerFullName(auth.customer),
    email: auth.customer.email || "",
  });
  if (!result.ok) return jsonError(result.error);
  return NextResponse.json({ ok: true, already: result.already });
}
