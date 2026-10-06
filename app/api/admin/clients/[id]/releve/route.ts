import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { loadClientLedger } from "@/lib/crm/client-ledger";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey } from "@/lib/crm/rate-limit";
import { buildStatement, STATEMENT_CUSTOMER_COLUMNS, statementHolderLines } from "@/lib/crm/statement";
import { renderStatementPdf } from "@/lib/crm/statement-pdf";
import { deliverStatementWhatsapp, statementPdfResponse, statementSendResponse } from "@/lib/crm/statement-send";
import { customerFullName, type CrmCustomer } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const CUSTOMER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadProfile(ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!CUSTOMER_ID.test(id)) return jsonError("Client introuvable", 404);
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .select(STATEMENT_CUSTOMER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return dbError(error, 500);
  if (!data) return jsonError("Client introuvable", 404);
  const customer = data as CrmCustomer;
  const view = await loadClientLedger(auth.supabase, customer, "staff");
  const pdf = await renderStatementPdf(
    buildStatement({
      view,
      holderName: customerFullName(customer),
      holderLines: statementHolderLines(customer),
      issuedAt: new Date(),
    })
  );
  return { customer, view, pdf };
}

export async function GET(_request: Request, ctx: Ctx) {
  const loaded = await loadProfile(ctx);
  if (loaded instanceof NextResponse) return loaded;
  return statementPdfResponse(loaded.pdf);
}

export async function POST(_request: Request, ctx: Ctx) {
  const loaded = await loadProfile(ctx);
  if (loaded instanceof NextResponse) return loaded;
  const allowed = await rateLimit({
    key: rateLimitKey("releve:whatsapp", loaded.customer.id),
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!allowed) return jsonError(RATE_LIMITED_MESSAGE, 429);
  return statementSendResponse(
    await deliverStatementWhatsapp({
      customerId: loaded.customer.id,
      phone: loaded.customer.phone,
      firstName: loaded.customer.first_name,
      member: loaded.view.member,
      pdf: loaded.pdf,
      audience: "staff",
    })
  );
}
