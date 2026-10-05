import { useState, type Dispatch, type SetStateAction } from "react";
import { mirrorStep } from "./mirror-state";

/**
 * `useState` dont la valeur initiale suit le serveur tant que l’agent n’y a pas touché.
 * Ajustement pendant le rendu (motif React « adjusting state when a prop changes »), pas d’effet.
 */
export function useMirror<T>(server: T): [T, Dispatch<SetStateAction<T>>] {
  const [draft, setDraft] = useState(server);
  const [seen, setSeen] = useState(server);
  if (!Object.is(server, seen)) {
    const next = mirrorStep(server, seen, draft);
    setSeen(next.seen);
    if (!Object.is(next.draft, draft)) setDraft(next.draft);
  }
  return [draft, setDraft];
}
