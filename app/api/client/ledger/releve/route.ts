import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { loadClientLedger } from "@/lib/crm/client-ledger-load";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey } from "@/lib/crm/rate-limit";
import { statementExportName } from "@/lib/crm/statement-filename";
import { buildStatement, statementHolderLines } from "@/lib/crm/statement";
import { attachStatementTransfer } from "@/lib/crm/statement-wire";
import { renderStatementPdf } from "@/lib/crm/statement-pdf";
import { deliverStatementWhatsapp, statementPdfResponse, statementSendResponse } from "@/lib/crm/statement-send";
import { customerFullName } from "@/lib/crm/types";
import { clientHidesPrices } from "@/lib/crm/client-price-privacy";

export const runtime = "nodejs";

async function statementPdf(auth: Exclude<Awaited<ReturnType<typeof requireCustomer>>, NextResponse>) {
  const issuedAt = new Date();
  const view = await loadClientLedger(auth.supabase, auth.customer, "client");
  const pdf = await renderStatementPdf(
    await attachStatementTransfer(
      buildStatement({
        view,
        holderName: customerFullName(auth.customer),
        holderLines: statementHolderLines(auth.customer),
        issuedAt,
      })
    )
  );
  return { view, pdf, filename: statementExportName(auth.customer, { issuedAt }) };
}

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (clientHidesPrices(auth.customer)) return jsonError("Le relevé n’est pas disponible.", 404);
  const { pdf, filename } = await statementPdf(auth);
  return statementPdfResponse(pdf, filename);
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
  if (clientHidesPrices(auth.customer)) return jsonError("Le relevé n’est pas disponible.", 404);
  const { view, pdf, filename } = await statementPdf(auth);
  return statementSendResponse(
    await deliverStatementWhatsapp({
      customerId: auth.customer.id,
      phone: auth.customer.phone,
      firstName: auth.customer.first_name,
      member: view.member,
      pdf,
      filename,
      audience: "client",
      optOutAt: auth.customer.whatsapp_opt_out_at,
    })
  );
}
