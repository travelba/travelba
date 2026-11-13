import type { SupabaseClient } from "@supabase/supabase-js";
import { agencyFeeExtraAmounts, bookingTotalFromItems } from "@/lib/crm/bookings";
import { resolveCountryCode, resolveNationality } from "@/lib/crm/countries";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { stayPriceWithExpenses } from "@/lib/crm/ledger-display";
import { stayCurrency } from "@/lib/crm/stay-currency";
import { staffStayFacts } from "@/lib/crm/staff-stay";
import { chargeableTicketingFee, isAutoTicketingExpense } from "@/lib/crm/ticketing-fee";
import { isActiveItem, type CrmBooking, type CrmCustomer } from "@/lib/crm/types";
import { expenseCountsForClient } from "@/lib/crm/expense-validation";

type PayerCustomer = Pick<
  CrmCustomer,
  | "id"
  | "first_name"
  | "last_name"
  | "email"
  | "billing_email"
  | "billing_address_line"
  | "billing_postal_code"
  | "billing_city"
  | "billing_country"
  | "address_line"
  | "postal_code"
  | "city"
  | "country"
> &
  Partial<Pick<CrmCustomer, "phone" | "phone_secondary" | "sex" | "birth_date" | "nationality">>;
import {
  mb3mDossierLines,
  mb3mFactureHref,
  mb3mLedgerMention,
  mb3mLineSignature,
  mb3mPieceStale,
  type Mb3mAccountLine,
  type Mb3mLedgerRow,
} from "@/lib/crm/mb3m-account";
import { chargesWithoutGdsFlights, finishMb3mGds, readMb3mGdsPlan, type Mb3mGdsPlan } from "@/lib/crm/mb3m-gds";
import { mb3mIsPaymentGap, recordMb3mInvoicePayments, type Mb3mReglement } from "@/lib/crm/mb3m-payments";
import {
  mb3mActorLabel,
  mb3mPrepInProgress,
  mb3mPreparationLockMessage,
  type Mb3mAttemptStatus,
} from "@/lib/crm/mb3m-prep";
import { defaultPayer, type PayerCompany } from "@/lib/crm/payer";
import {
  accountLines,
  mapTripCost,
  marginByTransaction,
  saleLines,
  type SaleLedgerRow,
  type TripCost,
  type TripCostRow,
} from "@/lib/crm/trip-costs";
import {
  conformMb3mAccountLines,
  MB3M_FLIGHT_HOLD_MESSAGE,
  mb3mInvoiceNotice,
  mb3mInvoiceRefCommand,
  mb3mSendableLines,
  mb3mSoapLines,
  mb3mSupplierAlertMail,
  mb3mSupplierBlock,
} from "@/lib/crm/mb3m-conform";
import { deliverServiceRequestMail } from "@/lib/crm/service-request-mail";
import {
  Mb3mError,
  mb3mAddCreditNote,
  mb3mAddInvoice,
  mb3mCancelInvoice,
  type Mb3mLine,
  mb3mConfigured,
  mb3mFindPiece,
  mb3mPartnerCode,
  mb3mPrestationActivityId,
  mb3mRealm,
  mb3mRenderPiece,
  mb3mCivilityFromSex,
  mb3mSaveCompany,
  mb3mSaveFolder,
  mb3mSavePerson,
  mb3mSingleAgencyUid,
  mb3mAddress,
  type Mb3mAddress,
  type Mb3mCivility,
} from "@/lib/crm/mb3m";
import { createServiceClient } from "@/lib/supabase/admin";

type StayItem = {
  id?: string;
  kind?: string | null;
  amount?: number | string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
  start_at?: string | null;
  end_at?: string | null;
  title?: string | null;
  supplier?: string | null;
  confirmation_ref?: string | null;
  sort_order?: number | null;
};

type CompanyRow = PayerCompany & {
  company_name?: string | null;
  billing_email?: string | null;
  billing_address_line?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
  billing_country?: string | null;
};

export type Mb3mInvoiceContext = {
  bookingId: string;
  reference: string;
  title: string;
  currency: string;
  amount: number;
  dateStart: string | null;
  dateEnd: string | null;
  destination: string | null;
  destinationIso: string | null;
  payerKind: "company" | "personal";
  person: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    address: Mb3mAddress | null;
    civility?: Mb3mCivility;
    birthDate?: string | null;
    country?: string | null;
    mobileNumber?: string | null;
    phoneNumber?: string | null;
  } | null;
  company: {
    id: string;
    name: string;
    email: string | null;
    countryCode: string | null;
    address: Mb3mAddress | null;
    commercialName?: string | null;
    phoneNumber?: string | null;
  } | null;
  travelers: { firstName: string; lastName: string }[];
  visibleToClient: boolean;
  configured: boolean;
  lines: Mb3mAccountLine[];
  /** Billetterie retenue, ou fournisseur manquant sur un vol qui ne part pas. */
  notice?: string | null;
  hadExpenses: boolean;
  /** Vols déjà importés par Amadeus. Absent : rien à écarter. */
  gdsPlan?: Mb3mGdsPlan;
};

export type Mb3mStoredPiece = {
  id: string;
  bookingId: string;
  customerUid: string | null;
  folderId: string | null;
  folderUid: string | null;
  pieceNumber: string | null;
  pieceUid: string | null;
  amount: number | null;
  documentId: string | null;
  updatedAt: string;
  printedAt: string | null;
  signature: string | null;
  transactionIds: string[];
  /** Lignes telles qu’envoyées à MB3M : l’avoir les reprend. */
  lines: Mb3mLine[];
  /** preparing : tentative vivante. failed : le clic suivant reprend cette ligne. */
  attemptStatus: Mb3mAttemptStatus | null;
  attemptError: string | null;
  attemptStartedAt: string | null;
  attemptStartedBy: string | null;
};

export type Mb3mInvoiceResult = {
  number: string;
  documentId: string | null;
  created: boolean;
  replaced: boolean;
  printed: boolean;
  visibleToClient: boolean;
  reglements: Mb3mReglement[];
  amadeus?: {
    label: string;
    invoiceNumber: string;
    pnr: string;
    placement: "move" | "here" | "other";
    moveWarning?: string | null;
  }[];
  suggestionsAmadeus?: { label: string; invoiceNumber: string }[];
  avertissement?: string | null;
};

type PiecePatch = {
  customerUid?: string | null;
  folderId?: string | null;
  folderUid?: string | null;
  pieceNumber?: string | null;
  pieceUid?: string | null;
  amount?: number | null;
  documentId?: string | null;
  printedAt?: string | null;
  signature?: string | null;
  transactionIds?: string[];
  lines?: Mb3mLine[];
  attemptStatus?: Mb3mAttemptStatus | null;
  attemptError?: string | null;
  attemptStartedAt?: string | null;
  attemptStartedBy?: string | null;
};

