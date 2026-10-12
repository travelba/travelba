import type { SupabaseClient } from "@supabase/supabase-js";
import { agencyFeeExtraAmounts, bookingTotalFromItems } from "@/lib/crm/bookings";
import { resolveCountryCode } from "@/lib/crm/countries";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { stayPriceWithExpenses } from "@/lib/crm/ledger-display";
import { stayCurrency } from "@/lib/crm/stay-currency";
import { staffStayFacts } from "@/lib/crm/staff-stay";
import { chargeableTicketingFee, isAutoTicketingExpense } from "@/lib/crm/ticketing-fee";
import { isActiveItem, isLedgerExpenseKind, type CrmBooking, type CrmCustomer } from "@/lib/crm/types";

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
>;
import { defaultPayer, type PayerCompany } from "@/lib/crm/payer";
import {
  Mb3mError,
  mb3mActivityId,
  mb3mAddInvoice,
  mb3mConfigured,
  mb3mPartnerCode,
  mb3mRenderPiece,
  mb3mSaveCompany,
  mb3mSaveFolder,
  mb3mSavePerson,
  type Mb3mAddress,
} from "@/lib/crm/mb3m";

const STALE_MS = 3 * 60 * 1000;

type StayItem = {
  kind?: string | null;
  amount?: number | string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
  start_at?: string | null;
  end_at?: string | null;
  title?: string | null;
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
  } | null;
  company: {
    id: string;
    name: string;
    email: string | null;
    address: Mb3mAddress | null;
  } | null;
  travelers: { firstName: string; lastName: string }[];
  visibleToClient: boolean;
  configured: boolean;
  activityId: number | null;
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
};

export type Mb3mInvoiceResult = {
  number: string;
  documentId: string;
  created: boolean;
  visibleToClient: boolean;
};

type PiecePatch = {
  customerUid?: string | null;
  folderId?: string | null;
  folderUid?: string | null;
  pieceNumber?: string | null;
  pieceUid?: string | null;
  amount?: number | null;
  documentId?: string | null;
};

export type Mb3mInvoiceDeps = {
  now: () => number;
  claim: (bookingId: string, amount: number) => Promise<{ piece: Mb3mStoredPiece; created: boolean }>;
  save: (id: string, patch: PiecePatch) => Promise<void>;
  remove: (id: string) => Promise<void>;
  savePerson: typeof mb3mSavePerson;
  saveCompany: typeof mb3mSaveCompany;
  saveFolder: typeof mb3mSaveFolder;
  addInvoice: typeof mb3mAddInvoice;
  renderPiece: (number: string) => Promise<{ bytes: Buffer }>;
  putPdf: (input: {
    bookingId: string;
    documentId: string | null;
    fileName: string;
    bytes: Buffer;
    visibleToClient: boolean;
  }) => Promise<string>;
};

/** Même chiffre que l’onglet Règlement, à partir des cartes déjà enregistrées. */
export function dossierStayAmount(input: {
  items: StayItem[];
  agencyCommission: boolean;
  status: string;
  travelerCount: number;
}) {
  const items = input.items.map((item) => ({
    ...item,
    amount: item.amount == null || item.amount === "" ? null : Number(item.amount),
  }));
  return stayPriceWithExpenses({
    stayTotal: bookingTotalFromItems(items),
    agencyCommission: input.agencyCommission,
    expenses: items
      .filter((item) => isActiveItem(item) && isLedgerExpenseKind(item.kind))
      .map((item) => ({ amount: item.amount, agencyFee: !isAutoTicketingExpense(item) })),
    extras: agencyFeeExtraAmounts(items),
    ticketingFee: chargeableTicketingFee({
      items,
      status: input.status,
      travelerCount: input.travelerCount,
    }),
  });
}

function blank(value: string | null | undefined) {
  const text = (value || "").trim();
  return text || null;
}

