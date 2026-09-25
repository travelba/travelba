import { NextResponse } from "next/server";
import { jsonError, requireCustomer, requireStaff } from "@/lib/crm/auth";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { readExampleFile } from "@/lib/crm/example-store";
import { safeFileName, signedCrmUrl } from "@/lib/crm/files";
import { customerPathScope, isSafeCrmPath } from "@/lib/crm/files-access";

async function sendCrmFile(path: string, requestUrl: URL) {
  const signed = await signedCrmUrl(path);
  const download = requestUrl.searchParams.get("download") === "1";
  const inline = requestUrl.searchParams.get("inline") === "1";
  if (!download && !inline) return NextResponse.redirect(signed);
  const upstream = await fetch(signed);
  if (!upstream.ok || !upstream.body) return jsonError("Fichier introuvable", 404);
  const filename = safeFileName(requestUrl.searchParams.get("name") || "document");
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) return jsonError("path requis");
  if (!isSafeCrmPath(path)) return jsonError("Chemin invalide", 400);

  if (path.startsWith("exemple/") && exampleSessionEnabled()) {
    const file = readExampleFile(path);
    if (!file) return jsonError("Fichier introuvable", 404);
    const filename = safeFileName(url.searchParams.get("name") || file.name);
    return new NextResponse(Buffer.from(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mime || "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const staff = await requireStaff();
  if (!(staff instanceof NextResponse)) {
    return sendCrmFile(path, url);
  }

  const client = await requireCustomer();
  if (client instanceof NextResponse) return client;

  const scope = customerPathScope(path, client.customer.id);
  if (scope.kind === "denied") return jsonError("Accès refusé", 403);

  if (scope.kind === "booking") {
    const bookingId = scope.bookingId;
    const { data: booking } = await client.supabase
      .from("crm_bookings")
      .select("id, cover_image_path")
      .eq("id", bookingId)
      .eq("customer_id", client.customer.id)
      .maybeSingle();
    if (!booking) return jsonError("Accès refusé", 403);
    if (booking.cover_image_path === path) {
      return sendCrmFile(path, url);
    }
    const { data: doc } = await client.supabase
      .from("crm_booking_documents")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("storage_path", path)
      .eq("visible_to_client", true)
      .maybeSingle();
    if (!doc) return jsonError("Document non publié", 403);
  }

  return sendCrmFile(path, url);
}