/**
 * Ligne MB3M d’une vente. MB3M facture **Net + Marge** : `NetPrice` est le net fournisseur, la
 * marge s’ajoute dessus. On envoie donc vente − marge en net, et la marge à part, pour que la
 * pièce fasse le prix vendu. Sans marge connue, le prix vendu entier en net.
 *
 * MB3M refuse une ligne à net 0 (-504 « Une erreur s'est produite durant l'enregistrement de la
 * facture »), et ses types Fees / Note ne conviennent pas (non supporté / ligne absente du PDF).
 * Une ligne de marge pure (frais, prestation sans coût pointé) part donc avec un net plancher
 * d’un centime et la marge qui complète : la pièce imprime le bon montant, la marge varie de 0,01 €.
 * Un frais d’agence part en ligne Custom, sans marge. Un vol garde son activité (2, 1001 ou 27).
 */
export const MB3M_MIN_NET = 0.01;

export function mb3mInvoiceLine(line: Mb3mAccountLine): Mb3mLine {
  if (line.customCode || line.agencyProvider) return mb3mSoapLines([line], MB3M_MIN_NET)[0];
  const raw = line.margin == null || !Number.isFinite(line.margin) ? null : line.margin;
  let net = raw == null ? line.amount : Math.round((line.amount - raw) * 100) / 100;
  let margin = raw;
  if (margin != null && net < MB3M_MIN_NET && line.amount >= MB3M_MIN_NET) {
    net = MB3M_MIN_NET;
    margin = Math.round((line.amount - MB3M_MIN_NET) * 100) / 100;
  }
  return {
    label: line.label,
    quantity: 1,
    netPriceUnit: net,
    netPriceTotal: net,
    activityId: mb3mPrestationActivityId(line.activityId),
    type: "Standard" as const,
    marginUnit: margin,
    note: line.note ?? null,
    providerId: line.providerId ?? null,
    refPiece: line.refPiece ?? null,
    refCommand: line.refCommand ?? null,
  };
}

export type Mb3mInvoiceDeps = {
  now: () => number;
  /** Nom de la personne qui clique, pour le message de verrou. */
  actorName?: string | null;
  claim: (
    bookingId: string,
    amount: number
  ) => Promise<{ piece: Mb3mStoredPiece; created: boolean; busy?: boolean; owned?: boolean }>;
  save: (id: string, patch: PiecePatch) => Promise<void>;
  remove: (id: string) => Promise<void>;
  savePerson: typeof mb3mSavePerson;
  saveCompany: typeof mb3mSaveCompany;
  saveFolder: typeof mb3mSaveFolder;
  addInvoice: typeof mb3mAddInvoice;
  findPiece: typeof mb3mFindPiece;
  cancelInvoice: typeof mb3mCancelInvoice;
  renderPiece: (number: string) => Promise<{ bytes: Buffer }>;
  /** Agence unique de la base, posée sur le dossier et la pièce. Absente : le serveur prend celle du compte. */
  agencyUid?: () => Promise<string | null>;
  putPdf: (input: {
    bookingId: string;
    documentId: string | null;
    fileName: string;
    bytes: Buffer;
    visibleToClient: boolean;
  }) => Promise<string>;
  /** Range les factures Amadeus dans le dossier, une fois qu’il existe. */
  finishGds?: (folderId: string | null) => Promise<string | null>;
  /** Alerte Marie quand un fournisseur du catalogue manque. Défaut : l’e-mail agence. */
  notifySupplier?: (mail: { to: string; subject: string; html: string; text: string }) => Promise<boolean>;
  /** Crédits du client sur la pièce. Une erreur ici ne retire pas la facture. */
  recordPayments?: (input: {
    bookingId: string;
    folderId: string;
    customerUid: string;
    invoiceNumber: string;
    invoiceAmount: number;
    gdsInvoices?: { number: string; amount: number }[];
  }) => Promise<Mb3mReglement[]>;
};

/** Même chiffre que l’onglet Argent, à partir des cartes déjà enregistrées. */
export function dossierStayAmount(input: {
  items: StayItem[];
  agencyCommission: boolean;
  status: string;
  travelerCount: number;
  agencyFeeRate?: number | null;
  feeMode?: string | null;
}) {
  const items = input.items.map((item) => ({
    ...item,
    amount: item.amount == null || item.amount === "" ? null : Number(item.amount),
  }));
  return stayPriceWithExpenses({
    stayTotal: bookingTotalFromItems(items),
    agencyCommission: input.agencyCommission,
    expenses: items
      .filter((item) => isActiveItem(item) && expenseCountsForClient(item))
      .map((item) => ({ amount: item.amount, agencyFee: !isAutoTicketingExpense(item) })),
    extras: agencyFeeExtraAmounts(items),
    ticketingFee: chargeableTicketingFee({
      items,
      status: input.status,
      travelerCount: input.travelerCount,
      feeMode: input.feeMode,
    }),
    agencyFeeRate: input.agencyFeeRate,
  });
}

function blank(value: string | null | undefined) {
  const text = (value || "").trim();
  return text || null;
}

function personAddress(customer: PayerCustomer, name: string) {
  return (
    mb3mAddress({
      name,
      line: customer.billing_address_line,
      postal: customer.billing_postal_code,
      city: customer.billing_city,
      country: customer.billing_country,
    }) ||
    mb3mAddress({
      name,
      line: customer.address_line,
      postal: customer.postal_code,
      city: customer.city,
      country: customer.country,
    })
  );
}

