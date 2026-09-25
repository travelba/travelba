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

const PHONE = "+33772158257";
const EMAIL = "benjamin@travelba.fr";
const REFERENCE = "TB-2026-0028";

function authorized(header: string | null) {
  const expected = process.env.WHATSAPP_PROBE_TOKEN?.trim() || "";
  const got = (header || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

async function buttonSuffix(path: string) {
  const admin = createServiceClient();
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) return null;
  const link = await createEntryLink(admin, siteConfig.url, {
    tokenHash,
    otpType: "magiclink",
    nextPath: path,
  });
  const code = entryCodeFromLink(link);
  return code ? entryButtonSuffix(code) : null;
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createServiceClient();
  const { data: booking } = await admin
    .from("crm_bookings")
    .select("reference, destination, title, cover_image_path, visible_to_client")
    .eq("reference", REFERENCE)
    .maybeSingle();
  if (!booking?.visible_to_client) {
    return NextResponse.json({ error: "Séjour introuvable" }, { status: 404 });
  }

  const place = stayPlaceName(booking.destination, booking.title);
  if (!place) return NextResponse.json({ error: "Lieu absent" }, { status: 422 });

  const path = `/mon-compte/reservations/${booking.reference}`;
  const suffix = await buttonSuffix(path);
  if (!suffix) return NextResponse.json({ error: "Lien absent" }, { status: 422 });

  const cover = stayHasPublishedCover(booking) ? stayCoverUrl(booking.reference, true) : null;
  const mediaUrl = await liveStayCover(cover);
  const stayTemplate = mediaUrl ? "sejour" : "sejour_texte";
  const stayVariables = conciergeContentVariables({
    template: stayTemplate,
    buttonSuffix: suffix,
    place,
    reference: booking.reference,
    mediaUrl,
  });
  const pieceVariables = conciergeContentVariables({
    template: "pieces_composees",
    buttonSuffix: suffix,
    place,
    reference: booking.reference,
    variable: "confirmation d'hôtel et le transfert",
  });
  if (!stayVariables || !pieceVariables) {
    return NextResponse.json({ error: "Message incomplet" }, { status: 422 });
  }

  const staySid = conciergeContentSid(stayTemplate);
  const pieceSid = conciergeContentSid("pieces_composees");
  if (!staySid || !pieceSid) {
    return NextResponse.json({ error: "Modèle absent" }, { status: 422 });
  }

  const stay = await sendContentTemplate({
    phone: PHONE,
    contentSid: staySid,
    variables: stayVariables,
  });
  const pieces = await sendContentTemplate({
    phone: PHONE,
    contentSid: pieceSid,
    variables: pieceVariables,
  });

  return NextResponse.json({
    stay: stay.ok ? "envoyé" : "échec",
    pieces: pieces.ok ? "envoyé" : "échec",
    image: Boolean(mediaUrl),
  });
}
