"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  isActiveItem,
  isLedgerExpenseKind,
  type CrmBooking,
  type CrmBookingCard,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CardViewLine,
  type CrmHotelArrival,
  type CrmHotelMessage,
  type CrmHotelThreadMessage,
  type CrmHotelRequest,
  type CrmCompanion,
  type CrmCustomer,
  type CrmCustomerActivity,
  type CrmCustomerLogin,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { BusyBar } from "@/components/crm/BusyBar";
import { formatMoney, jMinusLabel, todayIsoDate } from "@/lib/crm/money";
import { EstaOnBooking } from "@/components/admin/EstaOnBooking";
import { UkEtaOnBooking } from "@/components/admin/UkEtaOnBooking";
import { TripPassportGroup } from "@/components/crm/TripPassportGroup";
import type { EstaTravelerLine } from "@/lib/crm/esta-status";
import { settledAuthorizationCountries } from "@/lib/crm/visa-cover";
import type { UkEtaTravelerLine } from "@/lib/crm/uk-eta-ui";
import { passportVaultRows } from "@/lib/crm/passport-vault";
import { agencyFeeExtraAmounts, bookingTotalFromItems } from "@/lib/crm/bookings";
import { stayPriceWithExpenses } from "@/lib/crm/ledger-display";
import { chargeableTicketingFee, isAutoTicketingExpense } from "@/lib/crm/ticketing-fee";
import { passengersFromDetails, peopleNotOnStay } from "@/lib/crm/document-passengers";
import {
  canConfirmCarnetPublish,
  coverQuery,
  flightCardTitle,
  hotelDisplayName,
  keptHiddenFromClient,
  stayHeadline,
} from "@/lib/crm/carnet";
import { unsplashKeywordMatch } from "@/lib/crm/covers";
import { BookingIngest } from "@/components/crm/BookingIngest";
import { CoverPickDialog } from "@/components/admin/CoverPickDialog";
import { BookingCards } from "@/components/admin/BookingCards";
import { CustomerLoginLog } from "@/components/admin/CustomerLoginLog";
import { PliantBookingTab } from "@/components/admin/PliantBookingTab";
import { principalGuest } from "@/lib/crm/hotel-arrival";
import type { PliantCardRecap } from "@/lib/crm/pliant-booking";
import { WhatsappThread, type WhatsappThreadMessage, type WhatsappThreadRequest } from "@/components/admin/WhatsappThread";
import { BookingExpensesPanel, type ExpenseWrite } from "@/components/admin/BookingExpensesPanel";
import { ClientTransactionsPanel } from "@/components/account/ClientTransactionsPanel";
import { ServiceOfferToggles } from "@/components/admin/ServiceOfferToggles";
import { BookingItemsPanel } from "@/components/admin/BookingItemsPanel";
import { ClientInterfacePreview } from "@/components/account/ClientInterfacePreview";
import { applyExpenseLedgerChange, type ClientLedgerView } from "@/lib/crm/client-ledger";
import {
  ArchiveBookingButton,
  DuplicateBookingButton,
  RestoreBookingButton,
} from "@/components/admin/ArchiveBookingButton";
import { LittleEmperorsCancel } from "@/components/admin/LittleEmperorsCancel";
import { hotelTripChecklist } from "@/lib/crm/hotel-desk";
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
import { groupAttachedEmails } from "@/lib/crm/email-duplicates";
import {
  staffBlockingChips,
  staffLedgerCaption,
  staffStayFacts,
  staffStayLabel,
  stayCitiesFromSteps,
} from "@/lib/crm/staff-stay";
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
import { fundingCompanyOptionLabel } from "@/lib/crm/funding-wallet";
import { defaultBillingCompany } from "@/lib/crm/payer";
import {
  BOOKING_TAB_IDS,
  BOOKING_TAB_LABELS,
  BOOKING_TAB_SLUGS,
  bookingStepAnchor,
  bookingTabFromParam,
  bookingTabQuery,
  nextBookingTab,
  type BookingTabId,
} from "@/lib/crm/booking-tabs";
import { useMirror } from "@/lib/crm/use-mirror";
import { adminAction } from "@/lib/crm/admin-action";

/** Assez pour recalculer le montant : prix, billets, aéroports, aller-retour. */
function ledgerMoneyKey(view: ClientLedgerView | null) {
  if (!view) return "";
  return [
    view.balanceValue,
    view.debits,
    ...view.movements.map((row) => `${row.id}:${row.title}:${row.amountLabel}`),
  ].join("|");
}