export function mb3mInvoiceBlocker(ctx: Mb3mInvoiceContext) {
  if (!ctx.configured) return "L’accès MB3M n’est pas configuré.";
  if (ctx.currency !== "EUR") return "Le séjour n’est pas en euros.";
  if (!ctx.dateStart || !ctx.dateEnd) return "Les dates du séjour manquent.";
  if (ctx.dateEnd < ctx.dateStart) return "Les dates du séjour sont inversées.";
  if (ctx.payerKind === "company") {
    if (!ctx.company?.name) return "La raison sociale est incomplète.";
    if (!ctx.company.address) {
      return ctx.company.countryCode && ctx.company.countryCode !== "FR"
        ? "L’adresse de facturation de la société est incomplète (rue, ville)."
        : "L’adresse de facturation de la société est incomplète (rue, code postal, ville).";
    }
  } else {
    if (!ctx.person?.firstName || !ctx.person.lastName) return "Le nom du client est incomplet.";
    // Particulier : l’adresse de la fiche est l’adresse de facturation.
    if (!ctx.person.address) return "L’adresse du client manque sur sa fiche (rue, code postal, ville) : c’est elle qui sert à la facture.";
  }
  if (!ctx.lines.length) {
    return ctx.hadExpenses
      ? "Les dépenses de ce séjour sont déjà sur une facture validée."
      : "Aucune dépense de ce séjour n’est au grand livre.";
  }
  const supplier = mb3mSupplierBlock(ctx.lines);
  if (supplier) {
    const held = ctx.lines.some((line) => line.held) ? MB3M_FLIGHT_HOLD_MESSAGE : "";
    return [supplier, held].filter(Boolean).join(" ");
  }
  const sendable = mb3mSendableLines(ctx.lines);
  if (!sendable.length) {
    const notice = mb3mInvoiceNotice(ctx.lines);
    if (notice) return notice;
    if (ctx.lines.some((line) => !line.rollup && !line.held && line.activityId == null && !line.customCode && !line.supplierReason)) {
      return "L’activité MB3M n’est pas configurée.";
    }
    return ctx.hadExpenses
      ? "Les dépenses de ce séjour sont déjà sur une facture validée."
      : "Aucune dépense de ce séjour n’est au grand livre.";
  }
  if (sendable.some((line) => line.activityId == null && !line.customCode)) return "L’activité MB3M n’est pas configurée.";
  return null;
}

export function buildMb3mInvoiceContext(input: {
  booking: Pick<
    CrmBooking,
    | "id"
    | "reference"
    | "title"
    | "currency"
    | "destination"
    | "start_date"
    | "end_date"
    | "status"
    | "agency_commission"
    | "visible_to_client"
    | "payer_kind"
    | "billing_company_id"
  >;
  items: StayItem[];
  travelers: { first_name: string | null; last_name: string | null }[];
  payer: PayerCustomer | null;
  companies: CompanyRow[];
  charges?: Mb3mLedgerRow[];
  coveredIds?: string[];
  /** Coûts rattachés (Pliant, Revolut) : la marge de chaque ligne. */
  costs?: TripCost[];
}): Mb3mInvoiceContext {
  const facts = staffStayFacts({
    items: input.items,
    destination: input.booking.destination,
    startDate: input.booking.start_date,
    endDate: input.booking.end_date,
  });
  const payerKind =
    input.booking.payer_kind === "company" || input.booking.payer_kind === "personal"
      ? input.booking.payer_kind
      : defaultPayer(input.companies).payer_kind;
  const companies = [...input.companies].sort(
    (left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id)
  );
  const company =
    payerKind === "company"
      ? companies.find((row) => row.id === input.booking.billing_company_id) || companies[0] || null
      : null;
  const companyName = (company?.company_name || "").trim();
  const personName = [input.payer?.first_name, input.payer?.last_name].filter(Boolean).join(" ").trim();
  const namedTravelers = input.travelers
    .map((traveler) => ({
      firstName: (traveler.first_name || "").trim(),
      lastName: (traveler.last_name || "").trim(),
    }))
    .filter((traveler) => traveler.firstName && traveler.lastName);
  const covered = new Set(input.coveredIds || []);
  const margins = input.costs?.length
    ? marginByTransaction(
        accountLines(saleLines((input.charges || []) as SaleLedgerRow[], input.booking.id), input.costs).lines
      )
    : null;
  const posted = mb3mDossierLines(input.charges || [], input.items, margins);
  const lines = conformMb3mAccountLines(
    posted.filter((line) => !covered.has(line.transactionId)),
    input.items
  );
  const sendable = mb3mSendableLines(lines);
  return {
    bookingId: input.booking.id,
    reference: input.booking.reference,
    title: (input.booking.title || "").trim().slice(0, 120) || input.booking.reference,
    currency: stayCurrency(input.booking.currency),
    amount: Math.round(sendable.reduce((sum, line) => sum + line.amount, 0) * 100) / 100,
    dateStart: facts.start,
    dateEnd: facts.end,
    destination: facts.placeLine.trim().slice(0, 120) || null,
    destinationIso: resolveCountryCode(input.booking.destination),
    payerKind,
    person: input.payer
      ? {
          id: input.payer.id,
          firstName: (input.payer.first_name || "").trim(),
          lastName: (input.payer.last_name || "").trim(),
          email: blank(input.payer.billing_email) || blank(input.payer.email),
          address: personAddress(input.payer, personName || "Client"),
          civility: mb3mCivilityFromSex(input.payer.sex),
          birthDate: blank(input.payer.birth_date),
          country: resolveNationality(input.payer.nationality),
          mobileNumber: blank(input.payer.phone),
          phoneNumber: blank(input.payer.phone_secondary),
        }
      : null,
    company: company
      ? {
          id: company.id,
          name: companyName,
          commercialName: companyName,
          email: blank(company.billing_email) || blank(input.payer?.email),
          phoneNumber: blank(input.payer?.phone),
          countryCode: resolveCountryCode(company.billing_country),
          address: mb3mAddress({
            name: companyName || "Société",
            line: company.billing_address_line,
            postal: company.billing_postal_code,
            city: company.billing_city,
            country: company.billing_country,
            company: true,
          }),
        }
      : null,
    travelers: namedTravelers,
    visibleToClient: input.booking.visible_to_client === true,
    configured: mb3mConfigured(),
    lines,
    notice: mb3mInvoiceNotice(lines),
    hadExpenses: posted.length > 0,
  };
}

function invoiceFileName(number: string) {
  return `Facture MB3M n° ${number}.pdf`;
}

export async function storeMb3mPdf(input: {
  bookingId: string;
  documentId: string | null;
  fileName: string;
  bytes: Buffer;
  visibleToClient: boolean;
  loadDocument: (id: string) => Promise<{ storagePath: string } | null>;
  upload: (path: string, bytes: Buffer, upsert: boolean) => Promise<void>;
  insertDocument: (row: {
    bookingId: string;
    fileName: string;
    path: string;
    visibleToClient: boolean;
  }) => Promise<string>;
}) {
  if (input.documentId) {
    const existing = await input.loadDocument(input.documentId);
    if (existing?.storagePath) {
      await input.upload(existing.storagePath, input.bytes, true);
      return input.documentId;
    }
  }
  const path = `bookings/${input.bookingId}/${Date.now()}-${safeFileName(input.fileName)}`;
  await input.upload(path, input.bytes, false);
  return input.insertDocument({
    bookingId: input.bookingId,
    fileName: input.fileName,
    path,
    visibleToClient: input.visibleToClient,
  });
}

