"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOOKING_ITEM_KINDS,
  BOOKING_ITEM_LABELS,
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
} from "@/lib/crm/types";

type Notice = { tone: "error" | "success"; text: string } | null;

async function apiRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Erreur serveur (${response.status})`);
  return data;
}

export function BookingEditor({
  booking,
  items,
  travelers,
  documents,
  companions,
}: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  documents: CrmBookingDocument[];
  companions: CrmCompanion[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.sort_order - b.sort_order),
    [items]
  );

  async function run(key: string, success: string, action: () => Promise<void>) {
    setPending(key);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "success", text: success });
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Une erreur est survenue.",
      });
    } finally {
      setPending(null);
    }
  }

  async function submitJson(
    event: FormEvent<HTMLFormElement>,
    key: string,
    url: string,
    method: "POST" | "PATCH",
    success: string,
    extra?: Record<string, unknown>
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = { ...Object.fromEntries(new FormData(form).entries()), ...extra };
    await run(key, success, async () => {
      await apiRequest(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (method === "POST") form.reset();
    });
  }

  async function addTraveler(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const companionId = String(fd.get("companion_id") || "");
    const companion = companions.find((candidate) => candidate.id === companionId);
    await run("traveler-add", "Voyageur ajouté.", async () => {
      await apiRequest(`/api/admin/bookings/${booking.id}/travelers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companion_id: companionId || null,
          is_account_holder: fd.get("is_account_holder") === "on",
          first_name: companion?.first_name || fd.get("first_name"),
          last_name: companion?.last_name || fd.get("last_name"),
        }),
      });
      form.reset();
    });
  }

  async function addDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await run("document-add", "Document ajouté.", async () => {
      await apiRequest(`/api/admin/bookings/${booking.id}/documents`, {
        method: "POST",
        body: new FormData(form),
      });
      form.reset();
    });
  }

  async function uploadCover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await run("cover-upload", "Image de couverture mise à jour.", async () => {
      await apiRequest(`/api/admin/bookings/${booking.id}/cover`, {
        method: "POST",
        body: new FormData(form),
      });
      form.reset();
    });
  }

  async function moveItem(index: number, direction: -1 | 1) {
    const item = sortedItems[index];
    const other = sortedItems[index + direction];
    if (!other) return;
    const reordered = [...sortedItems];
    reordered[index] = other;
    reordered[index + direction] = item;
    await run(`item-move-${item.id}`, "Ordre mis à jour.", async () => {
      await Promise.all(
        reordered.map((entry, sortOrder) =>
          apiRequest(`/api/admin/bookings/${booking.id}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: entry.id, sort_order: sortOrder }),
          })
        )
      );
    });
  }

  async function remove(kind: "item" | "traveler" | "document", id: string) {
    const labels = { item: "cette prestation", traveler: "ce voyageur", document: "ce document" };
    if (!window.confirm(`Supprimer ${labels[kind]} ? Cette action est irréversible.`)) return;
    const paths = {
      item: `items?itemId=${encodeURIComponent(id)}`,
      traveler: `travelers?travelerId=${encodeURIComponent(id)}`,
      document: `documents?documentId=${encodeURIComponent(id)}`,
    };
    await run(`${kind}-delete-${id}`, "Suppression effectuée.", async () => {
      await apiRequest(`/api/admin/bookings/${booking.id}/${paths[kind]}`, { method: "DELETE" });
    });
  }

  async function deleteBooking() {
    if (!window.confirm(`Supprimer définitivement la réservation ${booking.reference} ?`)) return;
    await run("booking-delete", "Réservation supprimée.", async () => {
      await apiRequest(`/api/admin/bookings/${booking.id}`, { method: "DELETE" });
      router.push("/admin/reservations");
    });
  }

  const disabled = pending !== null;
  const fieldClass = "rounded-xl border border-border px-3 py-2";

  return (
    <div className="space-y-6">
      <div aria-live="polite" aria-atomic="true">
        {pending ? <p className="text-sm text-muted">Traitement en cours…</p> : null}
        {notice ? (
          <p className={`text-sm ${notice.tone === "error" ? "text-accent" : "text-emerald-700"}`}>
            {notice.text}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(event) =>
          submitJson(event, "booking-save", `/api/admin/bookings/${booking.id}`, "PATCH", "Réservation enregistrée.")
        }
        className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-2"
      >
        <input name="title" required defaultValue={booking.title} className={fieldClass} />
        <input name="destination" defaultValue={booking.destination || ""} className={fieldClass} />
        <input name="start_date" type="date" defaultValue={booking.start_date || ""} className={fieldClass} />
        <input name="end_date" type="date" defaultValue={booking.end_date || ""} className={fieldClass} />
        <input name="total_amount" type="number" step="0.01" defaultValue={booking.total_amount} className={fieldClass} />
        <select name="status" defaultValue={booking.status} className={fieldClass}>
          {BOOKING_STATUSES.map((status) => (
            <option key={status} value={status}>{BOOKING_STATUS_LABELS[status]}</option>
          ))}
        </select>
        <textarea name="notes_client" defaultValue={booking.notes_client || ""} placeholder="Notes client" className={`sm:col-span-2 ${fieldClass}`} />
        <textarea name="notes_internal" defaultValue={booking.notes_internal || ""} placeholder="Notes internes" className={`sm:col-span-2 ${fieldClass}`} />
        <button disabled={disabled} className="admin-af-btn rounded-full px-4 py-2 text-sm sm:col-span-2 disabled:opacity-50">
          {pending === "booking-save" ? "Enregistrement…" : "Enregistrer (le statut confirmé crée le débit)"}
        </button>
      </form>

      <form onSubmit={uploadCover} className="admin-af-card flex flex-wrap items-center gap-3 rounded-3xl p-5">
        <div className="mr-auto">
          <h2 className="font-display text-lg font-bold">Image de couverture</h2>
          <p className="text-xs text-muted">{booking.cover_image_path ? "Une couverture est enregistrée." : "Aucune couverture."} JPG, PNG ou WebP, 10 Mo maximum.</p>
        </div>
        <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
        <button disabled={disabled} className="admin-af-btn rounded-full px-3 py-2 text-sm disabled:opacity-50">{pending === "cover-upload" ? "Upload…" : "Mettre à jour"}</button>
      </form>

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Prestations</h2>
        <ul className="mt-3 space-y-3">
          {sortedItems.map((item, index) => (
            <li key={item.id} className="rounded-2xl border border-border p-3">
              <form
                onSubmit={(event) =>
                  submitJson(event, `item-save-${item.id}`, `/api/admin/bookings/${booking.id}/items`, "PATCH", "Prestation enregistrée.", { id: item.id })
                }
                className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
              >
                <select name="kind" defaultValue={item.kind} className={fieldClass}>
                  {BOOKING_ITEM_KINDS.map((kind) => <option key={kind} value={kind}>{BOOKING_ITEM_LABELS[kind]}</option>)}
                </select>
                <input name="title" required defaultValue={item.title} className={fieldClass} />
                <input name="amount" type="number" step="0.01" defaultValue={item.amount ?? ""} className={fieldClass} />
                <input name="supplier" defaultValue={item.supplier || ""} placeholder="Fournisseur" className={fieldClass} />
                <input name="confirmation_ref" defaultValue={item.confirmation_ref || ""} placeholder="Référence fournisseur" className={fieldClass} />
                <label className="text-xs text-muted">Début<input name="start_at" type="datetime-local" defaultValue={item.start_at?.slice(0, 16) || ""} className={`mt-1 w-full text-foreground ${fieldClass}`} /></label>
                <label className="text-xs text-muted">Fin<input name="end_at" type="datetime-local" defaultValue={item.end_at?.slice(0, 16) || ""} className={`mt-1 w-full text-foreground ${fieldClass}`} /></label>
                <div className="flex items-center gap-2">
                  <button disabled={disabled} className="text-xs font-semibold disabled:opacity-50">Modifier</button>
                  <button type="button" disabled={disabled || index === 0} onClick={() => moveItem(index, -1)} aria-label="Monter la prestation">↑</button>
                  <button type="button" disabled={disabled || index === sortedItems.length - 1} onClick={() => moveItem(index, 1)} aria-label="Descendre la prestation">↓</button>
                  <button type="button" disabled={disabled} onClick={() => remove("item", item.id)} className="text-xs font-semibold text-accent">Supprimer</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) =>
            submitJson(event, "item-add", `/api/admin/bookings/${booking.id}/items`, "POST", "Prestation ajoutée.", {
              sort_order: sortedItems.length,
            })
          }
          className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          <select name="kind" className={fieldClass}>
            {BOOKING_ITEM_KINDS.map((kind) => <option key={kind} value={kind}>{BOOKING_ITEM_LABELS[kind]}</option>)}
          </select>
          <input name="title" required placeholder="Titre" className={fieldClass} />
          <input name="amount" type="number" step="0.01" placeholder="Montant" className={fieldClass} />
          <input name="supplier" placeholder="Fournisseur" className={fieldClass} />
          <input name="confirmation_ref" placeholder="Référence fournisseur" className={fieldClass} />
          <input name="start_at" type="datetime-local" aria-label="Début" className={fieldClass} />
          <input name="end_at" type="datetime-local" aria-label="Fin" className={fieldClass} />
          <button disabled={disabled} className="admin-af-btn rounded-full px-3 py-2 text-sm disabled:opacity-50">Ajouter</button>
        </form>
      </section>

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Voyageurs</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {travelers.map((traveler) => (
            <li key={traveler.id} className="flex items-center justify-between gap-3">
              <span>{[traveler.first_name, traveler.last_name].filter(Boolean).join(" ")}{traveler.is_account_holder ? " (titulaire)" : ""}</span>
              <button type="button" disabled={disabled} onClick={() => remove("traveler", traveler.id)} className="text-xs font-semibold text-accent">Supprimer</button>
            </li>
          ))}
        </ul>
        <form onSubmit={addTraveler} className="mt-3 flex flex-wrap gap-2">
          <select name="companion_id" className={fieldClass}>
            <option value="">Saisie libre</option>
            {companions.map((companion) => <option key={companion.id} value={companion.id}>{companion.first_name} {companion.last_name}</option>)}
          </select>
          <input name="first_name" placeholder="Prénom" className={fieldClass} />
          <input name="last_name" placeholder="Nom" className={fieldClass} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_account_holder" /> Titulaire</label>
          <button disabled={disabled} className="admin-af-btn rounded-full px-3 py-2 text-sm disabled:opacity-50">Ajouter</button>
        </form>
      </section>

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Documents</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {documents.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-3">
              <a className="underline" href={`/api/files?path=${encodeURIComponent(document.storage_path)}`}>{document.file_name || document.kind}</a>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={disabled}
                  className="text-xs font-semibold"
                  onClick={() => run(`document-toggle-${document.id}`, "Visibilité mise à jour.", async () => {
                    await apiRequest(`/api/admin/bookings/${booking.id}/documents`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: document.id, visible_to_client: !document.visible_to_client }),
                    });
                  })}
                >
                  {document.visible_to_client ? "Masquer au client" : "Publier au client"}
                </button>
                <button type="button" disabled={disabled} onClick={() => remove("document", document.id)} className="text-xs font-semibold text-accent">Supprimer</button>
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={addDocument} className="mt-3 flex flex-wrap gap-2">
          <input name="file" type="file" required />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible_to_client" value="true" /> Visible client</label>
          <button disabled={disabled} className="admin-af-btn rounded-full px-3 py-2 text-sm disabled:opacity-50">Uploader</button>
        </form>
      </section>

      <section className="rounded-3xl border border-red-200 bg-red-50 p-5">
        <h2 className="font-display text-lg font-bold text-red-900">Zone dangereuse</h2>
        <button type="button" disabled={disabled} onClick={deleteBooking} className="mt-3 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
          {pending === "booking-delete" ? "Suppression…" : "Supprimer la réservation"}
        </button>
      </section>
    </div>
  );
}
