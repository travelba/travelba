export function entryCodeFromPath(pathname: string) {
  const path = pathname.split("?")[0].replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "e") return null;
  const code = parts[1] === "c" ? parts[2] : parts[1];
  return code && /^[2-9A-HJ-NP-Z]{8}$/.test(code) ? code : null;
}

export function callbackSecretsFromUrl(raw: string) {
  try {
    const url = new URL(raw);
    return {
      token_hash: url.searchParams.get("token_hash"),
      code: url.searchParams.get("code"),
      type: url.searchParams.get("type"),
      path: url.pathname,
    };
  } catch {
    return { token_hash: null, code: null, type: null, path: "" };
  }
}

export function routeAfterLink(path: string) {
  if (path.startsWith("/connexion/mot-de-passe")) return "/mot-de-passe";
  if (path.startsWith("/mon-compte/bienvenue")) return "/bienvenue";
  if (path.startsWith("/mon-compte/reservations/")) {
    const reference = path.split("/").pop();
    return reference ? `/reservation/${reference}` : "/reservations";
  }
  if (path.startsWith("/mon-compte/transactions")) return "/transactions";
  if (path.startsWith("/mon-compte/profil")) return "/compte";
  return "/";
}
