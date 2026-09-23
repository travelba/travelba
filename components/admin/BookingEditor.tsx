"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  customerFullName,
  isLedgerExpenseKind,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmCustomer,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { BusyBar } from "@/components/crm/BusyBar";
import { formatMoney, jMinusLabel } from "@/lib/crm/money";
import { bookingTotalFromItems } from "@/lib/crm/bookings";
import { passengersFromDetails, peopleNotOnStay } from "@/lib/crm/document-passengers";
import { coverQuery, documentLabel } from "@/lib/crm/carnet";
import { BookingIngest } from "@/components/crm/BookingIngest";
import { BookingHero } from "@/components/crm/BookingHero";
import { CoverPickDialog } from "@/components/admin/CoverPickDialog";
import { Icon } from "@/components/crm/icons";
import { BookingExpensesPanel } from "@/components/admin/BookingExpensesPanel";
import { BookingItemsPanel } from "@/components/admin/BookingItemsPanel";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { DateFrInput, fieldControlClass } from "@/components/crm/fields";
import { PlaceField } from "@/components/crm/PlaceField";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import { TripPassportPicker } from "@/components/crm/TripPassportPicker";
import { TripFormalities } from "@/components/crm/TripFormalities";
import { TripVisaUploads } from "@/components/crm/TripVisaUploads";
import { ExtrasPanel } from "@/components/crm/ExtrasPanel";
import { IssuesList } from "@/components/crm/IssuesList";
import { collectPublishIssues, issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import { householdMembers } from "@/lib/crm/household";
import { bookingHasFlight } from "@/lib/crm/extras";
import type { FrenchPassportTrip } from "@/lib/crm/visa-trip";
import { reusableDocumentsForTraveler, tripDocumentsForTraveler } from "@/lib/crm/trip-documents";

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
  formalities,
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
  formalities: FrenchPassportTrip;
}) {
  const router = useRouter();
  const saveOpenCard = useRef<(() => Promise<boolean>) | null>(null);
  const unpublishedItems = items.filter((item) => !item.visible_to_client);
  const needsReview = items.some((item) => item.details?.needs_review === true);
  const [busy, setBusy] = useState<"idle" | "save" | "publish" | "cover">("idle");
  const [titleDraft, setTitleDraft] = useState(booking.title);
  const [titleFromServer, setTitleFromServer] = useState(booking.title);
  if (booking.title !== titleFromServer) {
    setTitleFromServer(booking.title);
    setTitleDraft(booking.title);
  }
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverNotice, setCoverNotice] = useState<string | null>(null);
  const arrival = coverQuery(booking.destination, booking.title);
  const coverPlace = arrival === "voyage" ? "" : arrival;
  const [flash, setFlash] = useState<string | null>(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const account = customers.find((row) => row.id === booking.customer_id);
  const holderProfile = {
    first_name: account?.first_name || holderName.first_name,
    last_name: account?.last_name || holderName.last_name,
    usage_name: account?.usage_name ?? null,
  };
  const documentChoices = peopleNotOnStay(
    items.flatMap((item) => passengersFromDetails(item.details)),
    travelers
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form =
      event.currentTarget instanceof HTMLFormElement
        ? event.currentTarget
        : document.getElementById("booking-meta");
    if (!(form instanceof HTMLFormElement)) {
      setFlash("Enregistrement impossible. Réessayez.");
      return;
    }
    const fd = new FormData(form);
    const title = titleDraft.trim();
    const payload = {
      ...Object.fromEntries(fd.entries()),
      title,
      include_in_ledger: fd.get("include_in_ledger") === "on",
    };
    setBusy("save");
    setFlash(null);
    setIssues([]);
    try {
      let cardOk = true;
      if (saveOpenCard.current) {
        cardOk = await Promise.race([
          saveOpenCard.current().catch(() => false),
          new Promise<boolean>((resolve) => {
            window.setTimeout(() => resolve(false), 12000);
          }),
        ]);
      }
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIssues(issuesFromResponse(json));
        setFlash(null);
        return;
      }
      const savedTitle = typeof json.booking?.title === "string" ? json.booking.title : title;
      setTitleDraft(savedTitle);
      setTitleFromServer(savedTitle);
      setIssues([]);
      setFlash(
        cardOk
          ? "Enregistré. Le carnet n’est pas publié pour autant."
          : "Titre enregistré. La carte ouverte n’a pas été enregistrée."
      );
      router.refresh();
    } catch {
      setFlash("Enregistrement impossible. Réessayez.");
    } finally {
      setBusy("idle");
    }
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
    const documentIndex = key.startsWith("doc:") ? Number(key.slice(4)) : -1;
    const fromDocument = documentChoices[documentIndex];
    const res = await fetch(`/api/admin/bookings/${booking.id}/travelers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        fromDocument
          ? { first_name: fromDocument.first_name, last_name: fromDocument.last_name }
          : {
              companion_id: companionId || null,
              is_account_holder: isHolder,
            }
      ),
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

  async function sendCover(init: RequestInit) {
    setBusy("cover");
    setFlash(null);
    setCoverNotice(null);
    const res = await fetch(`/api/admin/bookings/${booking.id}/cover`, { method: "POST", ...init });
    const json = await res.json().catch(() => ({}));
    setBusy("idle");
    if (!res.ok) {
      setCoverNotice(typeof json.error === "string" ? json.error : "Photo non importée.");
      return;
    }
    setCoverOpen(false);
    setFlash("Photo importée.");
    router.refresh();
  }

  function uploadCoverFile(file: File) {
    const body = new FormData();
    body.set("file", file);
    void sendCover({ body });
  }

  function pickCover(photoId: string) {
    void sendCover({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId }),
    });
  }

  async function clearCover() {
    setBusy("cover");
    setFlash(null);
    const res = await fetch(`/api/admin/bookings/${booking.id}/cover`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy("idle");
    if (!res.ok) {
      setFlash(typeof json.error === "string" ? json.error : "Photo du lieu indisponible.");
      return;
    }
    setFlash("Photo du lieu.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <BookingHero booking={booking} priority className="rounded-3xl">
        <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy !== "idle"}
            onClick={() => {
              setCoverNotice(null);
              setCoverOpen(true);
            }}
            className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] disabled:opacity-50"
          >
            {busy === "cover" ? "Photo…" : "Importer une photo"}
          </button>
          {booking.cover_image_path ? (
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={clearCover}
              className="rounded-full bg-[var(--admin-navy)]/80 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Photo du lieu
            </button>
          ) : null}
        </div>
        <div className="absolute bottom-4 left-5 right-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
            {booking.reference}
            {jMinusLabel(booking.start_date) ? ` · ${jMinusLabel(booking.start_date)}` : ""}
          </p>
          <h1 className="font-display text-2xl font-bold leading-tight">{titleDraft || booking.title}</h1>
        </div>
      </BookingHero>
      <CoverPickDialog
        open={coverOpen}
        bookingId={booking.id}
        place={coverPlace}
        busy={busy === "cover"}
        notice={coverNotice}
        onClose={() => setCoverOpen(false)}
        onPick={pickCover}
        onFile={uploadCoverFile}
      />

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
        <div className="min-w-[12rem] shrink-0 space-y-2">
          <BusyBar
            active={busy !== "idle"}
            label={busy === "publish" ? "Publication…" : "Enregistrement…"}
          />
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
          <input
            name="title"
            required
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            className="rounded-xl border border-border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Destination
          <PlaceField
            name="destination"
            defaultValue={booking.destination || ""}
            className="rounded-xl border border-border px-3 py-2"
          />
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
        <div className="sm:col-span-2">
          <BusyBar active={busy === "save"} label="Enregistrement…" />
        </div>
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
            Le passeport déposé au coffre est repris pour chaque voyageur.
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
            embedded
            customerId={booking.customer_id}
            bookingId={booking.id}
            travelers={travelers}
            documents={identityDocs}
            holder={holderProfile}
            onRemove={(id) => void removeTraveler(id)}
          />
        )}
        {travelers.some(
          (traveler) =>
            tripDocumentsForTraveler(identityDocs, traveler).length === 0 &&
            reusableDocumentsForTraveler(identityDocs, traveler, holderProfile).length === 0
        ) ? (
          <Link
            href={`/admin/clients/${booking.customer_id}`}
            className="inline-flex text-sm font-semibold text-[var(--admin-navy)] underline"
          >
            Joindre les pièces sur la fiche client
          </Link>
        ) : null}
        <form onSubmit={addTraveler} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select name="party_key" required className={fieldControlClass}>
            <option value="">Ajouter un voyageur…</option>
            {documentChoices.length ? (
              <optgroup label="Dans les documents">
                {documentChoices.map((person, index) => (
                  <option key={`doc-${person.first_name}-${person.last_name}`} value={`doc:${index}`}>
                    {[person.first_name, person.last_name].filter(Boolean).join(" ")}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Foyer">
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
            </optgroup>
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
        onBindDraftSave={(save) => {
          saveOpenCard.current = save;
        }}
      />

      <BookingExpensesPanel
        bookingId={booking.id}
        items={items}
        status={booking.status}
        currency={booking.currency}
      />

      {customers.find((row) => row.id === booking.customer_id) && bookingHasFlight(items) ? (
        <section className="admin-af-card space-y-4 rounded-3xl p-5">
          <TripFormalities trip={formalities} />
          {formalities.needsFormality ? (
            <TripVisaUploads
              variant="admin"
              customerId={booking.customer_id}
              bookingId={booking.id}
              travelers={travelers}
              documents={identityDocs}
            />
          ) : null}
          <ExtrasPanel
            variant="admin"
            booking={booking}
            items={items}
            travelers={travelers}
            holder={customers.find((row) => row.id === booking.customer_id)!}
            companions={companions}
            formalities={formalities}
          />
        </section>
      ) : null}

      {items.some((item) => !isLedgerExpenseKind(item.kind)) ? (
        <section className="admin-af-card space-y-3 rounded-3xl p-5">
          <h2 className="font-display text-lg font-bold">Aperçu client</h2>
          <p className="text-sm text-muted">Les mêmes cartes, dans l’ordre du carnet. Invisible tant que vous ne publiez pas.</p>
          <CarnetItinerary
            booking={booking}
            items={items}
            docs={documents}
            calendarBase={`/api/admin/bookings/${booking.id}/calendrier`}
            services={
              account
                ? {
                    variant: "admin",
                    travelers,
                    holder: account,
                    companions,
                  }
                : null
            }
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
