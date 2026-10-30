"use client";

import { useEffect, useState } from "react";
import { JournalTimeline, type JournalFeedItem } from "@/components/admin/journal/JournalTimeline";

/**
 * Historique lisible : qui, quoi, quand, avant → après, en frise.
 * `dossier` / `client` / `user` : ce qui a été fait sur cette fiche. `acteur` : tout ce qu’un collègue a fait.
 * Les numéros de pièce et de carte sont masqués à l’écriture ; rien de complet ne passe ici.
 */
export function AgencyHistoryPanel({
  entity,
  entityId,
  title = "Historique",
}: {
  entity: "dossier" | "client" | "user" | "acteur";
  entityId: string;
  title?: string;
}) {
  const [rows, setRows] = useState<JournalFeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = entity === "acteur" ? new URLSearchParams({ agent: entityId }) : new URLSearchParams({ entity, id: entityId });
    void fetch(`/api/admin/journal?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Lecture impossible.");
        if (!cancelled) setRows((json.rows || []) as JournalFeedItem[]);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [entity, entityId]);

  return (
    <section className="admin-af-card space-y-3 rounded-3xl p-5">
      <p className="font-display text-lg font-bold text-[var(--admin-navy)]">{title}</p>
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      {rows == null && !error ? <p className="text-sm text-muted">Chargement…</p> : null}
      {rows ? <JournalTimeline items={rows} showDossier={entity !== "dossier"} /> : null}
    </section>
  );
}