async function attachPdf(
  ctx: Mb3mInvoiceContext,
  deps: Mb3mInvoiceDeps,
  piece: Mb3mStoredPiece,
  number: string
) {
  const rendered = await deps.renderPiece(number);
  const documentId = await deps.putPdf({
    bookingId: ctx.bookingId,
    documentId: piece.documentId,
    fileName: invoiceFileName(number),
    bytes: rendered.bytes,
    visibleToClient: ctx.visibleToClient,
  });
  if (documentId !== piece.documentId) await deps.save(piece.id, { documentId });
  return documentId;
}

async function attachReglements(
  ctx: Mb3mInvoiceContext,
  deps: Mb3mInvoiceDeps,
  result: Omit<Mb3mInvoiceResult, "reglements">,
  invoiceAmount: number,
  folderId: string | null,
  customerUid: string | null
): Promise<Mb3mInvoiceResult> {
  let folder = folderId || "";
  if (deps.finishGds) folder = (await deps.finishGds(folderId)) || folder;
  const gdsWarning = (ctx.gdsPlan?.warnings || []).filter(Boolean).join(" ") || null;
  if (!deps.recordPayments) return { ...result, reglements: [], avertissement: gdsWarning };
  try {
    const reglements = await deps.recordPayments({
      bookingId: ctx.bookingId,
      folderId: folder,
      customerUid: customerUid || ctx.gdsPlan?.customerUid || "",
      invoiceNumber: result.number,
      invoiceAmount,
      gdsInvoices: ctx.gdsPlan?.invoices,
    });
    const failed = reglements.find((row) => row.statut === "erreur" && !mb3mIsPaymentGap(row.erreur));
    if (failed) throw new Mb3mError(failed.erreur || "Les règlements n’ont pas pu être enregistrés.", -1);
    const gap = reglements.find((row) => mb3mIsPaymentGap(row.erreur));
    const notes = reglements.flatMap((row) => (row.avertissement ? [row.avertissement] : []));
    const avertissement = [gdsWarning, gap?.erreur, ...notes].filter(Boolean).join(" ") || null;
    return { ...result, reglements, avertissement };
  } catch (err) {
    if (err instanceof Mb3mError) throw err;
    throw new Mb3mError(err instanceof Error ? err.message : "Les règlements n’ont pas pu être enregistrés.", -1);
  }
}

async function notifySupplierGap(ctx: Mb3mInvoiceContext, deps: Mb3mInvoiceDeps) {
  const reason = [...new Set(ctx.lines.map((line) => line.supplierReason).filter(Boolean))].join(" ");
  if (!reason) return;
  try {
    const mail = mb3mSupplierAlertMail({ reference: ctx.reference, bookingId: ctx.bookingId, reason });
    const send = deps.notifySupplier || deliverServiceRequestMail;
    await send(mail);
  } catch {
    console.error("[mb3m] alerte fournisseur non délivrée");
  }
}

function withNotice(ctx: Mb3mInvoiceContext, result: Mb3mInvoiceResult): Mb3mInvoiceResult {
  const avertissement = [ctx.notice, result.avertissement].filter(Boolean).join(" ") || null;
  return { ...result, avertissement };
}

