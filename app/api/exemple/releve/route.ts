import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { readExample } from "@/lib/crm/example-store";
import { statementExportName } from "@/lib/crm/statement-filename";
import { buildStatement, statementHolderLines } from "@/lib/crm/statement";
import { attachStatementTransfer } from "@/lib/crm/statement-wire";
import { renderStatementPdf } from "@/lib/crm/statement-pdf";
import { statementPdfResponse } from "@/lib/crm/statement-send";
import { customerFullName } from "@/lib/crm/types";

export const runtime = "nodejs";

function previewPdf() {
  if (!exampleSessionEnabled()) return jsonError("Introuvable", 404);
  const { ledger, customer } = readExample();
  return { ledger, customer };
}

export async function GET() {
  const preview = previewPdf();
  if (preview instanceof NextResponse) return preview;
  const issuedAt = new Date();
  const pdf = await renderStatementPdf(
    await attachStatementTransfer(
      buildStatement({
        view: preview.ledger,
        holderName: customerFullName(preview.customer),
        holderLines: statementHolderLines(preview.customer),
        issuedAt,
      })
    )
  );
  return statementPdfResponse(pdf, statementExportName(preview.customer, { issuedAt }));
}

export async function POST() {
  const preview = previewPdf();
  if (preview instanceof NextResponse) return preview;
  return NextResponse.json({
    ok: true,
    message: "Aperçu : aucun message n’est envoyé. Le relevé reste à télécharger.",
  });
}
