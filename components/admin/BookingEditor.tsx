"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  isLedgerExpenseKind,
  visibleServiceCopy,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CardViewLine,
  type CrmHotelArrival,
  type CrmHotelRequest,
  type CrmCompanion,
  type CrmCustomer,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { BusyBar } from "@/components/crm/BusyBar";
import { formatDateFr, formatDateRangeShort, formatMoney, jMinusLabel, todayIsoDate } from "@/lib/crm/money";
import { TripPassportGroup } from "@/components/crm/TripPassportGroup";
import { passportVaultRows } from "@/lib/crm/passport-vault";
import { bookingTotalFromItems } from "@/lib/crm/bookings";
import { stayPriceWithExpenses } from "@/lib/crm/ledger-display";
import { collectableTicketingFee } from "@/lib/crm/ticketing-fee";
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
import { ServiceOfferToggles } from "@/components/admin/ServiceOfferToggles";
import { BookingItemsPanel } from "@/components/admin/BookingItemsPanel";
import { ClientInterfacePreview } from "@/components/account/ClientInterfacePreview";
import { DeleteBookingButton } from "@/components/admin/DeleteBookingButton";
import { LittleEmperorsCancel } from "@/components/admin/LittleEmperorsCancel";
import { hotelsNeedingDesk } from "@/lib/crm/hotel-desk";
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
import { StayBillingChoice } from "@/components/crm/StayBillingChoice";
import { billingCompanyTabLabel } from "@/lib/crm/billing-companies";
import { defaultBillingCompany } from "@/lib/crm/payer";

const coverField =
  "w-full rounded-2xl border border-transparent bg-white px-4 py-3 text-sm text-[var(--admin-navy)] shadow-[0_1px_2px_rgba(11,25,44,0.04)] outline-none transition focus:border-[var(--admin-gold)] focus:shadow-[0_0_0_3px_rgba(197,168,128,0.22)]";

