import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { loadClientLedger } from "@/lib/crm/client-ledger";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey } from "@/lib/crm/rate-limit";
import { buildStatement, statementHolderLines } from "@/lib/crm/statement";
import { renderStatementPdf } from "@/lib/crm/statement-pdf";
import { deliverStatementWhatsapp, statementPdfResponse, statementSendResponse } from "@/lib/crm/statement-send";
import { customerFullName } from "@/lib/crm/types";

export const runtime = "nodejs";

async function statementPdf(auth: Exclude<Awaited<ReturnType<typeof requireCustomer>>, NextResponse>) {
  const view = await loadClientLedger(auth.supabase, auth.customer, "client");
  const pdf = await renderStatementPdf(
    buildStatement({
      view,
      holderName: customerFullName(auth.customer),
      holderLines: statementHolderLines(auth.customer),
      issuedAt: new Date(),
    })
  );
  return { view, pdf };
}

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { pdf } = await statementPdf(auth);
  return statementPdfResponse(pdf);
}

export async function POST() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const allowed = await rateLimit({
    key: rateLimitKey("releve:whatsapp", auth.customer.id),
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!allowed) return jsonError(RATE_LIMITED_MESSAGE, 429);
  const { view, pdf } = await statementPdf(auth);
  return statementSendResponse(
    await deliverStatementWhatsapp({
      customerId: auth.customer.id,
      phone: auth.customer.phone,
      firstName: auth.customer.first_name,
      member: view.member,
      pdf,
      audience: "client",
    })
  );
}
