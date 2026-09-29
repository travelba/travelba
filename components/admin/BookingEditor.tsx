"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  isLedgerExpenseKind,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmHotelArrival,
  type CrmHotelRequest,
  type CrmCompanion,
  type CrmCustomer,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { BusyBar } from "@/components/crm/BusyBar";
import { formatDateFr, formatMoney, jMinusLabel, todayIsoDate } from "@/lib/crm/money";
import { TripPassportGroup } from "@/components/crm/TripPassportGroup";
import { passportVaultRows } from "@/lib/crm/passport-vault";
import { bookingTotalFromItems } from "@/lib/crm/bookings";
import { stayPriceWithExpenses } from "@/lib/crm/ledger-display";
import { passengersFromDetails, peopleNotOnStay } from "@/lib/crm/document-passengers";
import {
  canConfirmCarnetPublish,
  coverQuery,
  flightCardTitle,
  nightsBetween,
  hotelDisplayName,
  keptHiddenFromClient,
  pendingPublishCards,
  stayArrivalPlaces,
  stayHeadline,
} from "@/lib/crm/carnet";
import { unsplashKeywordMatch } from "@/lib/crm/covers";
import { BookingIngest } from "@/components/crm/BookingIngest";
import { BookingHero } from "@/components/crm/BookingHero";
import { CoverPickDialog } from "@/components/admin/CoverPickDialog";
import { HotelArrivalPanel } from "@/components/admin/HotelArrivalPanel";
import { principalGuest } from "@/lib/crm/hotel-arrival";
import { BookingExpensesPanel } from "@/components/admin/BookingExpensesPanel";
import { BookingItemsPanel } from "@/components/admin/BookingItemsPanel";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { DateFrInput, fieldControlClass } from "@/components/crm/fields";
import { PlaceField } from "@/components/crm/PlaceField";
import { ReservationFiles } from "@/components/crm/ReservationFiles";
import { attachmentPreviews, passportPreviewsForStay } from "@/lib/crm/preview-files";
import { TripPassportPicker } from "@/components/crm/TripPassportPicker";
import { VisaSection } from "@/components/crm/VisaSection";
import { ExtrasPanel } from "@/components/crm/ExtrasPanel";
import { IssuesList } from "@/components/crm/IssuesList";
import { collectPublishIssues, issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import { householdMembers } from "@/lib/crm/household";
import { bookingHasFlight, findVisaExtra, type ServiceRefusal } from "@/lib/crm/extras";
import { type ClientVisaStep, type EstaAnswers } from "@/lib/crm/visa-flow";
import type { FrenchPassportTrip } from "@/lib/crm/visa-trip";
import { reusableDocumentsForTraveler, tripDocumentsForTraveler } from "@/lib/crm/trip-documents";
import { TripSharePanel } from "@/components/account/TripSharePanel";
import type { ShareCompanion } from "@/lib/crm/trip-share";
import { CustomerPickField } from "@/components/admin/CustomerPickField";
import {
  customerBillingPickLabel,
  customerTravelerPickLabel,
  type PickableCustomer,
} from "@/lib/crm/customer-search";
import { STAY_CURRENCIES, stayCurrency } from "@/lib/crm/stay-currency";

export function BookingEditor({
  booking,
  items,
  travelers,
  documents,
  identityDocs,
  companions,
  customer,
  billingCustomer,
  holderName,
  aiConfigured,
  formalities,
  refusals = [],
  visaRequests = [],
  pliantReady = false,
  shareUrl = null,
  shareCompanions = [],
  arrivals = [],
  hotelRequests = [],
  passportCount = 0,
}: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  documents: CrmBookingDocument[];
  identityDocs: CrmTravelDocument[];
  companions: CrmCompanion[];
  customer: CrmCustomer | null;
  billingCustomer?: CrmCustomer | null;
  holderName: { first_name: string; last_name: string };
  aiConfigured: boolean;
  formalities: FrenchPassportTrip;
  refusals?: ServiceRefusal[];
  visaRequests?: {
    country: string;
    step?: ClientVisaStep | null;
    status?: string | null;
    accepted_at?: string | null;
    answers?: Partial<EstaAnswers> | null;
  }[];
  pliantReady?: boolean;
  shareUrl?: string | null;
  shareCompanions?: ShareCompanion[];
  arrivals?: CrmHotelArrival[];
  hotelRequests?: CrmHotelRequest[];
  passportCount?: number;
}) {
  const router = useRouter();
  const saveOpenCard = useRef<(() => Promise<boolean>) | null>(null);
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
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish">(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const serverSettles = booking.client_settles_stay === true;
  const [clientSettlesFromServer, setClientSettlesFromServer] = useState(serverSettles);
  const [clientSettles, setClientSettles] = useState(serverSettles);
  if (serverSettles !== clientSettlesFromServer) {
    setClientSettlesFromServer(serverSettles);
    setClientSettles(serverSettles);
  }
  const stayStamp = `${booking.start_date}|${booking.end_date}|${booking.status}`;
  const [stayFromServer, setStayFromServer] = useState(stayStamp);
  const [startDraft, setStartDraft] = useState(booking.start_date || "");
  const [endDraft, setEndDraft] = useState(booking.end_date || "");
  const [statusDraft, setStatusDraft] = useState(booking.status);
  if (stayStamp !== stayFromServer) {
    setStayFromServer(stayStamp);
    setStartDraft(booking.start_date || "");
    setEndDraft(booking.end_date || "");
    setStatusDraft(booking.status);
  }
  const nights = nightsBetween(startDraft || null, endDraft || null);
  const datesInverted = Boolean(startDraft && endDraft && endDraft < startDraft);
  const [clientPick, setClientPick] = useState<PickableCustomer | null>(customer);
  const [payerPick, setPayerPick] = useState<PickableCustomer | null>(billingCustomer || customer);
  const account = customer;
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
    const settles = fd.get("client_settles_stay") === "on";
    const payload: Record<string, unknown> = {
      ...Object.fromEntries(fd.entries()),
      title,
      client_settles_stay: settles,
    };
    if (settles) delete payload.include_in_ledger;
    else payload.include_in_ledger = fd.get("include_in_ledger") === "on";
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

  async function removeDocument(documentId: string) {
    await fetch(
      `/api/admin/bookings/${booking.id}/documents?id=${encodeURIComponent(documentId)}`,
      { method: "DELETE" }
    );
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
    setFlash(json.retouched === false ? "Photo d’origine conservée." : "Photo importée.");
    router.refresh();
  }

  async function regenerateCover() {
    setBusy("cover");
    setFlash(null);
    setCoverNotice(null);
    const catalog = !booking.cover_image_path && unsplashKeywordMatch(booking);
    const res = await fetch(
      catalog
        ? `/api/admin/bookings/${booking.id}/cover/catalog`
        : `/api/admin/bookings/${booking.id}/cover`,
      catalog
        ? { method: "POST" }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ regenerate: true }),
          }
    );
    const json = await res.json().catch(() => ({}));
    setBusy("idle");
    if (!res.ok) {
      setCoverNotice(typeof json.error === "string" ? json.error : "Retouche indisponible.");
      return;
    }
    setCoverOpen(false);
    setFlash("Nouvelle version enregistrée.");
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

  const pendingCards = pendingPublishCards(items);
  const revealItems = items.filter(
    (item) =>
      !keptHiddenFromClient(item.details) &&
      item.kind !== "fee" &&
      !isLedgerExpenseKind(item.kind) &&
      (!booking.visible_to_client || !item.visible_to_client)
  );
  const revealDocs = documents.filter((doc) => {
    if (booking.visible_to_client && doc.visible_to_client) return false;
    if (!doc.booking_item_id) return true;
    const linked = items.find((item) => item.id === doc.booking_item_id);
    if (!linked) return true;
    return !keptHiddenFromClient(linked.details) && !isLedgerExpenseKind(linked.kind);
  });
  const publishReady = canConfirmCarnetPublish({
    stayVisible: booking.visible_to_client,
    revealCards: revealItems.length,
    revealDocs: revealDocs.length,
  });

  function cardName(item: CrmBookingItem) {
    if (item.kind === "hotel") return hotelDisplayName(item);
    if (item.kind === "flight" || item.kind === "rail") return flightCardTitle(item);
    return item.title;
  }

  return (
    <div className="space-y-6">
      <BookingHero booking={booking} items={items} priority className="rounded-3xl">
        <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy !== "idle"}
            onClick={() => {
              setCoverNotice(null);
              setCoverOpen(true);
            }}
            className="admin-tap rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] disabled:opacity-50"
          >
            {busy === "cover" ? "Photo…" : "Importer une photo"}
          </button>
          {booking.cover_image_path || unsplashKeywordMatch(booking) ? (
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={() => void regenerateCover()}
              className="admin-tap rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] disabled:opacity-50"
            >
              {busy === "cover" ? "Retouche…" : "Autre version"}
            </button>
          ) : null}
          {booking.cover_image_path ? (
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={clearCover}
              className="admin-tap rounded-full bg-[var(--admin-navy)]/80 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
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
          <h1 className="break-words font-display text-2xl font-bold leading-tight">
            {stayHeadline(
              titleDraft || booking.title,
              booking.destination,
              stayArrivalPlaces(booking.destination, booking.title, items)
            )}
          </h1>
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
        onRegenerate={() => void regenerateCover()}
      />

      <section className="admin-af-card flex flex-col gap-3 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Carnet client</p>
          <p className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
            {booking.visible_to_client ? "Visible dans l’espace" : "Masqué — invisible au client"}
          </p>
          <p className="text-sm text-muted">
            Enregistrer ne publie pas. Publier montre au client les cartes qui ne sont pas masquées.
          </p>
          {pendingCards.length > 0 && booking.visible_to_client ? (
            <p className="mt-2 rounded-2xl bg-[var(--admin-peach)] px-3 py-2 text-sm">
              À vérifier — {pendingCards.length} nouvelle{pendingCards.length > 1 ? "s" : ""} carte
              {pendingCards.length > 1 ? "s" : ""} non publiée{pendingCards.length > 1 ? "s" : ""}.
            </p>
          ) : null}
          {needsReview ? (
            <p className="mt-2 text-sm text-accent">Certaines cartes sont marquées lecture douteuse.</p>
          ) : null}
          {flash ? <p className="mt-2 text-sm text-[var(--admin-navy)]">{flash}</p> : null}
          <IssuesList issues={issues} className="mt-2" />
        </div>
        <div className="min-w-0 space-y-2 sm:min-w-[12rem] sm:shrink-0">
          <BusyBar
            active={busy !== "idle"}
            label={busy === "publish" ? "Publication…" : "Enregistrement…"}
          />
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="submit"
            form="booking-meta"
            disabled={busy !== "idle"}
            className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy === "save" ? "Enregistrement…" : "Enregistrer"}
          </button>
          {booking.visible_to_client ? (
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={() => setConfirm("unpublish")}
              className="admin-tap rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Retirer le carnet
            </button>
          ) : (
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={() => setConfirm("publish")}
              className="admin-tap rounded-full border border-[var(--admin-gold)] bg-[#f8f4ed] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
            >
              Publier le carnet
            </button>
          )}
          {booking.visible_to_client && (revealItems.length > 0 || revealDocs.length > 0) ? (
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={() => setConfirm("publish")}
              className="admin-tap rounded-full border border-[var(--admin-gold)] bg-[#f8f4ed] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
            >
              Publier les mises à jour
            </button>
          ) : null}
        </div>
        </div>
      </section>

      {confirm ? (
        <section className="admin-af-card space-y-3 rounded-3xl border border-[var(--admin-gold)]/50 p-5">
          <p className="font-display text-lg font-bold text-[var(--admin-navy)]">
            {confirm === "publish" ? "Publier le carnet" : "Retirer le carnet"}
          </p>
          {confirm === "publish" ? (
            <>
              <p className="text-sm text-muted">Le client verra ces éléments.</p>
              <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
                {revealItems.map((item) => (
                  <li key={item.id}>{cardName(item)}</li>
                ))}
                {revealDocs.map((doc) => (
                  <li key={doc.id}>{doc.file_name || "Document"}</li>
                ))}
                {!revealItems.length && !revealDocs.length ? (
                  <li>Aucune carte à montrer. Retirez un masquage ou ajoutez une carte.</li>
                ) : null}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Le client ne verra plus ce séjour.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== "idle" || (confirm === "publish" && !publishReady)}
              onClick={() => {
                const next = confirm === "publish";
                setConfirm(null);
                void setPublished(next);
              }}
              className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {confirm === "publish" ? "Confirmer la publication" : "Retirer de l’espace"}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
            >
              Annuler
            </button>
          </div>
        </section>
      ) : null}

      <form id="booking-meta" onSubmit={save} className="admin-af-card space-y-8 rounded-3xl p-5 sm:p-6">
        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">Client</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CustomerPickField
              name="customer_id"
              label="Client"
              selected={account}
              title="Client du dossier"
              formatLabel={customerTravelerPickLabel}
              onPick={setClientPick}
            />
            <CustomerPickField
              name="billing_customer_id"
              selected={billingCustomer || account}
              title="Qui paie"
              label="Qui paie"
              formatLabel={customerBillingPickLabel}
              onPick={setPayerPick}
            />
          </div>
          {clientPick && payerPick && clientPick.id === payerPick.id ? (
            <p className="text-sm text-[var(--admin-navy)]">{clientPick.first_name} paie ce séjour.</p>
          ) : null}
        </section>

        <section className="space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">Séjour</p>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--admin-navy)]">
            Titre
            <input
              name="title"
              required
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              placeholder="Séjour à Avoriaz"
              className={`${fieldControlClass} font-display text-xl font-bold`}
            />
            <span className="text-xs font-normal text-muted">Le client le voit en haut de son carnet.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--admin-navy)]">
            Destination
            <PlaceField
              name="destination"
              defaultValue={booking.destination || ""}
              placeholder="Ville ou station"
              className={fieldControlClass}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--admin-navy)]">
              Départ
              <DateFrInput
                name="start_date"
                aria-label="Date de départ"
                value={startDraft}
                onChange={setStartDraft}
                className={fieldControlClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--admin-navy)]">
              Retour
              <DateFrInput
                name="end_date"
                aria-label="Date de retour"
                value={endDraft}
                onChange={setEndDraft}
                className={fieldControlClass}
              />
            </label>
          </div>
          {nights ? (
            <p className="text-sm font-semibold text-[var(--admin-navy)]">
              {formatDateFr(startDraft)} → {formatDateFr(endDraft)} · {nights} nuit{nights > 1 ? "s" : ""}
            </p>
          ) : null}
          {datesInverted ? (
            <p className="text-sm font-semibold text-[var(--admin-red)]">Le retour est avant le départ.</p>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-[var(--admin-navy)]">Où en est le dossier</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Où en est le dossier">
              {BOOKING_STATUSES.map((status) => {
                const selected = statusDraft === status;
                return (
                  <label
                    key={status}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold ${
                      selected
                        ? "bg-[var(--admin-navy)] text-white"
                        : "bg-white text-[var(--admin-navy)] ring-1 ring-[var(--border)]"
                    } ${selected && status === "confirmed" ? "ring-2 ring-[var(--admin-gold)]" : ""}`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={status}
                      checked={selected}
                      onChange={() => setStatusDraft(status)}
                      className="sr-only"
                    />
                    {BOOKING_STATUS_LABELS[status]}
                  </label>
                );
              })}
            </div>
            {statusDraft === "confirmed" ? (
              <p className="text-xs text-muted">Ce statut inscrit le montant dans les transactions du client.</p>
            ) : null}
          </div>

          <label className="flex max-w-xs flex-col gap-1.5 text-sm font-semibold text-[var(--admin-navy)]">
            Devise
            <select
              name="currency"
              defaultValue={stayCurrency(booking.currency)}
              aria-label="Devise du séjour"
              className={fieldControlClass}
            >
              {STAY_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">Règlement</p>
          <input
            type="checkbox"
            name="client_settles_stay"
            checked={clientSettles}
            onChange={(event) => setClientSettles(event.target.checked)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={!clientSettles}
              onClick={() => setClientSettles(false)}
              className={`rounded-2xl border p-4 text-left ${
                clientSettles
                  ? "border-[var(--border)] bg-[var(--background)]"
                  : "border-[var(--admin-gold)] bg-white shadow-[0_0_0_1px_var(--admin-gold)]"
              }`}
            >
              <span className="block font-display text-base font-bold text-[var(--admin-navy)]">L’agence encaisse</span>
              <span className="mt-1 block text-xs font-normal text-muted">
                Le montant entre dans les transactions du client.
              </span>
            </button>
            <button
              type="button"
              aria-pressed={clientSettles}
              onClick={() => setClientSettles(true)}
              className={`rounded-2xl border p-4 text-left ${
                clientSettles
                  ? "border-[var(--admin-gold)] bg-white shadow-[0_0_0_1px_var(--admin-gold)]"
                  : "border-[var(--border)] bg-[var(--background)]"
              }`}
            >
              <span className="block font-display text-base font-bold text-[var(--admin-navy)]">Le client règle l’hôtel</span>
              <span className="mt-1 block text-xs font-normal text-muted">
                Sur sa carte. Le prix reste au carnet.
              </span>
            </button>
          </div>
          {clientSettles ? (
            <p className="text-sm text-muted">Ce montant ne va pas dans les transactions.</p>
          ) : (
            <label className="flex items-start gap-3 text-sm text-[var(--admin-navy)]">
              <input
                key="stay-in"
                type="checkbox"
                name="include_in_ledger"
                defaultChecked={booking.include_in_ledger !== false}
                className="mt-1 size-4"
              />
              <span>
                Compter dans les transactions
                <span className="mt-0.5 block text-xs font-normal text-muted">
                  Décochez pour montrer le prix au carnet sans le compter.
                  {items.some((item) => item.include_in_ledger)
                    ? " Des cartes sont déjà comptées : laissez décoché pour ne pas compter deux fois."
                    : ""}
                </span>
              </span>
            </label>
          )}
        </section>

        <section className="space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">Mots</p>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--admin-navy)]">
            Message pour le client
            <textarea
              name="notes_client"
              defaultValue={booking.notes_client || ""}
              rows={3}
              placeholder="Conseils, horaires de rendez-vous…"
              className={`${fieldControlClass} min-h-24`}
            />
          </label>
          <label className="flex flex-col gap-1.5 rounded-2xl bg-[var(--admin-peach)] p-4 text-sm font-semibold text-[var(--admin-navy)]">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              Notes pour l’agence
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
                Le client ne voit pas ça
              </span>
            </span>
            <textarea
              name="notes_internal"
              defaultValue={booking.notes_internal || ""}
              rows={3}
              placeholder="Mémo pour l’agence"
              className={`${fieldControlClass} min-h-24`}
            />
          </label>
        </section>

        <p className="text-xs text-muted">Enregistrer garde le dossier.</p>
      </form>
      <BookingIngest
        role="admin"
        mode="append"
        householdHolder={account || holderName}
        householdCompanions={companions}
        ingestUrl="/api/admin/bookings/ingest"
        saveUrl={`/api/admin/bookings/${booking.id}/from-ingest`}
        aiConfigured={aiConfigured}
        preserveTitle={booking.title}
      />

      <section className="admin-af-card space-y-4 rounded-3xl p-5">
        <div className="space-y-3">
          <h2 className="font-display text-lg font-bold">Voyageurs</h2>
          <TripPassportGroup
            embedded
            rows={passportVaultRows(travelers, identityDocs, todayIsoDate(), holderProfile)}
            hrefFor={() => `/admin/clients/${booking.customer_id}`}
            passports={passportPreviewsForStay(travelers, identityDocs, holderName, booking.reference)}
          />
          <p className="text-sm text-muted">
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

      {shareUrl ? (
        <TripSharePanel
          bookingId={booking.id}
          shareUrl={shareUrl}
          companions={shareCompanions}
          sendUrl={`/api/admin/bookings/${booking.id}/partage`}
        />
      ) : null}

      <section className="admin-af-card space-y-2 rounded-3xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Montant du séjour
        </p>
        <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
          {formatMoney(
            stayPriceWithExpenses({
              stayTotal: bookingTotalFromItems(items),
              agencyCommission: booking.agency_commission === true,
              expenses: items.filter((item) => isLedgerExpenseKind(item.kind)),
            }),
            stayCurrency(booking.currency)
          )}
        </p>
        <p className="text-sm text-muted">
          Prix des cartes, des frais d’agence et des dépenses. Le frais de billeterie n’est pas inclus.
          {clientSettles
            ? " Réglé sur la carte du client : ce montant ne va pas aux transactions ni à l’encours."
            : ""}
        </p>
      </section>

      <HotelArrivalPanel
        bookingId={booking.id}
        items={items}
        arrivals={arrivals}
        holder={(() => {
          const guest = principalGuest({ travelers, holder: holderProfile });
          return `${guest.firstName} ${guest.lastName}`.trim();
        })()}
      />

      <BookingItemsPanel
        bookingId={booking.id}
        items={items}
        documents={documents}
        household={householdMembers(account || holderName, companions)}
        currency={booking.currency}
        hotelRequests={hotelRequests}
        today={todayIsoDate()}
        passportCount={passportCount}
        clientSettlesStay={clientSettles}
        onBindDraftSave={(save) => {
          saveOpenCard.current = save;
        }}
      />

      <BookingExpensesPanel
        bookingId={booking.id}
        items={items}
        status={booking.status}
        currency={booking.currency}
        agencyCommission={booking.agency_commission === true}
        stayTotal={bookingTotalFromItems(items)}
      />

      {account && bookingHasFlight(items) ? (
        <section className="admin-af-card space-y-4 rounded-3xl p-5">
          <VisaSection
            variant="admin"
            bookingId={booking.id}
            reference={booking.reference}
            trip={formalities}
            requests={visaRequests}
            travelers={travelers}
            documents={identityDocs}
            visaBooked={Boolean(findVisaExtra(items))}
            pliantReady={pliantReady}
          />
          <ExtrasPanel
            variant="admin"
            booking={booking}
            items={items}
            travelers={travelers}
            holder={account}
            companions={companions}
            formalities={formalities}
            refusals={refusals}
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
            refusals={refusals}
          />
        </section>
      ) : null}

      <ReservationFiles
        variant="admin"
        showPassports={false}
        attachments={attachmentPreviews(documents, items, booking.reference)}
        onRemoveAttachment={(file) => void removeDocument(file.id)}
      />
      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Joindre un justificatif</h2>
        <p className="mt-1 text-sm text-muted">
          Billets, vouchers et devis. Visibles au client seulement après publication du carnet.
        </p>
        <form onSubmit={addDoc} className="mt-3 flex flex-wrap gap-2">
          <input name="file" type="file" required />
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm">Joindre</button>
        </form>
      </section>
    </div>
  );
}
