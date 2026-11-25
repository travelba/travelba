"use client";

import { FormEvent, KeyboardEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DeferredHotels, DeferredLedger, DeferredSlice, type DeferredLedgerValue } from "@/components/admin/BookingDeferred";
import { SpouseTravelWhatsapp } from "@/components/admin/SpouseTravelWhatsapp";
import { Mb3mFicheAction } from "@/components/admin/Mb3mFicheAction";
import type { DossierPanels } from "@/lib/crm/admin-booking-load";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { greetingGivenName, shownPersonName } from "@/lib/crm/identity";
import { completeFlightRoutes } from "@/lib/crm/flight-route";
import {
  countsAsCarnetCard,
  isActiveItem,
  isLedgerExpenseKind,
  type CrmBooking,
  type CrmBookingCard,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmHotelArrival,
  type CrmHotelMessage,
  type CrmHotelThreadMessage,
  type CrmHotelRequest,
  type CrmBillingCompany,
  type CrmCompanion,
  type CrmCustomer,
  type CrmCustomerActivity,
  type CrmCustomerLogin,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import {
  acceptArgent,
  mergeItemMoney,
  moneyFieldsEqual,
  recallArgent,
  rememberArgent,
  type ArgentIncoming,
} from "@/lib/crm/argent-live";
import { expenseCountsForClient, validatedExpenseDetails } from "@/lib/crm/expense-validation";
import { BusyBar } from "@/components/crm/BusyBar";
import { formatMoney, jMinusLabel, todayIsoDate } from "@/lib/crm/money";
import { readMb3mActivityOverride } from "@/lib/crm/mb3m-activity";
import { Icon } from "@/components/crm/icons";
import type { EstaTravelerLine } from "@/lib/crm/esta-status";
import { settledAuthorizationCountries } from "@/lib/crm/visa-cover";
import type { UkEtaTravelerLine } from "@/lib/crm/uk-eta-ui";
import { passportVaultRows } from "@/lib/crm/passport-vault";
import { agencyFeeExtraAmounts, bookingTotalFromItems, flightsInStayTotal, isStayAmountKind } from "@/lib/crm/bookings";
import {
  agencyFeeRateKey,
  agencyFeeSourceLabel,
  formatAgencyFeePercent,
  parseStoredAgencyFeeRate,
  type AgencyFeeSource,
} from "@/lib/crm/agency-fee-rate";
import { AgencyFeeRateField } from "@/components/admin/AgencyFeeRateField";
import { COMMERCIAL_DISCOUNT_LABEL, readCommercialDiscount, type DiscountLine } from "@/lib/crm/commercial-discount";
import { BookingDiscountPanel } from "@/components/admin/BookingDiscountPanel";
import { stayPriceWithExpenses } from "@/lib/crm/ledger-display";
import { chargeableTicketingFee } from "@/lib/crm/ticketing-fee";
import { passengersFromDetails, peopleNotOnStay } from "@/lib/crm/document-passengers";
import {
  canConfirmCarnetPublish,
  publishConfirmHold,
  coverQuery,
  hiddenClientCards,
  hotelDisplayName,
  keptHiddenFromClient,
  stayNameField,
} from "@/lib/crm/carnet";
import { bookingCoverPlan, catalogPhotoId } from "@/lib/crm/covers";
import { ReviewDoubtList } from "@/components/crm/ReviewDoubtList";
import { reviewDoubts, reviewStepLabel } from "@/lib/crm/review-doubt";
import { CoverPickDialog } from "@/components/admin/CoverPickDialog";
import { useOpenClientSpace } from "@/components/admin/OpenClientSpace";
import { AgencyHistoryPanel } from "@/components/admin/AgencyHistoryPanel";
import { ChargeControl } from "@/components/admin/ChargeControl";
import { ResponsableForm } from "@/components/admin/ResponsableForm";
import { ReglementSummary } from "@/components/admin/ReglementSummary";
import { SepaInFlight } from "@/components/account/SepaInFlight";
import { TripCostsBlock } from "@/components/admin/TripCostsBlock";
import { attachedCostStamp, useTripProposals } from "@/components/admin/use-trip-proposals";
import { visibleTripState, type TripAccountingView } from "@/lib/crm/trip-costs";
import { reglementChecklist } from "@/lib/crm/reglement-checklist";
import { hotelCardNeedsAlert, principalGuest } from "@/lib/crm/hotel-arrival";
import type { PliantCardRecap } from "@/lib/crm/pliant-booking";
import type { WhatsappThreadMessage, WhatsappThreadRequest } from "@/components/admin/WhatsappThread";
import type { ExpenseWrite } from "@/components/admin/BookingExpensesPanel";
import { DEFAULT_EXPENSE_PRESETS, type ExpensePreset } from "@/lib/crm/expense-presets";
import { ServiceOfferToggles } from "@/components/admin/ServiceOfferToggles";
import { BookingItemsPanel } from "@/components/admin/BookingItemsPanel";
import { forfaitPriceError, readForfaitAmount, readStayPriceMode, type StayPriceMode } from "@/lib/crm/card-price";
import { HiddenCardsCounter } from "@/components/admin/HiddenCards";
import { BoardingPassSend } from "@/components/admin/BoardingPassSend";
import { applyExpenseLedgerChange, type ClientLedgerView } from "@/lib/crm/client-ledger";
import {
  ArchiveBookingButton,
  DuplicateBookingButton,
  RestoreBookingButton,
} from "@/components/admin/ArchiveBookingButton";
import { LittleEmperorsCancel } from "@/components/admin/LittleEmperorsCancel";
import { MoveToDossier } from "@/components/admin/MoveToDossier";
import { TripSharePanel } from "@/components/account/TripSharePanel";
import { hotelTripChecklist } from "@/lib/crm/hotel-desk";
import { dossierCheckinBadge, flightCheckinViews, type StoredFlightCheckin } from "@/lib/crm/online-checkin";
import { OnlineCheckinChecklist } from "@/components/admin/OnlineCheckinChecklist";
import { DateFrInput, fieldControlClass } from "@/components/crm/fields";
import { PlaceField } from "@/components/crm/PlaceField";
import { BoardingPassGroups, boardingGroupsEmpty } from "@/components/account/BoardingPassGroups";
import { MovePieceButton } from "@/components/admin/MovePieceButton";
import { ReservationFiles } from "@/components/crm/ReservationFiles";
import { passportPreviewsForStay, splitBoardingAttachments } from "@/lib/crm/preview-files";
import { TripPassportPicker } from "@/components/crm/TripPassportPicker";
import { IssuesList } from "@/components/crm/IssuesList";
import { collectPublishIssues, issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import { householdMembers } from "@/lib/crm/household";
import { bookingHasFlight, findVisaExtra, type ServiceRefusal } from "@/lib/crm/extras";
import { groupAttachedEmails } from "@/lib/crm/email-duplicates";
import {
  clientStayAction,
  PRIMARY_STAY_LABEL,
  staffBlockingChips,
  staffLedgerCaption,
  staffStayFacts,
  staffStayLabel,
  stayTitleFromItems,
} from "@/lib/crm/staff-stay";
import { type ClientVisaStep, type EstaAnswers } from "@/lib/crm/visa-flow";
import type { FrenchPassportTrip } from "@/lib/crm/visa-trip";
import { travelersMissingPassport, travelersPassportExpiresBeforeReturn } from "@/lib/crm/trip-documents";
import type { ShareCompanion } from "@/lib/crm/trip-share-types";
import { ChangeBookingClient } from "@/components/admin/ChangeBookingClient";
import { CustomerPickField } from "@/components/admin/CustomerPickField";
import {
  customerBillingPickLabel,
  customerTravelerPickLabel,
  type PickableCustomer,
} from "@/lib/crm/customer-search";
import { STAY_CURRENCIES, stayCurrency } from "@/lib/crm/stay-currency";
import { StayBillingChoice } from "@/components/crm/StayBillingChoice";
import { billingCompanyTabLabel } from "@/lib/crm/billing-companies";
import { fundingCompanyOptionLabel, payingCompanyCaption } from "@/lib/crm/funding-wallet";
import { defaultBillingCompany } from "@/lib/crm/payer";
import {
  BOOKING_TAB_HELP,
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
import { TITLE_REVIEW_MARK } from "@/lib/crm/import-title";

function panelLoading(label: string) {
  return <p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-muted">{label}</p>;
}

/** Panneaux absents du premier affichage (ou sous les cartes) : chunk séparé. */
const BookingIngest = dynamic(() => import("@/components/crm/BookingIngest").then((m) => m.BookingIngest), {
  loading: () => panelLoading("Chargement de l’import…"),
});
const CustomerLoginLog = dynamic(
  () => import("@/components/admin/CustomerLoginLog").then((m) => m.CustomerLoginLog),
  { loading: () => panelLoading("Activité…") }
);
const WhatsappThread = dynamic(() => import("@/components/admin/WhatsappThread").then((m) => m.WhatsappThread), {
  loading: () => panelLoading("Chargement de WhatsApp…"),
});
const BookingExpensesPanel = dynamic(
  () => import("@/components/admin/BookingExpensesPanel").then((m) => m.BookingExpensesPanel),
  { loading: () => panelLoading("Chargement des dépenses…") }
);
const ClientTransactionsPanel = dynamic(
  () => import("@/components/account/ClientTransactionsPanel").then((m) => m.ClientTransactionsPanel),
  { loading: () => panelLoading("Chargement du compte…") }
);
const InvoiceBlock = dynamic(() => import("@/components/admin/InvoiceBlock").then((m) => m.InvoiceBlock), {
  loading: () => panelLoading("Chargement de la facture…"),
});
const BookingCards = dynamic(() => import("@/components/admin/BookingCards").then((m) => m.BookingCards), {
  loading: () => panelLoading("Chargement des cartes…"),
});
const VisaSection = dynamic(() => import("@/components/crm/VisaSection").then((m) => m.VisaSection), {
  loading: () => panelLoading("Chargement des formalités…"),
});
const ExtrasPanel = dynamic(() => import("@/components/crm/ExtrasPanel").then((m) => m.ExtrasPanel), {
  loading: () => panelLoading("Chargement des prestations…"),
});
const EstaOnBooking = dynamic(() => import("@/components/admin/EstaOnBooking").then((m) => m.EstaOnBooking), {
  loading: () => panelLoading("Chargement ESTA…"),
});
const UkEtaOnBooking = dynamic(() => import("@/components/admin/UkEtaOnBooking").then((m) => m.UkEtaOnBooking), {
  loading: () => panelLoading("Chargement ETA…"),
});
const BookingRestaurants = dynamic(() => import("@/components/admin/BookingRestaurants").then((m) => m.BookingRestaurants), {
  loading: () => panelLoading("Chargement des restaurants…"),
});
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
      item.id === change.id
        ? {
            ...item,
            title: change.title,
            amount: change.amount,
            kind: "expense",
            // Validée : la ligne compte dans le prix affiché sans attendre le rechargement.
            details: change.validated ? validatedExpenseDetails(item.details) : item.details,
          }
        : item
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
        item.include_in_ledger ? "1" : "0",
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

const stayNameClass =
  "w-full cursor-text rounded-md border-b border-transparent bg-transparent px-1.5 py-0.5 font-display font-bold leading-tight text-[var(--admin-navy)] outline-none placeholder:text-[var(--admin-navy)]/30 hover:border-[var(--admin-gold)] hover:bg-white focus:border-[var(--admin-gold)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-gold)]/40";

function CoverMark({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-gold-dark)]">{children}</p>
      <span className="h-px flex-1 bg-gradient-to-r from-[var(--admin-gold)]/45 to-transparent" />
    </div>
  );
}

type SegmentedOption<T extends string> = { value: T; title: string; hint: string; disabled?: boolean };

/** Un choix à deux ou trois valeurs sur une ligne. Le texte sous la ligne décrit la valeur retenue. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
}) {
  const current = options.find((option) => option.value === value) || options[0];
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl bg-white/60 p-1 shadow-[inset_0_0_0_1px_var(--border)]"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={option.disabled}
              onClick={() => onChange(option.value)}
              className={`admin-tap grow rounded-xl px-3.5 py-1.5 text-center text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                selected ? "bg-[var(--admin-navy)] text-white" : "text-[var(--admin-navy)] hover:bg-white"
              }`}
            >
              {option.title}
            </button>
          );
        })}
      </div>
      {current?.hint ? <p className="text-xs text-muted">{current.hint}</p> : null}
    </div>
  );
}

export function BookingEditor({
  booking,
  items: sourceItems,
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
  pliantBalance = null,
  shareUrl = null,
  shareCompanions = [],
  arrivals: arrivalsIn = [],
  hotelRequests: hotelRequestsIn = [],
  hotelSignatory = "",
  attachedEmails: attachedEmailsIn = [],
  hotelMessages: hotelMessagesIn = [],
  hotelThreadMessages: hotelThreadMessagesIn = [],
  openHotelItemId = null,
  openRelanceId = null,
  openReplyId = null,
  billingCompanies = [],
  ficheBillingCompanies = [],
  mb3mFiche = { blocker: null, sent: false, sentCompanyIds: [] as string[] },
  littleEmperors = null,
  leLinks = [],
  leStays = [],
  expenseBilling = [],
  revolutExpenses: revolutIn = [],
  accountLedger: accountLedgerIn = null,
  deferredLedger = null,
  deferredItems = null,
  bookingCards: bookingCardsIn = [],
  pliantRecap: pliantRecapIn = [],
  estaLines: estaIn = [],
  ukEtaLines: ukIn = [],
  whatsappMessages: whatsappMessagesIn = [],
  whatsappRequests: whatsappRequestsIn = [],
  whatsappBookings: whatsappBookingsIn = [],
  whatsappTemplates = [],
  whatsappPreviewBlocked = false,
  customerLogins: loginsIn = [],
  customerActivity: activityIn = [],
  mb3m: mb3mIn,
  accounting: accountingIn = null,
  panels = null,
  agencyFee,
  expensePresets = DEFAULT_EXPENSE_PRESETS,
  importTasks = [],
  showMargins = true,
  checkins = [],
  ownership = null,
  twinNames = [],
  discounts = null,
}: {
  booking: CrmBooking;
  /** Taux appliqué et taux hérité du compte. Le sélecteur reste à l’agence. */
  agencyFee?: {
    rate: number;
    source: AgencyFeeSource;
    inheritedRate: number;
    inheritedSource: AgencyFeeSource;
  };
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
    launched_by_name?: string | null;
  }[];
  pliantReady?: boolean;
  /** Disponible du compte Pliant de l’agence. Null : lecture impossible, le solde reste affiché. */
  pliantBalance?: ReactNode;
  shareUrl?: string | null;
  shareCompanions?: ShareCompanion[];
  arrivals?: CrmHotelArrival[];
  hotelRequests?: CrmHotelRequest[];
  hotelSignatory?: string;
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
  openRelanceId?: string | null;
  openReplyId?: string | null;
  billingCompanies?: {
    id: string;
    company_name: string | null;
    sort_order: number;
    funding?: string | null;
  }[];
  /** Sociétés de la fiche du client du dossier, colonnes complètes. */
  ficheBillingCompanies?: CrmBillingCompany[];
  mb3mFiche?: { blocker: string | null; sent: boolean; sentCompanyIds: string[] };
  littleEmperors?: {
    id: string;
    hotel_name: string | null;
    is_cancellable: boolean | null;
    cancellation_deadline: string | null;
    cancellation_policies: string[] | null;
    state: string | null;
    created_at?: string | null;
  } | null;
  leLinks?: { id: string; confirmation_number: string; hotel_name: string | null }[];
  leStays?: { hotel_name: string | null; check_in: string | null; total_cost: string | null; currency: string | null }[];
  expenseBilling?: { id: string; title: string; billing_company_id: string | null }[];
  /** Débits Revolut rattachés au dossier. Hors encours ; montrés dans Coûts du voyage s’ils n’ont pas de coût posé. */
  revolutExpenses?: { id: string; label: string; amount: string }[];
  ledger?: ClientLedgerView | null;
  /** Grand livre du compte, même lecture que Transactions du client. */
  accountLedger?: ClientLedgerView | null;
  /** Même lecture, après le rapprochement Stripe. N’empêche pas l’en-tête. */
  deferredLedger?: Promise<DeferredLedgerValue | null> | null;
  /** Cartes hôtel complétées (contacts, photos). Les étapes déjà affichées restent. */
  deferredItems?: Promise<CrmBookingItem[] | null> | null;
  bookingCards?: CrmBookingCard[];
  pliantRecap?: PliantCardRecap[];
  estaLines?: EstaTravelerLine[];
  ukEtaLines?: UkEtaTravelerLine[];
  whatsappMessages?: WhatsappThreadMessage[];
  whatsappRequests?: WhatsappThreadRequest[];
  whatsappBookings?: { id: string; reference: string }[];
  whatsappTemplates?: { key: string; label: string }[];
  whatsappPreviewBlocked?: boolean;
  customerLogins?: CrmCustomerLogin[];
  customerActivity?: CrmCustomerActivity[];
  mb3m: {
    blocker: string | null;
    notice?: string | null;
    piece: { number: string } | null;
    preparation: { state: "running" | "failed" | null; message: string | null; resume: boolean };
    amadeus?: { label: string; invoiceNumber: string; placement: "move" | "here" | "other" }[];
    creditNoteAllowed?: boolean;
  };
  /** Comptabilité du voyage déjà en base : ventes, coûts rattachés, marge, totaux. Les propositions arrivent ensuite. */
  accounting?: TripAccountingView | null;
  /** Raccourcis du bloc Dépenses. Vide si l’agence les a tous retirés. */
  expensePresets?: readonly ExpensePreset[];
  /** Enregistrement, visa et pré-enregistrement issus d’un mail. Pas des étapes. */
  importTasks?: { id: string; kind: string; title: string }[];
  /** Faux : marges, coûts nets et commission restent cachés. */
  showMargins?: boolean;
  /** Statut d’enregistrement en ligne déjà noté, une ligne par vol. */
  checkins?: StoredFlightCheckin[];
  /** Qui est en charge (null : à prendre) et qui a créé le dossier (null : inconnu). */
  ownership?: {
    owner: string | null;
    createdBy: string | null;
    mine?: boolean;
    canTake?: boolean;
    meName?: string;
  } | null;
  /** Fiches jumelées qui voient aussi ce dossier. */
  twinNames?: string[];
  /** null : la table n’est pas là, les colonnes restent. Tableau : les lignes, même vides. */
  discounts?: DiscountLine[] | null;
  /** E-mails, activité, WhatsApp, formalités, Pliant et compta, après le premier affichage. */
  panels?: DossierPanels | null;
}) {
  const discountSignature = (discounts || []).map((line) => `${line.id}:${line.label}:${line.quantity}:${line.unitPrice}:${line.percent}`).join("|");
  const [discountSynced, setDiscountSynced] = useState(discountSignature);
  const [discountOverride, setDiscountOverride] = useState<DiscountLine[] | null>(null);
  if (discountSynced !== discountSignature) {
    setDiscountSynced(discountSignature);
    setDiscountOverride(null);
  }
  const discountLines = discountOverride ?? discounts;
  const columnDiscount = readCommercialDiscount(booking);
  const columnLine: DiscountLine | null =
    discounts == null && columnDiscount.type && columnDiscount.value
      ? {
          id: "remise-commerciale",
          label: COMMERCIAL_DISCOUNT_LABEL,
          kind: columnDiscount.type,
          quantity: 1,
          unitPrice: columnDiscount.type === "amount" ? columnDiscount.value : null,
          percent: columnDiscount.type === "percent" ? columnDiscount.value : null,
        }
      : null;
  const panelLines = discountLines ?? (columnLine ? [columnLine] : []);
  const [mailRows, setMailRows] = useState<typeof attachedEmailsIn | null>(null);
  const [hotelRows, setHotelRows] = useState<{
    arrivals: typeof arrivalsIn;
    hotelRequests: typeof hotelRequestsIn;
    hotelMessages: typeof hotelMessagesIn;
    hotelThreadMessages: typeof hotelThreadMessagesIn;
    bookingCards: typeof bookingCardsIn;
    pliantRecap: typeof pliantRecapIn;
  } | null>(null);
  const [moneyRows, setMoneyRows] = useState<{
    ledger: ClientLedgerView | null;
    accountLedger: typeof accountLedgerIn;
    accounting: typeof accountingIn;
    revolutExpenses: typeof revolutIn;
    mb3m: typeof mb3mIn;
    revision?: number;
    layer?: number;
  } | null>(null);
  const [estaRows, setEstaRows] = useState<{ estaLines: typeof estaIn; ukEtaLines: typeof ukIn } | null>(null);
  const [threadRows, setThreadRows] = useState<{
    messages: typeof whatsappMessagesIn;
    requests: typeof whatsappRequestsIn;
    bookings: typeof whatsappBookingsIn;
  } | null>(null);
  const [activityRows, setActivityRows] = useState<{ logins: typeof loginsIn; activity: typeof activityIn } | null>(null);
  const attachedEmails = mailRows ?? attachedEmailsIn;
  const arrivals = hotelRows?.arrivals ?? arrivalsIn;
  const hotelRequests = hotelRows?.hotelRequests ?? hotelRequestsIn;
  const hotelMessages = hotelRows?.hotelMessages ?? hotelMessagesIn;
  const hotelThreadMessages = hotelRows?.hotelThreadMessages ?? hotelThreadMessagesIn;
  const bookingCards = hotelRows?.bookingCards ?? bookingCardsIn;
  const pliantRecap = hotelRows?.pliantRecap ?? pliantRecapIn;
  const accountLedger = moneyRows?.accountLedger ?? accountLedgerIn;
  // Le premier rendu porte déjà les coûts en base. La vague différée et l’enregistrement
  // les remplacent quand ils arrivent ; la file des propositions, elle, reste à part.
  const serverAccounting = moneyRows?.accounting ?? accountingIn;
  const revolutExpenses = revolutIn.length ? revolutIn : (moneyRows?.revolutExpenses ?? revolutIn);
  const mb3m = moneyRows?.mb3m ?? mb3mIn;
  const estaLines = estaRows?.estaLines ?? estaIn;
  const ukEtaLines = estaRows?.ukEtaLines ?? ukIn;
  const whatsappMessages = threadRows?.messages ?? whatsappMessagesIn;
  const whatsappRequests = threadRows?.requests ?? whatsappRequestsIn;
  const whatsappBookings = threadRows?.bookings ?? whatsappBookingsIn;
  const customerLogins = activityRows?.logins ?? loginsIn;
  const customerActivity = activityRows?.activity ?? activityIn;
  const onMails = useCallback((value: NonNullable<typeof mailRows>) => setMailRows(value), []);
  const onHotels = useCallback((value: NonNullable<typeof hotelRows>) => setHotelRows(value), []);
  const onEsta = useCallback((value: NonNullable<typeof estaRows>) => setEstaRows(value), []);
  const onThread = useCallback((value: NonNullable<typeof threadRows>) => setThreadRows(value), []);
  const onActivity = useCallback((value: NonNullable<typeof activityRows>) => setActivityRows(value), []);
  const [held, setHeld] = useState(() => recallArgent(booking.id));
  const [commissionOverride, setCommissionOverride] = useState<boolean | null>(null);
  const [seenSource, setSeenSource] = useState(sourceItems);
  const [liveSource, setLiveSource] = useState<CrmBookingItem[] | null>(null);
  if (seenSource !== sourceItems) {
    setSeenSource(sourceItems);
    setLiveSource(null);
  }
  const serverItems = useMemo(() => completeFlightRoutes(liveSource ?? sourceItems), [liveSource, sourceItems]);
  // Un prix enregistré reste, même si le changement d’onglet restaure l’ancienne page.
  // `held` entier : le compilateur refuse `held.items` seul. Le tableau ne change que si les prix changent.
  const items = useMemo(() => {
    if (!held?.items) return serverItems;
    const merged = mergeItemMoney(serverItems, held.items);
    return moneyFieldsEqual(serverItems, merged) ? serverItems : merged;
  }, [held, serverItems]);
  const router = useRouter();
  const [clearedReview, setClearedReview] = useState<string[]>([]);
  const [verifyBusy, setVerifyBusy] = useState(false);
  async function verifyCards(ids: string[] | null) {
    setVerifyBusy(true);
    const result = await adminAction<{ cartes?: { id: string }[] }>(`/api/admin/bookings/${booking.id}/verifier`, {
      method: "POST",
      body: ids ? { carte_ids: ids } : { tout: true },
    });
    setVerifyBusy(false);
    if (!result.ok) return false;
    const cleared = (result.data?.cartes || []).map((row) => row.id);
    if (cleared.length) setClearedReview((current) => [...new Set([...current, ...cleared])]);
    router.refresh();
    return true;
  }
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const saveOpenCard = useRef<(() => Promise<boolean | "annule">) | null>(null);
  const [pricedItems, setPricedItems] = useState(items);
  const [liveSteps, setLiveSteps] = useState<CrmBookingItem[] | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const stepErrorRef = useRef<string | null>(null);
  const ledgerKey = ledgerMoneyKey(accountLedger);
  const [seenLedgerKey, setSeenLedgerKey] = useState(ledgerKey);
  const [liveLedger, setLiveLedger] = useState(accountLedger);
  const [stripeLedgerReady, setStripeLedgerReady] = useState(false);
  if (ledgerKey !== seenLedgerKey) {
    setSeenLedgerKey(ledgerKey);
    if (!held && !stripeLedgerReady) setLiveLedger(accountLedger);
  }
  const applyArgent = useCallback(
    (incoming: ArgentIncoming) => {
      if (incoming.agencyCommission !== undefined) setCommissionOverride(null);
      setHeld((current) => {
        const next = acceptArgent(current, incoming);
        if (next !== current) rememberArgent(booking.id, next);
        return next;
      });
    },
    [booking.id]
  );
  const refreshArgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/argent`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const json = (await res.json()) as ArgentIncoming;
      if (typeof json?.revision !== "number") return;
      applyArgent(json);
    } catch {
      // Le séjour est déjà enregistré. L’onglet garde le dernier montant reçu.
    }
  }, [applyArgent, booking.id]);
  const onMoney = useCallback(
    (value: NonNullable<typeof moneyRows>) => {
      setMoneyRows(value);
      applyArgent({
        revision: value.revision ?? 0,
        layer: value.layer ?? 0,
        accounting: value.accounting,
        ledger: value.ledger,
        accountLedger: value.accountLedger,
      });
    },
    [applyArgent]
  );
  const onDeferredLedger = useCallback(
    (value: DeferredLedgerValue) => {
      setStripeLedgerReady(true);
      applyArgent({
        revision: value.revision ?? 0,
        layer: value.layer ?? 1,
        ledger: value.ledger,
        accountLedger: value.accountLedger,
      });
    },
    [applyArgent]
  );
  const onDeferredItems = useCallback((next: CrmBookingItem[]) => {
    setLiveSource(next);
  }, []);
  const onLiveItems = useCallback((next: CrmBookingItem[]) => {
    setLiveSteps(next);
    setPricedItems((current) => (stayAmountKey(current) === stayAmountKey(next) ? current : next));
  }, []);
  const onExpenseWrite = useCallback(
    (change: ExpenseWrite) => {
      setPricedItems((current) => withExpenseWrite(current, change, booking.id));
      const patch = {
        bookingId: booking.id,
        itemId: change.id,
        previousTitle: change.previousTitle,
        title: change.title,
        previousAmount: change.previousAmount,
        amount: change.amount,
        removed: change.removed,
        currency: booking.currency,
      };
      setLiveLedger((current) => applyExpenseLedgerChange(current, patch));
      setHeld((current) => {
        if (!current) return current;
        const next = {
          ...current,
          ledger: applyExpenseLedgerChange(current.ledger, patch),
          accountLedger: applyExpenseLedgerChange(current.accountLedger, patch),
        };
        rememberArgent(booking.id, next);
        return next;
      });
    },
    [booking.currency, booking.id]
  );
  const reviewRows = items.flatMap((item) => {
    if (clearedReview.includes(item.id)) return [];
    const reasons = reviewDoubts(item);
    return reasons.length ? [{ key: item.id, label: reviewStepLabel(item), reasons }] : [];
  });
  const [busy, setBusy] = useState<"idle" | "save" | "publish" | "cover" | "invoice">("idle");
  // Champs du formulaire méta : `useMirror` — un champ touché par l’agent gagne, un champ intact suit
  // le serveur à chaque `router.refresh()` (une étape ajoutée met déjà à jour la ligne du dossier).
  const routeTitle = stayTitleFromItems(booking.title, booking.destination, items, "Séjour", customer?.city);
  const [titleDraft, setTitleDraft] = useMirror(routeTitle);
  const titleEdit = stayNameField(routeTitle, titleDraft);
  const [coverOpen, setCoverOpen] = useState(false);
  const tab = bookingTabFromParam(searchParams.get("tab"));
  useEffect(() => {
    void adminAction(`/api/admin/bookings/${booking.id}/vu`, { method: "POST" });
  }, [booking.id]);
  const [more, setMore] = useState(false);
  const clientSpace = useOpenClientSpace(booking.customer_id);
  useEffect(() => {
    if (!more) return;
    function close(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-dossier-menu]")) return;
      setMore(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setMore(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [more]);
  const [coverNotice, setCoverNotice] = useState<string | null>(null);
  const arrival = coverQuery(booking.destination, booking.title);
  const coverPlace = arrival === "voyage" ? "" : arrival;
  const coverPlan = bookingCoverPlan(booking, { items });
  const catalogCoverId =
    !booking.cover_image_path && coverPlan.mode === "single" ? catalogPhotoId(coverPlan.src) : null;
  const [flash, setFlash] = useState<string | null>(null);
  const [invoicePiece, setInvoicePiece] = useState(mb3m.piece);
  const [seenInvoice, setSeenInvoice] = useState(mb3m.piece?.number || null);
  if ((mb3m.piece?.number || null) !== seenInvoice) {
    setSeenInvoice(mb3m.piece?.number || null);
    if (mb3m.piece) setInvoicePiece(mb3m.piece);
  }
  const [invoiceNote, setInvoiceNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish" | "cancel">(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyIssues, setPartyIssues] = useState<BookingIssue[]>([]);
  const [partyError, setPartyError] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [passesOpen, setPassesOpen] = useState(false);
  useEffect(() => {
    if (!passesOpen) return;
    document.getElementById("cartes-embarquement")?.scrollIntoView({ block: "start" });
  }, [passesOpen]);
  const [compact, setCompact] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pendingStep = useRef<string | null>(null);
  const pendingRemises = useRef(false);
  const [highlightStep, setHighlightStep] = useState<{ id: string; token: number } | null>(null);
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
  const serverStayPrice = readStayPriceMode(booking);
  const serverForfait = readForfaitAmount(booking);
  const [stayPriceMode, setStayPriceMode] = useMirror<StayPriceMode>(serverStayPrice);
  const [forfaitAmount, setForfaitAmount] = useMirror<number | null>(serverForfait);
  const inheritedFee = agencyFee || {
    rate: parseStoredAgencyFeeRate(booking.agency_fee_rate) ?? 0.1,
    source: (parseStoredAgencyFeeRate(booking.agency_fee_rate) != null ? "dossier" : "defaut") as AgencyFeeSource,
    inheritedRate: 0.1,
    inheritedSource: "defaut" as AgencyFeeSource,
  };
  const serverFeeChoice = parseStoredAgencyFeeRate(booking.agency_fee_rate) == null ? "compte" : agencyFeeRateKey(inheritedFee.rate);
  const [feeChoice, setFeeChoice] = useMirror(serverFeeChoice);
  const [notesInternal, setNotesInternal] = useMirror(booking.notes_internal || "");
  const [notesClient, setNotesClient] = useMirror(booking.notes_client || "");
  const datesInverted = Boolean(startDraft && endDraft && endDraft < startDraft);
  const serverPayerPick: PickableCustomer | null = billingCustomer || customer;
  const [payerPick, setPayerPick] = useMirror<PickableCustomer | null>(serverPayerPick);
  const serverPayerPickId = serverPayerPick?.id || null;
  const [stepsPending, setStepsPending] = useState(false);
  const [appliedMoneyRev, setAppliedMoneyRev] = useState(() => recallArgent(booking.id)?.revision ?? 0);
  if (held?.items && held.revision !== appliedMoneyRev && !stepsPending) {
    setAppliedMoneyRev(held.revision);
    setPricedItems((current) => mergeItemMoney(current, held.items!));
  }
  const dirty =
    titleEdit.dirty ||
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
    feeChoice !== serverFeeChoice ||
    stayPriceMode !== serverStayPrice ||
    (stayPriceMode === "forfait" && forfaitAmount !== serverForfait) ||
    (payerPick?.id || null) !== serverPayerPickId;
  const unsaved = dirty || stepsPending;
  // `replaceState(null, …)` : Next recopie lui-même ses internes et prévient le routeur, donc
  // `useSearchParams()` suit sans rejouer le GET du dossier. Avec `history.state`, l’appel serait ignoré.
  // Cette restauration annule aussi un `router.refresh()` encore en vol : les montants passent par `/argent`.
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

  function openRemises() {
    pendingRemises.current = true;
    if (tab === "argent") {
      document.getElementById("booking-remises")?.scrollIntoView({ block: "start", behavior: "smooth" });
      pendingRemises.current = false;
      return;
    }
    setTab("argent");
  }

  useEffect(() => {
    if (tab !== "argent" || !pendingRemises.current) return;
    pendingRemises.current = false;
    document.getElementById("booking-remises")?.scrollIntoView({ block: "start", behavior: "smooth" });
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
      title: titleEdit.value.trim(),
      client_settles_stay: settles,
    };
    if (settles) delete payload.include_in_ledger;
    else payload.include_in_ledger = fd.get("include_in_ledger") === "on";
    delete payload.agency_fee_rate;
    if (stayPriceMode !== serverStayPrice || (stayPriceMode === "forfait" && forfaitAmount !== serverForfait)) {
      payload.price_mode = stayPriceMode;
      payload.forfait_amount = stayPriceMode === "forfait" ? forfaitAmount : null;
    }
    if (feeChoice !== serverFeeChoice) {
      payload.agency_fee_rate = feeChoice === "compte" ? null : Number(feeChoice);
    }
    return payload;
  }

  const account = customer;
  const holderProfile = {
    first_name: account?.first_name || holderName.first_name,
    last_name: account?.last_name || holderName.last_name,
    usage_name: account?.usage_name ?? null,
    birth_date: account?.birth_date ?? null,
    sex: account?.sex ?? null,
  };
  const stayGuest = principalGuest({ travelers, holder: holderProfile });
  const documentChoices = peopleNotOnStay(
    items.flatMap((item) => passengersFromDetails(item.details)),
    travelers
  );

  function noteStepError(message: string | null) {
    stepErrorRef.current = message;
    setStepError(message);
  }

  async function persistSteps() {
    if (!saveOpenCard.current) return true;
    const cardOk = await saveOpenCard.current().catch(() => false as const);
    if (cardOk === "annule") {
      noteStepError(null);
      return false;
    }
    if (!cardOk) {
      noteStepError(stepErrorRef.current || "Les étapes n’ont pas été enregistrées. Le séjour n’a pas changé.");
      return false;
    }
    noteStepError(null);
    return true;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = metaPayload();
    if (!payload) {
      setFlash("Enregistrement impossible. Réessayez.");
      return;
    }
    const pricingError = forfaitPriceError(stayPriceMode, forfaitAmount);
    if (pricingError) {
      setFlash(pricingError);
      return;
    }
    setBusy("save");
    setFlash(null);
    setIssues([]);
    try {
      if (!(await persistSteps())) return;
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
      await refreshArgent();
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

  async function setFace(status: "draft" | "cancelled") {
    setBusy("publish");
    setFlash(null);
    setIssues([]);
    const res = await fetch(`/api/admin/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("idle");
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      setFlash(null);
      return;
    }
    setFlash(status === "cancelled" ? "Séjour annulé." : "Séjour rouvert. Le client ne le voit pas encore.");
    await refreshArgent();
    router.refresh();
  }

  async function publishStay(visible: boolean, stepsJustSaved: boolean) {
    const payload = dirty ? metaPayload() : null;
    if (dirty && !payload) {
      noteStepError("Enregistrement impossible. Réessayez.");
      return;
    }
    setBusy("publish");
    setFlash(null);
    setIssues([]);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(payload || {}), visible_to_client: visible }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setIssues(issuesFromResponse(json));
        const message = json.error || (visible ? "Le carnet n’a pas été montré." : "Le séjour n’a pas été caché.");
        noteStepError(stepsJustSaved ? `Les étapes sont enregistrées. ${message}` : message);
        setFlash(null);
        return;
      }
      noteStepError(null);
      const saved = payload ? "Enregistré. " : "";
      setFlash(`${saved}${visible ? "Le client voit ce séjour." : "Le client ne voit plus ce séjour."}`);
      await refreshArgent();
      router.refresh();
    } catch {
      noteStepError("Enregistrement impossible. Réessayez.");
    } finally {
      setBusy("idle");
    }
  }

  async function setPublished(visible: boolean) {
    if (visible) {
      const publishIssues = collectPublishIssues(liveSteps ?? items);
      if (publishIssues.length) {
        setIssues(publishIssues);
        setFlash(null);
        return;
      }
    }
    setBusy("publish");
    const hadSteps = stepsPending;
    if (!(await persistSteps())) {
      setBusy("idle");
      return;
    }
    await publishStay(visible, hadSteps);
  }

  async function saveAndShow() {
    setBusy("publish");
    setFlash(null);
    setIssues([]);
    const hadSteps = stepsPending || dirty;
    if (!(await persistSteps())) {
      setBusy("idle");
      return;
    }
    await publishStay(true, hadSteps);
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
    const catalog = Boolean(catalogCoverId);
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
  const hiddenFromClient = items.filter(
    (item) => isActiveItem(item) && countsAsCarnetCard(item.kind) && keptHiddenFromClient(item.details)
  );
  const publishReady = canConfirmCarnetPublish({
    stayVisible: booking.visible_to_client,
    revealCards: revealItems.length,
    revealDocs: revealDocs.length,
  });
  const publishHold = publishConfirmHold({
    stayVisible: booking.visible_to_client,
    revealCards: revealItems.length,
    revealDocs: revealDocs.length,
    hiddenLabels: hiddenFromClient.map((item) => reviewStepLabel(item)),
  });

  const updatesPending = revealItems.length > 0 || revealDocs.length > 0;
  const passportParty = {
    holder: holderProfile,
    companions,
    returnOn: booking.end_date || booking.start_date,
  };
  const passportGap = travelersMissingPassport(travelers, identityDocs, passportParty);
  const passportExpiry = travelersPassportExpiresBeforeReturn(travelers, identityDocs, passportParty);
  const hotelLetters = hotelTripChecklist(hotelRequests);
  const hasFlight = bookingHasFlight(items);
  const leOpen =
    Boolean(littleEmperors) &&
    !["cancelled", "canceled"].includes((littleEmperors?.state || "").toLowerCase());
  const factItems = liveSteps ?? items;
  const hiddenCards = hiddenClientCards(factItems, Boolean(booking.visible_to_client));
  function jumpToHiddenCard() {
    const first = hiddenCards[0];
    if (!first?.id) return;
    setHighlightStep({ id: first.id, token: Date.now() });
    showStep(first.id);
  }
  const facts = staffStayFacts({
    items: factItems,
    savedItems: liveSteps ? items : undefined,
    destination: booking.destination,
    startDate: booking.start_date,
    endDate: booking.end_date,
  });
  const accounting = held?.accounting ?? serverAccounting;
  const shownLedger = held ? held.accountLedger : liveLedger;
  const agencyCommission = commissionOverride ?? held?.agencyCommission ?? booking.agency_commission === true;
  const proposals = useTripProposals(booking.id, attachedCostStamp(accounting));
  const costsToPoint =
    proposals.status === "ready"
      ? proposals.lines.length + (accounting?.unsold.length ?? 0)
      : (accounting?.unsold.length ?? 0);
  const tripState = visibleTripState(accounting, {
    known: proposals.status === "ready",
    count: proposals.lines.length,
  });
  const checkinLines = flightCheckinViews({ items, documents, rows: checkins, now: new Date() });
  const checkinBadge = dossierCheckinBadge(checkinLines);
  const blockers = staffBlockingChips({
    travelers,
    missingPassportIds: passportGap.map((traveler) => traveler.id),
    expiringPassportIds: passportExpiry.map((row) => row.traveler.id),
    hotelLettersOpen: hotelLetters.openCount,
    amountHidden: !booking.archived_at && (!booking.visible_to_client || booking.prices_visible === false),
    costsToPoint,
    marginStale: Boolean(accounting?.invoice.printed && accounting.invoice.marginStale),
    cardAlerts: arrivals.filter((row) => hotelCardNeedsAlert(row)).length,
    checkinAlerts: checkinLines.filter((line) => line.alert).length,
  });
  const travelerLabel = travelers.length
    ? travelers.length <= 4
      ? travelers
          .map((traveler) => greetingGivenName(traveler.first_name) || (traveler.last_name || "").trim())
          .filter(Boolean)
          .join(", ") || `${travelers.length} voyageurs`
      : `${travelers.length} voyageurs`
    : "Aucun voyageur";
  const mailGroups = groupAttachedEmails(attachedEmails);
  const boardingAttachments = splitBoardingAttachments(documents, items, travelers, booking.reference);
  const payerCaption = payingCompanyCaption(payerKind, payerCompanies, payerCompanyId);
  const previewFeeRate = feeChoice === "compte" ? inheritedFee.inheritedRate : Number(feeChoice);
  const previewFeeSource: AgencyFeeSource = feeChoice === "compte" ? inheritedFee.inheritedSource : "dossier";
  const stayPriceInput = {
    stayTotal: bookingTotalFromItems(pricedItems),
    agencyCommission,
    agencyFeeRate: previewFeeRate,
    expenses: pricedItems
      .filter((item) => isActiveItem(item) && expenseCountsForClient(item))
      .map((item) => ({ amount: item.amount == null ? null : Number(item.amount) })),
    extras: agencyFeeExtraAmounts(pricedItems),
    ticketingFee: chargeableTicketingFee({
      items: pricedItems,
      status: booking.status,
      travelerCount: travelers.length,
      feeMode: booking.fee_mode,
    }),
  };
  const grossStay = stayPriceWithExpenses(stayPriceInput);
  const stayAmount = stayPriceWithExpenses({
    ...stayPriceInput,
    ...(discountLines ? { discounts: discountLines } : { discount: readCommercialDiscount(booking) }),
  });
  const statementCustomer = billingCustomer || customer;
  // Cartes qui composent le montant : un aller-retour compte une fois, comme dans le total stocké.
  const activeStayCards = pricedItems.filter((item) => isActiveItem(item) && isStayAmountKind(item.kind));
  const fareFlights = new Set(flightsInStayTotal(activeStayCards));
  const stayCards = activeStayCards.filter((item) => item.kind !== "flight" || fareFlights.has(item));
  const countedCards = stayCards.filter((item) => item.include_in_ledger);
  const payerCompany = payerKind === "company" ? payerCompanies.find((company) => company.id === payerCompanyId) || null : null;
  const invoiceNumber = invoicePiece?.number || accounting?.invoice.number || mb3m.piece?.number || null;
  const checklist = reglementChecklist({
    payerKind,
    payerCompanyName: payerCompany?.company_name || null,
    cardsTotal: stayCards.length,
    cardsPriced: stayCards.filter((item) => item.amount != null).length,
    booking: {
      status: booking.status,
      visible_to_client: booking.visible_to_client,
      archived_at: booking.archived_at,
      include_in_ledger: includeInLedger,
      client_settles_stay: clientSettles,
    },
    costsToPoint,
    costsSearch: proposals.status === "loading" ? "pending" : proposals.status === "error" ? "failed" : undefined,
    invoice: {
      number: invoiceNumber,
      printed: Boolean(accounting?.invoice.printed),
      marginStale: Boolean(accounting?.invoice.marginStale),
    },
  });
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

  // Enregistrer n’apparaît que s’il y a quelque chose à écrire. Montrer seulement si le séjour est caché.
  const stayAction = clientStayAction(booking);
  const showButtonClass = "admin-af-btn admin-tap whitespace-nowrap rounded-full px-4 py-2 text-sm disabled:opacity-50";
  const saveButton =
    unsaved && stayAction !== "cacher" ? (
      <button
        type="submit"
        form="booking-meta"
        disabled={busy !== "idle"}
        aria-keyshortcuts="Control+S Meta+S"
        title="⌘S / Ctrl+S"
        className="admin-tap whitespace-nowrap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
      >
        {busy === "save" ? "Enregistrement…" : "Enregistrer"}
      </button>
    ) : null;
  const showButton =
    stayAction === "montrer" ? (
      <button type="button" disabled={busy !== "idle"} onClick={() => setConfirm("publish")} className={showButtonClass}>
        Montrer au client
      </button>
    ) : null;
  const primaryAction =
    stayAction === "restaurer" ? (
      <>
        {saveButton}
        <RestoreBookingButton bookingId={booking.id} />
      </>
    ) : stayAction === "rouvrir" ? (
      <>
        {saveButton}
        <button
          type="button"
          disabled={busy !== "idle"}
          onClick={() => void setFace("draft")}
          className={showButtonClass}
        >
          Rouvrir
        </button>
      </>
    ) : unsaved && stayAction === "cacher" ? (
      <button type="button" disabled={busy !== "idle"} onClick={() => void saveAndShow()} className={showButtonClass}>
        {PRIMARY_STAY_LABEL["enregistrer-mettre-a-jour"]}
      </button>
    ) : stayAction === "montrer" ? (
      <>
        {saveButton}
        {showButton}
      </>
    ) : null;
  const moreButton = (
    <button
      type="button"
      aria-expanded={more}
      aria-label="Autres actions du dossier"
      onClick={() => setMore((open) => !open)}
      className="admin-tap inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-sm font-bold text-[var(--admin-navy)] lg:h-10 lg:w-10"
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
  const menuItem = "admin-tap block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50";
  const dossierLabel = `${booking.reference} — ${titleEdit.value.trim() || booking.title}`;
  const moreMenu = (
    <div className="w-64 rounded-2xl border border-[var(--border)] bg-white p-1.5">
      {hasFlight ? (
        <button
          type="button"
          className={menuItem}
          onClick={() => {
            setMore(false);
            setPassesOpen(true);
          }}
        >
          Cartes d’embarquement
        </button>
      ) : null}
      <button
        type="button"
        className={menuItem}
        disabled={clientSpace.busy}
        onClick={() => {
          setMore(false);
          void clientSpace.start();
        }}
      >
        Ouvrir l’espace client
      </button>
      {shareUrl ? (
        <a href={shareUrl} target="_blank" rel="noreferrer" className={menuItem}>
          Voir comme le client
        </a>
      ) : null}
      <button
        type="button"
        className={menuItem}
        disabled={busy !== "idle"}
        onClick={() => {
          setMore(false);
          setCoverNotice(null);
          setCoverOpen(true);
        }}
      >
        Couverture
      </button>
      <DuplicateBookingButton bookingId={booking.id} label={dossierLabel} plain />
      {booking.archived_at ? null : (
        <div className="mt-1 border-t border-[var(--border)] pt-1">
          {stayAction === "cacher" && !unsaved && updatesPending ? (
            <button
              type="button"
              className={menuItem}
              disabled={busy !== "idle"}
              onClick={() => {
                setMore(false);
                setConfirm("publish");
              }}
            >
              Mettre à jour le carnet
            </button>
          ) : null}
          {stayAction === "cacher" ? (
            <button
              type="button"
              className={menuItem}
              disabled={busy !== "idle"}
              onClick={() => {
                setMore(false);
                setConfirm("unpublish");
              }}
            >
              Cacher au client
            </button>
          ) : null}
          {booking.status === "cancelled" ? null : (
            <button
              type="button"
              className={menuItem}
              disabled={busy !== "idle"}
              onClick={() => {
                setMore(false);
                setConfirm("cancel");
              }}
            >
              Annuler le dossier
            </button>
          )}
          <ArchiveBookingButton bookingId={booking.id} label={dossierLabel} plain redirectTo={null} />
        </div>
      )}
    </div>
  );
  const dossierMenu = (open: boolean) => (
    <div className="relative" data-dossier-menu>
      {moreButton}
      {open ? <div className="absolute right-0 z-30 mt-2">{moreMenu}</div> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {deferredLedger ? (
        <Suspense fallback={null}>
          <DeferredLedger promise={deferredLedger} onReady={onDeferredLedger} />
        </Suspense>
      ) : null}
      {deferredItems ? (
        <Suspense fallback={null}>
          <DeferredHotels promise={deferredItems} onReady={onDeferredItems} />
        </Suspense>
      ) : null}
      {panels ? (
        <>
          <Suspense fallback={null}>
            <DeferredSlice promise={panels.emails} onReady={onMails} />
          </Suspense>
          <Suspense fallback={null}>
            <DeferredSlice promise={panels.activity} onReady={onActivity} />
          </Suspense>
          <Suspense fallback={null}>
            <DeferredSlice promise={panels.whatsapp} onReady={onThread} />
          </Suspense>
          <Suspense fallback={null}>
            <DeferredSlice promise={panels.esta} onReady={onEsta} />
          </Suspense>
          <Suspense fallback={null}>
            <DeferredSlice promise={panels.pliant} onReady={onHotels} />
          </Suspense>
          <Suspense fallback={null}>
            <DeferredSlice promise={panels.money} onReady={onMoney} />
          </Suspense>
        </>
      ) : null}
      {compact ? (
        <div className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b border-[var(--border)] bg-[rgba(250,249,246,0.94)] px-4 py-2 shadow-[0_1px_8px_rgba(11,25,44,0.06)] backdrop-blur-xl sm:px-6 lg:left-72 lg:top-20 lg:px-8">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
            <div className="min-w-0 flex-1">
              <input
                value={titleEdit.value}
                onChange={(event) => setTitleDraft(event.target.value)}
                placeholder="Nom du séjour"
                aria-label="Nom du séjour"
                autoComplete="off"
                className={`${stayNameClass} truncate text-base`}
              />
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--admin-navy)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--admin-gold)]" aria-hidden />
                  {staffStayLabel(booking)}
                </span>
                {ownership ? (
                  <ChargeControl
                    compact
                    bookingId={booking.id}
                    owner={ownership.owner}
                    createdBy={ownership.createdBy}
                    mine={ownership.mine === true}
                    canTake={ownership.canTake === true}
                    meName={ownership.meName || ""}
                    onHistory={() => setTab("historique")}
                  />
                ) : null}
                {unsaved ? <span>· Modifications non enregistrées</span> : null}
                {stepError ? <span className="font-semibold text-[var(--admin-red)]">· {stepError}</span> : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <HiddenCardsCounter count={hiddenCards.length} onJump={jumpToHiddenCard} />
              {travelers.length === 0 ? (
                <button
                  type="button"
                  disabled={partyBusy}
                  onClick={() => void addHolder()}
                  className="admin-tap rounded-full border border-[var(--admin-navy)] px-3 py-2 text-xs font-semibold text-[var(--admin-navy)] disabled:opacity-50 max-lg:basis-full lg:shrink-0"
                >
                  Ajouter le titulaire
                </button>
              ) : null}
              {primaryAction}
              {dossierMenu(more)}
            </div>
          </div>
        </div>
      ) : null}
      <header className="relative space-y-4">
        <div ref={sentinelRef} aria-hidden className="absolute left-0 top-0 h-px w-px" />
        <div className="relative z-20 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-start lg:gap-3">
            <Link href="/admin/reservations" className="admin-tap inline-flex shrink-0 items-center text-sm font-semibold text-[var(--admin-navy)] lg:pt-5">
              ← Dossiers
            </Link>
            <div className="min-w-0 flex-1">
              <label className="block min-w-0">
                <span className="px-1.5 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-gold-dark)]">
                  Nom du séjour
                </span>
                <input
                  id="booking-title"
                  name="title"
                  form="booking-meta"
                  value={titleEdit.value}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  placeholder="Séjour à Avoriaz"
                  autoComplete="off"
                  className={`${stayNameClass} text-2xl sm:text-3xl`}
                />
              </label>
              <p className="px-1.5 text-sm text-muted">
                Référence {booking.reference}
                {jMinusLabel(facts.start) ? ` · ${jMinusLabel(facts.start)}` : ""}
              </p>
              {(booking.notes_internal || "").includes(TITLE_REVIEW_MARK) || notesInternal.includes(TITLE_REVIEW_MARK) ? (
                <p className="mt-1 px-1.5">
                  <span className="rounded-full bg-[#C5A880]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0B192C]">
                    Titre à vérifier
                  </span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
            {travelers.length === 0 ? (
              <button
                type="button"
                disabled={partyBusy}
                onClick={() => void addHolder()}
                className="admin-tap rounded-full border border-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
              >
                Ajouter le titulaire
              </button>
            ) : null}
            {primaryAction}
            {dossierMenu(more && !compact)}
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>{facts.dates || "Dates à confirmer"}</span>
          {facts.placeLine ? <span>· {facts.placeLine}</span> : null}
          {facts.draft ? <span className="font-semibold text-[var(--admin-gold-dark)]">· pas encore enregistré</span> : null}
          <span>· {travelerLabel}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {stateChip}
          <button
            type="button"
            onClick={openRemises}
            className="inline-flex items-center rounded-full bg-[#f8f3eb] px-3 py-1 text-sm font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)]"
          >
            {panelLines.length
              ? `${panelLines.length} remise${panelLines.length > 1 ? "s" : ""}`
              : "Remises"}
          </button>
          {customer?.hide_client_prices ? (
            <span className="inline-flex items-center rounded-full bg-[#f8f3eb] px-3 py-1 text-sm font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)]">
              Prix masqués au client
            </span>
          ) : null}
          {twinNames.length ? (
            <span className="inline-flex items-center rounded-full bg-[#f8f3eb] px-3 py-1 text-sm font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)]">
              Aussi visible par {twinNames.join(", ")}
            </span>
          ) : null}
          <HiddenCardsCounter count={hiddenCards.length} onJump={jumpToHiddenCard} />
          {ownership ? (
            <ChargeControl
              bookingId={booking.id}
              owner={ownership.owner}
              createdBy={ownership.createdBy}
              mine={ownership.mine === true}
              canTake={ownership.canTake === true}
              meName={ownership.meName || ""}
              onHistory={() => setTab("historique")}
            />
          ) : null}
          {checkinBadge && !checkinBadge.alert ? (
            <button
              type="button"
              onClick={() => setTab("todo")}
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                checkinBadge.done ? "bg-white text-[#0B192C] ring-1 ring-[#d9d1c3]" : "bg-[#0B192C] text-white"
              }`}
            >
              {checkinBadge.label}
            </button>
          ) : null}
        </div>
        {blockers.length ? (
          <ul className="flex flex-wrap gap-2">
            {blockers.map((chip) => (
              <li key={chip.id}>
                <button
                  type="button"
                  onClick={() => setTab(chip.tab || "todo")}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]"
                >
                  {chip.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex min-w-0 items-end gap-4 overflow-x-auto border-b border-[var(--border)] lg:gap-6" role="tablist" aria-label="Parties du dossier">
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
                className={`-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 pb-3 font-display text-sm font-semibold lg:min-h-0 ${
                  selected
                    ? "border-[var(--admin-gold)] text-[var(--admin-navy)]"
                    : "border-transparent text-muted hover:text-[var(--admin-navy)]"
                }`}
                title={BOOKING_TAB_HELP[id]}
              >
                {BOOKING_TAB_LABELS[id]}
                {id === "todo" && blockers.length > 0 ? (
                  <>
                    {" "}
                    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--admin-gold)] px-1 text-[10px] font-bold text-[var(--admin-navy)]">
                      {blockers.length}
                    </span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
        <BusyBar
          active={busy !== "idle"}
          label={busy === "publish" ? "Mise à jour du carnet…" : busy === "invoice" ? "Facturation…" : "Enregistrement…"}
        />
        {unsaved || stepError ? (
          <p role="status" className="text-sm font-semibold text-[var(--admin-gold-dark)]">
            {unsaved ? "Modifications non enregistrées · ⌘S ou Ctrl+S pour enregistrer" : null}
            {stepError ? (
              <span className={unsaved ? "mt-1 block text-[var(--admin-red)]" : "text-[var(--admin-red)]"}>{stepError}</span>
            ) : null}
          </p>
        ) : null}
        {booking.archived_at ? (
          <p className="rounded-2xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
            Dossier archivé. Le client ne le voit plus. Réactivez-le pour le remettre dans la liste et au grand livre.
          </p>
        ) : null}
        <ReviewDoubtList
          rows={reviewRows}
          busy={verifyBusy}
          onValidateAll={() => {
            void verifyCards(null).then((ok) => {
              if (!ok) setFlash("La vérification n’a pas été enregistrée.");
            });
          }}
        />
        {flash ? <p className="text-sm text-[var(--admin-navy)]">{flash}</p> : null}
        <IssuesList issues={issues} />
      </header>
      {clientSpace.dialog}
      {passesOpen ? (
        <BoardingPassSend
          bookingId={booking.id}
          clientName={shownPersonName(customer) || shownPersonName(holderName)}
          phone={customer?.phone || null}
          optInAt={customer?.whatsapp_opt_in_at}
          optOutAt={customer?.whatsapp_opt_out_at}
          documents={documents}
          items={items}
          travelers={travelers}
          open
          onClose={() => setPassesOpen(false)}
        />
      ) : null}
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
        onUsePlacePhoto={booking.cover_image_path ? clearCover : undefined}
      />

      {confirm ? (
        <section className="admin-af-card space-y-3 rounded-3xl border border-[var(--admin-gold)]/50 p-5">
          <p className="font-display text-lg font-bold text-[var(--admin-navy)]">
            {confirm === "publish" ? "Montrer au client" : confirm === "cancel" ? "Annuler le dossier" : "Cacher au client"}
          </p>
          {confirm === "cancel" ? (
            <p className="text-sm text-muted">
              Le séjour passe en Annulé. Le client ne le voit plus. Rouvrir le remet en Non visible.
            </p>
          ) : confirm === "publish" ? (
            <>
              <p className="text-sm text-muted">Le client verra ces éléments.</p>
              <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
                {revealItems.map((item) => (
                  <li key={item.id}>{reviewStepLabel(item)}</li>
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
          {confirm === "publish" && publishHold ? (
            <p className="text-sm font-semibold text-accent">{publishHold}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== "idle" || (confirm === "publish" && !publishReady)}
              title={confirm === "publish" && publishHold ? publishHold : undefined}
              onClick={() => {
                const mode = confirm;
                setConfirm(null);
                if (mode === "cancel") {
                  void setFace("cancelled");
                  return;
                }
                void setPublished(mode === "publish");
              }}
              className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {confirm === "publish" ? "Confirmer" : confirm === "cancel" ? "Annuler le dossier" : "Cacher"}
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
          <section className={`order-1 admin-af-card space-y-4 rounded-3xl p-5 ${tab === "client" ? "" : "hidden"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CoverMark>Le client</CoverMark>
              <Link
                href={`/admin/clients/${booking.customer_id}`}
                className="shrink-0 text-sm font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
              >
                Ouvrir la fiche
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Client</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 text-sm font-semibold text-[var(--admin-navy)]">
                    {customer ? customerTravelerPickLabel(customer) : "Aucun client"}
                  </p>
                  <ChangeBookingClient bookingId={booking.id} onChanged={() => router.refresh()} />
                </div>
              </div>
              <p className="self-end pb-3 text-sm text-muted">
                {customer && payerPick && customer.id !== payerPick.id
                  ? `Réglé par ${shownPersonName(payerPick)}`
                  : "Règle lui-même ce séjour"}
                {" · "}
                <button
                  type="button"
                  onClick={() => setTab("argent")}
                  className="font-semibold text-[var(--admin-navy)] underline underline-offset-2"
                >
                  Argent
                </button>
              </p>
            </div>
            {customer ? (
              <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-[#faf9f6] px-4 py-3 text-sm text-[var(--admin-navy)] sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">E-mail</dt>
                  <dd className="truncate">{customer.email || "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">Téléphone</dt>
                  <dd className="truncate">
                    {customer.phone || "—"}
                    {customer.whatsapp_opt_out_at
                      ? " · WhatsApp refusé"
                      : customer.whatsapp_opt_in_at
                        ? " · WhatsApp activé"
                        : ""}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">Foyer</dt>
                  <dd className="truncate">
                    {companions.length
                      ? `${companions.length} compagnon${companions.length > 1 ? "s" : ""}`
                      : "Aucun compagnon"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">Sociétés</dt>
                  <dd className="truncate">
                    {ficheBillingCompanies.length
                      ? ficheBillingCompanies.map((company) => company.company_name).filter(Boolean).join(", ")
                      : "Particulier"}
                  </dd>
                </div>
              </dl>
            ) : null}
            {customer ? (
              <p className="text-xs text-muted">Identité, coordonnées, passeports et sociétés se modifient sur la fiche client.</p>
            ) : null}
            {customer && ficheBillingCompanies.length > 1 ? (
              <Mb3mFicheAction
                customerId={customer.id}
                blocker={mb3mFiche.blocker}
                sent={mb3mFiche.sent}
                companies={ficheBillingCompanies}
                sentCompanyIds={mb3mFiche.sentCompanyIds}
              />
            ) : null}
            <details className="group rounded-2xl bg-[#faf9f6]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
                    Notes
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted">
                    {[notesInternal, notesClient].map((note) => note.trim()).filter(Boolean)[0]?.replace(/\s+/g, " ") ||
                      "Aucune note"}
                  </span>
                </span>
                <Icon name="expand_more" className="h-4 w-4 shrink-0 text-[var(--admin-navy)] transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-3 border-t border-[var(--border)] px-4 py-3">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--admin-navy)]">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    Pour l’agence
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
                      Invisible au client
                    </span>
                  </span>
                  <textarea
                    name="notes_internal"
                    value={notesInternal}
                    onChange={(event) => setNotesInternal(event.target.value)}
                    rows={2}
                    placeholder="Mémo pour l’agence"
                    className={`${coverField} min-h-16 font-normal`}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--admin-navy)]">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    Pour le client
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
                      Visible sur son séjour
                    </span>
                  </span>
                  <span className="text-[11px] font-normal leading-snug text-amber-800">
                    Ce texte est public : il apparaît dans l’espace client et sur le lien du séjour. N’y mettez pas de
                    devis, de prix ni de note d’import.
                  </span>
                  <textarea
                    name="notes_client"
                    value={notesClient}
                    onChange={(event) => setNotesClient(event.target.value)}
                    rows={2}
                    placeholder="Un mot que le client lira"
                    className={`${coverField} min-h-16 font-normal`}
                  />
                </label>
              </div>
            </details>
          </section>

          <section className={`order-1 admin-af-card space-y-3 rounded-3xl p-5 ${tab === "voyage" ? "" : "hidden"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CoverMark>Lieu et dates</CoverMark>
              {facts.nights ? (
                <span className="rounded-full bg-[var(--admin-navy)] px-3 py-1 font-display text-sm font-bold text-[var(--admin-gold)]">
                  {facts.nights} nuit{facts.nights > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            {facts.segments.length || facts.removed.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {facts.segments.map((segment) => (
                  <li key={segment.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm text-[var(--admin-navy)]">
                    <span className="min-w-0 break-words font-semibold">
                      {segment.place}
                      {segment.pending ? (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-gold-dark)]">
                          Pas encore enregistré
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-muted">{segment.when}</span>
                  </li>
                ))}
                {facts.removed.map((segment) => (
                  <li key={`retire-${segment.id}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm text-muted">
                    <span className="min-w-0 break-words font-semibold line-through">{segment.place}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--admin-gold-dark)]">
                      Retiré · pas encore enregistré
                    </span>
                    <span className="shrink-0">{segment.when}</span>
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

          <section className={`order-2 admin-af-card space-y-5 rounded-3xl p-5 ${tab === "argent" ? "" : "hidden"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CoverMark>Qui règle et comment</CoverMark>
              <p className="shrink-0 text-xs text-muted">Enregistrer applique ces choix.</p>
            </div>
            <CustomerPickField
              name="billing_customer_id"
              selected={billingCustomer || account}
              title="Qui paie"
              label="Qui paie"
              formatLabel={customerBillingPickLabel}
              onPick={setPayerPick}
              controlClass={coverField}
            />
            {customer && payerPick && customer.id !== payerPick.id ? (
              <p className="-mt-3 text-xs text-muted">
                Le compte de {shownPersonName(payerPick)} porte les débits ; {shownPersonName(customer)} voyage.
              </p>
            ) : null}
            <input type="hidden" name="payer_kind" value={payerKind} />
            <input
              type="hidden"
              name="billing_company_id"
              value={payerKind === "company" ? payerCompanyId : ""}
            />
            <Segmented<"company" | "personal">
              label="Part de l’encours"
              value={payerKind}
              options={[
                {
                  value: "company",
                  title: "Société",
                  hint: payerCompanies.length
                    ? "Ce voyage entre dans la part société de l’encours. Le client règle cette part depuis son compte."
                    : "Aucune société sur la fiche.",
                  disabled: !payerCompanies.length,
                },
                {
                  value: "personal",
                  title: "Particulier",
                  hint: "Ce voyage entre dans la part particulier de l’encours.",
                },
              ]}
              onChange={(kind) => {
                setPayerKind(kind);
                if (kind === "company") setPayerCompanyId((current) => current || defaultCompany?.id || "");
              }}
            />
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
              <p className="text-sm text-[var(--admin-navy)]">
                Société :{" "}
                {fundingCompanyOptionLabel(
                  payerCompanies[0].company_name,
                  payerCompanies[0].funding,
                  billingCompanyTabLabel(payerCompanies[0].company_name, 0, 1)
                )}
              </p>
            ) : null}
            {payerKind === "company" && payerCompanies.length > 1 ? (
              <label className="flex max-w-md flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
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
            <input
              type="checkbox"
              name="client_settles_stay"
              checked={clientSettles}
              onChange={(event) => setClientSettles(event.target.checked)}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />
            <Segmented<"agency" | "client">
              label="Encaissement"
              value={clientSettles ? "client" : "agency"}
              options={[
                { value: "agency", title: "L’agence encaisse", hint: "Le montant du séjour entre dans le compte du client." },
                {
                  value: "client",
                  title: "Le client règle l’hôtel",
                  hint: "Sur sa carte. Le prix reste au carnet ; les cartes du séjour ne vont pas dans les transactions.",
                },
              ]}
              onChange={(value) => setClientSettles(value === "client")}
            />
            {clientSettles ? null : (
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
                  Ajouter le montant global au compte du client
                  <span className="mt-0.5 block text-xs font-normal text-muted">
                    Décochez pour montrer le prix sans le compter.
                    {countedCards.length
                      ? ` ${countedCards.length > 1 ? `${countedCards.length} cartes sont` : "Une carte est"} déjà comptée${countedCards.length > 1 ? "s" : ""} : laissez décoché pour ne pas compter deux fois.`
                      : ""}
                  </span>
                </span>
              </label>
            )}
            <input
              type="hidden"
              name="fees_follow_stay"
              value={payerKind === "personal" && !payerCompanies.length ? "on" : feesFollowStay ? "on" : "off"}
            />
            <Segmented<"follow" | "apart">
              label="Frais d’agence, billeterie et dépenses"
              value={payerKind === "personal" && !payerCompanies.length ? "follow" : feesFollowStay ? "follow" : "apart"}
              options={[
                {
                  value: "follow",
                  title: "Avec le séjour",
                  hint:
                    payerKind === "company"
                      ? "Ils suivent la facture société du séjour."
                      : "Ils suivent le séjour, sur la part particulier.",
                },
                payerKind === "company"
                  ? {
                      value: "apart",
                      title: "À part, sans facture société",
                      hint: "Le client les règle à part, sur sa part particulier.",
                    }
                  : {
                      value: "apart",
                      title: `Portés par ${defaultCompany?.company_name?.trim() || "la société du compte"}`,
                      hint: "Le séjour reste au particulier ; les frais vont sur la facture société.",
                      disabled: !payerCompanies.length,
                    },
              ]}
              onChange={(value) => setFeesFollowStay(value === "follow")}
            />
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
          </section>


        </div>
      </form>
      {tab === "voyage" ? (
        <>
      <div className="order-5 space-y-3">
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
      <details className="group rounded-2xl border border-dashed border-[var(--border)] bg-white/70">
        <summary className="admin-tap flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--admin-navy)] [&::-webkit-details-marker]:hidden">
          <span>Joindre une pièce sans la lire</span>
          <Icon name="expand_more" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <form onSubmit={addDoc} className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-4 py-3">
          <p className="basis-full text-xs text-muted">Le fichier arrive dans Pièces, sans créer d’étape.</p>
          <select name="kind" defaultValue="other" disabled={docBusy} aria-label="Type de pièce" className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--admin-navy)]">
            <option value="other">Confirmation</option>
            <option value="carte d'embarquement">Carte d’embarquement</option>
          </select>
          <input name="file" type="file" accept=".pdf,.pkpass,application/pdf,application/vnd.apple.pkpass,image/*,.eml,.docx,.xlsx,.txt,.ics" required disabled={docBusy} aria-label="PDF, photo ou passe Apple Wallet" className="text-sm" />
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
      </details>
      </div>
      <div className="order-2">
      <BookingItemsPanel
        bookingId={booking.id}
        customerId={booking.customer_id}
        items={items}
        documents={documents}
        household={householdMembers(account || holderName, companions)}
        currency={booking.currency}
        hotelRequests={hotelRequests}
        hotelSignatory={hotelSignatory}
        today={todayIsoDate()}
        travelers={travelers}
        identityDocs={identityDocs}
        holder={holderProfile}
        arrivals={arrivals}
        leStays={leStays}
        clientSettlesStay={clientSettles}
        stayPriceMode={stayPriceMode}
        forfaitAmount={forfaitAmount}
        onStayPrice={(mode, amount) => {
          setStayPriceMode(mode);
          setForfaitAmount(mode === "forfait" ? amount : null);
        }}
        stayVisible={booking.visible_to_client}
        attachedEmails={attachedEmails}
        hotelMessages={hotelMessages}
        hotelThreadMessages={hotelThreadMessages}
        openHotelItemId={openHotelItemId}
        openRelanceId={openRelanceId}
        openReplyId={openReplyId}
        reference={booking.reference}
        checkins={checkins}
        tripStart={startDraft || booking.start_date}
        tripEnd={endDraft || booking.end_date}
        onLiveItems={onLiveItems}
        onStepError={noteStepError}
        onBindDraftSave={(save) => {
          saveOpenCard.current = save;
        }}
        onStepsPending={setStepsPending}
        clearedReviewIds={clearedReview}
        onVerify={(ids) => verifyCards(ids)}
        highlightStepId={highlightStep?.id ?? null}
        highlightToken={highlightStep?.token ?? 0}
        onHighlightDone={() => setHighlightStep(null)}
      />
      </div>
      <button
        type="button"
        onClick={() => setTab("argent")}
        className="order-3 admin-af-card flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-3xl px-5 py-4 text-left"
      >
        <span className="font-display text-lg font-bold text-[var(--admin-navy)]">Argent</span>
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
        attachments={boardingAttachments.others}
        leading={
          boardingGroupsEmpty(boardingAttachments.groups) ? null : (
            <BoardingPassGroups
              groups={boardingAttachments.groups}
              onRemove={(file) => removeDocument(file.id)}
              removeQuestion={(file) => `${file.label} quitte le dossier et son fichier est supprimé.`}
              aside={(file) => (
                <MovePieceButton
                  pieceId={file.id}
                  label={file.label}
                  customerId={booking.customer_id}
                  sourceBookingId={booking.id}
                />
              )}
            />
          )
        }
        onRemoveAttachment={(file) => removeDocument(file.id)}
        removeQuestion={(file) => `${file.label} quitte le dossier et son fichier est supprimé.`}
        aside={(file) => (
          <MovePieceButton
            pieceId={file.id}
            label={file.label}
            customerId={booking.customer_id}
            sourceBookingId={booking.id}
          />
        )}
      />
      {mailGroups.sources.length ? (
        <ul className="admin-af-card space-y-1 rounded-3xl p-5 text-sm text-[var(--admin-navy)]">
          <li className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">Courriers</li>
          {mailGroups.sources.map((mail) => (
            <li key={mail.id} className="truncate">{mail.label}</li>
          ))}
        </ul>
      ) : null}
      <BookingRestaurants bookingId={booking.id} />
      </div>
        </>
      ) : null}

      {tab === "client" ? (
        <>
      <section className="order-3 admin-af-card space-y-4 rounded-3xl p-5">
        <CoverMark>Sur ce séjour</CoverMark>
        {!travelers.length ? (
          <button
            type="button"
            disabled={partyBusy}
            onClick={() => void addHolder()}
            className="admin-tap rounded-full bg-[var(--admin-peach)] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
          >
            {partyBusy ? "Ajout…" : `Ajouter ${shownPersonName(holderName)} (titulaire)`}
          </button>
        ) : (
          <TripPassportPicker
            variant="admin"
            embedded
            mosaic
            customerId={booking.customer_id}
            bookingId={booking.id}
            travelers={travelers}
            documents={identityDocs}
            holder={holderProfile}
            companions={companions}
            badges={passportVaultRows(travelers, identityDocs, todayIsoDate(), holderProfile, booking, companions)}
            scans={passportPreviewsForStay(travelers, identityDocs, holderName, booking.reference)}
            onRemove={(id) => removeTraveler(id)}
          />
        )}
        <SpouseTravelWhatsapp bookingId={booking.id} travelers={travelers} companions={companions} />
        {passportGap.length ? (
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
                    {shownPersonName(person) || "Sans nom"}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Foyer">
              {travelers.some((row) => row.is_account_holder) ? null : (
                <option value="holder">
                  {shownPersonName(holderName)} (titulaire)
                </option>
              )}
              {companions
                .filter((companion) => !travelers.some((row) => row.companion_id === companion.id))
                .map((companion) => (
                  <option key={companion.id} value={`companion:${companion.id}`}>
                    {shownPersonName(companion)}
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
        <div className={estaLines.length && ukEtaLines.length ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
          <EstaOnBooking bookingId={booking.id} rows={estaLines} />
          <UkEtaOnBooking bookingId={booking.id} rows={ukEtaLines} />
        </div>
      </section>

      <div className="order-4">
        <WhatsappThread
          messages={whatsappMessages}
          requests={whatsappRequests}
          bookings={whatsappBookings}
          phone={customer?.phone || null}
          customerId={customer?.id || null}
          customerName={customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") : null}
          customerFirstName={customer?.first_name || null}
          bookingId={booking.id}
          templates={whatsappTemplates}
          previewBlocked={whatsappPreviewBlocked}
        />
      </div>
      {shareUrl ? (
        <div className="order-5">
        <TripSharePanel
          bookingId={booking.id}
          shareUrl={shareUrl}
          companions={shareCompanions}
          sendUrl={`/api/admin/bookings/${booking.id}/partage`}
        />
        </div>
      ) : null}
      <div className="order-6">
        <CustomerLoginLog logins={customerLogins} activity={customerActivity} />
      </div>
        </>
      ) : null}

      {tab === "argent" ? (
        <>
          {(shownLedger?.sepaHolds || []).filter((hold) => !hold.bookingId || hold.bookingId === booking.id).length ? (
            <div className="order-1">
              <SepaInFlight
                holds={(shownLedger?.sepaHolds || []).filter((hold) => !hold.bookingId || hold.bookingId === booking.id)}
                failures={shownLedger?.sepaFailures || []}
                tone="admin"
              />
            </div>
          ) : null}
          <div className="order-1">
            <ReglementSummary
              amount={stayAmount}
              currency={stayCurrency(booking.currency)}
              showMargins={showMargins}
              commissionCaption={
                showMargins
                  ? `Commission d’agence ${formatAgencyFeePercent(previewFeeRate)} · ${agencyFeeSourceLabel(previewFeeSource)}`
                  : null
              }
              ledgerCaption={staffLedgerCaption({
                ...booking,
                include_in_ledger: includeInLedger,
                client_settles_stay: clientSettles,
              })}
              payerCaption={payerCaption}
              totals={accounting?.totals || null}
              state={tripState}
              invoiceNumber={invoiceNumber}
              checks={checklist}
            />
          </div>

          <section className="order-3 admin-af-card space-y-4 rounded-3xl p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1">
                <CoverMark>Prix et lignes vendues</CoverMark>
                <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
                  {formatMoney(stayAmount, stayCurrency(booking.currency))}
                </p>
                <p className="text-sm text-muted">
                  {clientSettles
                    ? "Les cartes se règlent hors agence. Seuls les frais et les dépenses comptent au grand livre."
                    : !includeInLedger
                      ? "Le montant global n’est pas ajouté au compte du client ; seules les cartes cochées comptent."
                      : countedCards.length
                        ? `${countedCards.length} ${countedCards.length > 1 ? "cartes comptent" : "carte compte"} au grand livre, avec les frais et les dépenses.`
                        : "Prix des cartes, des frais d’agence, des frais de billeterie et des dépenses."}
                </p>
              </div>
              <label className="flex max-w-[11rem] flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Devise
                <select
                  name="currency"
                  form="booking-meta"
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
            </div>
            <BookingDiscountPanel
              bookingId={booking.id}
              currency={booking.currency}
              gross={grossStay}
              net={accounting?.totals.cost ?? null}
              margin={accounting?.totals.margin ?? null}
              lines={panelLines}
              tableReady={discounts != null}
              onLines={setDiscountOverride}
              onArgentRefresh={refreshArgent}
            />
            <AgencyFeeRateField
              label="Commission d’agence"
              value={feeChoice}
              onChange={setFeeChoice}
              options={[
                {
                  value: "compte",
                  title: "Compte",
                  hint: `Suit le compte : ${formatAgencyFeePercent(inheritedFee.inheritedRate)}${
                    inheritedFee.inheritedSource === "defaut" ? " par défaut" : ""
                  }.`,
                },
                {
                  value: "0.1000",
                  title: "10 %",
                  hint: "Ce dossier garde 10 %, même si le compte change.",
                },
                {
                  value: "0.0750",
                  title: "7,5 %",
                  hint: "Ce dossier garde 7,5 %, même si le compte change.",
                },
                {
                  value: "0.0500",
                  title: "5 %",
                  hint: "Ce dossier garde 5 %, même si le compte change.",
                },
              ]}
            />
            <p className="text-sm text-[var(--admin-navy)]">
              Taux retenu : {formatAgencyFeePercent(previewFeeRate)} · {agencyFeeSourceLabel(previewFeeSource)}.
              {agencyCommission
                ? " La ligne est dans les dépenses."
                : " Cochez la commission pour l’ajouter aux dépenses."}
            </p>
            <BookingExpensesPanel
              bookingId={booking.id}
              items={pricedItems}
              visible={booking.visible_to_client}
              currency={booking.currency}
              agencyCommission={agencyCommission}
              agencyFeeRate={previewFeeRate}
              costs={[...(accounting?.lines ?? []).flatMap((line) => line.costs), ...(accounting?.unsold ?? [])]}
              onExpenseWrite={onExpenseWrite}
              onCommissionChange={setCommissionOverride}
              onArgentRefresh={refreshArgent}
              presets={expensePresets}
            />
          </section>

          <div className="order-4">
            {accounting ? (
              <TripCostsBlock
                bookingId={booking.id}
                booking={{
                  id: booking.id,
                  reference: booking.reference,
                  title: booking.title || booking.destination || "",
                  items: pricedItems
                    .filter((item) => isActiveItem(item))
                    .map((item) => ({
                      id: item.id,
                      label: item.kind === "hotel" ? hotelDisplayName(item) : item.title,
                      kind: item.kind,
                      amount: item.amount == null ? null : Number(item.amount),
                    })),
                }}
                view={accounting}
                cards={pliantRecap}
                revolutLinked={revolutExpenses}
                busy={busy !== "idle"}
                showMargins={showMargins}
                onUpdated={refreshArgent}
                proposals={proposals}
              />
            ) : (
              <section className="admin-af-card space-y-2 rounded-3xl p-5">
                <CoverMark>Coûts du voyage</CoverMark>
                <p className="text-sm text-muted">La comptabilité du voyage n’est pas lisible pour le moment.</p>
              </section>
            )}
          </div>

          <div className="order-5">
            <InvoiceBlock
              bookingId={booking.id}
              busy={busy !== "idle"}
              invoicing={busy === "invoice"}
              unsaved={unsaved}
              blocker={mb3m.blocker}
              notice={mb3m.notice}
              view={{
                number: invoiceNumber,
                printed: Boolean(accounting?.invoice.printed),
                marginStale: Boolean(accounting?.invoice.marginStale),
                printedTotal: accounting?.invoice.printedTotal ?? null,
                saleTotal: accounting?.totals.sale ?? null,
                preparation: mb3m.preparation,
                amadeus: mb3m.amadeus,
              }}
              creditNoteAllowed={mb3m.creditNoteAllowed === true}
              cards={pricedItems
                .filter(
                  (item) =>
                    isActiveItem(item) &&
                    item.kind === "flight" &&
                    !item.id.startsWith("draft:")
                )
                .map((item) => ({
                  id: item.id,
                  label: item.title || "Vol",
                  amount: item.amount == null ? null : Number(item.amount),
                  currency: booking.currency || "EUR",
                  category: readMb3mActivityOverride(item.details) === "land" ? ("land" as const) : ("auto" as const),
                }))}
              note={invoiceNote}
              onBusy={(active) => setBusy(active ? "invoice" : "idle")}
              onNote={setInvoiceNote}
              onInvoiced={(number, note) => {
                setInvoicePiece({ number });
                setInvoiceNote(note);
                router.refresh();
              }}
            />
          </div>

          <details className="order-6 admin-af-card group rounded-3xl">
            <summary className="admin-tap flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="space-y-0.5">
                <span className="block font-display text-lg font-bold text-[var(--admin-navy)]">Compte du client</span>
                <span className="block text-sm text-muted">Même lecture que l’espace du client.</span>
              </span>
              <span className="text-sm font-semibold text-[var(--admin-gold-dark)]">
                <span className="group-open:hidden">Ouvrir</span>
                <span className="hidden group-open:inline">Replier</span>
              </span>
            </summary>
            <div className="space-y-3 border-t border-[var(--border)] px-5 py-4">
              {statementCustomer ? (
                <Link
                  href={`/admin/transactions/client/${statementCustomer.id}`}
                  className="text-sm font-semibold text-[var(--admin-navy)] underline underline-offset-4"
                >
                  Toutes les transactions du client
                </Link>
              ) : null}
              {shownLedger ? (
                <ClientTransactionsPanel
                  view={shownLedger}
                  statementEndpoint={
                    statementCustomer ? `/api/admin/clients/${statementCustomer.id}/releve` : null
                  }
                  statementAudience="staff"
                />
              ) : (
                <p className="text-sm text-muted">Le grand livre n’est pas lisible pour le moment.</p>
              )}
            </div>
          </details>

          <div className="order-7 space-y-4">
            <CoverMark>Carte Pliant</CoverMark>
            {pliantBalance}
            <BookingCards
              bookingId={booking.id}
              cards={bookingCards}
              recap={pliantRecap}
              firstName={stayGuest.firstName}
              lastName={stayGuest.lastName}
            />
          </div>
        </>
      ) : null}

      {tab === "todo" ? (
        <div className="space-y-6">
          {importTasks.length ? (
            <section className="admin-af-card space-y-2 rounded-3xl p-5">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">À faire, venus du mail</h2>
              <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
                {importTasks.map((task) => (
                  <li key={task.id}>{task.title}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {passportGap.length ? (
            <section className="admin-af-card space-y-2 rounded-3xl p-5">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Passeports à joindre</h2>
              <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
                {passportGap.map((traveler) => (
                  <li key={traveler.id}>
                    {shownPersonName(traveler)}
                  </li>
                ))}
              </ul>
              <Link href={`/admin/clients/${booking.customer_id}`} className="inline-flex text-sm font-semibold underline">
                Ouvrir la fiche client
              </Link>
            </section>
          ) : null}
          {passportExpiry.length ? (
            <section className="admin-af-card space-y-2 rounded-3xl p-5">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Expire avant le retour</h2>
              <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
                {passportExpiry.map((row) => {
                  const [year, month, day] = row.expiresOn.split("-");
                  return (
                    <li key={row.traveler.id}>
                      {row.givenName} — {day}/{month}/{year}
                    </li>
                  );
                })}
              </ul>
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
                settled={settledAuthorizationCountries({
                  travelerIds: travelers.map((traveler) => traveler.id),
                  estaTones: estaLines,
                  ukEtaTones: ukEtaLines,
                })}
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
          {leLinks.length ? (
            <section className="admin-af-card space-y-3 rounded-3xl p-5">
              <h2 className="font-display text-lg font-bold text-[#0B192C]">Little Emperors</h2>
              <ul className="space-y-2">
                {leLinks.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#0B192C]">
                    <span className="font-semibold">{row.hotel_name || "Hôtel"} · {row.confirmation_number}</span>
                    <MoveToDossier
                      bookingId={booking.id}
                      kind="reservation"
                      reference={row.confirmation_number}
                      titre={row.hotel_name || row.confirmation_number}
                      buttonClassName="admin-tap shrink-0 rounded-full border border-[var(--admin-navy)] px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]"
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {leOpen && littleEmperors ? (
            <LittleEmperorsCancel
              id={littleEmperors.id}
              hotelName={littleEmperors.hotel_name}
              isCancellable={littleEmperors.is_cancellable}
              deadline={littleEmperors.cancellation_deadline}
              policies={littleEmperors.cancellation_policies || []}
              state={littleEmperors.state}
              bookedAt={littleEmperors.created_at}
            />
          ) : null}
          <OnlineCheckinChecklist bookingId={booking.id} lines={checkinLines} />
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

      {tab === "historique" ? (
        <>
          <ResponsableForm bookingId={booking.id} />
          <AgencyHistoryPanel entity="dossier" entityId={booking.id} />
        </>
      ) : null}
      </div>
    </div>
  );
}
