/** Premier mot du nom d’agence : « Marie Martin » → « Marie ». */
export function staffGivenName(fullName: string | null | undefined) {
  const name = (fullName || "").trim();
  if (!name) return "";
  return name.split(/\s+/)[0] || name;
}

/** Une ou deux initiales, pour l’avatar compact des listes. */
export function staffInitials(fullName: string | null | undefined) {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toLocaleUpperCase("fr");
}
