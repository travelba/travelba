import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { stayHasPublishedCover, stayPlaceName } from "./concierge-notices";
import {
  entryPreviewHtml,
  isEntryCode,
  referenceFromNextPath,
  safeNextPath,
  safeOtpType,
  stayPreviewCopy,
  type EntryPreview,
} from "./entry-link";

async function stayBehindCode(origin: string, code: string): Promise<EntryPreview | null> {
  try {
    const admin = createServiceClient();
    const { data: link } = await admin
      .from("crm_entry_links")
      .select("next_path")
      .eq("code", code)
      .maybeSingle();
    const reference = referenceFromNextPath(link?.next_path);
    if (!reference) return null;
    const { data: booking } = await admin
      .from("crm_bookings")
      .select("reference, destination, title, cover_image_path, visible_to_client")
      .eq("reference", reference)
      .maybeSingle();
    if (!booking?.reference) return null;
    const place = stayPlaceName(booking.destination, booking.title);
    const hasCover = Boolean(booking.visible_to_client) && stayHasPublishedCover(booking);
    return stayPreviewCopy({ origin, reference: booking.reference, place, hasCover });
  } catch {
    return null;
  }
}

export async function entryPreviewResponse(origin: string, code: string) {
  const safe = isEntryCode(code) ? code : "00000000";
  const stay = isEntryCode(code) ? await stayBehindCode(origin, safe) : null;
  return new NextResponse(entryPreviewHtml(origin, safe, stay), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      Vary: "User-Agent, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, Sec-Fetch-User",
    },
  });
}

export async function redirectEntryToCallback(origin: string, code: string) {
  const safe = isEntryCode(code) ? code : "";
  const admin = createServiceClient();
  const { data } = safe
    ? await admin
        .from("crm_entry_links")
        .select("token_hash, otp_type, next_path")
        .eq("code", safe)
        .maybeSingle()
    : { data: null };

  if (!data?.token_hash) {
    return noStore(NextResponse.redirect(new URL("/connexion?error=auth", origin)));
  }

  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("token_hash", data.token_hash);
  callback.searchParams.set("type", safeOtpType(data.otp_type));
  callback.searchParams.set("next", safeNextPath(data.next_path));
  return noStore(NextResponse.redirect(callback));
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
