"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  DOC_TYPE_LABELS,
  customerFullName,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmCustomer,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { bookingCoverUrl } from "@/lib/crm/covers";
import { documentLabel } from "@/lib/crm/carnet";
import { personDocumentsForTraveler, primaryIdentityDoc, travelerDisplayName } from "@/lib/crm/trip-documents";
import { BookingIngest } from "@/components/crm/BookingIngest";
import { CoverPhoto } from "@/components/crm/CoverPhoto";
import { Icon } from "@/components/crm/icons";
import { BookingItemsPanel } from "@/components/admin/BookingItemsPanel";
import { DateFrInput, fieldControlClass } from "@/components/crm/fields";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";

export function BookingEditor({
  booking,
  items,
  travelers,
  documents,
  identityDocs,
  companions,
  customers,
  holderName,
  aiConfigured,
}: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  documents: CrmBookingDocument[];
  identityDocs: CrmTravelDocument[];
  companions: CrmCompanion[];
  customers: CrmCustomer[];
  holderName: { first_name: string; last_name: string };
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const unpublishedItems = items.filter((item) => !item.visible_to_client);
  const needsReview = items.some((item) => item.details?.needs_review === true);
  const [busy, setBusy] = useState<"idle" | "save" | "publish">("idle");
  const [flash, setFlash] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setFlash(null);
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const res = await fetch(`/api/admin/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy("idle");
    if (!res.ok) {
      setFlash("Enregistrement impossible.");
      return;
    }
    setFlash("Enregistré. Le carnet n’est pas publié pour autant.");
    router.refresh();
  }

  async function setPublished(visible: boolean) {
    if (visible && !items.some((item) => item.kind !== "fee")) {
      setFlash("Ajoutez au moins une carte avant de publier le carnet.");
      return;
    }
    setBusy("publish");
    setFlash(null);
    const res = await fetch(`/api/admin/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible_to_client: visible }),
    });
    setBusy("idle");
    if (!res.ok) {
      setFlash(visible ? "Publication impossible." : "Masquage impossible.");
      return;
    }
    setFlash(visible ? "Carnet publié." : "Carnet masqué.");
    router.refresh();
  }

  async function addTraveler(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const companionId = String(fd.get("companion_id") || "");
    const companion = companions.find((c) => c.id === companionId);
    await fetch(`/api/admin/bookings/${booking.id}/travelers`, {
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
    router.refresh();
  }

  async function addHolder() {
    await fetch(`/api/admin/bookings/${booking.id}/travelers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        is_account_holder: true,
        first_name: holderName.first_name,
        last_name: holderName.last_name,
      }),
    });
    router.refresh();
  }

  async function addDoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await fetch(`/api/admin/bookings/${booking.id}/documents`, {
      method: "POST",
      body: new FormData(form),
    });
    form.reset();
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-28">
      <div className="relative h-48 overflow-hidden rounded-3xl sm:h-64">
        <CoverPhoto
          src={bookingCoverUrl(booking, 1200)}
          alt={booking.destination || booking.title}
          priority
        />
      </div>

      <section className="admin-af-card flex flex-col gap-3 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Carnet client</p>
          <p className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
            {booking.visible_to_client ? "Publié" : "Brouillon — invisible au client"}
          </p>
          <p className="text-sm text-muted">
            Enregistrer ne publie pas. Publier rend visibles toutes les cartes actuelles.
          </p>
          {unpublishedItems.length > 0 && booking.visible_to_client ? (
            <p className="mt-2 rounded-2xl bg-[var(--admin-peach)] px-3 py-2 text-sm">
              À vérifier — {unpublishedItems.length} nouvelle{unpublishedItems.length > 1 ? "s" : ""} carte
              {unpublishedItems.length > 1 ? "s" : ""} non publiée{unpublishedItems.length > 1 ? "s" : ""}.
            </p>
          ) : null}
          {needsReview ? (
            <p className="mt-2 text-sm text-accent">Certaines cartes sont marquées lecture douteuse.</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {booking.visible_to_client ? (
            <button
              type="button"
              onClick={() => void setPublished(false)}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
            >
              Masquer le carnet
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void setPublished(true)}
            className="admin-af-btn rounded-full px-4 py-2 text-sm"
          >
            {booking.visible_to_client ? "Publier les mises à jour" : "Publier le carnet"}
          </button>
        </div>
      </section>

      <BookingIngest
        role="admin"
        mode="append"
        ingestUrl="/api/admin/bookings/ingest"
        saveUrl={`/api/admin/bookings/${booking.id}/from-ingest`}
        aiConfigured={aiConfigured}
      />
      <form id="booking-meta" onSubmit={save} className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
        <input name="title" defaultValue={booking.title} className="rounded-xl border border-border px-3 py-2" />
        <input name="destination" defaultValue={booking.destination || ""} className="rounded-xl border border-border px-3 py-2" />
        <DateFrInput name="start_date" defaultValue={booking.start_date || ""} className="rounded-xl border border-border px-3 py-2" />
        <DateFrInput name="end_date" defaultValue={booking.end_date || ""} className="rounded-xl border border-border px-3 py-2" />
        <input name="total_amount" type="number" step="0.01" defaultValue={booking.total_amount} className="rounded-xl border border-border px-3 py-2" />
        <select name="status" defaultValue={booking.status} className="rounded-xl border border-border px-3 py-2">
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          name="customer_id"
          defaultValue={booking.customer_id}
          className="rounded-xl border border-border px-3 py-2 sm:col-span-2"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {customerFullName(c)} — {c.email}
            </option>
          ))}
        </select>
        <textarea name="notes_client" defaultValue={booking.notes_client || ""} placeholder="Notes client" className="sm:col-span-2 rounded-xl border border-border px-3 py-2" />
        <textarea name="notes_internal" defaultValue={booking.notes_internal || ""} placeholder="Notes internes" className="sm:col-span-2 rounded-xl border border-border px-3 py-2" />
        <p className="sm:col-span-2 text-xs text-muted">
          Enregistrer ne publie pas. Le statut confirmé crée le débit au grand livre.
        </p>
      </form>

      <section className="admin-af-card space-y-4 rounded-3xl p-5">
        <div>
          <h2 className="mt-1 font-display text-lg font-bold">Voyageurs</h2>
          <p className="mt-1 text-sm text-muted">
            Les passeports se joignent sur la fiche de chaque personne, pas sur le dossier.
          </p>
        </div>
        {!travelers.length ? (
          <button
            type="button"
            onClick={() => void addHolder()}
            className="rounded-full bg-[var(--admin-peach)] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
          >
            Ajouter {holderName.first_name} {holderName.last_name} (titulaire)
          </button>
        ) : (
          <ul className="space-y-2">
            {travelers.map((traveler) => {
              const personDocs = personDocumentsForTraveler(identityDocs, traveler);
              const doc = primaryIdentityDoc(personDocs);
              return (
                <li
                  key={traveler.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e3dc] bg-white px-3 py-2"
                >
                  <span className="text-sm font-medium text-[var(--admin-navy)]">
                    {travelerDisplayName(traveler)}
                    {traveler.is_account_holder ? " · titulaire" : ""}
                  </span>
                  <span className={`text-xs font-semibold ${doc ? "text-[var(--admin-navy)]" : "text-accent"}`}>
                    {doc
                      ? `${DOC_TYPE_LABELS[doc.doc_type]} ${doc.number || ""}`.trim()
                      : "Pièce manquante"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href={`/admin/clients/${booking.customer_id}`}
          className="inline-flex text-sm font-semibold text-[var(--admin-navy)] underline"
        >
          Joindre les pièces sur la fiche client
        </Link>
        <form onSubmit={addTraveler} className="grid gap-2 sm:grid-cols-2">
          <select name="companion_id" className={fieldControlClass}>
            <option value="">Saisie libre</option>
            {companions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_account_holder" /> Titulaire du dossier
          </label>
          <input name="first_name" placeholder="Prénom" className={fieldControlClass} />
          <input name="last_name" placeholder="Nom" className={fieldControlClass} />
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm sm:col-span-2">
            Ajouter un voyageur
          </button>
        </form>
      </section>

      <BookingItemsPanel bookingId={booking.id} items={items} />

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Billets, vouchers et devis</h2>
        <p className="mt-1 text-sm text-muted">Justificatifs du dossier. Visibles au client seulement après publication du carnet.</p>
        <ul className="mt-2 space-y-2 text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{documentLabel(d, items)}</p>
                <p className="text-xs text-muted">
                  {d.visible_to_client ? "Publié avec le carnet" : "Masqué jusqu’à publication"}
                </p>
              </div>
              <FileOpenLink
                path={d.storage_path}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--admin-sky)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)]"
              >
                <Icon name={fileKindIcon(d.mime_type, d.file_name)} className="h-4 w-4" />
                Ouvrir
              </FileOpenLink>
            </li>
          ))}
        </ul>
        <form onSubmit={addDoc} className="mt-3 flex flex-wrap gap-2">
          <input name="file" type="file" required />
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm">Joindre</button>
        </form>
      </section>

      <div className="fixed bottom-4 left-4 right-4 z-30 flex flex-col gap-2 rounded-2xl border border-[#e5e3dc] bg-white/95 p-3 shadow-[0_12px_32px_rgba(11,25,44,0.12)] backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:left-[calc(18rem+2rem)] lg:right-8">
        <p className="text-sm text-[var(--admin-navy)]">
          {flash ||
            (booking.visible_to_client
              ? "Carnet en ligne — enregistrer ne change pas la visibilité."
              : "Brouillon — le client ne voit rien tant que vous ne publiez pas.")}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="submit"
            form="booking-meta"
            disabled={busy !== "idle"}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy === "save" ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            disabled={busy !== "idle"}
            onClick={() => void setPublished(true)}
            className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy === "publish"
              ? "Publication…"
              : booking.visible_to_client
                ? "Publier les mises à jour"
                : "Publier le carnet"}
          </button>
        </div>
      </div>
    </div>
  );
}
