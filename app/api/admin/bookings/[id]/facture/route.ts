import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { roleAllows } from "@/lib/crm/agency-access";
import { runInvoiceSend } from "@/lib/crm/invoice-run";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (!roleAllows(auth.staff.role, "message_client", null)) return jsonError("Cette action n’est pas ouverte pour votre rôle.", 403);
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase.from("crm_bookings").select("id").eq("id", id).maybeSingle();
  if (error) return dbError(error, 500);
  if (!data) return jsonError("Réservation introuvable", 404);
  try {
    const result = await runInvoiceSend(createServiceClient(), id, { confirmer: false }, {
      staffId: auth.staff.id,
      name: auth.staff.full_name?.trim() || "Agence",
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "La facture n’est pas lisible.";
    return jsonError(message, 400);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (!roleAllows(auth.staff.role, "message_client", null)) return jsonError("Cette action n’est pas ouverte pour votre rôle.", 403);
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase.from("crm_bookings").select("id").eq("id", id).maybeSingle();
  if (error) return dbError(error, 500);
  if (!data) return jsonError("Réservation introuvable", 404);
  const body = (await request.json().catch(() => null)) as {
    confirmer?: boolean;
    email?: boolean;
    whatsapp?: boolean;
    lien_stripe?: string | null;
    force?: boolean;
  } | null;
  try {
    const result = await runInvoiceSend(
      createServiceClient(),
      id,
      {
        confirmer: body?.confirmer === true,
        email: body?.email,
        whatsapp: body?.whatsapp,
        lienStripe: body && "lien_stripe" in body ? body.lien_stripe : undefined,
        force: body?.force === true,
      },
      { staffId: auth.staff.id, name: auth.staff.full_name?.trim() || "Agence" }
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "La facture n’a pas été envoyée.";
    return jsonError(message, 400);
  }
}
