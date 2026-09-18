"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOOKING_ITEM_LABELS,
  type BookingItemKind,
  type CrmBookingItem,
} from "@/lib/crm/types";
import type { BookingExtract } from "@/lib/crm/ingest-types";
import { itemDetailsLine, itemWhen } from "@/lib/crm/booking-display";
import { IngestItemCard } from "@/components/crm/IngestItemCard";

type ItemDraft = BookingExtract["items"][number];

function emptyDraft(): ItemDraft {
  return {
    kind: "hotel",
    title: "",
    supplier: "",
    confirmation_ref: "",
    start_at: "",
    end_at: "",
    amount: null,
    details: {},
  };
}

function toDraft(item: CrmBookingItem): ItemDraft {
  return {
    kind: item.kind,
    title: item.title,
    supplier: item.supplier || "",
    confirmation_ref: item.confirmation_ref || "",
    start_at: item.start_at || "",
    end_at: item.end_at || "",
    amount: item.amount,
    details: item.details || {},
  };
}

export function BookingItemsPanel({
  bookingId,
  items,
}: {
  bookingId: string;
  items: CrmBookingItem[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(item: CrmBookingItem) {
    setEditingId(item.id);
    setDraft(toDraft(item));
    setError(null);
  }

  function startNew() {
    setEditingId("new");
    setDraft(emptyDraft());
    setError(null);
  }

  async function saveDraft() {
    if (!draft.title.trim()) {
      setError("Titre requis.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      kind: draft.kind,
      title: draft.title,
      supplier: draft.supplier || null,
      confirmation_ref: draft.confirmation_ref || null,
      start_at: draft.start_at || null,
      end_at: draft.end_at || null,
      amount: draft.amount,
      details: draft.details || {},
    };
    const res =
      editingId && editingId !== "new"
        ? await fetch(`/api/admin/bookings/${bookingId}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch(`/api/admin/bookings/${bookingId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Enregistrement impossible");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function removeItem(id: string) {
    setBusy(true);
    await fetch(`/api/admin/bookings/${bookingId}/items?itemId=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (editingId === id) setEditingId(null);
    router.refresh();
  }

  return (
    <section className="admin-af-card rounded-3xl p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Cartes</h2>
        <button
          type="button"
          className="text-xs font-semibold text-[var(--admin-navy)] underline"
          onClick={startNew}
        >
          Ajouter une carte
        </button>
      </div>
      <ul className="mt-2 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-border px-3 py-2">
            {editingId === item.id ? (
              <div className="space-y-2">
                <IngestItemCard item={draft} onChange={setDraft} onRemove={() => setEditingId(null)} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveDraft()}
                    className="admin-af-btn rounded-full px-4 py-1.5 text-xs"
                  >
                    {busy ? "…" : "Enregistrer la carte"}
                  </button>
                  <button type="button" className="text-xs font-semibold" onClick={() => setEditingId(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind} · {item.title}
                    {!item.visible_to_client ? (
                      <span className="ml-2 rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase">
                        Brouillon
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {[itemWhen(item), itemDetailsLine(item)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--admin-navy)]"
                    onClick={() => startEdit(item)}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-accent"
                    onClick={() => void removeItem(item.id)}
                  >
                    Retirer
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editingId === "new" ? (
        <div className="mt-3 space-y-2">
          <IngestItemCard item={draft} onChange={setDraft} onRemove={() => setEditingId(null)} />
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveDraft()}
            className="admin-af-btn rounded-full px-4 py-2 text-sm"
          >
            {busy ? "Enregistrement…" : "Ajouter au dossier"}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
      <p className="mt-2 text-xs text-muted">Retirer une carte conserve le PDF joint au dossier.</p>
    </section>
  );
}
