/** Preview Vercel : ne pas utiliser les secrets de production. */
export function isVercelPreview() {
  return process.env.VERCEL_ENV === "preview";
}

/** Chaîne vide sur une preview, même si la variable est encore présente. */
export function productionOnlySecret(value: string | undefined | null) {
  if (isVercelPreview()) return "";
  return (value ?? "").trim();
}
