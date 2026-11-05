/** Photos réellement reçues, sans doublon. L’ordre reste celui de la fiche. */
export function hotelPhotoList(input: { photo?: string | null; images?: readonly (string | null | undefined)[] | null }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value?: string | null) => {
    const src = (value || "").trim();
    if (!src || seen.has(src)) return;
    seen.add(src);
    out.push(src);
  };
  push(input.photo);
  for (const src of input.images || []) push(src);
  return out;
}

/**
 * Sous le seuil, c’est un appui. Au-delà, l’horizontale fait défiler les photos
 * et la verticale laisse la page défiler.
 */
export function photoGesture(dx: number, dy: number, threshold = 12): "pending" | "swipe" | "scroll" {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return "pending";
  return Math.abs(dx) > Math.abs(dy) ? "swipe" : "scroll";
}