export async function runMb3mInvoice(ctx: Mb3mInvoiceContext, deps: Mb3mInvoiceDeps): Promise<Mb3mInvoiceResult> {
  const sendable = mb3mSendableLines(ctx.lines);
  const signature = mb3mLineSignature(sendable);
  const claimed = await deps.claim(ctx.bookingId, ctx.amount);
  let piece = claimed.piece;
  const created = Boolean(claimed.created);
  const mine = created || claimed.owned === true;
  if (claimed.busy || (!mine && mb3mPrepInProgress(piece, deps.now()))) {
    throw new Mb3mError(mb3mPreparationLockMessage(piece, deps.now()), 0);
  }
  let rememberFailure = true;
  try {
    if (!ctx.lines.length) {
      if (piece.pieceNumber && !piece.printedAt) {
        const state = await deps.findPiece(piece.pieceNumber);
        if (state === "open" && piece.folderId) await deps.cancelInvoice(piece.folderId, piece.pieceNumber);
        if (state !== "printed") await deps.remove(piece.id);
      } else if (created) {
        rememberFailure = false;
        await deps.remove(piece.id);
      }
      throw new Mb3mError(mb3mInvoiceBlocker(ctx) || "Aucune dépense de ce séjour n’est au grand livre.", 0);
    }
    await notifySupplierGap(ctx, deps);
    let previous: { folderId: string; number: string } | null = null;
    if (piece.pieceNumber) {
      const state = await deps.findPiece(piece.pieceNumber);
      if (state === "printed") {
        let documentId = piece.documentId;
        if (!piece.printedAt) {
          documentId = await attachPdf(ctx, deps, piece, piece.pieceNumber);
          await deps.save(piece.id, { printedAt: new Date().toISOString(), documentId });
        }
        const covered = new Set(piece.transactionIds);
        const fresh = ctx.lines.filter((line) => !covered.has(line.transactionId));
        if (!fresh.length) {
          return withNotice(ctx, await attachReglements(
            ctx,
            deps,
            {
              number: piece.pieceNumber,
              documentId,
              created: false,
              replaced: false,
              printed: true,
              visibleToClient: ctx.visibleToClient,
            },
            piece.amount ?? ctx.amount,
            piece.folderId,
            piece.customerUid
          ));
        }
        return await runMb3mInvoice(
          { ...ctx, lines: fresh, amount: Math.round(fresh.reduce((sum, line) => sum + line.amount, 0) * 100) / 100, hadExpenses: true },
          deps
        );
      }
      if (state === "open" && piece.signature === signature) {
        return withNotice(ctx, await attachReglements(
          ctx,
          deps,
          {
            number: piece.pieceNumber,
            documentId: null,
            created: false,
            replaced: false,
            printed: false,
            visibleToClient: ctx.visibleToClient,
          },
          piece.amount ?? ctx.amount,
          piece.folderId,
          piece.customerUid
        ));
      }
      // L’ancienne pro forma s’annule après la nouvelle : un refus de MB3M ne laisse pas le dossier sans pièce.
      if (state === "open" && piece.folderId) previous = { folderId: piece.folderId, number: piece.pieceNumber };
    }
    const blocker = mb3mInvoiceBlocker(ctx);
    if (blocker && !piece.customerUid) {
      if (created) {
        rememberFailure = false;
        await deps.remove(piece.id);
      }
      throw new Mb3mError(blocker, 0);
    }
    if (blocker && !piece.pieceNumber) {
      if (created) {
        rememberFailure = false;
        await deps.remove(piece.id);
      }
      throw new Mb3mError(blocker, 0);
    }
    if (!piece.pieceNumber && !mb3mPrepInProgress(piece, deps.now())) {
      const startedAt = new Date(deps.now()).toISOString();
      const startedBy = mb3mActorLabel(deps.actorName);
      await deps.save(piece.id, {
        attemptStatus: "preparing",
        attemptError: null,
        attemptStartedAt: startedAt,
        attemptStartedBy: startedBy,
      });
      piece = {
        ...piece,
        attemptStatus: "preparing",
        attemptError: null,
        attemptStartedAt: startedAt,
        attemptStartedBy: startedBy,
      };
    }

    const savedPiece = await ensureFolder(ctx, deps, piece);
    const replaced = Boolean(piece.pieceNumber);
    const soapLines = mb3mSoapLines(sendable, MB3M_MIN_NET);
    const invoiceAmount = Math.round(sendable.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
    const invoice = await deps.addInvoice({
      folderId: savedPiece.folderId || "",
      customerUid: savedPiece.customerUid || "",
      title: ctx.title,
      refCommand: mb3mInvoiceRefCommand(ctx.reference, soapLines),
      dateStart: ctx.dateStart || undefined,
      dateEnd: ctx.dateEnd || undefined,
      destination: ctx.destination || undefined,
      destinationIso: ctx.destinationIso || undefined,
      lines: soapLines,
      travelers: ctx.travelers.map((traveler) => ({ firstName: traveler.firstName, name: traveler.lastName })),
      agencyUid: savedPiece.agencyUid,
    });
    if (previous && previous.number !== invoice.number) {
      try {
        await deps.cancelInvoice(previous.folderId, previous.number);
      } catch (err) {
        const message = err instanceof Error ? err.message : "annulation";
        try {
          await deps.cancelInvoice(savedPiece.folderId || previous.folderId, invoice.number);
        } catch (undo) {
          console.error(
            `[mb3m] la nouvelle pro forma n° ${invoice.number} n’a pas pu être retirée`,
            undo instanceof Error ? undo.message : undo
          );
        }
        throw new Mb3mError(`La pro forma n° ${previous.number} n’a pas pu être annulée. ${message}`, -1);
      }
    }
    await deps.save(savedPiece.id, {
      pieceNumber: invoice.number,
      pieceUid: invoice.uid || null,
      amount: invoiceAmount,
      signature,
      transactionIds: sendable.map((line) => line.transactionId),
      lines: soapLines,
      customerUid: savedPiece.customerUid,
      folderId: savedPiece.folderId,
      folderUid: savedPiece.folderUid,
      attemptStatus: null,
      attemptError: null,
    });
    return withNotice(
      ctx,
      await attachReglements(
        ctx,
        deps,
        {
          number: invoice.number,
          documentId: null,
          created: !replaced,
          replaced,
          printed: false,
          visibleToClient: ctx.visibleToClient,
        },
        invoiceAmount,
        savedPiece.folderId,
        savedPiece.customerUid
      )
    );
  } catch (error) {
    if (rememberFailure) {
      const message = (error instanceof Error ? error.message : "La facture MB3M n’a pas abouti.")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1000);
      try {
        await deps.save(piece.id, { attemptStatus: "failed", attemptError: message || "La facture MB3M n’a pas abouti." });
      } catch (saveError) {
        console.error("[mb3m] échec non enregistré", saveError instanceof Error ? saveError.message : saveError);
      }
    }
    throw error;
  }
}

async function ensureFolder(ctx: Mb3mInvoiceContext, deps: Mb3mInvoiceDeps, piece: Mb3mStoredPiece) {
  let customerUid = piece.customerUid;
  if (!customerUid) {
    const saved =
      ctx.payerKind === "company" && ctx.company?.address
        ? await deps.saveCompany({
            partnerId: mb3mPartnerCode(ctx.company.id),
            name: ctx.company.name,
            commercialName: ctx.company.commercialName || ctx.company.name,
            email: ctx.company.email || undefined,
            phoneNumber: ctx.company.phoneNumber,
            address: ctx.company.address,
          })
        : ctx.person?.address
          ? await deps.savePerson({
              partnerId: mb3mPartnerCode(ctx.person.id),
              civility: ctx.person.civility,
              firstName: ctx.person.firstName,
              name: ctx.person.lastName,
              email: ctx.person.email || undefined,
              address: ctx.person.address,
              birthDate: ctx.person.birthDate,
              country: ctx.person.country,
              mobileNumber: ctx.person.mobileNumber,
              phoneNumber: ctx.person.phoneNumber,
            })
          : null;
    if (!saved?.uid) throw new Mb3mError("La fiche MB3M n’a pas abouti.", -1);
    customerUid = saved.uid;
    await deps.save(piece.id, { customerUid });
  }
  let folderId = piece.folderId;
  let folderUid = piece.folderUid;
  const agencyUid = await agencyFor(deps);
  // Sans dossier : on le crée. Avec dossier et une agence connue : on le repose avec l’agence,
  // pour les dossiers ouverts avant que la base de l’agence l’exige.
  if (!folderId || agencyUid) {
    const folder = await deps.saveFolder({
      customerUid,
      title: ctx.title,
      folderType: "Prestation",
      dateStart: ctx.dateStart || "",
      dateEnd: ctx.dateEnd || "",
      destination: ctx.destination || undefined,
      destinationIso: ctx.destinationIso || undefined,
      codeRef: mb3mPartnerCode(ctx.bookingId),
      id: folderId || undefined,
      agencyUid,
    });
    if (!folderId) {
      folderId = folder.id;
      folderUid = folder.uid || null;
      await deps.save(piece.id, { folderId, folderUid });
    }
  }
  return { ...piece, customerUid, folderId, folderUid, agencyUid };
}

async function agencyFor(deps: Mb3mInvoiceDeps) {
  if (!deps.agencyUid) return null;
  try {
    return await deps.agencyUid();
  } catch {
    return null;
  }
}

function dbFail(error: { code?: string; message?: string }, fallback: string): never {
  console.error("[crm] mb3m:", error.code ?? "?", error.message ?? "");
  throw new Mb3mError(fallback, -1);
}

