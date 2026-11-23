"use client";

import { useEffect } from "react";
import { rememberEspace } from "@/lib/client/stay-cache";

/** Écrit le dernier écran connu de cette fiche. Rien n’est affiché. */
export function RememberEspace({
  userId,
  greeting,
  stays,
  documents,
}: {
  userId: string;
  greeting?: string;
  stays?: unknown;
  documents?: unknown;
}) {
  const payload = JSON.stringify({ userId, greeting, stays, documents });
  useEffect(() => {
    void rememberEspace(JSON.parse(payload));
  }, [payload]);
  return null;
}
