import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { Mb3mError } from "@/lib/crm/mb3m";
import { pushMb3mCustomer } from "@/lib/crm/mb3m-party";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase.from("crm_customers").select("id").eq("id", id).maybeSingle();
  if (error) return jsonError("Client introuvable", 500);
  if (!data) return jsonError("Client introuvable", 404);
  try {
    const result = await pushMb3mCustomer(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Mb3mError || err instanceof Error ? err.message : "La fiche MB3M n’a pas abouti.";
    return jsonError(message, 400);
  }
}