function mapPiece(row: Record<string, unknown>): Mb3mStoredPiece {
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    customerUid: row.customer_uid ? String(row.customer_uid) : null,
    folderId: row.folder_id ? String(row.folder_id) : null,
    folderUid: row.folder_uid ? String(row.folder_uid) : null,
    pieceNumber: row.piece_number ? String(row.piece_number) : null,
    pieceUid: row.piece_uid ? String(row.piece_uid) : null,
    amount: row.amount == null ? null : Number(row.amount),
    documentId: row.document_id ? String(row.document_id) : null,
    updatedAt: String(row.updated_at || ""),
    printedAt: row.printed_at ? String(row.printed_at) : null,
    signature: row.line_signature ? String(row.line_signature) : null,
    transactionIds: Array.isArray(row.transaction_ids) ? row.transaction_ids.map(String) : [],
    lines: Array.isArray(row.lines) ? (row.lines as Mb3mLine[]) : [],
    attemptStatus: row.attempt_status === "preparing" || row.attempt_status === "failed" ? row.attempt_status : null,
    attemptError: row.attempt_error ? String(row.attempt_error) : null,
    attemptStartedAt: row.attempt_started_at ? String(row.attempt_started_at) : null,
    attemptStartedBy: row.attempt_started_by ? String(row.attempt_started_by) : null,
  };
}

const SALE_SELECT = "id, direction, status, currency, amount, label, external_id, booking_id, kind";

/** Ventes postées du dossier, coûts rattachés, pièces imprimées encore valables. */
async function dossierInvoiceInputs(supabase: SupabaseClient, bookingId: string) {
  const [chargesResult, piecesResult, costsResult] = await Promise.all([
    supabase
      .from("crm_transactions")
      .select(SALE_SELECT)
      .eq("booking_id", bookingId)
      .eq("status", "posted")
      .eq("direction", "debit"),
    supabase
      .from("crm_mb3m_pieces")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("kind", "invoice")
      .eq("realm", mb3mRealm())
      .not("printed_at", "is", null)
      .is("credited_at", null),
    supabase
      .from("crm_trip_costs")
      .select(
        "id, booking_id, booking_item_id, source, source_id, amount_eur, original_amount, original_currency, supplier, occurred_on, instrument, instrument_detail"
      )
      .eq("booking_id", bookingId),
  ]);
  if (chargesResult.error) dbFail(chargesResult.error, "La facture n’a pas pu être préparée.");
  if (costsResult.error) dbFail(costsResult.error, "La facture n’a pas pu être préparée.");
  const printed = ((piecesResult.data || []) as Record<string, unknown>[]).map(mapPiece);
  return {
    charges: (chargesResult.data || []) as Mb3mLedgerRow[],
    printed,
    coveredIds: printed.flatMap((piece) => piece.transactionIds),
    costs: ((costsResult.data || []) as TripCostRow[]).map(mapTripCost),
  };
}

/** Contexte de facture d’un séjour, tel qu’il part vers MB3M. */
export async function loadMb3mInvoiceContext(supabase: SupabaseClient, bookingId: string): Promise<Mb3mInvoiceContext> {
  const { data: booking, error: bookingError } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) dbFail(bookingError, "La facture n’a pas pu être préparée.");
  if (!booking) throw new Mb3mError("Réservation introuvable.", 0);
  const stay = booking as CrmBooking;
  const payerId = stay.billing_customer_id || stay.customer_id;
  const [items, travelers, payerResult, companiesResult] = await Promise.all([
    supabase.from("crm_booking_items").select("*").eq("booking_id", bookingId),
    supabase.from("crm_booking_travelers").select("first_name, last_name").eq("booking_id", bookingId),
    supabase.from("crm_customers").select("*").eq("id", payerId).maybeSingle(),
    supabase.from("crm_billing_companies").select("*").eq("customer_id", payerId),
  ]);
  if (items.error) dbFail(items.error, "La facture n’a pas pu être préparée.");
  if (travelers.error) dbFail(travelers.error, "La facture n’a pas pu être préparée.");
  if (payerResult.error) dbFail(payerResult.error, "La facture n’a pas pu être préparée.");
  if (companiesResult.error) dbFail(companiesResult.error, "La facture n’a pas pu être préparée.");
  const inputs = await dossierInvoiceInputs(supabase, bookingId);
  const stayItems = (items.data || []) as StayItem[];
  const openFolder = await supabase
    .from("crm_mb3m_pieces")
    .select("folder_id")
    .eq("booking_id", bookingId)
    .eq("realm", mb3mRealm())
    .not("folder_id", "is", null)
    .limit(1)
    .maybeSingle();
  const folderId = (openFolder.data as { folder_id?: string } | null)?.folder_id || null;
  const gdsPlan = await readMb3mGdsPlan(supabase, {
    bookingId,
    payerId,
    billingCompanyId: stay.billing_company_id || null,
    items: stayItems,
    charges: inputs.charges,
    folderId,
  });
  return {
    ...buildMb3mInvoiceContext({
      booking: stay,
      items: stayItems,
      travelers: (travelers.data || []) as { first_name: string | null; last_name: string | null }[],
      payer: (payerResult.data as PayerCustomer | null) || null,
      companies: (companiesResult.data || []) as CompanyRow[],
      charges: chargesWithoutGdsFlights(inputs.charges, gdsPlan.covered),
      coveredIds: inputs.coveredIds,
      costs: inputs.costs,
    }),
    gdsPlan,
  };
}

