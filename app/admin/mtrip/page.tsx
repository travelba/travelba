"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deriveVoyageStep,
  VOYAGE_STEP_LABELS,
  type AgencyMtripGuide,
} from "@/lib/mtrip/guide-types";

export default function AdminMtripPage() {
  const router = useRouter();
  const [guides, setGuides] = useState<AgencyMtripGuide[]>([]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/mtrip/guides");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Chargement des voyages impossible");
        return;
      }
      setError(null);
      setGuides(data.guides || []);
    } catch {
      setError("Chargement des voyages impossible");
    }
  }

  useEffect(() => {
    // Initial client-side load from the protected API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function start() {
    setCreating(true);
    const res = await fetch("/api/admin/mtrip/guides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nouveau voyage", passengers: [] }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) router.push(`/admin/mtrip/${data.guide.id}`);
  }

  async function deleteVoyage(g: AgencyMtripGuide) {
    const ok = window.confirm(
      `Supprimer « ${g.title} »${
        g.mtrip_identifier ? " (CRM + mTrip)" : ""
      } ?`
    );
    if (!ok) return;
    setDeletingId(g.id);
    setError(null);
    const res = await fetch(`/api/admin/mtrip/guides/${g.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    setDeletingId(null);
    if (!res.ok) {
      setError(data.error || "Suppression impossible");
      return;
    }
    setGuides((prev) => prev.filter((x) => x.id !== g.id));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">
            Voyages
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Borne agent : passeports → contact → résas → WhatsApp. Les guides
            mTrip sont produits automatiquement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/imports"
            className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
          >
            Import guidé
          </Link>
          <Link
            href="/admin/dossiers/new"
            className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
          >
            Dossier hôtel
          </Link>
          <Link
            href="/admin/hotels/contacts"
            className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
          >
            Contacts hôtels
          </Link>
          <button
            type="button"
            onClick={start}
            disabled={creating}
            className="admin-af-btn rounded-full px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {creating ? "…" : "Nouveau voyage"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--admin-red)]">{error}</p>}

      <ul className="admin-af-card divide-y divide-border overflow-hidden rounded-2xl">
        {!guides.length && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            Aucun voyage.
          </li>
        )}
        {guides.map((g) => (
          <li
            key={g.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <Link
              href={`/admin/mtrip/${g.id}`}
              className="min-w-0 flex-1 hover:text-accent-2"
            >
              <p className="font-medium">{g.title}</p>
              <p className="text-xs text-muted">
                {(g.passengers || []).length} passager(s) ·{" "}
                {(g.documents || []).length} PDF ·{" "}
                {(g.quote_lines || []).length} ligne(s) devis
              </p>
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">
                {VOYAGE_STEP_LABELS[deriveVoyageStep(g)]}
              </span>
              <button
                type="button"
                onClick={() => void deleteVoyage(g)}
                disabled={deletingId === g.id}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-red-50 hover:text-[var(--admin-red)] disabled:opacity-40"
              >
                {deletingId === g.id ? "…" : "Supprimer"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
