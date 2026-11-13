import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { Mb3mError } from "@/lib/crm/mb3m";
import { pushMb3mCompany, pushMb3mCustomer } from "@/lib/crm/mb3m-party";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase.from("crm_customers").select("id").eq("id", id).maybeSingle();
  if (error) return jsonError("Client introuvable", 500);
  if (!data) return jsonError("Client introuvable", 404);
  const body = (await request.json().catch(() => null)) as { company_id?: unknown; person_only?: unknown } | null;
  const companyId = typeof body?.company_id === "string" ? body.company_id.trim() : "";
  if (companyId && !UUID.test(companyId)) return jsonError("Société introuvable.", 400);
  try {
    const result = companyId
      ? await pushMb3mCompany(id, companyId)
      : await pushMb3mCustomer(id, { companies: body?.person_only === true ? false : undefined });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Mb3mError || err instanceof Error ? err.message : "La fiche MB3M n’a pas abouti.";
    return jsonError(message, 400);
  }
}
