/** Message d’échec de lecture. Un 400 est un fichier illisible ; une panne du service est autre chose. */
export function ocrRequestFailure(status: number | undefined, isPdf: boolean) {
  if (status === 400) {
    return isPdf
      ? "Ce PDF ne contient pas une pièce lisible. Reprenez le passeport, ou saisissez à la main."
      : "Cette photo ne contient pas une pièce lisible. Reprenez le passeport, ou saisissez à la main.";
  }
  if (status == null || status === 401 || status === 403 || status === 429 || status >= 500) {
    return "Lecture automatique indisponible temporairement. Réessayez dans un instant.";
  }
  return null;
}