export async function emitMb3mInvoice(
  supabase: SupabaseClient,
  bookingId: string,
  actorName?: string | null
): Promise<Mb3mInvoiceResult> {
  const ctx = await loadMb3mInvoiceContext(supabase, bookingId);
  const deps = supabaseInvoiceDeps(supabase, actorName);
  const plan = ctx.gdsPlan;
  if (plan?.covered.length) {
    deps.finishGds = (folderId) =>
      finishMb3mGds(supabase, {
        bookingId,
        plan,
        folderId,
        title: ctx.title,
        dateStart: ctx.dateStart,
        dateEnd: ctx.dateEnd,
        destination: ctx.destination,
        destinationIso: ctx.destinationIso,
      });
  }
  const suggestionsAmadeus = (plan?.suggestions || []).map((row) => ({
    label: row.label,
    invoiceNumber: row.invoiceNumber,
  }));
  const amadeusOf = () =>
    (plan?.covered || []).map((row) => ({
      label: row.label,
      invoiceNumber: row.invoiceNumber,
      pnr: row.pnr,
      placement: row.placement,
      moveWarning: row.moveWarning,
    }));
  try {
    const result = await runMb3mInvoice(ctx, deps);
    return { ...result, amadeus: amadeusOf(), suggestionsAmadeus };
  } catch (err) {
    if (!(plan?.covered.length && err instanceof Mb3mError && /dépense/.test(err.message))) throw err;
    const folderId = deps.finishGds ? await deps.finishGds(plan.folderId) : plan.folderId;
    const reglements = deps.recordPayments
      ? await deps.recordPayments({
          bookingId,
          folderId: folderId || "",
          customerUid: plan.customerUid || "",
          invoiceNumber: plan.covered[0]?.invoiceNumber || "",
          invoiceAmount: 0,
          gdsInvoices: plan.invoices,
        })
      : [];
    const failed = reglements.find((row) => row.statut === "erreur" && !mb3mIsPaymentGap(row.erreur));
    if (failed) throw new Mb3mError(failed.erreur || "Les règlements n’ont pas pu être enregistrés.", -1);
    const gap = reglements.find((row) => mb3mIsPaymentGap(row.erreur));
    const notes = reglements.flatMap((row) => (row.avertissement ? [row.avertissement] : []));
    return {
      number: plan.covered[0]?.invoiceNumber || "",
      documentId: null,
      created: false,
      replaced: false,
      printed: false,
      visibleToClient: ctx.visibleToClient,
      reglements,
      amadeus: amadeusOf(),
      suggestionsAmadeus,
      avertissement: [(plan?.warnings || []).filter(Boolean).join(" "), gap?.erreur, ...notes].filter(Boolean).join(" ") || null,
    };
  }
}

/** Pièces imprimées dont la marge a changé depuis l’impression. */
export function mb3mStalePieces(printed: Mb3mStoredPiece[], lines: Mb3mAccountLine[]) {
  return printed.filter((piece) => mb3mPieceStale(piece, lines));
}

/**
 * Avoir et nouvelle facture. L’avoir reprend la facture imprimée ligne à ligne ; la facture suivante
 * repart avec la même vente et la marge corrigée. Les deux se valident dans MB3M, à l’impression.
 */
export async function reissueMb3mInvoice(supabase: SupabaseClient, bookingId: string, actorName?: string | null) {
  const { data: booking } = await supabase.from("crm_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!booking) throw new Mb3mError("Réservation introuvable.", 0);
  const stay = booking as CrmBooking;
  const [{ data: items }, inputs] = await Promise.all([
    supabase.from("crm_booking_items").select("*").eq("booking_id", bookingId),
    dossierInvoiceInputs(supabase, bookingId),
  ]);
  const ctx = buildMb3mInvoiceContext({
    booking: stay,
    items: (items || []) as StayItem[],
    travelers: [],
    payer: null,
    companies: [],
    charges: inputs.charges,
    costs: inputs.costs,
  });
  const stale = mb3mStalePieces(inputs.printed, ctx.lines);
  if (!stale.length) throw new Mb3mError("Aucune facture imprimée à corriger.", 0);
  const agencyUid = await mb3mSingleAgencyUid().catch(() => null);
  const creditNotes: string[] = [];
  for (const piece of stale) {
    if (!piece.folderId || !piece.customerUid || !piece.pieceNumber) continue;
    const lines = piece.lines.length
      ? piece.lines
      : ctx.lines
          .filter((line) => piece.transactionIds.includes(line.transactionId))
          .map((line) => mb3mInvoiceLine({ ...line, margin: line.amount, note: null }));
    const credit = await mb3mAddCreditNote({
      folderId: piece.folderId,
      customerUid: piece.customerUid,
      folderTitle: ctx.title,
      folderType: "Prestation",
      dateStart: ctx.dateStart || new Date().toISOString().slice(0, 10),
      dateEnd: ctx.dateEnd || ctx.dateStart || new Date().toISOString().slice(0, 10),
      title: `Avoir sur facture n° ${piece.pieceNumber}`,
      refCommand: ctx.reference,
      destinationIso: ctx.destinationIso || undefined,
      lines,
      agencyUid,
    });
    const now = new Date().toISOString();
    const inserted = await supabase.from("crm_mb3m_pieces").insert({
      booking_id: bookingId,
      kind: "credit_note",
      realm: mb3mRealm(),
      customer_uid: piece.customerUid,
      folder_id: piece.folderId,
      folder_uid: piece.folderUid,
      piece_number: credit.number,
      amount: piece.amount,
      currency: "EUR",
      line_signature: piece.signature,
      transaction_ids: piece.transactionIds,
      lines,
      replaces_piece_id: piece.id,
    });
    if (inserted.error) dbFail(inserted.error, "L’avoir n’a pas pu être enregistré.");
    const credited = await supabase.from("crm_mb3m_pieces").update({ credited_at: now, updated_at: now }).eq("id", piece.id);
    if (credited.error) dbFail(credited.error, "L’avoir n’a pas pu être enregistré.");
    creditNotes.push(credit.number);
  }
  if (!creditNotes.length) throw new Mb3mError("La facture imprimée n’a pas de dossier MB3M connu.", 0);
  const invoice = await emitMb3mInvoice(supabase, bookingId, actorName);
  return { creditNote: creditNotes.join(", "), ...invoice };
}

function supabaseInvoiceDeps(supabase: SupabaseClient, actorName?: string | null): Mb3mInvoiceDeps {
  const actor = mb3mActorLabel(actorName);
  const now = () => Date.now();
  return {
    now,
    actorName: actor,
    claim: async (bookingId, amount) => {
      const startedAt = new Date(now()).toISOString();
      const inserted = await supabase
        .from("crm_mb3m_pieces")
        .insert({
          booking_id: bookingId,
          kind: "invoice",
          amount,
          currency: "EUR",
          realm: mb3mRealm(),
          attempt_status: "preparing",
          attempt_error: null,
          attempt_started_at: startedAt,
          attempt_started_by: actor,
        })
        .select("*")
        .maybeSingle();
      if (!inserted.error && inserted.data) {
        return { piece: mapPiece(inserted.data as Record<string, unknown>), created: true, owned: true };
      }
      if (inserted.error?.code !== "23505") {
        dbFail(inserted.error || { message: "insert" }, "La facture n’a pas pu être enregistrée.");
      }
      const loadOpen = async () => {
        const existing = await supabase
          .from("crm_mb3m_pieces")
          .select("*")
          .eq("booking_id", bookingId)
          .eq("kind", "invoice")
          .eq("realm", mb3mRealm())
          .is("printed_at", null)
          .maybeSingle();
        if (existing.error || !existing.data) {
          dbFail(existing.error || { message: "select" }, "La facture n’a pas pu être enregistrée.");
        }
        return mapPiece(existing.data as Record<string, unknown>);
      };
      let piece = await loadOpen();
      if (mb3mPrepInProgress(piece, now())) return { piece, created: false, busy: true };
      const take = async (updatedAt: string) => {
        const taken = await supabase
          .from("crm_mb3m_pieces")
          .update({
            attempt_status: "preparing",
            attempt_error: null,
            attempt_started_at: new Date(now()).toISOString(),
            attempt_started_by: actor,
            updated_at: new Date(now()).toISOString(),
          })
          .eq("id", piece.id)
          .eq("updated_at", updatedAt)
          .select("*")
          .maybeSingle();
        if (taken.error) dbFail(taken.error, "La facture n’a pas pu être enregistrée.");
        return taken.data ? mapPiece(taken.data as Record<string, unknown>) : null;
      };
      const first = await take(piece.updatedAt);
      if (first) return { piece: first, created: false, owned: true };
      piece = await loadOpen();
      if (mb3mPrepInProgress(piece, now())) return { piece, created: false, busy: true };
      const second = await take(piece.updatedAt);
      if (second) return { piece: second, created: false, owned: true };
      piece = await loadOpen();
      if (mb3mPrepInProgress(piece, now())) return { piece, created: false, busy: true };
      return { piece, created: false, owned: true };
    },
    save: async (id, patch) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("customerUid" in patch) row.customer_uid = patch.customerUid;
      if ("folderId" in patch) row.folder_id = patch.folderId;
      if ("folderUid" in patch) row.folder_uid = patch.folderUid;
      if ("pieceNumber" in patch) row.piece_number = patch.pieceNumber;
      if ("pieceUid" in patch) row.piece_uid = patch.pieceUid;
      if ("amount" in patch) row.amount = patch.amount;
      if ("documentId" in patch) row.document_id = patch.documentId;
      if ("printedAt" in patch) row.printed_at = patch.printedAt;
      if ("signature" in patch) row.line_signature = patch.signature;
      if ("transactionIds" in patch) row.transaction_ids = patch.transactionIds;
      if ("lines" in patch) row.lines = patch.lines;
      if ("attemptStatus" in patch) row.attempt_status = patch.attemptStatus;
      if ("attemptError" in patch) row.attempt_error = patch.attemptError;
      if ("attemptStartedAt" in patch) row.attempt_started_at = patch.attemptStartedAt;
      if ("attemptStartedBy" in patch) row.attempt_started_by = patch.attemptStartedBy;
      const { error } = await supabase.from("crm_mb3m_pieces").update(row).eq("id", id);
      if (error) dbFail(error, "La facture n’a pas pu être enregistrée.");
    },
    remove: async (id) => {
      const { error } = await supabase.from("crm_mb3m_pieces").delete().eq("id", id);
      if (error) dbFail(error, "La facture n’a pas pu être enregistrée.");
    },
    savePerson: mb3mSavePerson,
    saveCompany: mb3mSaveCompany,
    saveFolder: mb3mSaveFolder,
    addInvoice: mb3mAddInvoice,
    recordPayments: (input) => recordMb3mInvoicePayments(supabase, input),
    agencyUid: mb3mSingleAgencyUid,
    findPiece: mb3mFindPiece,
    cancelInvoice: mb3mCancelInvoice,
    renderPiece: async (number) => mb3mRenderPiece({ number }),
    putPdf: async (input) =>
      storeMb3mPdf({
        ...input,
        loadDocument: async (id) => {
          const { data, error } = await supabase
            .from("crm_booking_documents")
            .select("storage_path")
            .eq("id", id)
            .maybeSingle();
          if (error) dbFail(error, "Le PDF n’a pas pu être déposé dans les pièces.");
          const path = (data as { storage_path?: string } | null)?.storage_path;
          return path ? { storagePath: path } : null;
        },
        upload: async (path, bytes, upsert) => {
          try {
            await uploadCrmFile(path, bytes, "application/pdf", { upsert });
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            dbFail({ message }, "Le PDF n’a pas pu être déposé dans les pièces.");
          }
        },
        insertDocument: async (row) => {
          const { data, error } = await supabase
            .from("crm_booking_documents")
            .insert({
              booking_id: row.bookingId,
              booking_item_id: null,
              kind: "invoice",
              file_name: row.fileName,
              mime_type: "application/pdf",
              storage_path: row.path,
              visible_to_client: row.visibleToClient,
            })
            .select("id")
            .single();
          if (error || !data?.id) dbFail(error || { message: "insert" }, "Le PDF n’a pas pu être déposé dans les pièces.");
          return String(data.id);
        },
      }),
  };
}

