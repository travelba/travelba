import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { parseBoardingPassPages } from "@/lib/crm/boarding-pass-link";
import { pdfPageCount, slicePdfPages } from "@/lib/crm/boarding-pass-pdf";
import { boardingPassDownloadHeaders, isBoardingPassFile } from "@/lib/crm/boarding-pass-whatsapp";
import { visibleClientBooking } from "@/lib/crm/client-boarding-pass-load";
import { downloadCrmFile } from "@/lib/crm/files";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Carte d’embarquement du séjour du client, même si la pièce est restée cachée.
 * Une page demandée ne renvoie que cette page.
 * Sans page, un PDF de plusieurs pages est refusé, sauf ?complet=1 (le fichier entier du séjour).
 */
export async function GET(request: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return jsonError("Document introuvable", 404);
  const client = await requireCustomer();
  if (client instanceof NextResponse) return client;

  const url = new URL(request.url);
  const pageRaw = url.searchParams.get("page");
  const pages = pageRaw ? parseBoardingPassPages(pageRaw) : null;
  if (pageRaw && !pages) return jsonError("Document introuvable", 404);
  const complet = url.searchParams.get("complet") === "1";
  const download = url.searchParams.get("download") === "1";

  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_booking_documents")
      .select("id, booking_id, kind, mime_type, file_name, storage_path")
      .eq("id", documentId)
      .maybeSingle();
    const storage = String(data?.storage_path || "");
    if (!data || !isBoardingPassFile(data) || !storage) return jsonError("Document introuvable", 404);

    const booking = await visibleClientBooking(client.customer, String(data.booking_id || ""));
    if (!booking) return jsonError("Document introuvable", 404);

    const downloaded = await downloadCrmFile(storage);
    const type = downloaded.contentType.toLowerCase();
    if (!type.includes("pdf") && !storage.toLowerCase().endsWith(".pdf")) {
      return jsonError("Document introuvable", 404);
    }
    if (!pages && !complet) {
      const count = await pdfPageCount(downloaded.bytes);
      if (count !== 1) return jsonError("Document introuvable", 404);
    }
    const bytes = pages ? await slicePdfPages(downloaded.bytes, pages) : downloaded.bytes;
    if (!bytes) return jsonError("Document introuvable", 404);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: boardingPassDownloadHeaders("Carte embarquement.pdf", download ? "attachment" : "inline"),
    });
  } catch {
    return jsonError("Document introuvable", 404);
  }
}
