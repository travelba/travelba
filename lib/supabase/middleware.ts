import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { SET_PASSWORD_PATH, isStaffRole, mustSetPassword } from "@/lib/crm/session";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  const staff = user ? await userIsStaff(supabase, user) : false;

  if (isAdmin) {
    if (!user && !isAdminLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (user && isAdminLogin) {
      if (!staff) return supabaseResponse;
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
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (isSetPassword) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (isClient) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (mustSetPassword(user)) {
      const url = request.nextUrl.clone();
      url.pathname = SET_PASSWORD_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (isConnexion && user) {
    if (request.nextUrl.searchParams.get("error") === "no-account") {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = mustSetPassword(user)
      ? SET_PASSWORD_PATH
      : staff
        ? "/admin"
        : "/mon-compte";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
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