function addressOf(
  name: string,
  line: string | null | undefined,
  postal: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined
): Mb3mAddress | null {
  const line1 = (line || "").trim();
  const postalCode = (postal || "").trim();
  const cityName = (city || "").trim();
  if (!line1 || !postalCode || !cityName) return null;
  return {
    name,
    line1,
    postalCode,
    city: cityName,
    countryCode: resolveCountryCode(country) || undefined,
  };
}

function personAddress(customer: PayerCustomer, name: string) {
  return (
    addressOf(
      name,
      customer.billing_address_line,
      customer.billing_postal_code,
      customer.billing_city,
      customer.billing_country
    ) || addressOf(name, customer.address_line, customer.postal_code, customer.city, customer.country)
  );
}

export function mb3mInvoiceBlocker(ctx: Mb3mInvoiceContext) {
  if (!ctx.configured) return "L’accès MB3M n’est pas configuré.";
  if (!ctx.activityId) return "L’activité MB3M n’est pas configurée.";
  if (ctx.currency !== "EUR") return "Le séjour n’est pas en euros.";
  if (!(ctx.amount > 0)) return "Saisissez le prix du séjour avant de facturer.";
  if (!ctx.dateStart || !ctx.dateEnd) return "Les dates du séjour manquent.";
  if (ctx.dateEnd < ctx.dateStart) return "Les dates du séjour sont inversées.";
  if (ctx.payerKind === "company") {
    if (!ctx.company?.name) return "La raison sociale est incomplète.";
    if (!ctx.company.address) return "L’adresse de facturation est incomplète.";
    return null;
  }
  if (!ctx.person?.firstName || !ctx.person.lastName) return "Le nom du client est incomplet.";
  if (!ctx.person.address) return "L’adresse de facturation est incomplète.";
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
  return {
    bookingId: input.booking.id,
    reference: input.booking.reference,
    title: (input.booking.title || "").trim().slice(0, 120) || input.booking.reference,
    currency: stayCurrency(input.booking.currency),
    amount: dossierStayAmount({
      items: input.items,
      agencyCommission: input.booking.agency_commission === true,
      status: input.booking.status,
      travelerCount: input.travelers.length,
    }),
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
        }
      : null,
    company: company
      ? {
          id: company.id,
          name: companyName,
          email: blank(company.billing_email),
          address: addressOf(
            companyName || "Société",
            company.billing_address_line,
            company.billing_postal_code,
            company.billing_city,
            company.billing_country
          ),
        }
      : null,
    travelers: namedTravelers,
    visibleToClient: input.booking.visible_to_client === true,
    configured: mb3mConfigured(),
    activityId: mb3mActivityId(),
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

export async function runMb3mInvoice(ctx: Mb3mInvoiceContext, deps: Mb3mInvoiceDeps): Promise<Mb3mInvoiceResult> {
  const { piece, created } = await deps.claim(ctx.bookingId, ctx.amount);
  if (piece.pieceNumber) {
    const documentId = await attachPdf(ctx, deps, piece, piece.pieceNumber);
    return {
      number: piece.pieceNumber,
      documentId,
      created: false,
      visibleToClient: ctx.visibleToClient,
    };
  }
  if (!created) {
    const age = deps.now() - Date.parse(piece.updatedAt);
    if (!Number.isFinite(age) || age < STALE_MS) {
      throw new Mb3mError("Une facture MB3M est déjà en cours pour ce séjour.", 0);
    }
  }
  const blocker = mb3mInvoiceBlocker(ctx);
  if (blocker) {
    if (created) await deps.remove(piece.id);
    throw new Mb3mError(blocker, 0);
  }
  const activityId = ctx.activityId;
  if (!activityId) throw new Mb3mError("L’activité MB3M n’est pas configurée.", 0);

  let customerUid = piece.customerUid;
  if (!customerUid) {
    const saved =
      ctx.payerKind === "company" && ctx.company?.address
        ? await deps.saveCompany({
            partnerId: mb3mPartnerCode(ctx.company.id),
            name: ctx.company.name,
            email: ctx.company.email || undefined,
            address: ctx.company.address,
          })
        : ctx.person?.address
          ? await deps.savePerson({
              partnerId: mb3mPartnerCode(ctx.person.id),
              firstName: ctx.person.firstName,
              name: ctx.person.lastName,
              email: ctx.person.email || undefined,
              address: ctx.person.address,
            })
          : null;
    if (!saved?.uid) throw new Mb3mError("La fiche MB3M n’a pas abouti.", -1);
    customerUid = saved.uid;
    await deps.save(piece.id, { customerUid });
  }

  let folderId = piece.folderId;
  let folderUid = piece.folderUid;
  if (!folderId) {
    const folder = await deps.saveFolder({
      customerUid,
      title: ctx.title,
      folderType: "Prestation",
      dateStart: ctx.dateStart || "",
      dateEnd: ctx.dateEnd || "",
      destination: ctx.destination || undefined,
      destinationIso: ctx.destinationIso || undefined,
      codeRef: mb3mPartnerCode(ctx.bookingId),
    });
    folderId = folder.id;
    folderUid = folder.uid || null;
    await deps.save(piece.id, { folderId, folderUid });
  }

  const invoice = await deps.addInvoice({
    folderId,
    customerUid,
    title: ctx.title,
    refCommand: ctx.reference,
    dateStart: ctx.dateStart || undefined,
    dateEnd: ctx.dateEnd || undefined,
    destination: ctx.destination || undefined,
    destinationIso: ctx.destinationIso || undefined,
    lines: [
      {
        label: ctx.title,
        quantity: 1,
        netPriceUnit: ctx.amount,
        netPriceTotal: ctx.amount,
        activityId,
        type: "Standard",
      },
    ],
    travelers: ctx.travelers.map((traveler) => ({ firstName: traveler.firstName, name: traveler.lastName })),
  });
  await deps.save(piece.id, {
    pieceNumber: invoice.number,
    pieceUid: invoice.uid || null,
    amount: ctx.amount,
  });
  const documentId = await attachPdf(ctx, deps, { ...piece, pieceNumber: invoice.number, documentId: null }, invoice.number);
  return { number: invoice.number, documentId, created: true, visibleToClient: ctx.visibleToClient };
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
  };
}

