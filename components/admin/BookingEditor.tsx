"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
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
import { formatMoney, jMinusLabel } from "@/lib/crm/money";
import { bookingTotalFromItems } from "@/lib/crm/bookings";
import { documentLabel } from "@/lib/crm/carnet";
import { BookingIngest } from "@/components/crm/BookingIngest";
import { CoverPhoto } from "@/components/crm/CoverPhoto";
import { Icon } from "@/components/crm/icons";
import { BookingItemsPanel } from "@/components/admin/BookingItemsPanel";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { DateFrInput, fieldControlClass } from "@/components/crm/fields";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import { TripPassportPicker } from "@/components/crm/TripPassportPicker";
import { ExtrasPanel } from "@/components/crm/ExtrasPanel";
import { IssuesList } from "@/components/crm/IssuesList";
import { collectPublishIssues, issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import { householdMembers } from "@/lib/crm/household";
import { bookingHasFlight } from "@/lib/crm/extras";

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
  const [issues, setIssues] = useState<BookingIssue[]>([]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setFlash(null);
    const fd = new FormData(event.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch(`/api/admin/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        include_in_ledger: fd.get("include_in_ledger") === "on",
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("idle");
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      setFlash(null);
      return;
    }
    setIssues([]);
    setFlash("Enregistré. Le carnet n’est pas publié pour autant.");
    router.refresh();
  }

  async function setPublished(visible: boolean) {
    if (visible) {
      const publishIssues = collectPublishIssues(items);
      if (publishIssues.length) {
        setIssues(publishIssues);
        setFlash(null);
        return;
      }
    }
    setBusy("publish");
    setFlash(null);
    setIssues([]);
    const res = await fetch(`/api/admin/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible_to_client: visible }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("idle");
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      setFlash(null);
      return;
    }
    setFlash(visible ? "Carnet publié." : "Carnet masqué.");
    router.refresh();
  }

  async function addTraveler(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const key = String(fd.get("party_key") || "");
    const isHolder = key === "holder";
    const companionId = key.startsWith("companion:") ? key.slice("companion:".length) : "";
    const res = await fetch(`/api/admin/bookings/${booking.id}/travelers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companion_id: companionId || null,
        is_account_holder: isHolder,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    setIssues([]);
    form.reset();
    router.refresh();
  }

  async function removeTraveler(travelerId: string) {
    await fetch(
      `/api/admin/bookings/${booking.id}/travelers?travelerId=${encodeURIComponent(travelerId)}`,
      { method: "DELETE" }
    );
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
    <div className="space-y-6">
      <div className="relative h-36 overflow-hidden rounded-3xl sm:h-48">
        <CoverPhoto
          src={bookingCoverUrl(booking, 960)}
          alt={booking.destination || booking.title}
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--admin-navy)]/90 via-[var(--admin-navy)]/20 to-transparent" />
        <div className="absolute bottom-4 left-5 right-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
            {booking.reference}
            {jMinusLabel(booking.start_date) ? ` · ${jMinusLabel(booking.start_date)}` : ""}
          </p>
          <h1 className="font-display text-2xl font-bold leading-tight">{booking.title}</h1>
        </div>
      </div>

      <section className="admin-af-card flex flex-col gap-3 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Carnet client</p>
          <p className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
            {booking.visible_to_client ? "Visible dans l’espace" : "Masqué — invisible au client"}
          </p>
          <p className="text-sm text-muted">
            Enregistrer ne publie pas. L’interrupteur rend le carnet visible dans l’espace client.
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
          {flash ? <p className="mt-2 text-sm text-[var(--admin-navy)]">{flash}</p> : null}
          <IssuesList issues={issues} className="mt-2" />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="submit"
            form="booking-meta"
            disabled={busy !== "idle"}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy === "save" ? "Enregistrement…" : "Enregistrer"}
          </button>
          <label className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={booking.visible_to_client}
              disabled={busy !== "idle"}
              onChange={(event) => void setPublished(event.target.checked)}
            />
            Visible dans l’espace
          </label>
          {booking.visible_to_client && unpublishedItems.length > 0 ? (
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={() => void setPublished(true)}
              className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy === "publish" ? "Publication…" : "Publier les mises à jour"}
            </button>
          ) : null}
        </div>
      </section>

      <BookingIngest
        role="admin"
        mode="append"
        householdHolder={customers.find((row) => row.id === booking.customer_id) || holderName}
        householdCompanions={companions}
        ingestUrl="/api/admin/bookings/ingest"
        saveUrl={`/api/admin/bookings/${booking.id}/from-ingest`}
        aiConfigured={aiConfigured}
      />
      <form id="booking-meta" onSubmit={save} className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Titre du voyage
          <input name="title" required defaultValue={booking.title} className="rounded-xl border border-border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Destination
          <input name="destination" defaultValue={booking.destination || ""} className="rounded-xl border border-border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Départ
          <DateFrInput name="start_date" aria-label="Date de départ" defaultValue={booking.start_date || ""} className="rounded-xl border border-border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Retour
          <DateFrInput name="end_date" aria-label="Date de retour" defaultValue={booking.end_date || ""} className="rounded-xl border border-border px-3 py-2" />
        </label>
        <div className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Montant du séjour
          <p className="rounded-xl border border-border bg-[#f7f6f2] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)]">
            {formatMoney(bookingTotalFromItems(items), booking.currency)}
          </p>
          <span className="font-normal text-muted">
            Somme des prix vendus de chaque carte. Le frais de billeterie n’est pas inclus.
          </span>
        </div>
        <label className="flex items-start gap-2 text-sm font-semibold text-[var(--admin-navy)] sm:col-span-2">
          <input
            type="checkbox"
            name="include_in_ledger"
            defaultChecked={booking.include_in_ledger !== false}
            className="mt-1"
          />
          <span>
            Inclure le montant du séjour dans les transactions
            <span className="mt-0.5 block text-xs font-normal text-muted">
              Décochez pour afficher le prix au carnet sans impacter l’encours client.
              {items.some((item) => item.include_in_ledger)
                ? " Des cartes sont déjà comptabilisées : laissez décoché pour éviter un double compte."
                : ""}
            </span>
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Statut
          <select name="status" defaultValue={booking.status} className="rounded-xl border border-border bg-white px-3 py-2">
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BOOKING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted sm:col-span-2">
          Client voyageur (titulaire)
          <select
            name="customer_id"
            defaultValue={booking.customer_id}
            className="rounded-xl border border-border bg-white px-3 py-2"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {customerFullName(c)} — {c.email}
                {c.company_role === "member" ? " · rattaché" : ""}
                {c.company_role === "admin" ? " · admin société" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted sm:col-span-2">
          Facturé à (wallet / société)
          <select
            name="billing_customer_id"
            defaultValue={booking.billing_customer_id || booking.customer_id}
            className="rounded-xl border border-border bg-white px-3 py-2"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {customerFullName(c)}
                {c.company_name ? ` · ${c.company_name}` : ""}
                {c.company_role === "admin" ? " · admin société" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted sm:col-span-2">
          Notes visibles par le client
          <textarea name="notes_client" defaultValue={booking.notes_client || ""} placeholder="Conseils, horaires de rendez-vous…" className="rounded-xl border border-border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted sm:col-span-2">
          Notes internes (agence)
          <textarea name="notes_internal" defaultValue={booking.notes_internal || ""} placeholder="Jamais affichées au client" className="rounded-xl border border-border px-3 py-2" />
        </label>
        <p className="sm:col-span-2 text-xs text-muted">
          Enregistrer ne publie pas. Le statut confirmé crée le débit au grand livre.
        </p>
        <button
          type="submit"
          disabled={busy !== "idle"}
          className="admin-af-btn rounded-full px-4 py-2 text-sm sm:col-span-2 sm:justify-self-start disabled:opacity-50"
        >
          {busy === "save" ? "Enregistrement…" : "Enregistrer le dossier"}
        </button>
      </form>

      <section className="admin-af-card space-y-4 rounded-3xl p-5">
        <div>
          <h2 className="mt-1 font-display text-lg font-bold">Voyageurs</h2>
          <p className="mt-1 text-sm text-muted">
            Cochez le passeport utilisé pour chaque voyageur de ce séjour.
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
          <TripPassportPicker
            variant="admin"
            customerId={booking.customer_id}
            bookingId={booking.id}
            travelers={travelers}
            documents={identityDocs}
          />
        )}
        <Link
          href={`/admin/clients/${booking.customer_id}`}
          className="inline-flex text-sm font-semibold text-[var(--admin-navy)] underline"
        >
          Joindre les pièces sur la fiche client
        </Link>
        {travelers.length ? (
          <ul className="space-y-1 text-sm">
            {travelers.map((traveler) => (
              <li key={traveler.id} className="flex items-center justify-between gap-2">
                <span>
                  {[traveler.first_name, traveler.last_name].filter(Boolean).join(" ") || "Voyageur"}
                  {traveler.is_account_holder ? " · titulaire" : ""}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-accent"
                  onClick={() => void removeTraveler(traveler.id)}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={addTraveler} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select name="party_key" required className={fieldControlClass}>
            <option value="">Voyageur du foyer…</option>
            {travelers.some((row) => row.is_account_holder) ? null : (
              <option value="holder">
                {holderName.first_name} {holderName.last_name} (titulaire)
              </option>
            )}
            {companions
              .filter((companion) => !travelers.some((row) => row.companion_id === companion.id))
              .map((companion) => (
                <option key={companion.id} value={`companion:${companion.id}`}>
                  {companion.first_name} {companion.last_name}
                </option>
              ))}
          </select>
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm">Ajouter</button>
        </form>
      </section>

      <BookingItemsPanel
        bookingId={booking.id}
        items={items}
        documents={documents}
        household={householdMembers(
          customers.find((row) => row.id === booking.customer_id) || holderName,
          companions
        )}
        currency={booking.currency}
      />

      {customers.find((row) => row.id === booking.customer_id) && bookingHasFlight(items) ? (
        <section className="admin-af-card rounded-3xl p-5">
          <ExtrasPanel
            variant="admin"
            booking={booking}
            items={items}
            travelers={travelers}
            holder={customers.find((row) => row.id === booking.customer_id)!}
            companions={companions}
          />
        </section>
      ) : null}

      {items.length ? (
        <section className="admin-af-card space-y-3 rounded-3xl p-5">
          <h2 className="font-display text-lg font-bold">Aperçu client</h2>
          <p className="text-sm text-muted">Les mêmes cartes, dans l’ordre du carnet. Invisible tant que vous ne publiez pas.</p>
          <CarnetItinerary
            booking={booking}
            items={items}
            docs={documents}
            calendarBase={`/api/admin/bookings/${booking.id}/calendrier`}
          />
        </section>
      ) : null}

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
    </div>
  );
}
