import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};

/**
 * `false` au rendu serveur et pendant l’hydratation, `true` ensuite dans le navigateur.
 * Pour les portails (`createPortal` vers `document.body`) sans `setState` dans un effet.
 */
export function useIsClient() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );
}
