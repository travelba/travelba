import { fold } from "./text";

/** Lettres et chiffres, sans accents ni ponctuation. */
export function normalizeSearch(value: string | null | undefined) {
  return fold(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Distance de Damerau-Levenshtein bornée : une transposition de deux lettres voisines compte 1.
 * Au-delà de `limit`, renvoie `limit + 1` sans finir le tableau.
 */
function editDistance(a: string, b: string, limit: number) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prevPrev = new Array<number>(b.length + 1).fill(0);
  let prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    const curr = new Array<number>(b.length + 1);
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    prevPrev = prev;
    prev = curr;
  }
  return prev[b.length];
}

/** Une lettre tapée, un début de mot, ou un mot proche (faute, lettre en trop, transposition). */
export function tokenMatchesWord(token: string, word: string) {
  if (!token || !word) return false;
  if (word.startsWith(token)) return true;
  if (token.length >= 3 && word.includes(token)) return true;
  if (/^\d{2,}$/.test(token) && word.includes(token)) return true;
  if (token.length >= 4 && word.length >= 4 && token.startsWith(word)) return true;
  if (token.length >= 4) {
    const limit = token.length >= 8 ? 2 : 1;
    if (Math.abs(word.length - token.length) <= limit && editDistance(token, word, limit) <= limit) return true;
    if (word.length - token.length >= 2) {
      const head = word.slice(0, token.length);
      if (editDistance(token, head, 1) <= 1) return true;
    }
  }
  return false;
}

/**
 * Recherche de liste : chaque mot tapé doit retrouver un mot du dossier.
 * Les lettres filtrent tout de suite (début ou fragment). Un mot assez long
 * retrouve aussi l’orthographe proche (« lamega » → Lamego, « telaviv » → Tel Aviv).
 */
export function smartSearchMatch(query: string | null | undefined, haystack: string | null | undefined) {
  const q = normalizeSearch(query);
  if (!q) return true;
  const h = normalizeSearch(haystack);
  if (!h) return false;
  // À partir de 3 signes, la suite de lettres peut traverser un mot (« mad » dans Madrid).
  // Une ou deux lettres ne valent qu’un début de mot, sinon « a » retrouve presque tout.
  if (q.length >= 3 && h.includes(q)) return true;
  const qCompact = q.replace(/ /g, "");
  const hCompact = h.replace(/ /g, "");
  const compactOk = qCompact.length >= 4 || /\d/.test(qCompact);
  if (!q.includes(" ") && compactOk && hCompact.includes(qCompact)) return true;
  const words = h.split(" ").filter(Boolean);
  return q.split(" ").every((token) => words.some((word) => tokenMatchesWord(token, word)));
}
