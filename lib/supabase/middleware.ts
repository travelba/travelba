import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import {
  DESK_COOKIE,
  accessWhileDesk,
  deskBypass,
  deskClearCookie,
} from "@/lib/crm/admin-client-login";
import {
  ONBOARDING_PATH,
  PASSWORD_SETUP_COOKIE,
  SET_PASSWORD_PATH,
  clientAreaRedirect,
  destinationForConnexionVisit,
  hasChosenPassword,
  isStaffRole,
  mayShowPasswordSetup,
  mustSetPassword,
  needsClientOnboarding,
} from "@/lib/crm/session";
import { publicSupabaseEnv } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url: supabaseUrl, anonKey } = publicSupabaseEnv();

  const supabase = createServerClient(
    supabaseUrl,
    anonKey,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...AUTH_COOKIE_OPTIONS,
              ...options,
            })
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAdmin = pathname.startsWith("/admin");
  const isAdminLogin = pathname === "/admin/login";
  const isClient = pathname.startsWith("/mon-compte");
  const isSetPassword = pathname === SET_PASSWORD_PATH;
  const isConnexion = pathname === "/connexion" || pathname.startsWith("/connexion/");
  const desk = Boolean(user && deskBypass(request.cookies.get(DESK_COOKIE)?.value, user.id));
  const hasPassword = hasChosenPassword(user);
  const setupCookie = request.cookies.get(PASSWORD_SETUP_COOKIE)?.value === "1";
  const access = accessWhileDesk({
    desk,
    mustSetPassword: user ? mustSetPassword(user) : false,
    needsOnboarding: user ? needsClientOnboarding(user) : false,
    staff: user ? await userIsStaff(supabase, user) : false,
  });
  const staff = access.staff;
  const showPasswordSetup = mayShowPasswordSetup({
    mustSetPassword: access.mustSetPassword,
    hasPassword,
    staff,
    setupCookie,
  });

  function seal(response: NextResponse) {
    if (!user && request.cookies.get(DESK_COOKIE)) {
      const clear = deskClearCookie();
      response.cookies.set(clear.name, clear.value, clear.options);
    }
    return response;
  }

  if (isAdmin) {
    if (!user && !isAdminLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
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
      url.pathname = staff
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

async function userIsStaff(
  supabase: ReturnType<typeof createServerClient>,
  user: { id: string; app_metadata?: Record<string, unknown> | null }
) {
  if (isStaffRole(user)) return true;
  const { data } = await supabase
    .from("crm_staff")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return Boolean(data);
}