export async function emitMb3mInvoice(supabase: SupabaseClient, bookingId: string): Promise<Mb3mInvoiceResult> {
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
  const ctx = buildMb3mInvoiceContext({
    booking: stay,
    items: (items.data || []) as StayItem[],
    travelers: (travelers.data || []) as { first_name: string | null; last_name: string | null }[],
    payer: (payerResult.data as PayerCustomer | null) || null,
    companies: (companiesResult.data || []) as CompanyRow[],
  });
  return runMb3mInvoice(ctx, supabaseInvoiceDeps(supabase));
}

function supabaseInvoiceDeps(supabase: SupabaseClient): Mb3mInvoiceDeps {
  return {
    now: () => Date.now(),
    claim: async (bookingId, amount) => {
      const inserted = await supabase
        .from("crm_mb3m_pieces")
        .insert({ booking_id: bookingId, kind: "invoice", amount, currency: "EUR" })
        .select("*")
        .maybeSingle();
      if (!inserted.error && inserted.data) {
        return { piece: mapPiece(inserted.data as Record<string, unknown>), created: true };
      }
      if (inserted.error?.code !== "23505") {
        dbFail(inserted.error || { message: "insert" }, "La facture n’a pas pu être enregistrée.");
      }
      const existing = await supabase
        .from("crm_mb3m_pieces")
        .select("*")
        .eq("booking_id", bookingId)
        .eq("kind", "invoice")
        .maybeSingle();
      if (existing.error || !existing.data) {
        dbFail(existing.error || { message: "select" }, "La facture n’a pas pu être enregistrée.");
      }
      return { piece: mapPiece(existing.data as Record<string, unknown>), created: false };
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