function withExpenseWrite(items: CrmBookingItem[], change: ExpenseWrite, bookingId: string): CrmBookingItem[] {
  if (change.removed) return items.filter((item) => item.id !== change.id);
  if (items.some((item) => item.id === change.id)) {
    return items.map((item) =>
      item.id === change.id ? { ...item, title: change.title, amount: change.amount, kind: "expense" } : item
    );
  }
  return [
    ...items,
    {
      id: change.id,
      booking_id: bookingId,
      kind: "expense",
      title: change.title,
      supplier: null,
      confirmation_ref: null,
      start_at: null,
      end_at: null,
      amount: change.amount,
      include_in_ledger: true,
      sort_order: items.length,
      details: {},
      visible_to_client: false,
      source_document_id: null,
      lifecycle: "active",
      created_at: "",
      updated_at: "",
    },
  ];
}

function stayAmountKey(list: CrmBookingItem[]) {
  return list
    .map((item) => {
      const details = item.details || {};
      return [
        item.id,
        item.kind,
        item.lifecycle || "",
        item.amount ?? "",
        item.start_at || "",
        details.ticket_count ?? "",
        details.from ?? "",
        details.to ?? "",
      ].join("\u001f");
    })
    .join("\u001e");
}

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
  hotelMessages = [],
  hotelThreadMessages = [],
  openHotelItemId = null,
  billingCompanies = [],
  littleEmperors = null,
  expenseBilling = [],
  ledger = null,
  accountLedger = null,
  bookingCards = [],
  pliantRecap = [],
  estaLines = [],
  ukEtaLines = [],
  whatsappMessages = [],
  whatsappRequests = [],
  whatsappBookings = [],
  customerLogins = [],
  customerActivity = [],
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
    body_text?: string | null;
    extract?: unknown;
    warnings?: { file?: string | null; message?: string | null }[] | null;
  }[];
  hotelMessages?: CrmHotelMessage[];
  hotelThreadMessages?: CrmHotelThreadMessage[];
  openHotelItemId?: string | null;
  billingCompanies?: {
    id: string;
    company_name: string | null;
    sort_order: number;
    funding?: string | null;
  }[];
  littleEmperors?: {
    id: string;
    hotel_name: string | null;
    is_cancellable: boolean | null;
    cancellation_deadline: string | null;
    cancellation_policies: string[] | null;
    state: string | null;
  } | null;
  expenseBilling?: { id: string; title: string; billing_company_id: string | null }[];
  ledger?: ClientLedgerView | null;
  /** Grand livre du compte, même lecture que Transactions du client. */
  accountLedger?: ClientLedgerView | null;
  bookingCards?: CrmBookingCard[];
  pliantRecap?: PliantCardRecap[];
  estaLines?: EstaTravelerLine[];
  ukEtaLines?: UkEtaTravelerLine[];
  whatsappMessages?: WhatsappThreadMessage[];
  whatsappRequests?: WhatsappThreadRequest[];
  whatsappBookings?: { id: string; reference: string }[];
  customerLogins?: CrmCustomerLogin[];
  customerActivity?: CrmCustomerActivity[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const saveOpenCard = useRef<(() => Promise<boolean>) | null>(null);
  const [pricedItems, setPricedItems] = useState(items);
  const ledgerKey = ledgerMoneyKey(accountLedger);
  const [seenLedgerKey, setSeenLedgerKey] = useState(ledgerKey);
  const [liveLedger, setLiveLedger] = useState(accountLedger);
  if (ledgerKey !== seenLedgerKey) {
    setSeenLedgerKey(ledgerKey);
    setLiveLedger(accountLedger);
  }
  const onLiveItems = useCallback((next: CrmBookingItem[]) => {
    setPricedItems((current) => (stayAmountKey(current) === stayAmountKey(next) ? current : next));
  }, []);
  const onExpenseWrite = useCallback(
    (change: ExpenseWrite) => {
      setPricedItems((current) => withExpenseWrite(current, change, booking.id));
      setLiveLedger((current) =>
        applyExpenseLedgerChange(current, {
          bookingId: booking.id,
          itemId: change.id,
          previousTitle: change.previousTitle,
          title: change.title,
          previousAmount: change.previousAmount,
          amount: change.amount,
          removed: change.removed,
          currency: booking.currency,
        })
      );
    },
    [booking.currency, booking.id]
  );
  const needsReview = items.some((item) => item.details?.needs_review === true);
  const [busy, setBusy] = useState<"idle" | "save" | "publish" | "cover">("idle");
  // Champs du formulaire méta : `useMirror` — un champ touché par l’agent gagne, un champ intact suit
  // le serveur à chaque `router.refresh()` (une étape ajoutée met déjà à jour la ligne du dossier).
  const [titleDraft, setTitleDraft] = useMirror(booking.title);
  const routeTitle = stayHeadline(booking.title, booking.destination, stayCitiesFromSteps(items));
  const titleShown = titleDraft === booking.title ? routeTitle : titleDraft;
  const [coverOpen, setCoverOpen] = useState(false);
  const tab = bookingTabFromParam(searchParams.get("tab"));
  const [more, setMore] = useState(false);
  const [coverNotice, setCoverNotice] = useState<string | null>(null);
  const arrival = coverQuery(booking.destination, booking.title);
  const coverPlace = arrival === "voyage" ? "" : arrival;
  const [flash, setFlash] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish">(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyIssues, setPartyIssues] = useState<BookingIssue[]>([]);
  const [partyError, setPartyError] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pendingStep = useRef<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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
  const serverCompanyId =
    serverPayer === "personal" ? "" : booking.billing_company_id || defaultCompany?.id || "";
  const [payerKind, setPayerKind] = useMirror<"company" | "personal">(serverPayer);
  const [payerCompanyId, setPayerCompanyId] = useMirror(serverCompanyId);
  const serverFeesFollow = booking.fees_follow_stay !== false;
  const [feesFollowStay, setFeesFollowStay] = useMirror(serverFeesFollow);
  const serverSettles = booking.client_settles_stay === true;
  const [clientSettles, setClientSettles] = useMirror(serverSettles);
  const [startDraft, setStartDraft] = useMirror(booking.start_date || "");
  const [endDraft, setEndDraft] = useMirror(booking.end_date || "");
  const [destinationDraft, setDestinationDraft] = useMirror(booking.destination || "");
  const serverCurrency = stayCurrency(booking.currency);
  const [currencyDraft, setCurrencyDraft] = useMirror(serverCurrency);
  const serverIncludeInLedger = booking.include_in_ledger !== false;
  const [includeInLedger, setIncludeInLedger] = useMirror(serverIncludeInLedger);
  const [notesInternal, setNotesInternal] = useMirror(booking.notes_internal || "");
  const [notesClient, setNotesClient] = useMirror(booking.notes_client || "");
  const datesInverted = Boolean(startDraft && endDraft && endDraft < startDraft);
  const serverPayerPick: PickableCustomer | null = billingCustomer || customer;
  const [clientPick, setClientPick] = useMirror<PickableCustomer | null>(customer);
  const [payerPick, setPayerPick] = useMirror<PickableCustomer | null>(serverPayerPick);
  const serverPayerPickId = serverPayerPick?.id || null;
  const [stepsPending, setStepsPending] = useState(false);
  const dirty =
    titleDraft !== booking.title ||
    startDraft !== (booking.start_date || "") ||
    endDraft !== (booking.end_date || "") ||
    destinationDraft !== (booking.destination || "") ||
    currencyDraft !== serverCurrency ||
    payerKind !== serverPayer ||
    (payerKind === "company" && payerCompanyId !== serverCompanyId) ||
    feesFollowStay !== serverFeesFollow ||
    clientSettles !== serverSettles ||
    (!clientSettles && includeInLedger !== serverIncludeInLedger) ||
    notesInternal !== (booking.notes_internal || "") ||
    notesClient !== (booking.notes_client || "") ||
    (clientPick?.id || null) !== (customer?.id || null) ||
    (payerPick?.id || null) !== serverPayerPickId;
  const unsaved = dirty || stepsPending;
  // `replaceState(null, …)` : Next recopie lui-même ses internes et prévient le routeur, donc
  // `useSearchParams()` suit sans rejouer le GET du dossier. Avec `history.state`, l’appel serait ignoré.
  const setTab = useCallback(
    (next: BookingTabId) => {
      const query = bookingTabQuery(searchParams.toString(), next);
      window.history.replaceState(null, "", `${pathname}?${query}`);
    },
    [pathname, searchParams]
  );

  function showStep(itemId: string) {
    pendingStep.current = itemId;
    if (tab === "voyage") {
      scrollToStep(itemId);
      pendingStep.current = null;
      return;
    }
    setTab("voyage");
  }

  function scrollToStep(itemId: string) {
    window.requestAnimationFrame(() => {
      document.getElementById(bookingStepAnchor(itemId))?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  useEffect(() => {
    if (tab !== "voyage" || !pendingStep.current) return;
    const itemId = pendingStep.current;
    pendingStep.current = null;
    scrollToStep(itemId);
  }, [tab]);

  useEffect(() => {
    if (!unsaved) return;
    function guard(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [unsaved]);

  const busyRef = useRef(busy);
  const dirtyRef = useRef(unsaved);
  useEffect(() => {
    busyRef.current = busy;
    dirtyRef.current = unsaved;
  });
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      if (event.defaultPrevented) return;
      // Un dialogue ouvert (choix du client, aperçu de pièce) garde son raccourci.
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      if (busyRef.current !== "idle" || !dirtyRef.current) return;
      const form = document.getElementById("booking-meta");
      if (!(form instanceof HTMLFormElement)) return;
      event.preventDefault();
      form.requestSubmit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    let observer: IntersectionObserver | null = null;
    function observe() {
      observer?.disconnect();
      const top = desktop.matches ? 80 : 56;
      observer = new IntersectionObserver(
        ([entry]) => setCompact(!entry.isIntersecting && entry.boundingClientRect.top < top),
        { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 }
      );
      observer.observe(sentinel as Element);
    }
    observe();
    desktop.addEventListener("change", observe);
    return () => {
      observer?.disconnect();
      desktop.removeEventListener("change", observe);
    };
  }, []);

  /** Champs du formulaire méta tels que `save()` les envoie. Null si le formulaire n’est pas dans la page. */
  function metaPayload(): Record<string, unknown> | null {
    const form = document.getElementById("booking-meta");
    if (!(form instanceof HTMLFormElement)) return null;
    const fd = new FormData(form);
    const settles = fd.get("client_settles_stay") === "on";
    const payload: Record<string, unknown> = {
      ...Object.fromEntries(fd.entries()),
      title: titleShown.trim(),
      client_settles_stay: settles,
    };
    if (settles) delete payload.include_in_ledger;
    else payload.include_in_ledger = fd.get("include_in_ledger") === "on";
    return payload;
  }

  const account = customer;
  const holderProfile = {
    first_name: account?.first_name || holderName.first_name,
    last_name: account?.last_name || holderName.last_name,
    usage_name: account?.usage_name ?? null,
  };
  const stayGuest = principalGuest({ travelers, holder: holderProfile });
  const documentChoices = peopleNotOnStay(
    items.flatMap((item) => passengersFromDetails(item.details)),
    travelers
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = metaPayload();
    if (!payload) {
      setFlash("Enregistrement impossible. Réessayez.");
      return;
    }
    setBusy("save");
    setFlash(null);
    setIssues([]);
    try {
      let cardOk = true;
      if (saveOpenCard.current) {
        cardOk = await Promise.race([
          saveOpenCard.current().catch(() => false),
          new Promise<boolean>((resolve) => {
            window.setTimeout(() => resolve(false), 25000);
          }),
        ]);
        if (!cardOk) {
          setFlash("Les étapes n’ont pas été enregistrées. Le séjour n’a pas changé.");
          return;
        }
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
      setIssues([]);
      setFlash(
        booking.visible_to_client
          ? "Enregistré."
          : "Enregistré. Le client ne voit pas encore ce séjour."
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
    if (saveOpenCard.current) {
      const cardOk = await saveOpenCard.current().catch(() => false);
      if (!cardOk) {
        setFlash("Les étapes n’ont pas été enregistrées. Le séjour n’a pas changé.");
        return;
      }
    }
    // Les champs modifiés partent dans le même PATCH : la route applique le méta puis la publication.
    const payload = dirty ? metaPayload() : null;
    if (dirty && !payload) {
      setFlash("Enregistrement impossible. Réessayez.");
      return;
    }
    setBusy("publish");
    setFlash(null);
    setIssues([]);
    const res = await fetch(`/api/admin/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(payload || {}), visible_to_client: visible }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("idle");
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      setFlash(null);
      return;
    }
    const saved = payload ? "Enregistré. " : "";
    setFlash(`${saved}${visible ? "Le client voit ce séjour." : "Le client ne voit plus ce séjour."}`);
    router.refresh();
  }

  /** Ajout d’un voyageur : le retour serveur (déjà sur le séjour, hors du foyer…) s’affiche sous le formulaire. */
  async function postTraveler(body: Record<string, unknown>, afterOk?: () => void) {
    if (partyBusy) return;
    setPartyBusy(true);
    setPartyIssues([]);
    setPartyError(null);
    const result = await adminAction(`/api/admin/bookings/${booking.id}/travelers`, { method: "POST", body });
    setPartyBusy(false);
    if (!result.ok) {
      if (result.issues?.length) setPartyIssues(result.issues);
      else setPartyError(result.error || "Ajout impossible. Réessayez.");
      return;
    }
    afterOk?.();
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
    await postTraveler(
      fromDocument
        ? { first_name: fromDocument.first_name, last_name: fromDocument.last_name }
        : { companion_id: companionId || null, is_account_holder: isHolder },
      () => form.reset()
    );
  }

  /** Confirmé dans la liste : renvoie l’erreur pour l’afficher sous le bouton. */
  async function removeTraveler(travelerId: string) {
    const result = await adminAction(
      `/api/admin/bookings/${booking.id}/travelers?travelerId=${encodeURIComponent(travelerId)}`,
      { method: "DELETE" }
    );
    if (!result.ok) return result.error || "Retrait impossible. Réessayez.";
    router.refresh();
    return undefined;
  }

  async function addHolder() {
    await postTraveler({
      is_account_holder: true,
      first_name: holderName.first_name,
      last_name: holderName.last_name,
    });
  }

  /** Confirmé sur la vignette : renvoie l’erreur pour l’afficher sous le bouton. */
  async function removeDocument(documentId: string) {
    const result = await adminAction(
      `/api/admin/bookings/${booking.id}/documents?id=${encodeURIComponent(documentId)}`,
      { method: "DELETE" }
    );
    if (!result.ok) return result.error || "Retrait impossible. Réessayez.";
    router.refresh();
    return undefined;
  }

  async function addDoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (docBusy) return;
    const form = event.currentTarget;
    setDocBusy(true);
    setDocError(null);
    const result = await adminAction(`/api/admin/bookings/${booking.id}/documents`, {
      method: "POST",
      formData: new FormData(form),
    });
    setDocBusy(false);
    if (!result.ok) {
      setDocError(result.error || "Pièce non jointe. Réessayez.");
      return;
    }
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
  const hotelLetters = hotelTripChecklist(hotelRequests);
  const hasFlight = bookingHasFlight(items);
  const leOpen =
    Boolean(littleEmperors) &&
    !["cancelled", "canceled"].includes((littleEmperors?.state || "").toLowerCase());
  const facts = staffStayFacts({
    items,
    destination: booking.destination,
    startDate: booking.start_date,
    endDate: booking.end_date,
  });
  const blockers = staffBlockingChips({
    travelers,
    missingPassportIds: passportGap.map((traveler) => traveler.id),
    hotelLettersOpen: hotelLetters.openCount,
    amountHidden: !booking.archived_at && (!booking.visible_to_client || booking.prices_visible === false),
  });
  const travelerLabel = travelers.length
    ? travelers.length <= 4
      ? travelers
          .map((traveler) => (traveler.first_name || traveler.last_name || "").trim())
          .filter(Boolean)
          .join(", ") || `${travelers.length} voyageurs`
      : `${travelers.length} voyageurs`
    : "Aucun voyageur";
  const mailGroups = groupAttachedEmails(attachedEmails);
  const payerCaption =
    payerKind === "company"
      ? payerCompanies.length === 1
        ? payerCompanies[0].company_name?.trim() || "Société"
        : "Société"
      : "Particulier";
  const stayAmount = stayPriceWithExpenses({
    stayTotal: bookingTotalFromItems(pricedItems),
    agencyCommission: booking.agency_commission === true,
    expenses: pricedItems
      .filter((item) => isActiveItem(item) && isLedgerExpenseKind(item.kind))
      .map((item) => ({ ...item, agencyFee: !isAutoTicketingExpense(item) })),
    extras: agencyFeeExtraAmounts(pricedItems),
    ticketingFee: chargeableTicketingFee({
      items: pricedItems,
      status: booking.status,
      travelerCount: travelers.length,
    }),
  });
  const statementCustomer = billingCustomer || customer;
  const tabs = BOOKING_TAB_IDS;
  const tabButtonId = (id: BookingTabId) => `booking-tab-${BOOKING_TAB_SLUGS[id]}`;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const key = event.key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
    event.preventDefault();
    const next = nextBookingTab(tabs, tab, key);
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const primaryAction = booking.archived_at ? (
    <RestoreBookingButton bookingId={booking.id} />
  ) : !booking.visible_to_client || updatesPending ? (
    <button
      type="button"
      disabled={busy !== "idle"}
      onClick={() => setConfirm(showPrimaryPublish ? "publish" : "unpublish")}
      className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
    >
      {!booking.visible_to_client ? "Montrer au client" : "Mettre à jour"}
    </button>
  ) : null;
  const saveButton = (
    <button
      type="submit"
      form="booking-meta"
      disabled={busy !== "idle" || !unsaved}
      aria-keyshortcuts="Control+S Meta+S"
      title="⌘S / Ctrl+S"
      className="admin-tap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:border-[var(--border)] disabled:opacity-50"
    >
      {busy === "save" ? "Enregistrement…" : "Enregistrer"}
    </button>
  );
  const moreButton = (
    <button
      type="button"
      aria-expanded={more}
      aria-label="Autres actions du dossier"
      onClick={() => setMore((open) => !open)}
      className="admin-tap inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-sm font-bold text-[var(--admin-navy)]"
    >
      …
    </button>
  );
  const stateChip = (
    <p className="inline-flex items-center gap-2 rounded-full bg-[var(--admin-peach)] px-3 py-1 text-sm font-semibold text-[var(--admin-navy)]">
      <span className="h-2 w-2 rounded-full bg-[var(--admin-gold)]" />
      {staffStayLabel(booking)}
    </p>
  );
  const moreMenu = (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-[var(--admin-sky)] px-4 py-3">
      <div className="flex flex-wrap gap-3">
        <DuplicateBookingButton bookingId={booking.id} label={`${booking.reference} — ${titleShown || booking.title}`} />
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
        {booking.visible_to_client ? (
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
      {booking.archived_at ? null : (
        <ArchiveBookingButton
          bookingId={booking.id}
          label={`${booking.reference} — ${titleShown || booking.title}`}
          compact
          redirectTo={null}
        />
      )}
    </div>
  );

  function cardName(item: CrmBookingItem) {
    if (item.kind === "hotel") return hotelDisplayName(item);
    if (item.kind === "flight" || item.kind === "rail") return flightCardTitle(item);
    return item.title;
  }

  return (
    <div className="flex flex-col gap-6">
      {compact ? (
        <div className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b border-[var(--border)] bg-[rgba(250,249,246,0.94)] px-4 py-2 shadow-[0_1px_8px_rgba(11,25,44,0.06)] backdrop-blur-xl sm:px-6 lg:left-72 lg:top-20 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-bold text-[var(--admin-navy)]">
                {titleShown || booking.title}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--admin-navy)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--admin-gold)]" aria-hidden />
                  {staffStayLabel(booking)}
                </span>
                {unsaved ? <span>· Modifications non enregistrées</span> : null}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {saveButton}
              {primaryAction}
              {moreButton}
            </div>
          </div>
          {more ? <div className="mt-2">{moreMenu}</div> : null}
        </div>
      ) : null}
      <header className="relative space-y-4">
        <div ref={sentinelRef} aria-hidden className="absolute left-0 top-0 h-px w-px" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Link href="/admin/reservations" className="shrink-0 pt-2 text-sm font-semibold text-[var(--admin-navy)]">
              ← Réservations
            </Link>
            <div className="min-w-0 flex-1">
              <input
                name="title"
                form="booking-meta"
                value={titleShown}
                onChange={(event) => setTitleDraft(event.target.value)}
                placeholder="Séjour à Avoriaz"
                aria-label="Titre"
                className="w-full bg-transparent font-display text-2xl font-bold leading-tight text-[var(--admin-navy)] outline-none placeholder:text-[var(--admin-navy)]/30 sm:text-3xl"
              />
              <p className="text-sm text-muted">
                Référence {booking.reference}
                {jMinusLabel(facts.start) ? ` · ${jMinusLabel(facts.start)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            {saveButton}
            {primaryAction}
            {moreButton}
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>{facts.dates || "Dates à confirmer"}</span>
          {facts.placeLine ? <span>· {facts.placeLine}</span> : null}
          <span>· {travelerLabel}</span>
        </p>
        {stateChip}
        {blockers.length ? (
          <ul className="flex flex-wrap gap-2">
            {blockers.map((chip) => (
              <li key={chip.id}>
                <button
                  type="button"
                  onClick={() => setTab("todo")}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]"
                >
                  {chip.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-end gap-6 overflow-x-auto border-b border-[var(--border)]" role="tablist" aria-label="Parties du dossier">
          {tabs.map((id) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                ref={(node) => {
                  tabRefs.current[id] = node;
                }}
                id={tabButtonId(id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="booking-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={onTabKey}
                className={
                  id === "interface"
                    ? `ml-auto mb-2 shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 font-display text-sm font-semibold ${
                        selected
                          ? "bg-[var(--admin-peach)] text-[var(--admin-navy)]"
                          : "text-[#9e7e51] hover:text-[var(--admin-navy)]"
                      }`
                    : `-mb-px shrink-0 whitespace-nowrap border-b-2 pb-3 font-display text-sm font-semibold ${
                        selected
                          ? "border-[var(--admin-gold)] text-[var(--admin-navy)]"
                          : "border-transparent text-muted hover:text-[var(--admin-navy)]"
                      }`
                }
              >
                {BOOKING_TAB_LABELS[id]}
                {id === "todo" && blockers.length > 0 ? (
                  <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--admin-gold)] px-1 text-[10px] font-bold text-[var(--admin-navy)]">
                    {blockers.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <BusyBar active={busy !== "idle"} label={busy === "publish" ? "Envoi au client…" : "Enregistrement…"} />
        {unsaved && busy === "idle" ? (
          <p role="status" className="text-sm font-semibold text-[var(--admin-gold-dark)]">
            Modifications non enregistrées · ⌘S ou Ctrl+S pour enregistrer
          </p>
        ) : null}
        {more && !compact ? moreMenu : null}
        {booking.archived_at ? (
          <p className="rounded-2xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
            Dossier archivé. Le client ne le voit plus. Réactivez-le pour le remettre dans la liste et au grand livre.
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
          {unsaved ? (
            <p className="text-sm font-semibold text-[var(--admin-gold-dark)]">
              Vos modifications sont enregistrées en même temps.
            </p>
          ) : null}
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

      <div role="tabpanel" id="booking-panel" aria-labelledby={tabButtonId(tab)} className="flex flex-col gap-6">
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

          <section className={`order-1 admin-af-card space-y-3 rounded-3xl p-5 ${tab === "voyage" ? "" : "hidden"}`}>
            <div className="flex items-center justify-between gap-3">
              <CoverMark>Lieu et dates</CoverMark>
              {facts.nights ? (
                <span className="rounded-full bg-[var(--admin-navy)] px-3 py-1 font-display text-sm font-bold text-[var(--admin-gold)]">
                  {facts.nights} nuit{facts.nights > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            {facts.segments.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {facts.segments.map((segment) => (
                  <li key={segment.id} className="flex items-baseline justify-between gap-3 py-2 text-sm text-[var(--admin-navy)]">
                    <span className="font-semibold">{segment.place}</span>
                    <span className="shrink-0 text-muted">{segment.when}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Lieu
                  <PlaceField
                    name="destination"
                    value={destinationDraft}
                    onValueChange={setDestinationDraft}
                    placeholder="Ville ou station"
                    className={coverField}
                  />
                </label>
                <div className="rounded-3xl bg-[var(--admin-sky)] p-4">
                  <p className="mb-3 text-sm text-muted">Du départ au retour, tant qu’il n’y a pas d’étape.</p>
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
              </>
            )}
          </section>

          <section className={`order-2 admin-af-card space-y-3 rounded-3xl p-5 ${tab === "argent" ? "" : "hidden"}`}>
            <CoverMark>Règlement</CoverMark>
            <label className="flex max-w-[11rem] flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Devise
              <select
                name="currency"
                value={currencyDraft}
                onChange={(event) => setCurrencyDraft(stayCurrency(event.target.value))}
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
                    hint: "Ce voyage entre dans la part société de l’encours.",
                  },
                  {
                    kind: "personal" as const,
                    title: "Particulier",
                    hint: "Ce voyage entre dans la part particulier de l’encours.",
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
                Société :{" "}
                {fundingCompanyOptionLabel(
                  payerCompanies[0].company_name,
                  payerCompanies[0].funding,
                  billingCompanyTabLabel(payerCompanies[0].company_name, 0, 1)
                )}
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
                      {fundingCompanyOptionLabel(
                        company.company_name,
                        company.funding,
                        billingCompanyTabLabel(company.company_name, index, payerCompanies.length)
                      )}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {payerKind === "company" ? (
              <p className="text-xs text-muted">Le client règle cette part dans Transactions.</p>
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
                  checked={includeInLedger}
                  onChange={(event) => setIncludeInLedger(event.target.checked)}
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
                value={notesInternal}
                onChange={(event) => setNotesInternal(event.target.value)}
                rows={3}
                placeholder="Mémo pour l’agence"
                className={`${coverField} min-h-24 font-normal`}
              />
            </label>
            <label className="flex flex-col gap-2 rounded-3xl bg-white p-5 text-sm font-semibold text-[var(--admin-navy)] shadow-[inset_0_0_0_1px_var(--border)]">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                Note pour le client
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
                  Visible sur son séjour
                </span>
              </span>
              <textarea
                name="notes_client"
                value={notesClient}
                onChange={(event) => setNotesClient(event.target.value)}
                rows={3}
                placeholder="Un mot que le client lira"
                className={`${coverField} min-h-24 font-normal`}
              />
            </label>
          </section>

        </div>
      </form>
      {tab === "voyage" ? (
        <>
      <div className="order-5">
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
      <form onSubmit={addDoc} className="admin-af-card order-6 flex flex-wrap items-center gap-3 rounded-3xl p-5">
        <p className="text-sm font-semibold text-[var(--admin-navy)]">Ou joindre une pièce sans la lire</p>
        <input name="file" type="file" required disabled={docBusy} className="text-sm" />
        <button disabled={docBusy} className="admin-af-btn admin-tap rounded-full px-3 py-2 text-sm disabled:opacity-50">
          {docBusy ? "Envoi…" : "Joindre"}
        </button>
        <div className="basis-full">
          <BusyBar active={docBusy} label="Envoi de la pièce…" />
          {docError ? (
            <p role="alert" className="text-sm text-[var(--admin-red)]">
              {docError}
            </p>
          ) : null}
        </div>
      </form>
      <div className="order-2">
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
        stayVisible={booking.visible_to_client}
        attachedEmails={attachedEmails}
        hotelMessages={hotelMessages}
        hotelThreadMessages={hotelThreadMessages}
        openHotelItemId={openHotelItemId}
        reference={booking.reference}
        onLiveItems={onLiveItems}
        onBindDraftSave={(save) => {
          saveOpenCard.current = save;
        }}
        onStepsPending={setStepsPending}
      />
      </div>
      <button
        type="button"
        onClick={() => setTab("argent")}
        className="order-3 admin-af-card flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-3xl px-5 py-4 text-left"
      >
        <span className="font-display text-lg font-bold text-[var(--admin-navy)]">Règlement</span>
        <span className="text-sm text-muted">{payerCaption}</span>
        <span className="text-sm font-semibold text-[var(--admin-navy)]">
          {formatMoney(stayAmount, stayCurrency(booking.currency))}
        </span>
        <span className="text-sm font-semibold text-[var(--admin-navy)]">{staffLedgerCaption(booking)}</span>
      </button>
      <div className="order-4 space-y-3">
      <ReservationFiles
        variant="admin"
        showPassports={false}
        attachments={attachmentPreviews(documents, items, booking.reference)}
        onRemoveAttachment={(file) => removeDocument(file.id)}
        removeQuestion={(file) => `${file.label} quitte le dossier et son fichier est supprimé.`}
      />
      {mailGroups.sources.length ? (
        <ul className="admin-af-card space-y-1 rounded-3xl p-5 text-sm text-[var(--admin-navy)]">
          <li className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">Courriers</li>
          {mailGroups.sources.map((mail) => (
            <li key={mail.id} className="truncate">{mail.label}</li>
          ))}
        </ul>
      ) : null}
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
          <EstaOnBooking bookingId={booking.id} rows={estaLines} />
          <UkEtaOnBooking bookingId={booking.id} rows={ukEtaLines} />
        </div>
        {!travelers.length ? (
          <button
            type="button"
            disabled={partyBusy}
            onClick={() => void addHolder()}
            className="admin-tap rounded-full bg-[var(--admin-peach)] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
          >
            {partyBusy ? "Ajout…" : `Ajouter ${holderName.first_name} ${holderName.last_name} (titulaire)`}
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
            onRemove={(id) => removeTraveler(id)}
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
          <select name="party_key" required disabled={partyBusy} className={fieldControlClass}>
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
          <button disabled={partyBusy} className="admin-af-btn admin-tap rounded-full px-3 py-2 text-sm disabled:opacity-50">
            {partyBusy ? "Ajout…" : "Ajouter"}
          </button>
          <div className="sm:col-span-2">
            <BusyBar active={partyBusy} label="Ajout du voyageur…" />
            <IssuesList issues={partyIssues} />
            {partyError && !partyIssues.length ? (
              <p role="alert" className="text-sm text-[var(--admin-red)]">
                {partyError}
              </p>
            ) : null}
          </div>
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
      <CustomerLoginLog logins={customerLogins} activity={customerActivity} />
        </>
      ) : null}

      {tab === "whatsapp" ? (
        <WhatsappThread
          expanded
          messages={whatsappMessages}
          requests={whatsappRequests}
          bookings={whatsappBookings}
        />
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
        items={pricedItems}
        visible={booking.visible_to_client}
        currency={booking.currency}
        agencyCommission={booking.agency_commission === true}
        onExpenseWrite={onExpenseWrite}
      />
      </div>
      <section className="max-w-[480px] space-y-3">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Compte du client</h2>
        <p className="text-sm text-muted">Même lecture que l’espace du client.</p>
        {liveLedger ? (
          <ClientTransactionsPanel
            view={liveLedger}
            statementEndpoint={
              statementCustomer ? `/api/admin/clients/${statementCustomer.id}/releve` : null
            }
            statementAudience="staff"
          />
        ) : (
          <p className="text-sm text-muted">Le grand livre n’est pas lisible pour le moment.</p>
        )}
      </section>
        </>
      ) : null}

      {tab === "cartes" ? (
        <div className="space-y-6">
          <BookingCards
            bookingId={booking.id}
            cards={bookingCards}
            firstName={stayGuest.firstName}
            lastName={stayGuest.lastName}
          />
          {pliantRecap.length ? (
            <PliantBookingTab
              bookingId={booking.id}
              currency={booking.currency}
              cards={pliantRecap}
              items={items}
            />
          ) : null}
        </div>
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
          {hotelLetters.openStays.length ? (
            <section className="admin-af-card space-y-3 rounded-3xl bg-[#faf9f6] p-5">
              <h2 className="font-display text-lg font-bold text-[#0B192C]">Courriers hôtel</h2>
              <ul className="space-y-2">
                {hotelLetters.openStays.map((stay) => {
                  const hotel = items.find((item) => item.id === stay.itemId);
                  const hotelName = hotel ? hotelDisplayName(hotel) : "Hôtel";
                  return (
                    <li key={stay.itemId} className="flex flex-wrap items-start gap-2 text-sm text-[#0B192C]">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C5A880]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{hotelName}</span>
                        <span className="text-[#3d4654]"> — {stay.summary}</span>
                      </span>
                      <button
                        type="button"
                        className="admin-tap shrink-0 rounded-full border border-[#d9d1c3] bg-white px-3 py-1 text-xs font-semibold text-[#0B192C]"
                        aria-label={`Voir l’étape ${hotelName}`}
                        onClick={() => showStep(stay.itemId)}
                      >
                        Voir l’étape
                      </button>
                    </li>
                  );
                })}
              </ul>
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
          <ServiceOfferToggles
            bookingId={booking.id}
            chauffeur={booking.offer_chauffeur === true}
            greeter={booking.offer_greeter === true}
            checkin={booking.offer_checkin === true}
            visa={booking.offer_visa === true}
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
          ledger={ledger}
          settled={settledAuthorizationCountries({
            travelerIds: travelers.map((traveler) => traveler.id),
            estaTones: estaLines,
            ukEtaTones: ukEtaLines,
          })}
        />
      ) : null}
      </div>
    </div>
  );
}
