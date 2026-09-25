export const CLIENT_SHELL_UA = "TravelbaEspace";

export function isClientShellUserAgent(userAgent: string | null | undefined) {
  return (userAgent ?? "").includes(CLIENT_SHELL_UA);
}

/** L’app client n’ouvre pas le back-office. */
export function clientShellHome(pathname: string, userAgent: string | null | undefined) {
  if (!isClientShellUserAgent(userAgent)) return null;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "/mon-compte";
  return null;
}
