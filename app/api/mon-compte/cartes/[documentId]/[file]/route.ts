import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { walletPassDownloadHeaders } from "@/lib/crm/boarding-pass-whatsapp";
import { visibleClientBooking } from "@/lib/crm/client-boarding-pass-load";
import { downloadCrmFile } from "@/lib/crm/files";
import { isBoardingPassDocument } from "@/lib/crm/online-checkin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Passe Apple Wallet déjà signé par la compagnie, servi tel quel.
 * Même accès que la page PDF : séjour visible du client, pièce de type carte d’embarquement.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ documentId: string; file: string }> }) {
  const { documentId, file } = await ctx.params;
  let filename = file;
  try {
    filename = decodeURIComponent(file);
  } catch {
    return jsonError("Document introuvable", 404);
  }
  if (!/^[0-9a-f-]{36}$/i.test(documentId) || filename.toLowerCase() !== "passe.pkpass") {
    return jsonError("Document introuvable", 404);
  }
  const client = await requireCustomer();
  if (client instanceof NextResponse) return client;

  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_booking_documents")
      .select("id, booking_id, kind, mime_type, file_name, storage_path")
      .eq("id", documentId)
      .maybeSingle();
    const storage = String(data?.storage_path || "");
    const mime = String(data?.mime_type || "").toLowerCase();
    const name = String(data?.file_name || "");
    if (!data || !isBoardingPassDocument(data) || !storage) return jsonError("Document introuvable", 404);
    if (!mime.includes("pkpass") && !name.toLowerCase().endsWith(".pkpass") && !storage.toLowerCase().endsWith(".pkpass")) {
      return jsonError("Document introuvable", 404);
    }
    const booking = await visibleClientBooking(client.customer, String(data.booking_id || ""));
    if (!booking) return jsonError("Document introuvable", 404);
    const downloaded = await downloadCrmFile(storage);
    return new NextResponse(Buffer.from(downloaded.bytes), {
      status: 200,
      headers: walletPassDownloadHeaders(name.toLowerCase().endsWith(".pkpass") ? name : "passe.pkpass"),
    });
  } catch {
    return jsonError("Document introuvable", 404);
  }
}
