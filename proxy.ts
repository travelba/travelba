import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

/**
 * If Auth Site URL allowlist rejects /auth/callback, Supabase falls back to
 * Site URL (often http://localhost:3000 or https://travelba.fr) with ?code=.
 * Forward that PKCE code to our callback handler.
 */
function forwardAuthCode(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const path = request.nextUrl.pathname;
  if (!code) return null;
  if (path.startsWith("/auth/callback")) return null;

  const url = request.nextUrl.clone();
  url.pathname = "/auth/callback";
  // Keep code + any next param; drop locale prefix noise
  if (!url.searchParams.get("next")) {
    url.searchParams.set("next", "/mon-compte");
  }
  return NextResponse.redirect(url);
}

export default async function proxy(request: NextRequest) {
  const forwarded = forwardAuthCode(request);
  if (forwarded) return forwarded;

  const path = request.nextUrl.pathname;
  // Public CRM previews must bypass next-intl, otherwise `/demo/*` is
  // rewritten to `/fr/demo/*` even though these routes are not localized.
  if (path.startsWith("/demo")) {
    return NextResponse.next();
  }

  if (
    path.startsWith("/admin") ||
    path.startsWith("/mon-compte") ||
    path === "/connexion" ||
    path.startsWith("/auth")
  ) {
    return updateSession(request);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
