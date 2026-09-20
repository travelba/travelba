import { NextResponse } from "next/server";
import { jsonError, requireCustomer, requireStaff } from "@/lib/crm/auth";
import { signedCrmUrl } from "@/lib/crm/files";
import { customerPathScope, isSafeCrmPath } from "@/lib/crm/files-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) return jsonError("path requis");
  if (!isSafeCrmPath(path)) return jsonError("Chemin invalide", 400);

  const staff = await requireStaff();
  if (!(staff instanceof NextResponse)) {
    const signed = await signedCrmUrl(path);
    return NextResponse.redirect(signed);
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
      const signed = await signedCrmUrl(path);
      return NextResponse.redirect(signed);
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

  const signed = await signedCrmUrl(path);
  return NextResponse.redirect(signed);
}
