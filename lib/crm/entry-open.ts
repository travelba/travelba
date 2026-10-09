import { NextResponse } from "next/server";
import type { EmailOtpType, SupabaseClient, User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";
import { ensureCustomerForUser, ensureStaff } from "@/lib/crm/auth";
import { recordCustomerLogin } from "@/lib/crm/customer-login";
import { PASSWORD_SETUP_COOKIE, mustSetPassword } from "@/lib/crm/session";
import { deskOpenDecision, deskSetCookie } from "@/lib/crm/desk-mode";
import { isStaffAccount } from "@/lib/crm/desk-open";
import { stayHasPublishedCover, stayPlaceName } from "./concierge-notices";
import {
  entryDestination,
  entryDoorForPath,
  entryLinkExpiresAt,
  entryOptInFromLink,
  entryPreviewHtml,
  entryReopenDecision,
  isEntryCode,
  isMissingColumnError,
  referenceFromNextPath,
  safeOtpType,
  stayPreviewCopy,
  storedEntryEmail,
  type EntryPreview,
} from "./entry-link";

type LinkRow = {
  token_hash: string | null;
  otp_type: string | null;
  next_path: string | null;
  email: string | null;
  show_cover?: boolean | null;
  created_at?: string | null;
  expires_at?: string | null;
  used_at?: string | null;
  revoked_at?: string | null;
  open_count?: number | null;
  channel?: string | null;
  created_by_staff_id?: string | null;
};

/** Lecture du lien court. Sur la preview, la clé de service MyLER est autorisée. */
function entryAdmin() {
  return createServiceClient({ allowPreview: true });
}

/**
 * Carte d’aperçu. Un GET anonyme ne crée rien : la couverture se sert par le code du lien
 * lui-même (`?e=CODE`), jamais par le code de partage /v/. Un lien mort n’a pas de photo.
 */
async function stayBehindCode(origin: string, code: string): Promise<{ stay: EntryPreview | null; nextPath: string | null }> {
  try {
    const admin = entryAdmin();
    const { data } = await admin.from("crm_entry_links").select("*").eq("code", code).maybeSingle();
    const link = data as LinkRow | null;
    const reference = referenceFromNextPath(link?.next_path);
    if (!link || !reference) return { stay: null, nextPath: link?.next_path ?? null };
    const { data: booking } = await admin
      .from("crm_bookings")
      .select("reference, destination, title, cover_image_path, visible_to_client, archived_at")
      .eq("reference", reference)
      .maybeSingle();
    if (!booking?.reference || booking.archived_at) return { stay: null, nextPath: link.next_path };
    const now = new Date();
    const alive = !link.revoked_at && now.getTime() <= entryLinkExpiresAt(link).getTime();
    const place = stayPlaceName(booking.destination, booking.title);
    const hasCover =
      alive && link.show_cover === true && Boolean(booking.visible_to_client) && stayHasPublishedCover(booking);
    return {
      stay: stayPreviewCopy({ origin, reference: booking.reference, place, hasCover, entryCode: code }),
      nextPath: link.next_path,
    };
  } catch {
    return { stay: null, nextPath: null };
  }
}

export async function entryPreviewResponse(origin: string, code: string, enter = true) {
  const safe = isEntryCode(code) ? code : "00000000";
  const preview = isEntryCode(code) ? await stayBehindCode(origin, safe) : { stay: null, nextPath: null };
  return new NextResponse(entryPreviewHtml(origin, safe, preview.stay, enter, entryDoorForPath(preview.nextPath)), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Le GET nu ne vient pas ici. Un appui ou le POST vérifie le jeton, pose la session, ouvre next.
 * Une session déjà ouverte passe sans consommer le jeton. Un lien révoqué, expiré ou ouvert
 * cinq fois n’ouvre rien. Dans son délai, un jeton consommé (aperçu, scanner d’e-mail) est régénéré.
 */
export async function openEntry(origin: string, code: string) {
  const safe = isEntryCode(code) ? code : "";
  const admin = entryAdmin();
  const { data } = safe
    ? await admin.from("crm_entry_links").select("*").eq("code", safe).maybeSingle()
    : { data: null };
  const link = data as LinkRow | null;
  if (!link?.token_hash) return entryPreviewResponse(origin, safe, false);
  if (link.channel === "desk") return openDeskEntry(origin, safe, link);

  const now = new Date();
  const expiresAt = entryLinkExpiresAt(link);
  const response = NextResponse.redirect(new URL("/mon-compte", origin));
  const supabase = await cookieClient(response);
  const existing = await currentUser(supabase);
  const base = {
    now,
    expiresAt,
    revokedAt: link.revoked_at,
    openCount: link.open_count ?? 0,
    hasSession: Boolean(existing),
  };
  const gate = entryReopenDecision({ ...base, tokenValid: true });
  if (gate === "refuse") return entryPreviewResponse(origin, safe, false);

  const otpType = safeOtpType(link.otp_type);
  let user: User | null = gate === "session" ? existing : null;
  if (!user) {
    user = await verifyOn(supabase, link.token_hash, otpType);
    if (!user && entryReopenDecision({ ...base, tokenValid: false }) === "regenerate") {
      const email = storedEntryEmail(link.email);
      const fresh = email ? await freshMagicHash(email) : null;
      if (fresh) user = await verifyOn(supabase, fresh, "magiclink");
    }
    if (!user) return entryPreviewResponse(origin, safe, false);
    await markEntryOpened(safe, link, now);
  }

  await ensureCustomerForUser(user);
  const staff = await ensureStaff(user);
  if (gate !== "session") {
    if (!staff) await recordCustomerLogin(user.id, "entry");
    if (entryOptInFromLink({ channel: link.channel, staff: Boolean(staff) })) {
      await stampWhatsappOptIn(user.id, now);
    }
  }
  const dest = entryDestination({
    nextPath: link.next_path,
    otpType,
    staff: Boolean(staff),
    mustSetPassword: mustSetPassword(user),
  });
  response.headers.set("Location", new URL(dest, origin).toString());
  if (dest === "/connexion/mot-de-passe") {
    await stampMustSetPassword(user.id);
    response.cookies.set(PASSWORD_SETUP_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60,
    });
  } else {
    response.cookies.set(PASSWORD_SETUP_COOKIE, "", {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 0,
    });
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * Lien desk (l’agence ouvre l’espace d’un client) : 10 minutes, une ouverture, jamais régénéré.
 * Une autre session ouverte ici (souvent l’agent) n’est jamais écrasée. Un compte de l’agence
 * n’est jamais ouvert. L’ouverture est journalisée avec l’agent qui a créé le lien.
 */
async function openDeskEntry(origin: string, code: string, link: LinkRow) {
  const now = new Date();
  const response = NextResponse.redirect(new URL("/mon-compte", origin));
  response.headers.set("Cache-Control", "private, no-store");
  const supabase = await cookieClient(response);
  const existing = await currentUser(supabase);
  const decision = deskOpenDecision({
    now,
    expiresAt: entryLinkExpiresAt(link),
    revokedAt: link.revoked_at,
    openCount: link.open_count ?? 0,
    sessionEmail: existing?.email ?? null,
    linkEmail: link.email,
  });
  if (decision === "refuse") return entryPreviewResponse(origin, code, false);
  if (decision === "other-session") return deskBusyResponse();
  if (decision === "same-session") return response;

  const user = await verifyOn(supabase, link.token_hash || "", "magiclink");
  if (!user) return entryPreviewResponse(origin, code, false);
  await markEntryOpened(code, link, now);

  const admin = entryAdmin();
  if (await isStaffAccount(admin, user.id)) {
    // Ne doit pas arriver (refusé à la création) : on referme la session tout juste posée.
    await supabase.auth.signOut({ scope: "local" });
    const refusal = await entryPreviewResponse(origin, code, false);
    for (const cookie of response.cookies.getAll()) refusal.cookies.set(cookie);
    return refusal;
  }

  await ensureCustomerForUser(user);
  await recordCustomerLogin(user.id, "desk", { staffId: link.created_by_staff_id ?? null });
  const desk = deskSetCookie(user.id);
  if (desk) response.cookies.set(desk.name, desk.value, desk.options);
  response.cookies.set(PASSWORD_SETUP_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 0,
  });
  return response;
}

/** Une session est déjà ouverte dans ce navigateur : le lien desk reste intact pour une fenêtre privée. */
function deskBusyResponse() {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Le Concierge</title>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#faf9f6;color:#0b192c">
<main style="max-width:420px;margin:12vh auto;padding:0 20px">
<h1 style="font-size:20px;margin:0 0 12px">Une session est déjà ouverte ici</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 12px">Ce navigateur est connecté à un autre compte. Pour ne pas le fermer, ce lien ne s’ouvre pas ici.</p>
<p style="font-size:15px;line-height:1.5;margin:0">Ouvrez-le dans une fenêtre privée ou sur le téléphone du client. Il reste valable 10 minutes, pour une seule ouverture.</p>
</main>
</body>
</html>`;
  return new NextResponse(html, {
    status: 409,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

/** Client Supabase sur les cookies de la requête ; les cookies posés partent avec la réponse. */
async function cookieClient(response: NextResponse) {
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseEnv();
  return createServerClient(url, anonKey, {
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
}

/** Session déjà ouverte sur ce navigateur, ou null. */
async function currentUser(supabase: SupabaseClient) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}

async function verifyOn(supabase: SupabaseClient, tokenHash: string, type: string) {
  const verified = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: safeOtpType(type) as EmailOtpType,
  });
  if (verified.error) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/** Une ouverture de plus, et la première date. Sans la migration, les colonnes manquent : on continue. */
async function markEntryOpened(code: string, link: LinkRow, now: Date) {
  try {
    const admin = entryAdmin();
    const { error } = await admin
      .from("crm_entry_links")
      .update({ used_at: link.used_at || now.toISOString(), open_count: (link.open_count ?? 0) + 1 })
      .eq("code", code);
    if (error && !isMissingColumnError(error, "used_at") && !isMissingColumnError(error, "open_count")) {
      console.error("[entry] ouverture non comptée");
    }
  } catch {
    console.error("[entry] ouverture non comptée");
  }
}

/** Le client a reçu et ouvert un message WhatsApp : consentement posé s’il manquait. */
async function stampWhatsappOptIn(userId: string, now: Date) {
  try {
    const admin = entryAdmin();
    const { error } = await admin
      .from("crm_customers")
      .update({ whatsapp_opt_in_at: now.toISOString() })
      .eq("auth_user_id", userId)
      .is("whatsapp_opt_in_at", null);
    if (error) console.error("[entry] opt-in WhatsApp non posé");
  } catch {
    console.error("[entry] opt-in WhatsApp non posé");
  }
}

async function freshMagicHash(email: string) {
  try {
    const admin = entryAdmin();
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
    return generated.data?.properties?.hashed_token || null;
  } catch {
    return null;
  }
}

async function stampMustSetPassword(userId: string) {
  try {
    const admin = entryAdmin();
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
