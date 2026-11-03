import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  accessTimingFromCookies,
  clientSessionCookieWrites,
  isRouterPrefetch,
  mergeCookieValues,
  requestIsSecure,
  shouldRefreshClientSession,
} from "@/lib/crm/client-session-cookie";
import { AUTH_COOKIE_OPTIONS, clientAuthCookieOptions } from "@/lib/supabase/cookie-options";
import {
  DESK_COOKIE,
  accessWhileDesk,
  deskBypass,
  deskClearCookie,
} from "@/lib/crm/desk-mode";
import { isAgencyRole } from "@/lib/crm/agency-access";
import {
  ONBOARDING_PATH,
  PASSWORD_SETUP_COOKIE,
  SET_PASSWORD_PATH,
  clientAreaRedirect,
  destinationForConnexionVisit,
  hasChosenPassword,
  isStaffRole,
  partnerAdminDestination,
  RATEHAWK_ADMIN_HOME,
  ratehawkAdminDestination,
  mayShowPasswordSetup,
  mustSetPassword,
  isOnboardingReplay,
  needsClientOnboarding,
} from "@/lib/crm/session";
import { publicSupabaseEnv } from "@/lib/supabase/env";
import { readVerifiedUser } from "@/lib/crm/verified-user";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url: supabaseUrl, anonKey } = publicSupabaseEnv();
  const secure = requestIsSecure({
    forwardedProto: request.headers.get("x-forwarded-proto"),
    protocol: request.nextUrl.protocol,
  });
  const prefetch = isRouterPrefetch((name) => request.headers.get(name));
  const timing = accessTimingFromCookies(request.cookies.getAll());
  const written: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    supabaseUrl,
    anonKey,
    {
      cookieOptions: timing.audience === "client" ? clientAuthCookieOptions(secure) : AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          for (const [key, value] of Object.entries(cacheHeaders)) {
            supabaseResponse.headers.set(key, value);
          }
          written.length = 0;
          cookiesToSet.forEach(({ name, value, options }) => {
            const merged = { ...AUTH_COOKIE_OPTIONS, ...options };
            written.push({ name, value, options: merged });
            supabaseResponse.cookies.set(name, value, merged);
          });
          for (const [key, value] of Object.entries(headers ?? {})) {
            cacheHeaders[key] = value;
            supabaseResponse.headers.set(key, value);
          }
        },
      },
    }
  );

  if (!prefetch && shouldRefreshClientSession(timing, Math.floor(Date.now() / 1000))) {
    try {
      await supabase.auth.refreshSession();
    } catch {
      /* La visite suivante réessaie. Le cookie déjà posé reste. */
    }
  }

  const user = await readVerifiedUser(supabase);

  const pathname = request.nextUrl.pathname;
  const isAdmin = pathname.startsWith("/admin");
  const isAdminLogin = pathname === "/admin/login";
  const isClient = pathname.startsWith("/mon-compte");
  const isSetPassword = pathname === SET_PASSWORD_PATH;
  const isConnexion = pathname === "/connexion" || pathname.startsWith("/connexion/");
  const desk = Boolean(user && deskBypass(request.cookies.get(DESK_COOKIE)?.value, user.id));
  const hasPassword = hasChosenPassword(user);
  const setupCookie = request.cookies.get(PASSWORD_SETUP_COOKIE)?.value === "1";
  const deskAccess = user
    ? await userDeskAccess(supabase, user)
    : { staff: false, partner: false, ratehawk: false, inactive: false };
  const access = accessWhileDesk({
    desk,
    mustSetPassword: user ? mustSetPassword(user) : false,
    needsOnboarding: user ? needsClientOnboarding(user) : false,
    staff: deskAccess.staff || deskAccess.partner || deskAccess.ratehawk,
  });
  const staff = access.staff;
  const partner = Boolean(deskAccess.partner && staff);
  const ratehawk = Boolean(deskAccess.ratehawk && staff);
  const showPasswordSetup = mayShowPasswordSetup({
    mustSetPassword: access.mustSetPassword,
    hasPassword,
    staff,
    setupCookie,
  });

  function seal(response: NextResponse) {
    if (response !== supabaseResponse) {
      for (const [key, value] of Object.entries(cacheHeaders)) response.headers.set(key, value);
      for (const cookie of written) {
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }
    }
    // Chaque visite client réécrit le cookie avec une date de fin. Un préchargement ne le fait pas :
    // sa réponse peut arriver après et reposer l’ancien jeton.
    if (!prefetch) {
      const merged = mergeCookieValues(request.cookies.getAll(), written);
      const stamps = clientSessionCookieWrites(merged, secure);
      for (const cookie of stamps) {
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }
      if (stamps.length > 0) response.headers.set("Cache-Control", "private, no-store");
    }
    if (!user && request.cookies.get(DESK_COOKIE)) {
      const clear = deskClearCookie();
      response.cookies.set(clear.name, clear.value, clear.options);
    }
    return response;
  }

  if (isAdmin) {
    if (user && partner) {
      const dest = partnerAdminDestination(pathname);
      if (dest) {
        const url = request.nextUrl.clone();
        url.pathname = dest;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
    if (user && ratehawk) {
      const dest = ratehawkAdminDestination(pathname);
      if (dest) {
        const url = request.nextUrl.clone();
        url.pathname = dest;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
    if (!user && !isAdminLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      if (pathname === "/admin/little-emperors" || pathname.startsWith("/admin/little-emperors/")) {
        url.searchParams.set("espace", "myler");
      }
      return seal(NextResponse.redirect(url));
    }
    if (user && isAdminLogin) {
      if (!staff) return seal(supabaseResponse);
      const url = request.nextUrl.clone();
      const next = request.nextUrl.searchParams.get("next");
      url.pathname =
        next && next.startsWith("/admin") && !next.startsWith("/admin/login")
          ? next
          : "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (user && !staff) {
      const url = request.nextUrl.clone();
      if (deskAccess.inactive) {
        url.pathname = "/admin/login";
        url.searchParams.set("error", "desactive");
        return seal(NextResponse.redirect(url));
      }
      url.pathname = "/mon-compte";
      url.search = "";
      return seal(NextResponse.redirect(url));
    }
    return seal(supabaseResponse);
  }

  if (isSetPassword) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      url.search = "";
      return seal(NextResponse.redirect(url));
    }
    if (!showPasswordSetup) {
      const url = request.nextUrl.clone();
      url.pathname = partner
        ? partnerAdminDestination("/admin") || "/admin/little-emperors"
        : ratehawk
        ? RATEHAWK_ADMIN_HOME
        : staff
        ? "/admin"
        : desk
          ? "/mon-compte"
          : pathname === SET_PASSWORD_PATH && access.mustSetPassword && !hasPassword
            ? "/connexion"
            : needsClientOnboarding(user)
              ? ONBOARDING_PATH
              : "/mon-compte";
      url.search = "";
      return seal(NextResponse.redirect(url));
    }
    return seal(supabaseResponse);
  }

  if (user && ratehawk && (isClient || (isConnexion && !isSetPassword))) {
    const url = request.nextUrl.clone();
    url.pathname = RATEHAWK_ADMIN_HOME;
    url.search = "";
    return seal(NextResponse.redirect(url));
  }

  if (isClient) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      url.searchParams.set("next", pathname);
      return seal(NextResponse.redirect(url));
    }
    const dest = clientAreaRedirect(pathname, {
      mustSetPassword: showPasswordSetup,
      needsOnboarding: access.needsOnboarding,
      replay: isOnboardingReplay(request.nextUrl.search),
    });
    if (dest) {
      const url = request.nextUrl.clone();
      url.pathname = dest;
      url.search = "";
      return seal(NextResponse.redirect(url));
    }
    return seal(supabaseResponse);
  }

  if (isConnexion && user) {
    if (request.nextUrl.searchParams.get("error") === "no-account") {
      return seal(supabaseResponse);
    }
    if (pathname === "/connexion") {
      const dest = destinationForConnexionVisit({
        staff,
        mustSetPassword: access.mustSetPassword,
        needsOnboarding: access.needsOnboarding,
        hasPassword,
      });
      if (!dest) return seal(supabaseResponse);
      const url = request.nextUrl.clone();
      url.pathname = dest;
      url.search = "";
      return seal(NextResponse.redirect(url));
    }
  }

  return seal(supabaseResponse);
}