export async function mb3mPieceLinksFor(transactionIds: string[], options?: { preview?: boolean }) {
  const links = new Map<string, { text: string; href: string | null }>();
  const ids = [...new Set(transactionIds.filter(Boolean))];
  if (!ids.length) return links;
  const admin = createServiceClient();
  let query = admin
    .from("crm_mb3m_pieces")
    .select("booking_id, kind, piece_number, document_id, transaction_ids, printed_at")
    .eq("realm", mb3mRealm())
    .overlaps("transaction_ids", ids);
  if (!options?.preview) query = query.not("printed_at", "is", null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const pieces = ((data || []) as {
    booking_id: string | null;
    kind: string | null;
    piece_number: string | null;
    document_id: string | null;
    transaction_ids: string[] | null;
    printed_at: string | null;
  }[]).sort((left, right) => Number(Boolean(left.printed_at)) - Number(Boolean(right.printed_at)));
  const documentIds = [...new Set(pieces.map((row) => row.document_id).filter(Boolean))] as string[];
  const paths = new Map<string, string>();
  if (documentIds.length) {
    const { data: documents, error: documentError } = await admin
      .from("crm_booking_documents")
      .select("id, storage_path")
      .in("id", documentIds);
    if (documentError) throw new Error(documentError.message);
    for (const document of (documents || []) as { id: string; storage_path: string | null }[]) {
      if (document.storage_path) paths.set(document.id, document.storage_path);
    }
  }
  for (const piece of pieces) {
    const number = (piece.piece_number || "").trim();
    if (!number) continue;
    const issued = Boolean(piece.printed_at);
    const path = piece.document_id ? paths.get(piece.document_id) : "";
    const href = issued && path ? mb3mFactureHref(path, number) : null;
    const link = mb3mLedgerMention({
      kind: piece.kind,
      number,
      printed: issued,
      preview: Boolean(options?.preview),
      href,
      bookingId: piece.booking_id,
    });
    if (!link) continue;
    for (const id of piece.transaction_ids || []) {
      if (ids.includes(id)) links.set(id, { text: link.text, href: link.href });
    }
  }
  return links;
}
