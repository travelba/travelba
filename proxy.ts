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
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const path = request.nextUrl.pathname;
  if (!code && !tokenHash) return null;
  if (path.startsWith("/auth/callback")) return null;

  const url = request.nextUrl.clone();
  url.pathname = "/auth/callback";
  // Keep code / token_hash + any next param; drop locale prefix noise
  if (!url.searchParams.get("next")) {
    url.searchParams.set("next", "/mon-compte");
  }
  return NextResponse.redirect(url);
}

export default async function proxy(request: NextRequest) {
  const forwarded = forwardAuthCode(request);
  if (forwarded) return forwarded;

  const path = request.nextUrl.pathname;

  // Locale-prefixed bookmarks from next-intl (e.g. /fr/demo/espace-client).
  const demoted = path.match(/^\/(fr|en)(\/demo(?:\/.*)?)$/);
  if (demoted) {
    const url = request.nextUrl.clone();
    url.pathname = demoted[2];
    return NextResponse.redirect(url);
  }

  if (
    path.startsWith("/admin") ||
    path.startsWith("/mon-compte") ||
    path.startsWith("/connexion") ||
    path.startsWith("/auth") ||
    path.startsWith("/demo")
  ) {
    return updateSession(request);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
