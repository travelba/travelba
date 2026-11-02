import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { gateAgencyApi } from "./lib/crm/agency-gate";
import { IN_APP_STAY_COOKIE, IN_APP_STAY_MAX_AGE, IN_APP_STAY_PARAM, inAppHandoffDecision, inAppHandoffHtml } from "./lib/crm/in-app-browser";
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

/** Adresse publique de la requête (hôte et protocole vus par le client, pas ceux du conteneur). */
function publicRequestUrl(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    request.nextUrl.protocol.replace(/:$/, "") ||
    "https";
  return `${proto}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/**
 * Navigateur intégré de WhatsApp (ou Instagram, Facebook, Line) : avant tout rendu, la page renvoie
 * le téléphone vers Safari ou Chrome sur la même adresse, sans clic. Aucun jeton n’est consommé ici.
 * `?tb_inapp=1` (repli Android, ou choix de rester) pose un cookie de dix minutes qui laisse passer.
 */
export default async function proxy(request: NextRequest) {
  const handoff = inAppHandoffDecision({
    url: publicRequestUrl(request),
    method: request.method,
    userAgent: request.headers.get("user-agent"),
    secFetchDest: request.headers.get("sec-fetch-dest"),
    accept: request.headers.get("accept"),
    cookie: request.headers.get("cookie"),
  });
  if (handoff.kind === "handoff") {
    const lang = /^\/en(\/|$)/.test(request.nextUrl.pathname) ? "en" : "fr";
    return new NextResponse(inAppHandoffHtml(handoff.external, handoff.detection, lang), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        Vary: "User-Agent",
      },
    });
  }
  const response = await route(request);
  if (handoff.stay && request.nextUrl.searchParams.get(IN_APP_STAY_PARAM) === "1") {
    response.cookies.set(IN_APP_STAY_COOKIE, "1", {
      path: "/",
      maxAge: IN_APP_STAY_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}

async function route(request: NextRequest) {
  const forwarded = forwardAuthCode(request);
  if (forwarded) return forwarded;

  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/")) {
    if (path.startsWith("/api/admin") || path === "/api/auth/known-password" || path === "/api/auth/staff-failure") {
      return gateAgencyApi(request);
    }
    return NextResponse.next();
  }

  if (
    path === "/demo" ||
    path.startsWith("/demo/") ||
    /^\/(fr|en)\/demo(\/|$)/.test(path)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (path === "/e" || path.startsWith("/e/")) {
    return NextResponse.next();
  }

  if (path === "/v" || path.startsWith("/v/")) {
    return NextResponse.next();
  }

  // Lien carte envoyé à l’hôtel (B-04) : public, sans session, hors i18n.
  if (path === "/k" || path.startsWith("/k/")) {
    return NextResponse.next();
  }

  if (path === "/anniversaire-cyril" || path.startsWith("/anniversaire-cyril/")) {
    return NextResponse.next();
  }

  // Aperçu local : aucune session, aucune écriture. Fermé en production.
  if (
    path === "/exemple" ||
    path.startsWith("/exemple/") ||
    path === "/apercu" ||
    path.startsWith("/apercu/")
  ) {
    if (process.env.VERCEL_ENV === "production") {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (
    path.startsWith("/admin") ||
    path.startsWith("/mon-compte") ||
    path.startsWith("/connexion") ||
    path.startsWith("/auth")
  ) {
    return updateSession(request);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
