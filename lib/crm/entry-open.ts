import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";
import { ensureCustomerForUser, ensureStaff } from "@/lib/crm/auth";
import { mustSetPassword } from "@/lib/crm/session";
import { stayHasPublishedCover, stayPlaceName } from "./concierge-notices";
import {
  entryDestination,
  entryPreviewHtml,
  isEntryCode,
  referenceFromNextPath,
  safeOtpType,
  stayPreviewCopy,
  storedEntryEmail,
  type EntryPreview,
} from "./entry-link";

async function stayBehindCode(origin: string, code: string): Promise<EntryPreview | null> {
  try {
    const admin = createServiceClient();
    const { data: link } = await admin
      .from("crm_entry_links")
      .select("next_path, show_cover")
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
    const hasCover =
      link?.show_cover === true && Boolean(booking.visible_to_client) && stayHasPublishedCover(booking);
    return stayPreviewCopy({ origin, reference: booking.reference, place, hasCover });
  } catch {
    return null;
  }
}

export async function entryPreviewResponse(origin: string, code: string, enter = true) {
  const safe = isEntryCode(code) ? code : "00000000";
  const stay = isEntryCode(code) ? await stayBehindCode(origin, safe) : null;
  return new NextResponse(entryPreviewHtml(origin, safe, stay, enter), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

type LinkRow = {
  token_hash: string | null;
  otp_type: string | null;
  next_path: string | null;
  email: string | null;
};

/** Le GET ne vient pas ici. Le POST vérifie le jeton, pose la session, ouvre next. */
export async function openEntry(origin: string, code: string) {
  const safe = isEntryCode(code) ? code : "";
  const admin = createServiceClient();
  const { data } = safe
    ? await admin
        .from("crm_entry_links")
        .select("token_hash, otp_type, next_path, email")
        .eq("code", safe)
        .maybeSingle()
    : { data: null };
  const link = data as LinkRow | null;
  if (!link?.token_hash) return entryPreviewResponse(origin, safe, false);

  const otpType = safeOtpType(link.otp_type);
  const response = NextResponse.redirect(new URL("/mon-compte", origin));
  let user = await verifyOn(response, link.token_hash, otpType);
  if (!user) {
    const email = storedEntryEmail(link.email);
    const fresh = email ? await freshMagicHash(email) : null;
    if (fresh) user = await verifyOn(response, fresh, "magiclink");
  }
  if (!user) return entryPreviewResponse(origin, safe, false);

  await ensureCustomerForUser(user);
  const staff = await ensureStaff(user);
  const dest = entryDestination({
    nextPath: link.next_path,
    otpType,
    staff: Boolean(staff),
    mustSetPassword: mustSetPassword(user),
  });
  response.headers.set("Location", new URL(dest, origin).toString());
  if (dest === "/connexion/mot-de-passe") await stampMustSetPassword(user.id);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function verifyOn(response: NextResponse, tokenHash: string, type: string) {
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...AUTH_COOKIE_OPTIONS, ...options });
        });
      },
    },
  });
  const verified = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: safeOtpType(type) as EmailOtpType,
  });
  if (verified.error) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

async function freshMagicHash(email: string) {
  try {
    const admin = createServiceClient();
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
    return generated.data?.properties?.hashed_token || null;
  } catch {
    return null;
  }
}

async function stampMustSetPassword(userId: string) {
  try {
    const admin = createServiceClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    const meta = data.user?.app_metadata || {};
    if (meta.must_set_password === true) return;
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...meta, must_set_password: true },
    });
  } catch {
    console.error("[entry] impossible de poser must_set_password");
  }
}
