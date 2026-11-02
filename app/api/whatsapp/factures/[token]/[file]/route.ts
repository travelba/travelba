import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { downloadCrmFile } from "@/lib/crm/files";
import { INVOICE_MEDIA_FILE, invoiceObjectPath, verifyInvoiceToken } from "@/lib/crm/invoice-link";
import { renderInvoicePdf } from "@/lib/crm/invoice-pdf";

export const runtime = "nodejs";

function pdfResponse(bytes: Uint8Array, filename: string) {
  const safe = filename.replace(/["\\\r\n]/g, "").slice(0, 180);
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** PDF de facture joignable par WhatsApp. Le jeton expire. L’exemple n’a pas de client. */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await ctx.params;
  let filename = file;
  try {
    filename = decodeURIComponent(file);
  } catch {
    return jsonError("Document introuvable", 404);
  }
  if (filename !== INVOICE_MEDIA_FILE) return jsonError("Document introuvable", 404);
  if (token === "exemple") {
    const pdf = await renderInvoicePdf({
      number: "EXEMPLE",
      reference: "TB-EXEMPLE",
      title: "Séjour exemple",
      dates: "",
      billTo: ["Camille Exemple"],
      lines: [{ label: "Séjour", amount: 0 }],
    });
    return pdfResponse(pdf, "Facture-pro-forma-EXEMPLE.pdf");
  }
  const verified = verifyInvoiceToken(token);
  if (!verified) return jsonError("Document introuvable", 404);
  const storage = invoiceObjectPath(verified.customerId, verified.bookingId);
  if (!storage) return jsonError("Document introuvable", 404);
  try {
    const downloaded = await downloadCrmFile(storage);
    const head = Buffer.from(downloaded.bytes.subarray(0, 5)).toString("utf8");
    if (!downloaded.contentType.toLowerCase().includes("pdf") && head !== "%PDF-") {
      return jsonError("Document introuvable", 404);
    }
    return pdfResponse(downloaded.bytes, "Facture-pro-forma.pdf");
  } catch {
    return jsonError("Document introuvable", 404);
  }
}
