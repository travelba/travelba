/** E-mail du paramètre `email` de `/connexion`. Vide si la valeur n’est pas une adresse. */
export function loginEmailFromSearch(value: string | null | undefined) {
  let raw = (value || "").trim();
  if (!raw || raw.length > 320) return "";
  if (raw.includes("%")) {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      return "";
    }
  }
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

/** Suffixe du bouton « Se connecter ». Le domaine reste fixe dans le modèle. */
export function accessLoginEmailVariable(email: string) {
  const clean = loginEmailFromSearch(email);
  if (!clean || clean.length > 200) return null;
  return encodeURIComponent(clean);
}