function CoverMark({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-gold-dark)]">{children}</p>
      <span className="h-px flex-1 bg-gradient-to-r from-[var(--admin-gold)]/45 to-transparent" />
    </div>
  );
}

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
  hasCardCode = false,
  cardViews = [],
  attachedEmails = [],
  billingCompanies = [],
  littleEmperors = null,
  expenseBilling = [],
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
  hasCardCode?: boolean;
  cardViews?: CardViewLine[];
  attachedEmails?: {
    id: string;
    subject: string | null;
    from_email: string | null;
    received_at: string | null;
    extract?: unknown;
  }[];
  billingCompanies?: { id: string; company_name: string | null; sort_order: number }[];
  littleEmperors?: {
    id: string;
    hotel_name: string | null;
    is_cancellable: boolean | null;
    cancellation_deadline: string | null;
    cancellation_policies: string[] | null;
    state: string | null;
  } | null;
  expenseBilling?: { id: string; title: string; billing_company_id: string | null }[];
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
  const [tab, setTab] = useState<"voyage" | "client" | "argent" | "todo" | "interface">("voyage");
  const [more, setMore] = useState(false);
  const [hotelCardOpen, setHotelCardOpen] = useState(false);
  const [coverNotice, setCoverNotice] = useState<string | null>(null);
  const arrival = coverQuery(booking.destination, booking.title);
  const coverPlace = arrival === "voyage" ? "" : arrival;
  const [flash, setFlash] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish">(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const payerCompanies = [...billingCompanies].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)
  );
  const defaultCompany = defaultBillingCompany(payerCompanies);
  const serverPayer =
    booking.payer_kind === "company" || booking.payer_kind === "personal"
      ? booking.payer_kind
      : defaultCompany
        ? "company"
        : "personal";
  const payerStamp = `${serverPayer}|${booking.billing_company_id || ""}|${defaultCompany?.id || ""}`;
  const [payerFromServer, setPayerFromServer] = useState(payerStamp);
  const [payerKind, setPayerKind] = useState<"company" | "personal">(serverPayer);
  const [payerCompanyId, setPayerCompanyId] = useState(
    booking.payer_kind === "personal" ? "" : booking.billing_company_id || defaultCompany?.id || ""
  );
  if (payerStamp !== payerFromServer) {
    setPayerFromServer(payerStamp);
    setPayerKind(serverPayer);
    setPayerCompanyId(
      serverPayer === "personal" ? "" : booking.billing_company_id || defaultCompany?.id || ""
    );
  }
  const serverFeesFollow = booking.fees_follow_stay !== false;
  const [feesFromServer, setFeesFromServer] = useState(serverFeesFollow);
  const [feesFollowStay, setFeesFollowStay] = useState(serverFeesFollow);
  if (serverFeesFollow !== feesFromServer) {
    setFeesFromServer(serverFeesFollow);
    setFeesFollowStay(serverFeesFollow);
  }
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
          ? booking.visible_to_client
            ? "Enregistré."
            : "Enregistré. Le client ne voit pas encore ce séjour."
          : "Titre enregistré. L’étape ouverte n’a pas été enregistrée."
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
    setFlash(visible ? "Le client voit ce séjour." : "Le client ne voit plus ce séjour.");
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

  const updatesPending = revealItems.length > 0 || revealDocs.length > 0;
  const showPrimaryPublish = !booking.visible_to_client || updatesPending;
  const passportGap = travelers.filter(
    (traveler) =>
      tripDocumentsForTraveler(identityDocs, traveler).length === 0 &&
      reusableDocumentsForTraveler(identityDocs, traveler, holderProfile).length === 0
  );
  const hotelDeskCount = hotelsNeedingDesk(hotelRequests, todayIsoDate());
  const hasHotel = items.some((item) => item.kind === "hotel");
  const hasFlight = bookingHasFlight(items);
  const leOpen =
    Boolean(littleEmperors) &&
    !["cancelled", "canceled"].includes((littleEmperors?.state || "").toLowerCase());
  const showTodo =
    passportGap.length > 0 || hasHotel || hasFlight || (leOpen && Boolean(littleEmperors?.cancellation_deadline));
  if (tab === "todo" && !showTodo) setTab("voyage");
  const stayAmount = stayPriceWithExpenses({
    stayTotal: bookingTotalFromItems(items),
    agencyCommission: booking.agency_commission === true,
    expenses: items.filter((item) => isLedgerExpenseKind(item.kind)),
    ticketingFee: collectableTicketingFee({ status: booking.status, hasFlight }),
  });
  const hasSteps = items.some((item) => !isLedgerExpenseKind(item.kind));
  const tabs = [
    ["voyage", "Le voyage"],
    ...(showTodo ? [["todo", "À faire"] as const] : []),
    ["argent", "L’argent"],
    ["client", "Le client"],
    ["interface", "Interface client"],
  ] as const;

  function cardName(item: CrmBookingItem) {
    if (item.kind === "hotel") return hotelDisplayName(item);
    if (item.kind === "flight" || item.kind === "rail") return flightCardTitle(item);
    return item.title;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <BookingHero
              booking={booking}
              items={items}
              priority
              plain
              className="h-16 w-[5.5rem] shrink-0 rounded-2xl ring-1 ring-[var(--admin-gold)]/70"
              frameClassName="relative h-16 w-[5.5rem]"
            />
            <div className="min-w-0 flex-1">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold-dark)]">
                {booking.reference}
                {jMinusLabel(booking.start_date) ? ` · ${jMinusLabel(booking.start_date)}` : ""}
              </p>
              <input
                name="title"
                form="booking-meta"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                placeholder="Séjour à Avoriaz"
                aria-label="Titre"
                className="mt-1 w-full bg-transparent font-display text-2xl font-bold leading-tight text-[var(--admin-navy)] outline-none placeholder:text-[var(--admin-navy)]/30 sm:text-3xl"
              />
              <p className="mt-1 text-sm text-muted">
                {[
                  booking.destination,
                  formatDateRangeShort(startDraft, endDraft),
                  nights ? `${nights} nuit${nights > 1 ? "s" : ""}` : null,
                  account ? [account.first_name, account.last_name].filter(Boolean).join(" ") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <select
                name="status"
                form="booking-meta"
                value={statusDraft}
                aria-label="Où en est le dossier"
                onChange={(event) => setStatusDraft(event.target.value as typeof statusDraft)}
                className="font-label rounded-full bg-[var(--admin-navy)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-gold)] outline-none"
              >
                {BOOKING_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {BOOKING_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <p className="font-display text-lg font-bold text-[var(--admin-navy)]">
                {formatMoney(stayAmount, stayCurrency(booking.currency))}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                form="booking-meta"
                disabled={busy !== "idle"}
                className="admin-tap rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
              >
                {busy === "save" ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button"
                disabled={busy !== "idle"}
                onClick={() => setConfirm(showPrimaryPublish ? "publish" : "unpublish")}
                className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
              >
                {!booking.visible_to_client ? "Montrer au client" : updatesPending ? "Mettre à jour" : "Cacher au client"}
              </button>
              <button
                type="button"
                aria-expanded={more}
                aria-label="Autres actions du dossier"
                onClick={() => setMore((open) => !open)}
                className="admin-tap inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-sm font-bold text-[var(--admin-navy)]"
              >
                …
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-6 overflow-x-auto border-b border-[var(--border)]" role="tablist" aria-label="Parties du dossier">
          {tabs.map(([id, label]) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(id)}
                className={`-mb-px shrink-0 whitespace-nowrap border-b-2 pb-3 font-display text-sm font-semibold ${
                  selected
                    ? "border-[var(--admin-gold)] text-[var(--admin-navy)]"
                    : "border-transparent text-muted hover:text-[var(--admin-navy)]"
                }`}
              >
                {label}
                {id === "todo" && passportGap.length + hotelDeskCount > 0 ? (
                  <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--admin-gold)] px-1 text-[10px] font-bold text-[var(--admin-navy)]">
                    {passportGap.length + hotelDeskCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <BusyBar active={busy !== "idle"} label={busy === "publish" ? "Envoi au client…" : "Enregistrement…"} />
        {more ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-[var(--admin-sky)] px-4 py-3">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="text-sm font-semibold text-[var(--admin-navy)]"
                disabled={busy !== "idle"}
                onClick={() => {
                  setCoverNotice(null);
                  setCoverOpen(true);
                }}
              >
                Importer une photo
              </button>
              {booking.cover_image_path || unsplashKeywordMatch(booking) ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-[var(--admin-navy)]"
                  disabled={busy !== "idle"}
                  onClick={() => void regenerateCover()}
                >
                  Autre version
                </button>
              ) : null}
              {booking.cover_image_path ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-[var(--admin-navy)]"
                  disabled={busy !== "idle"}
                  onClick={clearCover}
                >
                  Photo du lieu
                </button>
              ) : null}
              {booking.visible_to_client && updatesPending ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-[var(--admin-navy)]"
                  onClick={() => {
                    setMore(false);
                    setConfirm("unpublish");
                  }}
                >
                  Cacher au client
                </button>
              ) : null}
              {shareUrl ? (
                <a href={shareUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[var(--admin-navy)] underline">
                  Voir comme le client
                </a>
              ) : null}
            </div>
            <DeleteBookingButton bookingId={booking.id} label={`${booking.reference} — ${titleDraft || booking.title}`} compact />
          </div>
        ) : null}
        {statusDraft === "confirmed" ? (
          <p className="text-xs text-muted">Ce statut inscrit le montant dans le compte du client.</p>
        ) : null}
        {pendingCards.length > 0 && booking.visible_to_client ? (
          <p className="rounded-2xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
            {pendingCards.length} étape{pendingCards.length > 1 ? "s" : ""} pas encore montrée{pendingCards.length > 1 ? "s" : ""}.
          </p>
        ) : null}
        {needsReview ? <p className="text-sm text-accent">Certaines étapes sont marquées lecture douteuse.</p> : null}
        {flash ? <p className="text-sm text-[var(--admin-navy)]">{flash}</p> : null}
        <IssuesList issues={issues} />
      </header>
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

      {confirm ? (
        <section className="admin-af-card space-y-3 rounded-3xl border border-[var(--admin-gold)]/50 p-5">
          <p className="font-display text-lg font-bold text-[var(--admin-navy)]">
            {confirm === "publish" ? "Montrer au client" : "Cacher au client"}
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
                  <li>Aucune étape à montrer. Retirez un masquage ou ajoutez une étape.</li>
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
              {confirm === "publish" ? "Confirmer" : "Cacher"}
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

      <form id="booking-meta" onSubmit={save} className="contents">
        <div className="contents">
          <section className={`order-2 admin-af-card space-y-3 rounded-3xl p-5 ${tab === "client" ? "" : "hidden"}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <CustomerPickField
                name="customer_id"
                label="Client"
                selected={account}
                title="Client du dossier"
                formatLabel={customerTravelerPickLabel}
                onPick={setClientPick}
                controlClass={coverField}
              />
              <CustomerPickField
                name="billing_customer_id"
                selected={billingCustomer || account}
                title="Qui paie"
                label="Qui paie"
                formatLabel={customerBillingPickLabel}
                onPick={setPayerPick}
                controlClass={coverField}
              />
            </div>
            {clientPick && payerPick && clientPick.id === payerPick.id ? (
              <p className="inline-flex rounded-full bg-[var(--admin-peach)] px-3 py-1 text-sm font-semibold text-[var(--admin-navy)]">
                {clientPick.first_name} paie ce séjour
              </p>
            ) : null}
          </section>

          <section className={`admin-af-card space-y-3 rounded-3xl p-5 ${hasSteps ? "order-3" : "order-2"} ${tab === "voyage" ? "" : "hidden"}`}>
            <CoverMark>Lieu et dates</CoverMark>
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Lieu
              <PlaceField
                name="destination"
                defaultValue={booking.destination || ""}
                placeholder="Ville ou station"
                className={coverField}
              />
            </label>
            <div className="rounded-3xl bg-[var(--admin-sky)] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {nights ? (
                  <p className="font-display text-sm font-semibold text-[var(--admin-navy)]">
                    {formatDateFr(startDraft)} → {formatDateFr(endDraft)}
                  </p>
                ) : (
                  <p className="text-sm text-muted">Du départ au retour</p>
                )}
                {nights ? (
                  <span className="rounded-full bg-[var(--admin-navy)] px-3 py-1 font-display text-sm font-bold text-[var(--admin-gold)]">
                    {nights} nuit{nights > 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Départ
                  <DateFrInput
                    name="start_date"
                    aria-label="Date de départ"
                    value={startDraft}
                    onChange={setStartDraft}
                    className={`${coverField} bg-[var(--admin-sky)]`}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Retour
                  <DateFrInput
                    name="end_date"
                    aria-label="Date de retour"
                    value={endDraft}
                    onChange={setEndDraft}
                    className={`${coverField} bg-[var(--admin-sky)]`}
                  />
                </label>
              </div>
              {datesInverted ? (
                <p className="mt-3 text-sm font-semibold text-[var(--admin-red)]">Le retour est avant le départ.</p>
              ) : null}
            </div>
          </section>

          <section className={`order-2 admin-af-card space-y-3 rounded-3xl p-5 ${tab === "argent" ? "" : "hidden"}`}>
            <CoverMark>Règlement</CoverMark>
            <label className="flex max-w-[11rem] flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Devise
              <select
                name="currency"
                defaultValue={stayCurrency(booking.currency)}
                aria-label="Devise du séjour"
                className={coverField}
              >
                {STAY_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="payer_kind" value={payerKind} />
            <input
              type="hidden"
              name="billing_company_id"
              value={payerKind === "company" ? payerCompanyId : ""}
            />
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Qui règle ce voyage">
              {(
                [
                  {
                    kind: "company" as const,
                    title: "Société",
                    hint: "Une société du compte règle ce voyage.",
                  },
                  {
                    kind: "personal" as const,
                    title: "Particulier",
                    hint: "Le client règle depuis son espace : carte, Apple Pay, prélèvement SEPA, virement.",
                  },
                ]
              ).map((choice) => {
                const selected = payerKind === choice.kind;
                const blocked = choice.kind === "company" && !payerCompanies.length;
                return (
                  <button
                    key={choice.kind}
                    type="button"
                    aria-pressed={selected}
                    disabled={blocked}
                    onClick={() => {
                      setPayerKind(choice.kind);
                      if (choice.kind === "company") {
                        setPayerCompanyId((current) => current || defaultCompany?.id || "");
                      }
                    }}
                    className={`rounded-3xl p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? "bg-white shadow-[0_8px_24px_-12px_rgba(11,25,44,0.35),inset_0_0_0_1.5px_var(--admin-gold)]"
                        : "bg-white/45 shadow-[inset_0_0_0_1px_var(--border)]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${selected ? "bg-[var(--admin-gold)]" : "bg-[var(--border)]"}`}
                      />
                      <span className="font-display text-base font-bold text-[var(--admin-navy)]">{choice.title}</span>
                    </span>
                    <span className="mt-2 block pl-4 text-xs leading-relaxed text-muted">{choice.hint}</span>
                  </button>
                );
              })}
            </div>
            {payerKind === "company" && !payerCompanies.length ? (
              <p className="text-sm text-muted">
                Ajoutez une société sur{" "}
                <Link
                  href={`/admin/clients/${billingCustomer?.id || booking.customer_id}`}
                  className="font-semibold text-[var(--admin-navy)] underline"
                >
                  la fiche
                </Link>{" "}
                avant d’enregistrer ce règlement.
              </p>
            ) : null}
            {payerKind === "company" && payerCompanies.length === 1 ? (
              <p className="rounded-2xl bg-white/70 px-4 py-3 text-sm text-[var(--admin-navy)]">
                Société : {billingCompanyTabLabel(payerCompanies[0].company_name, 0, 1)}
              </p>
            ) : null}
            {payerKind === "company" && payerCompanies.length > 1 ? (
              <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Société qui règle
                <select
                  value={payerCompanyId}
                  onChange={(event) => setPayerCompanyId(event.target.value)}
                  className={coverField}
                  aria-label="Société qui règle le voyage"
                >
                  {payerCompanies.map((company, index) => (
                    <option key={company.id} value={company.id}>
                      {billingCompanyTabLabel(company.company_name, index, payerCompanies.length)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {payerKind === "company" ? (
              <p className="text-xs text-muted">Moyens ouverts au client : prélèvement SEPA, virement.</p>
            ) : null}
            <input
              type="hidden"
              name="fees_follow_stay"
              value={payerKind === "personal" && !payerCompanies.length ? "on" : feesFollowStay ? "on" : "off"}
            />
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Facture des frais et dépenses">
              {(
                [
                  {
                    follow: true,
                    title: payerKind === "company" ? "Même facture" : "Sans facture société",
                    hint:
                      payerKind === "company"
                        ? "Frais d’agence et dépenses suivent la facture du séjour."
                        : "Frais d’agence et dépenses suivent le séjour.",
                  },
                  {
                    follow: false,
                    title: payerKind === "company" ? "Sans facture société" : "Facture société",
                    hint:
                      payerKind === "company"
                        ? "Le client les règle à part, sans facture société."
                        : `Ils sont portés par ${defaultCompany?.company_name?.trim() || "la société du compte"}.`,
                  },
                ] as const
              ).map((choice) => {
                const locked = !choice.follow && payerKind === "personal" && !payerCompanies.length;
                const effectiveFollow = payerKind === "personal" && !payerCompanies.length ? true : feesFollowStay;
                const selected = effectiveFollow === choice.follow;
                return (
                  <button
                    key={choice.title}
                    type="button"
                    aria-pressed={selected}
                    disabled={locked}
                    onClick={() => setFeesFollowStay(choice.follow)}
                    className={`rounded-3xl p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? "bg-white shadow-[0_8px_24px_-12px_rgba(11,25,44,0.35),inset_0_0_0_1.5px_var(--admin-gold)]"
                        : "bg-white/45 shadow-[inset_0_0_0_1px_var(--border)]"
                    }`}
                  >
                    <span className="font-display text-base font-bold text-[var(--admin-navy)]">{choice.title}</span>
                    <span className="mt-2 block text-xs leading-relaxed text-muted">{choice.hint}</span>
                  </button>
                );
              })}
            </div>
            {payerKind === "company" ? (
              <StayBillingChoice
                expensesOnly
                endpoint="admin"
                bookingId={booking.id}
                companies={payerCompanies}
                bookingCompanyId={payerCompanyId || null}
                expenses={expenseBilling}
              />
            ) : null}
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
              {(
                [
                  {
                    settles: false,
                    title: "L’agence encaisse",
                    hint: "Le montant entre dans le compte du client.",
                  },
                  {
                    settles: true,
                    title: "Le client règle l’hôtel",
                    hint: "Sur sa carte. Le prix reste visible.",
                  },
                ] as const
              ).map((choice) => {
                const selected = clientSettles === choice.settles;
                return (
                  <button
                    key={choice.title}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setClientSettles(choice.settles)}
                    className={`rounded-3xl p-4 text-left transition ${
                      selected
                        ? "bg-white shadow-[0_8px_24px_-12px_rgba(11,25,44,0.35),inset_0_0_0_1.5px_var(--admin-gold)]"
                        : "bg-white/45 shadow-[inset_0_0_0_1px_var(--border)]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${selected ? "bg-[var(--admin-gold)]" : "bg-[var(--border)]"}`}
                      />
                      <span className="font-display text-base font-bold text-[var(--admin-navy)]">{choice.title}</span>
                    </span>
                    <span className="mt-2 block pl-4 text-xs leading-relaxed text-muted">{choice.hint}</span>
                  </button>
                );
              })}
            </div>
            {clientSettles ? (
              <p className="text-sm text-muted">Ce montant ne va pas dans les transactions.</p>
            ) : (
              <label className="flex items-start gap-3 rounded-2xl bg-white/70 px-4 py-3 text-sm text-[var(--admin-navy)]">
                <input
                  key="stay-in"
                  type="checkbox"
                  name="include_in_ledger"
                  defaultChecked={booking.include_in_ledger !== false}
                  className="mt-1 size-4 accent-[var(--admin-navy)]"
                />
                <span>
                  Ajouter ce prix au compte du client
                  <span className="mt-0.5 block text-xs font-normal text-muted">
                    Décochez pour montrer le prix sans le compter.
                    {items.some((item) => item.include_in_ledger)
                      ? " Des étapes sont déjà comptées : laissez décoché pour ne pas compter deux fois."
                      : ""}
                  </span>
                </span>
              </label>
            )}
          </section>

          <section className={`order-3 admin-af-card space-y-3 rounded-3xl p-5 ${tab === "client" ? "" : "hidden"}`}>
            <label className="flex flex-col gap-2 rounded-3xl bg-[var(--admin-peach)] p-5 text-sm font-semibold text-[var(--admin-navy)] shadow-[inset_0_0_0_1px_rgba(197,168,128,0.45)]">
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
                className={`${coverField} min-h-24 font-normal`}
              />
            </label>
          </section>

        </div>
      </form>
      {tab === "voyage" ? (
        <>
      <div className={hasSteps ? "order-4" : "order-1"}>
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
      </div>
      <form onSubmit={addDoc} className={`admin-af-card flex flex-wrap items-center gap-3 rounded-3xl p-5 ${hasSteps ? "order-5" : "order-3"}`}>
        <p className="text-sm font-semibold text-[var(--admin-navy)]">Ou joindre une pièce sans la lire</p>
        <input name="file" type="file" required className="text-sm" />
        <button className="admin-af-btn rounded-full px-3 py-2 text-sm">Joindre</button>
      </form>
      <div className={hasSteps ? "order-1" : "order-5"}>
      <BookingItemsPanel
        bookingId={booking.id}
        items={items}
        documents={documents}
        household={householdMembers(account || holderName, companions)}
        currency={booking.currency}
        hotelRequests={hotelRequests}
        today={todayIsoDate()}
        travelers={travelers}
        identityDocs={identityDocs}
        holder={holderProfile}
        arrivals={arrivals}
        hasCardCode={hasCardCode}
        cardViews={cardViews}
        clientSettlesStay={clientSettles}
        attachedEmails={attachedEmails}
        onBindDraftSave={(save) => {
          saveOpenCard.current = save;
        }}
      />
      </div>
      <div className={hasSteps ? "order-2" : "order-4"}>
      <ReservationFiles
        variant="admin"
        showPassports={false}
        attachments={attachmentPreviews(documents, items, booking.reference)}
        onRemoveAttachment={(file) => void removeDocument(file.id)}
      />
      </div>
        </>
      ) : null}

      {tab === "client" ? (
        <>
      <section className="order-1 admin-af-card space-y-4 rounded-3xl p-5">
        <div className="space-y-3">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Voyageurs</h2>
          <TripPassportGroup
            embedded
            rows={passportVaultRows(travelers, identityDocs, todayIsoDate(), holderProfile)}
            hrefFor={() => `/admin/clients/${booking.customer_id}`}
            passports={passportPreviewsForStay(travelers, identityDocs, holderName, booking.reference)}
          />
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
        <div className="order-4">
        <TripSharePanel
          bookingId={booking.id}
          shareUrl={shareUrl}
          companions={shareCompanions}
          sendUrl={`/api/admin/bookings/${booking.id}/partage`}
        />
        </div>
      ) : null}
        </>
      ) : null}

      {tab === "argent" ? (
        <>
      <section className="order-1 admin-af-card space-y-2 rounded-3xl p-5">
        <p className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
          Montant du séjour
        </p>
        <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
          {formatMoney(stayAmount, stayCurrency(booking.currency))}
        </p>
        <p className="text-sm text-muted">
          Prix des cartes, des frais d’agence, des frais de billeterie et des dépenses.
        </p>
        {clientSettles ? (
          <p className="text-sm text-muted">Les cartes se règlent hors agence. Les frais et les dépenses restent au grand livre.</p>
        ) : null}
      </section>

      <div className="order-3">
      <BookingExpensesPanel
        bookingId={booking.id}
        items={items}
        status={booking.status}
        currency={booking.currency}
        agencyCommission={booking.agency_commission === true}
        stayTotal={bookingTotalFromItems(items)}
      />
      </div>
        </>
      ) : null}

      {tab === "todo" ? (
        <div className="space-y-6">
          {passportGap.length ? (
            <section className="admin-af-card space-y-2 rounded-3xl p-5">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Passeports à joindre</h2>
              <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
                {passportGap.map((traveler) => (
                  <li key={traveler.id}>
                    {traveler.first_name} {traveler.last_name}
                  </li>
                ))}
              </ul>
              <Link href={`/admin/clients/${booking.customer_id}`} className="inline-flex text-sm font-semibold underline">
                Ouvrir la fiche client
              </Link>
            </section>
          ) : null}
          {hasFlight && account ? (
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
          {hotelDeskCount > 0 ? (
            <section className="admin-af-card flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5">
              <p className="font-display text-lg font-bold text-[var(--admin-navy)]">
                {hotelDeskCount} hôtel{hotelDeskCount > 1 ? "s" : ""} à écrire
              </p>
              <button type="button" className="admin-af-btn rounded-full px-4 py-2 text-sm" onClick={() => setTab("voyage")}>
                Voir l’étape
              </button>
            </section>
          ) : null}
          {leOpen && littleEmperors?.cancellation_deadline ? (
            <LittleEmperorsCancel
              id={littleEmperors.id}
              hotelName={littleEmperors.hotel_name}
              isCancellable={littleEmperors.is_cancellable}
              deadline={littleEmperors.cancellation_deadline}
              policies={littleEmperors.cancellation_policies || []}
              state={littleEmperors.state}
            />
          ) : null}
          {hasHotel ? (
            <section className="admin-af-card space-y-3 rounded-3xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Carte pour l’hôtel</h2>
                  <p className="text-sm text-muted">Elle se prépare avec le séjour.</p>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
                  onClick={() => setHotelCardOpen((open) => !open)}
                >
                  {hotelCardOpen ? "Fermer" : "Voir"}
                </button>
              </div>
              {hotelCardOpen ? (
                <HotelArrivalPanel
                  bookingId={booking.id}
                  items={items}
                  arrivals={arrivals}
                  holder={(() => {
                    const guest = principalGuest({ travelers, holder: holderProfile });
                    return `${guest.firstName} ${guest.lastName}`.trim();
                  })()}
                  cardViews={cardViews}
                  bookingStatus={booking.status}
                  currency={booking.currency}
                />
              ) : null}
            </section>
          ) : null}
          <ServiceOfferToggles
            bookingId={booking.id}
            chauffeur={booking.offer_chauffeur === true}
            greeter={booking.offer_greeter === true}
            checkin={booking.offer_checkin === true}
            hasFlight={hasFlight}
          />
        </div>
      ) : null}

      {tab === "interface" ? (
        <ClientInterfacePreview
          booking={booking}
          items={items}
          documents={documents}
          travelers={travelers}
          identityDocs={identityDocs}
          companions={companions}
          customer={customer}
          visaRequests={visaRequests}
          refusals={refusals}
          pliantReady={pliantReady}
          shareUrl={shareUrl}
          shareCompanions={shareCompanions}
          billingCompanies={billingCompanies}
        />
      ) : null}
    </div>
  );
}
