"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import {
  BOOKING_ITEM_LABELS,
  type BookingItemKind,
  type CrmBookingItem,
} from "@/lib/crm/types";
import type { BookingExtract } from "@/lib/crm/ingest-types";
import { itemDetailsLine, itemWhen } from "@/lib/crm/booking-display";
import { hotelDisplayName, itemPriceLabel } from "@/lib/crm/carnet";
import { IngestItemCard } from "@/components/crm/IngestItemCard";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import { Icon } from "@/components/crm/icons";
import { documentsForItem } from "@/lib/crm/carnet";
import type { CrmBookingDocument } from "@/lib/crm/types";
import type { HouseholdMember } from "@/lib/crm/household";

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
    include_in_ledger: false,
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
    include_in_ledger: Boolean(item.include_in_ledger),
    details: item.details || {},
  };
}

function moveItem<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

export function BookingItemsPanel({
  bookingId,
  items,
  documents = [],
  household = [],
  currency = "EUR",
  onBindDraftSave,
}: {
  bookingId: string;
  items: CrmBookingItem[];
  documents?: CrmBookingDocument[];
  household?: HouseholdMember[];
  currency?: string;
  onBindDraftSave?: (save: (() => Promise<boolean>) | null) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [syncedItems, setSyncedItems] = useState(items);
  if (syncedItems !== items) {
    setSyncedItems(items);
    setRows(items);
  }
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);

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

  async function persistOrder(next: CrmBookingItem[]) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((item) => item.id) }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Ordre non enregistré.");
      setRows(items);
      return;
    }
    router.refresh();
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = moveItem(rows, from, to);
    if (next === rows) return;
    setRows(next);
    void persistOrder(next);
  }

  async function saveDraft() {
    if (!editingId) return true;
    if (!draft.title.trim()) {
      setError("Titre requis.");
      return false;
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
      include_in_ledger: Boolean(draft.include_in_ledger),
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
      return false;
    }
    setEditingId(null);
    router.refresh();
    return true;
  }

  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  const onBindRef = useRef(onBindDraftSave);
  onBindRef.current = onBindDraftSave;
  useEffect(() => {
    onBindRef.current?.(() => saveDraftRef.current());
    return () => onBindRef.current?.(null);
  }, []);

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
      <p className="mt-1 text-xs text-muted">Glissez pour l’ordre du carnet. Par défaut : chronologique.</p>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.map((item, index) => (
          <li
            key={item.id}
            className="rounded-xl border border-border px-3 py-2"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              const from = dragFrom.current;
              dragFrom.current = null;
              if (from == null) return;
              reorder(from, index);
            }}
          >
            {editingId === item.id ? (
              <div className="space-y-2">
                <IngestItemCard
                  item={draft}
                  household={household}
                  onChange={setDraft}
                  onRemove={() => setEditingId(null)}
                />
                <ItemAttachments
                  bookingId={bookingId}
                  itemId={item.id}
                  docs={documentsForItem(item, documents)}
                />
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
                <div className="flex min-w-0 items-start gap-2">
                  <span
                    draggable
                    onDragStart={(event) => {
                      dragFrom.current = index;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.id);
                    }}
                    className="mt-0.5 cursor-grab touch-none text-muted"
                    aria-label="Réordonner"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind} ·{" "}
                      {item.kind === "hotel" ? hotelDisplayName(item) : item.title}
                      {!item.visible_to_client ? (
                        <span className="ml-2 rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase">
                          Brouillon
                        </span>
                      ) : null}
                      {item.include_in_ledger ? (
                        <span className="ml-2 rounded-full bg-[var(--admin-sky)] px-2 py-0.5 text-[10px] font-bold uppercase">
                          Transactions
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      {[itemWhen(item), itemDetailsLine(item), itemPriceLabel(item, currency)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <ItemAttachments
                      bookingId={bookingId}
                      itemId={item.id}
                      docs={documentsForItem(item, documents)}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Monter"
                    className="rounded-full p-1 text-muted disabled:opacity-30"
                    disabled={index === 0 || busy}
                    onClick={() => reorder(index, index - 1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Descendre"
                    className="rounded-full p-1 text-muted disabled:opacity-30"
                    disabled={index === rows.length - 1 || busy}
                    onClick={() => reorder(index, index + 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
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
          <IngestItemCard
            item={draft}
            household={household}
            onChange={setDraft}
            onRemove={() => setEditingId(null)}
          />
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

function ItemAttachments({
  bookingId,
  itemId,
  docs,
}: {
  bookingId: string;
  itemId: string;
  docs: CrmBookingDocument[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set("booking_item_id", itemId);
    setBusy(true);
    await fetch(`/api/admin/bookings/${bookingId}/documents`, { method: "POST", body: fd });
    setBusy(false);
    form.reset();
    router.refresh();
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Pièces jointes</p>
      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate">{doc.file_name || "Document"}</span>
          <FileOpenLink path={doc.storage_path} className="inline-flex items-center gap-1 font-semibold">
            <Icon name={fileKindIcon(doc.mime_type, doc.file_name)} className="h-3.5 w-3.5" />
            Ouvrir
          </FileOpenLink>
        </div>
      ))}
      <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
        <input name="file" type="file" required className="text-xs" />
        <button type="submit" disabled={busy} className="text-xs font-semibold text-[var(--admin-navy)]">
          {busy ? "Envoi…" : "Joindre"}
        </button>
      </form>
    </div>
  );
}
