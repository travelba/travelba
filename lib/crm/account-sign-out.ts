/** Déconnexion de l’espace client. Le cookie est HttpOnly : seul le serveur peut l’effacer. */
export async function signOutAccount(scope: "local" | "global" = "local") {
  const response = await fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  if (!response.ok) return { ok: false as const };
  return { ok: true as const };
}
