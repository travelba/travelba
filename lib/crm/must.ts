/**
 * Écriture (ou lecture) PostgREST vérifiée : une erreur lève au lieu de passer en silence.
 * Une violation d’index unique sur le grand livre remonte ainsi jusqu’à la route, qui répond 400.
 */
export function must<T>(result: { data: T; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}
