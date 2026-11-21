/** Marque ajoutée à l’agent utilisateur par l’application iOS (Capacitor). */
export const NATIVE_APP_UA_MARK = "TBA-iOS";

const PORTAL_HOSTS = new Set(["travelba.fr", "www.travelba.fr"]);

export function isNativeAppUserAgent(userAgent: string | null | undefined) {
  return (userAgent || "").includes(NATIVE_APP_UA_MARK);
}

/** Chemin servi dans la webview. Le reste du site s’ouvre dehors, /admin jamais. */
export function isPortalPath(pathname: string) {
  if (pathname === "/connexion" || pathname.startsWith("/connexion/")) return true;
  if (pathname === "/mon-compte" || pathname.startsWith("/mon-compte/")) return true;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  if (pathname === "/e" || pathname.startsWith("/e/")) return true;
  if (pathname === "/acces" || pathname.startsWith("/acces/")) return true;
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) return false;
    if (pathname === "/api/mcp" || pathname.startsWith("/api/mcp/")) return false;
    return true;
  }
  return false;
}

export function isNativeBlockedPath(pathname: string) {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/mcp" ||
    pathname.startsWith("/api/mcp/")
  );
}

export type PortalNavigation = "allow" | "block" | "external";

/** Où envoyer une navigation demandée par la webview. */
export function portalNavigation(input: { url: string; base?: string }): PortalNavigation {
  let url: URL;
  try {
    url = new URL(input.url, input.base || "https://travelba.fr");
  } catch {
    return "block";
  }
  if (url.protocol === "tel:" || url.protocol === "mailto:") return "external";
  if (url.protocol !== "https:" && url.protocol !== "http:") return "external";
  const host = url.hostname.toLowerCase();
  if (!PORTAL_HOSTS.has(host)) return "external";
  if (isNativeBlockedPath(url.pathname)) return "block";
  if (isPortalPath(url.pathname)) return "allow";
  return "external";
}

/** Redirection à la place d’un écran agence, seulement pour l’application. */
export function nativeAdminRedirect(pathname: string, userAgent: string | null | undefined) {
  if (!isNativeAppUserAgent(userAgent)) return null;
  if (!isNativeBlockedPath(pathname)) return null;
  return "/connexion?error=application";
}

/** Cible d’une notification : un chemin du portail, jamais une adresse absolue. */
export function pushTargetPath(url: string) {
  if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\")) return null;
  const path = url.split("?")[0] || "";
  if (path !== "/mon-compte" && !path.startsWith("/mon-compte/")) return null;
  if (path.includes("..")) return null;
  return url.slice(0, 300);
}
