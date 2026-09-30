"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HidePriceChoice } from "@/components/crm/HidePriceChoice";
import type { CrmBookingDocument } from "@/lib/crm/types";

export function DocumentPriceChoices({
  bookingId,
  documents,
}: {
  bookingId: string;
  documents: CrmBookingDocument[];
}) {
  const router = useRouter();
  const pending = documents.filter((doc) => doc.hide_prices == null);
  const [choice, setChoice] = useState<Record<string, boolean | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!pending.length) return null;

  async function save(documentId: string) {
    const hidePrices = choice[documentId];
    if (hidePrices == null) return;
    setBusy(documentId);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/documents`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: documentId, hide_prices: hidePrices }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Enregistrement impossible");
      return;
    }
    router.refresh();
  }

  return (
    <section className="admin-af-card space-y-3 rounded-3xl p-5">
      <h2 className="font-display text-lg font-bold">Prix sur le PDF</h2>
      <p className="text-sm text-muted">
        Ces pièces sont arrivées sans réponse. Elles restent invisibles au client tant que le choix n’est pas fait.
      </p>
      {pending.map((doc) => (
        <div key={doc.id} className="space-y-2 rounded-2xl border border-border p-3">
          <p className="text-sm font-semibold">{doc.file_name || "Document"}</p>
          <HidePriceChoice
            value={choice[doc.id] ?? null}
            onChange={(next) => setChoice((prev) => ({ ...prev, [doc.id]: next }))}
          />
          <button
            type="button"
            disabled={busy === doc.id || choice[doc.id] == null}
            onClick={() => void save(doc.id)}
            className="admin-af-btn rounded-full px-3 py-2 text-sm disabled:opacity-50"
          >
            {busy === doc.id ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      ))}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </section>
  );
}
