/** Fichiers du hero public. Un seul fichier est demandé, selon l’écran et le format lu. */
export const HERO_POSTER = "/videos/hero-poster.jpg";

export function pickHeroVideo(input: { wide: boolean; webm: boolean }) {
  const size = input.wide ? "desktop" : "mobile";
  const kind = input.webm ? "webm" : "mp4";
  return `/videos/hero-${size}.${kind}`;
}

/** Mouvement réduit ou économie de données : le poster reste, la vidéo ne part pas. */
export function shouldPlayHeroVideo(input: { reduceMotion: boolean; saveData: boolean }) {
  return !input.reduceMotion && !input.saveData;
}
