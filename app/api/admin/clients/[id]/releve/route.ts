import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { customerStatementPdf, sendAccountStatement } from "@/lib/crm/statement-dispatch";
import { statementPdfResponse } from "@/lib/crm/statement-send";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const loaded = await customerStatementPdf(auth.supabase, id, "staff");
  if (!loaded.ok) return jsonError(loaded.message, loaded.httpStatus);
  return statementPdfResponse(loaded.pdf);
}

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const result = await sendAccountStatement({
    supabase: auth.supabase,
    customerId: id,
    audience: "staff",
    actor: { kind: "staff", staffId: auth.staff.id },
  });
  if (!result.ok) return jsonError(result.message, result.httpStatus);
  return NextResponse.json({ ok: true, message: result.message });
}
