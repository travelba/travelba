/** Minuscules, sans accents (NFD, marques combinantes retirées). Espaces et ponctuation conservés. */
export function fold(text: string | null | undefined) {
  return (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** `fold` puis lettres a-z seulement : clé de comparaison de noms de personnes ou de pays. */
export function foldLetters(text: string | null | undefined) {
  return fold(text).replace(/[^a-z]/g, "");
}
