"use client";

import { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BOOKING_ITEM_KINDS,
  BOOKING_ITEM_LABELS,
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  DOC_TYPE_LABELS,
  type BookingItemKind,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { itemDetailsLine, itemWhen } from "@/lib/crm/booking-display";
import { bookingCoverUrl } from "@/lib/crm/covers";
import { personDocumentsForTraveler, primaryIdentityDoc, travelerDisplayName } from "@/lib/crm/trip-documents";
import { BookingIngest } from "@/components/crm/BookingIngest";
import { DateFrInput, fieldControlClass } from "@/components/crm/fields";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";

export function BookingEditor({
  booking,
  items,
  travelers,
  documents,
  identityDocs,
  companions,
  holderName,
  aiConfigured,
}: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  documents: CrmBookingDocument[];
  identityDocs: CrmTravelDocument[];
  companions: CrmCompanion[];
  holderName: { first_name: string; last_name: string };
  aiConfigured: boolean;
}) {
  const router = useRouter();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    await fetch(`/api/admin/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    await fetch(`/api/admin/bookings/${booking.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    form.reset();
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

  async function toggleDoc(id: string, visible: boolean) {
    await fetch(`/api/admin/bookings/${booking.id}/documents`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, visible_to_client: visible }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bookingCoverUrl(booking)}
          alt={booking.destination || booking.title}
          className="h-48 w-full object-cover sm:h-64"
        />
      </div>
      <BookingIngest
        role="admin"
        mode="append"
        ingestUrl="/api/admin/bookings/ingest"
        saveUrl={`/api/admin/bookings/${booking.id}/from-ingest`}
        aiConfigured={aiConfigured}
      />
      <form onSubmit={save} className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
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
        <textarea name="notes_client" defaultValue={booking.notes_client || ""} placeholder="Notes client" className="sm:col-span-2 rounded-xl border border-border px-3 py-2" />
        <textarea name="notes_internal" defaultValue={booking.notes_internal || ""} placeholder="Notes internes" className="sm:col-span-2 rounded-xl border border-border px-3 py-2" />
        <button className="admin-af-btn rounded-full px-4 py-2 text-sm sm:col-span-2">
          Enregistrer (le statut confirmé crée le débit)
        </button>
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

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Prestations</h2>
        <ul className="mt-2 text-sm">
          {items.map((i) => (
            <li key={i.id}>
              {BOOKING_ITEM_LABELS[i.kind as BookingItemKind] || i.kind} · {i.title}
              {itemWhen(i) ? ` · ${itemWhen(i)}` : ""}
              {itemDetailsLine(i) ? ` · ${itemDetailsLine(i)}` : ""}
            </li>
          ))}
        </ul>
        <form onSubmit={addItem} className="mt-3 grid gap-2 sm:grid-cols-4">
          <select name="kind" className="rounded-xl border border-border px-3 py-2">
            {BOOKING_ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {BOOKING_ITEM_LABELS[k]}
              </option>
            ))}
          </select>
          <input name="title" required placeholder="Titre" className="rounded-xl border border-border px-3 py-2" />
          <input name="amount" type="number" step="0.01" placeholder="Montant" className="rounded-xl border border-border px-3 py-2" />
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm">Ajouter</button>
        </form>
      </section>

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Billets, vouchers et devis</h2>
        <p className="mt-1 text-sm text-muted">Justificatifs du dossier, distincts des passeports.</p>
        <ul className="mt-2 space-y-2 text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{d.file_name || d.kind}</p>
                <p className="text-xs text-muted">
                  {d.visible_to_client ? "Visible client" : "Masqué au client"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <FileOpenLink
                  path={d.storage_path}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--admin-sky)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)]"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {fileKindIcon(d.mime_type, d.file_name)}
                  </span>
                  Ouvrir
                </FileOpenLink>
                <button
                  type="button"
                  className="text-xs font-semibold"
                  onClick={() => toggleDoc(d.id, !d.visible_to_client)}
                >
                  {d.visible_to_client ? "Masquer" : "Publier"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={addDoc} className="mt-3 flex flex-wrap gap-2">
          <input name="file" type="file" required />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="visible_to_client" value="true" /> Visible client
          </label>
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm">Uploader</button>
        </form>
      </section>
    </div>
  );
}
