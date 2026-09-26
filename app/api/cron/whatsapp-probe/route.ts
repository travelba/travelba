import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { createEntryLink, entryButtonSuffix, entryCodeFromLink } from "@/lib/crm/entry-link";
import {
  conciergeContentSid,
  conciergeContentVariables,
  liveStayCover,
  stayCoverUrl,
  stayHasPublishedCover,
  stayPlaceName,
} from "@/lib/crm/concierge-notices";
import { sendContentTemplate } from "@/lib/crm/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 60;

const PHONE = "+33772158257";
const EMAIL = "benjamin@travelba.fr";
const REFERENCE = "TB-2026-0028";
const DEDUPE = "direct-lien:sejour";

function authorized(header: string | null) {
  const expected = process.env.WHATSAPP_PROBE_TOKEN?.trim() || "";
  const got = (header || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const admin = createServiceClient();
  const { data: prior } = await admin
    .from("crm_whatsapp_messages")
    .select("status")
    .eq("dedupe_key", DEDUPE)
    .maybeSingle();
  if (prior?.status === "sent") {
    return NextResponse.json({ reference: REFERENCE, envoi: "déjà" });
  }

  const { data: booking } = await admin
    .from("crm_bookings")
    .select("id, reference, destination, title, cover_image_path, visible_to_client")
    .eq("reference", REFERENCE)
    .maybeSingle();
  if (!booking?.visible_to_client) {
    return NextResponse.json({ error: "Séjour introuvable" }, { status: 404 });
  }
  const place = stayPlaceName(booking.destination, booking.title);
  const mediaUrl = await liveStayCover(
    stayHasPublishedCover(booking) ? stayCoverUrl(booking.reference, true) : null
  );
  if (!place || !mediaUrl) return NextResponse.json({ error: "Séjour incomplet" }, { status: 422 });

  const { data: customer } = await admin
    .from("crm_customers")
    .select("id")
    .eq("email", EMAIL)
    .maybeSingle();

  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) {
    return NextResponse.json({ error: "Lien absent" }, { status: 422 });
  }
  const link = await createEntryLink(admin, siteConfig.url, {
    tokenHash,
    otpType: "magiclink",
    nextPath: `/mon-compte/reservations/${booking.reference}`,
    email: EMAIL,
    showCover: true,
  });
  const code = entryCodeFromLink(link);
  const suffix = code ? entryButtonSuffix(code) : "";
  const variables = conciergeContentVariables({
    template: "sejour",
    buttonSuffix: suffix,
    place,
    reference: booking.reference,
    mediaUrl,
  });
  const sid = conciergeContentSid("sejour");
  const result = await sendContentTemplate({ phone: PHONE, contentSid: sid, variables });
  if (result.ok) {
    await admin.from("crm_whatsapp_messages").insert({
      customer_id: customer?.id || null,
      booking_id: booking.id,
      dedupe_key: DEDUPE,
      direction: "outbound",
      template_key: "sejour",
      body: "Votre séjour est dans votre espace.",
      payload: {},
      status: "sent",
      twilio_sid: result.sid,
    });
  }
  return NextResponse.json({
    reference: booking.reference,
    image: "couverture du séjour",
    envoi: result.ok ? "envoyé" : result.detail || result.reason,
  });
}
