import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const guideId = String(body?.guide_id || "");
  const bookingId = String(body?.booking_id || "");
  const mobileAppUrl = String(body?.mobile_app_url || "");
  if (!guideId || !bookingId || !mobileAppUrl) return jsonError("Guide, réservation et lien requis");
  const [{ data: guideData }, { data: booking }] = await Promise.all([
    auth.supabase.from("agency_mtrip_guides").select("*").eq("id", guideId).eq("user_id", auth.user.id).maybeSingle(),
    auth.supabase.from("crm_bookings").select("id").eq("id", bookingId).maybeSingle(),
  ]);
  const guide = guideData as AgencyMtripGuide | null;
  if (!guide || guide.status !== "published" || !guide.mtrip_identifier) return jsonError("Le guide doit être publié avec succès", 409);
  if (!booking) return jsonError("Réservation introuvable", 404);
  const permittedLinks = Object.values(guide.app_links || {});
  if (!permittedLinks.includes(mobileAppUrl) || !mobileAppUrl.startsWith("https://")) return jsonError("Lien mTrip invalide", 400);
  const { data, error } = await auth.supabase.from("crm_mtrip_publications").upsert({
    booking_id: bookingId,
    guide_id: guide.id,
    mtrip_identifier: guide.mtrip_identifier,
    state: "published",
    mobile_app_url: mobileAppUrl,
    validation_errors: [],
    published_at: guide.published_at || new Date().toISOString(),
    published_by: auth.staff.id,
  }, { onConflict: "booking_id" }).select("*").single();
  if (error) return jsonError(error.message, 400);
  await createServiceClient().from("crm_audit_events").insert({ actor_user_id: auth.user.id, actor_staff_id: auth.staff.id, entity_type: "mtrip_publication", entity_id: data.id, action: "linked_to_booking", metadata: { booking_id: bookingId, guide_id: guide.id } });
  return NextResponse.json({ publication: data });
}