async function userDeskAccess(
  supabase: ReturnType<typeof createServerClient>,
  user: { id: string; app_metadata?: Record<string, unknown> | null }
) {
  const jwt = user.app_metadata?.crm_role;
  const first = await supabase.from("crm_staff").select("role, active").eq("auth_user_id", user.id).maybeSingle();
  let role = first.data?.role as string | undefined;
  let active = (first.data as { active?: boolean } | null)?.active;
  if (first.error) {
    const second = await supabase.from("crm_staff").select("role").eq("auth_user_id", user.id).maybeSingle();
    if (second.error) {
      if (jwt === "partner") return { staff: false, partner: true, ratehawk: false, inactive: false };
      if (jwt === "ratehawk_cert") return { staff: false, partner: false, ratehawk: true, inactive: false };
      if (isStaffRole(user)) return { staff: true, partner: false, ratehawk: false, inactive: false };
      return { staff: false, partner: false, ratehawk: false, inactive: false };
    }
    role = second.data?.role as string | undefined;
    active = true;
  }
  if (!role) return { staff: false, partner: false, ratehawk: false, inactive: false };
  if (active === false) return { staff: false, partner: false, ratehawk: false, inactive: true };
  if (role === "partner") return { staff: false, partner: true, ratehawk: false, inactive: false };
  if (role === "ratehawk_cert") return { staff: false, partner: false, ratehawk: true, inactive: false };
  if (isAgencyRole(role)) return { staff: true, partner: false, ratehawk: false, inactive: false };
  return { staff: false, partner: false, ratehawk: false, inactive: false };
}
