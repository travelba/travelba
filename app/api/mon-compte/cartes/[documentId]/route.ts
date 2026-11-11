import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { parseBoardingPassPages } from "@/lib/crm/boarding-pass-link";
import { pdfPageCount, slicePdfPages } from "@/lib/crm/boarding-pass-pdf";
import { boardingPassDownloadHeaders, isBoardingPassFile } from "@/lib/crm/boarding-pass-whatsapp";
import { clientTripOwnerIds } from "@/lib/crm/company-peers";
import { downloadCrmFile } from "@/lib/crm/files";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Carte d’embarquement du séjour du client, même si la pièce est restée cachée.
 * Une page demandée ne renvoie que cette page. Sans page, un PDF de plusieurs pages est refusé.
 */
export async function GET(request: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return jsonError("Document introuvable", 404);
  const client = await requireCustomer();
  if (client instanceof NextResponse) return client;

  const pageRaw = new URL(request.url).searchParams.get("page");
  const pages = pageRaw ? parseBoardingPassPages(pageRaw) : null;
  if (pageRaw && !pages) return jsonError("Document introuvable", 404);

  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_booking_documents")
      .select("id, booking_id, kind, mime_type, file_name, storage_path")
      .eq("id", documentId)
      .maybeSingle();
    const storage = String(data?.storage_path || "");
    if (!data || !isBoardingPassFile(data) || !storage) return jsonError("Document introuvable", 404);

    const owners = await clientTripOwnerIds(client.customer);
    const { data: booking } = await admin
      .from("crm_bookings")
      .select("id, customer_id, visible_to_client, archived_at")
      .eq("id", data.booking_id)
      .maybeSingle();
    if (!booking || !owners.includes(String(booking.customer_id || ""))) return jsonError("Document introuvable", 404);
    if (!booking.visible_to_client || booking.archived_at) return jsonError("Document introuvable", 404);

    const downloaded = await downloadCrmFile(storage);
    const type = downloaded.contentType.toLowerCase();
    if (!type.includes("pdf") && !storage.toLowerCase().endsWith(".pdf")) {
      return jsonError("Document introuvable", 404);
    }
    if (!pages) {
      const count = await pdfPageCount(downloaded.bytes);
      if (count !== 1) return jsonError("Document introuvable", 404);
    }
    const bytes = pages ? await slicePdfPages(downloaded.bytes, pages) : downloaded.bytes;
    if (!bytes) return jsonError("Document introuvable", 404);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: boardingPassDownloadHeaders("Carte embarquement.pdf", "inline"),
    });
  } catch {
    return jsonError("Document introuvable", 404);
  }
}
