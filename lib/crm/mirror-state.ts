/**
 * Champ de formulaire qui reflète une valeur serveur rafraîchie par `router.refresh()` :
 * un champ touché par l’agent gagne, un champ intact suit le serveur.
 * `seen` est la dernière valeur serveur vue ; `draft` ce que l’agent a sous les yeux.
 */
export function mirrorStep<T>(server: T, seen: T, draft: T): { seen: T; draft: T } {
  if (Object.is(server, seen)) return { seen, draft };
  return { seen: server, draft: Object.is(draft, seen) ? server : draft };
}
