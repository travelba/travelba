import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { billingIdentifierLines } from "@/lib/crm/billing";
import { businessOutsideEu, displayCountry } from "@/lib/crm/countries";
import { pieceEstRetiree, withPieceArchive, withoutPieceArchive } from "@/lib/crm/dossier-piece";
import { uploadCrmFile } from "@/lib/crm/files";
import { isUuid } from "@/lib/crm/ids";
import type { InvoiceWire } from "@/lib/crm/invoice-document";
import { formatDateFr } from "@/lib/crm/money";
import { missingDbColumn, queryWithOptionalColumn } from "@/lib/crm/optional-column";
import { staffStayFacts } from "@/lib/crm/staff-stay";
import { stayDiscountEuros } from "@/lib/crm/displayed-stay";
import { isActiveItem } from "@/lib/crm/types";
import type { SaleLedgerRow } from "@/lib/crm/trip-costs";
import { renderGroupedInvoicePdf } from "@/lib/crm/grouped-invoice-pdf";
import {
  assertGroupedSelection,
  composeGroupedSections,
  GROUPED_INVOICE_KIND,
  groupedInvoiceDocument,
  nextGroupedNumber,
  payerKey,
  payerRefOf,
  type GroupedBookingRow,
  type GroupedInvoiceDocument,
  type GroupedSectionInput,
} from "@/lib/crm/grouped-invoice";

export const GROUPED_INVOICE_MIGRATION = "supabase/migrations/20261119180000_crm_grouped_invoices.sql";

export const GROUPED_INVOICE_SETUP =
  `La facture groupée n’est pas encore en place. La migration ${GROUPED_INVOICE_MIGRATION} est à jouer à la main.`;

/** Le CRM ne demande aucune impression, validation ou finalisation MB3M pour ce document. */
export const GROUPED_INVOICE_MB3M_CALLS: readonly string[] = [];

export type GroupedActor = { staffId: string | null; name: string };

type DbError = { code?: string | null; message?: string | null } | null;

type BookingRow = GroupedBookingRow & {
  title: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  agency_fee_rate: number | string | null;
  remise_type: string | null;
  remise_value: number | string | null;
  total_amount: number | string | null;
  fee_mode: string | null;
  status: string | null;
};

type ItemRow = {
  id: string;
  booking_id: string;
  kind: string | null;
  title: string | null;
  amount: number | string | null;
  start_at: string | null;
  end_at: string | null;
  details: Record<string, unknown> | null;
  lifecycle: string | null;
  include_in_ledger: boolean | null;
};

type TravelerRow = {
  booking_id: string;
  first_name: string | null;
  last_name: string | null;
};

type CompanyRow = {
  id: string;
  company_name: string | null;
  siret: string | null;
  vat_number: string | null;
  registration_number?: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
};

type PersonRow = {
  first_name: string | null;
  last_name: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
};

export type GroupedResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function fail(status: number, error: string): GroupedResult<never> {
  return { ok: false, status, error };
}

function missingGroupedTable(error: DbError) {
  if (!error) return false;
  const code = error.code || "";
  if (code === "42P01" || code === "PGRST205") return true;
  const message = (error.message || "").toLowerCase();
  return message.includes("crm_grouped_invoices") && (message.includes("does not exist") || message.includes("schema cache"));
}

export function asError(error: DbError, fallback: string) {
  if (missingGroupedTable(error)) return GROUPED_INVOICE_SETUP;
  const detail = (error?.message || "").replace(/\s+/g, " ").trim();
  if (!detail || detail === fallback) return fallback;
  return `${fallback} ${detail}`;
}

function addressLines(parts: (string | null | undefined)[]) {
  return parts.map((part) => (part || "").trim()).filter(Boolean);
}

function travelerName(row: TravelerRow) {
  return [row.first_name, row.last_name].map((part) => (part || "").trim()).filter(Boolean).join(" ");
}

function datesOf(booking: BookingRow) {
  return [booking.start_date ? formatDateFr(booking.start_date) : "", booking.end_date ? formatDateFr(booking.end_date) : ""]
    .filter((part) => part && part !== "—")
    .join(" — ");
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadWire(): Promise<InvoiceWire | null> {
  try {
    const { loadAgencyEurWire } = await import("./revolut");
    const wire = await loadAgencyEurWire();
    if (!wire?.iban) return null;
    return { iban: wire.iban, bic: wire.bic, holder: wire.accountHolder, source: "revolut" };
  } catch {
    return null;
  }
}

async function loadDueDays(admin: SupabaseClient) {
  const { data, error } = await admin.from("crm_invoice_settings").select("due_days, iban, bic, account_holder").eq("id", 1).maybeSingle();
  if (error || !data) return { dueDays: null as number | null, wire: null as InvoiceWire | null };
  const row = data as { due_days?: number | null; iban?: string | null; bic?: string | null; account_holder?: string | null };
  const wire = row.iban
    ? { iban: row.iban, bic: row.bic || "", holder: row.account_holder || "", source: "reglage" as const }
    : null;
  return { dueDays: row.due_days == null ? null : Number(row.due_days), wire };
}

const BOOKING_COLUMNS =
  "id, reference, title, destination, start_date, end_date, customer_id, billing_customer_id, payer_kind, billing_company_id, status, archived_at, currency, agency_commission, agency_fee_rate, remise_type, remise_value, total_amount, fee_mode";

export async function loadGroupedDesk(admin: SupabaseClient, customerId: string): Promise<GroupedResult<{
  payers: {
    key: string;
    kind: "company" | "personal";
    companyId: string | null;
    label: string;
    dossiers: { id: string; reference: string; title: string; dates: string; commission: boolean }[];
  }[];
  factures: {
    id: string;
    number: string;
    total: number;
    paid: number;
    balance: number;
    removed: boolean;
    createdAt: string;
    fichier: string;
    dossiers: { id: string; reference: string }[];
  }[];
  avertissement: string | null;
}>> {
  const [{ data: owned, error: ownedError }, { data: billed, error: billedError }, companies, person] = await Promise.all([
    admin.from("crm_bookings").select(BOOKING_COLUMNS).eq("customer_id", customerId),
    admin.from("crm_bookings").select(BOOKING_COLUMNS).eq("billing_customer_id", customerId),
    loadCompanies(admin, customerId),
    admin
      .from("crm_customers")
      .select("first_name, last_name")
      .eq("id", customerId)
      .maybeSingle(),
  ]);
  if (ownedError) return fail(400, asError(ownedError, "Les dossiers ne sont pas lisibles."));
  if (billedError) return fail(400, asError(billedError, "Les dossiers ne sont pas lisibles."));
  if (!person.data) return fail(404, "Client introuvable.");
  const byId = new Map<string, BookingRow>();
  for (const row of [...((owned || []) as BookingRow[]), ...((billed || []) as BookingRow[])]) byId.set(row.id, row);
  const open = [...byId.values()].filter((row) => !row.archived_at && row.status !== "cancelled");
  const companyName = new Map(companies.map((row) => [row.id, (row.company_name || "").trim() || "Société"]));
  const groups = new Map<string, { kind: "company" | "personal"; companyId: string | null; label: string; dossiers: BookingRow[] }>();
  for (const booking of open) {
    const payer = payerRefOf(booking);
    const key = payerKey(payer);
    const label = payer.kind === "company" ? companyName.get(payer.companyId || "") || "Société" : "Particulier";
    const group = groups.get(key) || { kind: payer.kind, companyId: payer.companyId, label, dossiers: [] };
    group.dossiers.push(booking);
    groups.set(key, group);
  }
  const payers = [...groups.entries()]
    .map(([key, group]) => ({
      key,
      kind: group.kind,
      companyId: group.companyId,
      label: group.label,
      dossiers: group.dossiers
        .sort((left, right) => (right.start_date || "").localeCompare(left.start_date || "") || left.reference.localeCompare(right.reference))
        .map((booking) => ({
          id: booking.id,
          reference: booking.reference,
          title: (booking.title || "").trim() || (booking.destination || "").trim() || booking.reference,
          dates: datesOf(booking),
          commission: booking.agency_commission === true,
        })),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "fr"));
  const invoices = await admin
    .from("crm_grouped_invoices")
    .select("id, number, total_amount, paid_amount, balance_amount, storage_path, removed_at, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (invoices.error) {
    if (missingGroupedTable(invoices.error)) {
      return { ok: true, data: { payers, factures: [], avertissement: GROUPED_INVOICE_SETUP } };
    }
    return fail(400, "Les factures groupées ne sont pas lisibles.");
  }
  const ids = ((invoices.data || []) as { id: string }[]).map((row) => row.id);
  const links = ids.length
    ? await admin.from("crm_grouped_invoice_bookings").select("grouped_invoice_id, booking_id").in("grouped_invoice_id", ids)
    : { data: [], error: null };
  if (links.error) return fail(400, asError(links.error, "Les dossiers de la facture ne sont pas lisibles."));
  const linkRows = (links.data || []) as { grouped_invoice_id: string; booking_id: string }[];
  const factures = ((invoices.data || []) as {
    id: string;
    number: string;
    total_amount: number | string;
    paid_amount: number | string;
    balance_amount: number | string;
    storage_path: string;
    removed_at: string | null;
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    number: row.number,
    total: Number(row.total_amount) || 0,
    paid: Number(row.paid_amount) || 0,
    balance: Number(row.balance_amount) || 0,
    removed: Boolean(row.removed_at),
    createdAt: row.created_at,
    fichier: `/api/files?path=${encodeURIComponent(row.storage_path)}`,
    dossiers: linkRows
      .filter((link) => link.grouped_invoice_id === row.id)
      .map((link) => ({
        id: link.booking_id,
        reference: byId.get(link.booking_id)?.reference || "Dossier",
      })),
  }));
  return { ok: true, data: { payers, factures, avertissement: null } };
}

async function loadCompanies(admin: SupabaseClient, customerId: string) {
  const result = await queryWithOptionalColumn(
    (columns) => admin.from("crm_billing_companies").select(columns).eq("customer_id", customerId),
    "id, company_name, siret, vat_number, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country",
    "registration_number"
  );
  if (result.error) return [] as CompanyRow[];
  return (result.data || []) as unknown as CompanyRow[];
}

async function loadBundle(admin: SupabaseClient, customerId: string, bookingIds: string[]) {
  const unique = [...new Set(bookingIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.some((id) => !isUuid(id))) return fail(400, "Dossier invalide.");
  const { data, error } = await admin.from("crm_bookings").select(BOOKING_COLUMNS).in("id", unique);
  if (error) return fail(400, "Les dossiers ne sont pas lisibles.");
  const rows = (data || []) as BookingRow[];
  if (rows.length !== unique.length) return fail(404, "Un dossier est introuvable.");
  const ordered = unique.map((id) => rows.find((row) => row.id === id)!);
  const refusal = assertGroupedSelection(ordered, customerId);
  if (refusal) return fail(400, refusal);
  const [itemsRes, travelersRes, debitsRes, creditsRes, personRes, companies] = await Promise.all([
    admin
      .from("crm_booking_items")
      .select("id, booking_id, kind, title, amount, start_at, end_at, details, lifecycle, include_in_ledger")
      .in("booking_id", unique),
    admin.from("crm_booking_travelers").select("booking_id, first_name, last_name").in("booking_id", unique),
    admin
      .from("crm_transactions")
      .select("id, booking_id, direction, kind, status, currency, amount, label, external_id")
      .in("booking_id", unique)
      .eq("direction", "debit")
      .eq("status", "posted"),
    admin
      .from("crm_transactions")
      .select("booking_id, direction, status, currency, amount, label")
      .in("booking_id", unique)
      .eq("direction", "credit"),
    admin
      .from("crm_customers")
      .select(
        "first_name, last_name, billing_address_line, billing_postal_code, billing_city, billing_country, address_line, postal_code, city, country"
      )
      .eq("id", customerId)
      .maybeSingle(),
    loadCompanies(admin, customerId),
  ]);
  const saleError = itemsRes.error || travelersRes.error || debitsRes.error || creditsRes.error;
  if (saleError) return fail(400, asError(saleError, "Les lignes de vente ne sont pas lisibles."));
  if (!personRes.data) return fail(404, "Client introuvable.");
  return {
    ok: true as const,
    data: {
      bookings: ordered,
      items: (itemsRes.data || []) as ItemRow[],
      travelers: (travelersRes.data || []) as TravelerRow[],
      debits: (debitsRes.data || []) as SaleLedgerRow[],
      credits: (creditsRes.data || []) as {
        booking_id?: string | null;
        direction?: string | null;
        status?: string | null;
        currency?: string | null;
        amount?: number | string | null;
        label?: string | null;
      }[],
      person: personRes.data as PersonRow,
      companies,
    },
  };
}

function billToOf(payerKind: "company" | "personal", company: CompanyRow | null, person: PersonRow) {
  if (payerKind === "company" && company) {
    const place = [company.billing_postal_code, company.billing_city].map((part) => (part || "").trim()).filter(Boolean).join(" ");
    return {
      label: (company.company_name || "").trim() || "Société",
      lines: addressLines([
        company.company_name,
        company.billing_address_line,
        place,
        displayCountry(company.billing_country),
        ...billingIdentifierLines(company),
      ]),
      outsideEu: businessOutsideEu(company.billing_country),
    };
  }
  const name = [person.first_name, person.last_name].map((part) => (part || "").trim()).filter(Boolean).join(" ");
  const place = [person.billing_postal_code || person.postal_code, person.billing_city || person.city]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");
  return {
    label: name || "Particulier",
    lines: addressLines([
      name,
      person.billing_address_line || person.address_line,
      place,
      displayCountry(person.billing_country || person.country),
    ]),
    outsideEu: false,
  };
}

export async function previewGroupedInvoice(
  admin: SupabaseClient,
  customerId: string,
  bookingIds: string[],
  now = new Date()
): Promise<
  GroupedResult<{
    document: GroupedInvoiceDocument;
    payerKind: "company" | "personal";
    companyId: string | null;
    sections: GroupedSectionInput[];
    dueDays: number | null;
    wire: InvoiceWire | null;
    outsideEu: boolean;
  }>
> {
  const loaded = await loadBundle(admin, customerId, bookingIds);
  if (!loaded.ok) return loaded;
  const bundle = loaded.data;
  const payer = payerRefOf(bundle.bookings[0]);
  const company = payer.companyId ? bundle.companies.find((row) => row.id === payer.companyId) || null : null;
  const bill = billToOf(payer.kind, company, bundle.person);
  const stays = bundle.bookings.map((booking) => {
    const items = bundle.items.filter((item) => item.booking_id === booking.id && isActiveItem(item));
    const travelers = bundle.travelers.filter((row) => row.booking_id === booking.id);
    const facts = staffStayFacts({
      items,
      destination: booking.destination,
      startDate: booking.start_date,
      endDate: booking.end_date,
    });
    const rate = booking.agency_fee_rate == null || booking.agency_fee_rate === "" ? undefined : Number(booking.agency_fee_rate);
    return {
      bookingId: booking.id,
      reference: booking.reference,
      destination: facts.placeLine.trim() || (booking.title || "").trim() || booking.reference,
      dates: facts.dates || datesOf(booking),
      travelers: travelers.map(travelerName).filter(Boolean),
      commission: booking.agency_commission === true,
      debits: bundle.debits,
      credits: bundle.credits,
      discountEuros: stayDiscountEuros(
        {
          status: booking.status || "confirmed",
          total_amount: booking.total_amount,
          agency_commission: booking.agency_commission,
          fee_mode: booking.fee_mode,
          remise_type: booking.remise_type,
          remise_value: booking.remise_value,
        },
        items,
        travelers.length,
        rate
      ),
    };
  });
  const composed = composeGroupedSections(stays);
  if ("error" in composed) return fail(400, composed.error);
  const settings = await loadDueDays(admin);
  const revolut = await loadWire();
  const wire = revolut || settings.wire;
  const document = groupedInvoiceDocument({
    number: "",
    billTo: bill.lines,
    payerLabel: bill.label,
    sections: composed.sections,
    now,
    dueDays: settings.dueDays,
    wire,
    outsideEu: bill.outsideEu,
  });
  return {
    ok: true,
    data: {
      document,
      payerKind: payer.kind,
      companyId: payer.companyId,
      sections: composed.sections,
      dueDays: settings.dueDays,
      wire,
      outsideEu: bill.outsideEu,
    },
  };
}

async function existingNumbers(admin: SupabaseClient, year: number) {
  const { data, error } = await admin
    .from("crm_grouped_invoices")
    .select("number")
    .like("number", `FG-${year}-%`);
  if (error) throw new Error(missingGroupedTable(error) ? GROUPED_INVOICE_SETUP : "Le numéro de facture n’est pas lisible.");
  return ((data || []) as { number: string }[]).map((row) => row.number);
}

function documentRow(bookingId: string, invoiceId: string, fileName: string, storagePath: string) {
  return {
    booking_id: bookingId,
    booking_item_id: null,
    kind: GROUPED_INVOICE_KIND,
    file_name: fileName,
    mime_type: "application/pdf",
    storage_path: storagePath,
    visible_to_client: false,
    extracted: { facture_groupee_id: invoiceId },
  };
}

async function insertDocument(admin: SupabaseClient, row: Record<string, unknown>) {
  const first = await admin.from("crm_booking_documents").insert(row).select("id").single();
  if (first.error && missingDbColumn(first.error, "extracted")) {
    const next = { ...row };
    delete next.extracted;
    return admin.from("crm_booking_documents").insert(next).select("id").single();
  }
  return first;
}

async function attachDocuments(
  admin: SupabaseClient,
  invoiceId: string,
  bookingIds: string[],
  fileName: string,
  storagePath: string
) {
  const ids: { bookingId: string; documentId: string }[] = [];
  for (const bookingId of bookingIds) {
    const inserted = await insertDocument(admin, documentRow(bookingId, invoiceId, fileName, storagePath));
    if (inserted.error || !inserted.data) {
      return { ok: false as const, error: "Le justificatif n’a pas été déposé sur un dossier." };
    }
    ids.push({ bookingId, documentId: (inserted.data as { id: string }).id });
  }
  const linked = await admin.from("crm_grouped_invoice_bookings").insert(
    ids.map((row) => ({
      grouped_invoice_id: invoiceId,
      booking_id: row.bookingId,
      document_id: row.documentId,
    }))
  );
  if (linked.error) return { ok: false as const, error: asError(linked.error, "Le lien entre la facture et les dossiers n’a pas été écrit.") };
  return { ok: true as const };
}

export async function generateGroupedInvoice(
  admin: SupabaseClient,
  customerId: string,
  bookingIds: string[],
  actor: GroupedActor,
  invoiceId?: string | null
): Promise<GroupedResult<{ id: string; number: string; fichier: string; document: GroupedInvoiceDocument }>> {
  const preview = await previewGroupedInvoice(admin, customerId, bookingIds);
  if (!preview.ok) return preview;
  const now = new Date();
  let id = (invoiceId || "").trim();
  let number = "";
  let storagePath = "";
  if (id) {
    if (!isUuid(id)) return fail(400, "Facture introuvable.");
    const existing = await admin
      .from("crm_grouped_invoices")
      .select("id, number, storage_path, customer_id")
      .eq("id", id)
      .maybeSingle();
    if (existing.error) return fail(400, asError(existing.error, "La facture groupée n’est pas lisible."));
    const row = existing.data as { id: string; number: string; storage_path: string; customer_id: string } | null;
    if (!row || row.customer_id !== customerId) return fail(404, "Facture introuvable.");
    number = row.number;
    storagePath = row.storage_path;
  } else {
    id = randomUUID();
    try {
      number = nextGroupedNumber(await existingNumbers(admin, now.getFullYear()), now.getFullYear());
    } catch (error) {
      return fail(400, error instanceof Error ? error.message : GROUPED_INVOICE_SETUP);
    }
    storagePath = `customers/${customerId}/factures-groupees/${id}.pdf`;
  }
  const document = groupedInvoiceDocument({
    number,
    billTo: preview.data.document.billTo,
    payerLabel: preview.data.document.payerLabel,
    sections: preview.data.sections,
    now,
    dueDays: preview.data.dueDays,
    wire: preview.data.wire,
    outsideEu: preview.data.outsideEu,
  });
  const pdf = await renderGroupedInvoicePdf(document);
  const bytes = Buffer.from(pdf);
  try {
    await uploadCrmFile(storagePath, bytes, "application/pdf", { upsert: true });
  } catch {
    return fail(400, "Le PDF n’a pas été enregistré.");
  }
  const hash = sha256(bytes);
  const payload = {
    customer_id: customerId,
    payer_kind: preview.data.payerKind,
    billing_company_id: preview.data.companyId,
    number,
    storage_path: storagePath,
    content_sha256: hash,
    total_amount: document.total,
    paid_amount: document.paid,
    balance_amount: document.balance,
    currency: "EUR",
    removed_at: null,
    updated_at: now.toISOString(),
  };
  if (invoiceId) {
    const updated = await admin.from("crm_grouped_invoices").update(payload).eq("id", id).eq("customer_id", customerId);
    if (updated.error) return fail(400, asError(updated.error, "La facture groupée n’a pas été mise à jour."));
    const synced = await syncDocuments(admin, id, bookingIds, document.filename, storagePath);
    if (!synced.ok) return fail(400, synced.error);
  } else {
    const inserted = await admin.from("crm_grouped_invoices").insert({
      id,
      ...payload,
      created_by: actor.staffId,
      created_at: now.toISOString(),
    });
    if (inserted.error) return fail(400, asError(inserted.error, "La facture groupée n’a pas été enregistrée."));
    const attached = await attachDocuments(admin, id, bookingIds, document.filename, storagePath);
    if (!attached.ok) {
      await admin.from("crm_grouped_invoices").update({ removed_at: now.toISOString() }).eq("id", id);
      return fail(400, attached.error);
    }
  }
  await recordAgencyJournal({
    staffId: actor.staffId,
    action: invoiceId ? "update" : "create",
    entityType: "client",
    entityId: customerId,
    summary: `Facture pro forma groupée ${number} ${invoiceId ? "mise à jour" : "préparée"} par ${actor.name}.`.slice(0, 500),
    path: `/admin/clients/${customerId}`,
    diff: { numero: number, dossiers: document.sections.map((section) => section.reference), envoye: false },
  });
  return {
    ok: true,
    data: {
      id,
      number,
      fichier: `/api/files?path=${encodeURIComponent(storagePath)}`,
      document,
    },
  };
}

async function syncDocuments(
  admin: SupabaseClient,
  invoiceId: string,
  bookingIds: string[],
  fileName: string,
  storagePath: string
) {
  const links = await admin
    .from("crm_grouped_invoice_bookings")
    .select("booking_id, document_id")
    .eq("grouped_invoice_id", invoiceId);
  if (links.error) return { ok: false as const, error: asError(links.error, "Les dossiers liés ne sont pas lisibles.") };
  const rows = (links.data || []) as { booking_id: string; document_id: string | null }[];
  const wanted = new Set(bookingIds);
  const now = new Date().toISOString();
  for (const row of rows) {
    if (wanted.has(row.booking_id)) continue;
    if (row.document_id) await retireDocument(admin, row.document_id, now);
    await admin.from("crm_grouped_invoice_bookings").delete().eq("grouped_invoice_id", invoiceId).eq("booking_id", row.booking_id);
  }
  for (const bookingId of bookingIds) {
    const link = rows.find((row) => row.booking_id === bookingId);
    if (link?.document_id) {
      const current = await admin.from("crm_booking_documents").select("extracted").eq("id", link.document_id).maybeSingle();
      const extracted = withoutPieceArchive((current.data as { extracted?: unknown } | null)?.extracted) || {};
      extracted.facture_groupee_id = invoiceId;
      const updated = await admin
        .from("crm_booking_documents")
        .update({
          file_name: fileName,
          storage_path: storagePath,
          mime_type: "application/pdf",
          kind: GROUPED_INVOICE_KIND,
          visible_to_client: false,
          extracted,
        })
        .eq("id", link.document_id);
      if (updated.error && missingDbColumn(updated.error, "extracted")) {
        await admin
          .from("crm_booking_documents")
          .update({
            file_name: fileName,
            storage_path: storagePath,
            visible_to_client: false,
            kind: GROUPED_INVOICE_KIND,
          })
          .eq("id", link.document_id);
      }
      continue;
    }
    const inserted = await insertDocument(admin, documentRow(bookingId, invoiceId, fileName, storagePath));
    if (inserted.error || !inserted.data) return { ok: false as const, error: "Le justificatif n’a pas été déposé sur un dossier." };
    const linked = await admin.from("crm_grouped_invoice_bookings").upsert({
      grouped_invoice_id: invoiceId,
      booking_id: bookingId,
      document_id: (inserted.data as { id: string }).id,
    });
    if (linked.error) return { ok: false as const, error: asError(linked.error, "Le lien de la facture n’a pas été écrit.") };
  }
  return { ok: true as const };
}

async function retireDocument(admin: SupabaseClient, documentId: string, now: string) {
  const current = await admin
    .from("crm_booking_documents")
    .select("extracted, visible_to_client")
    .eq("id", documentId)
    .maybeSingle();
  const row = current.data as { extracted?: unknown; visible_to_client?: boolean | null } | null;
  if (!row || pieceEstRetiree(row.extracted)) return;
  const extracted = withPieceArchive(row.extracted, { retiree_at: now, visible_avant: row.visible_to_client === true });
  await admin.from("crm_booking_documents").update({ extracted, visible_to_client: false }).eq("id", documentId);
}

export async function removeGroupedInvoice(
  admin: SupabaseClient,
  customerId: string,
  invoiceId: string,
  actor: GroupedActor
): Promise<GroupedResult<{ id: string; number: string }>> {
  if (!isUuid(invoiceId)) return fail(400, "Facture introuvable.");
  const existing = await admin
    .from("crm_grouped_invoices")
    .select("id, number, customer_id, removed_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (existing.error) return fail(400, asError(existing.error, "La facture groupée n’est pas lisible."));
  const row = existing.data as { id: string; number: string; customer_id: string; removed_at: string | null } | null;
  if (!row || row.customer_id !== customerId) return fail(404, "Facture introuvable.");
  if (row.removed_at) return { ok: true, data: { id: row.id, number: row.number } };
  const now = new Date().toISOString();
  const links = await admin.from("crm_grouped_invoice_bookings").select("document_id").eq("grouped_invoice_id", invoiceId);
  if (links.error) return fail(400, asError(links.error, "Les justificatifs ne sont pas lisibles."));
  for (const link of (links.data || []) as { document_id: string | null }[]) {
    if (link.document_id) await retireDocument(admin, link.document_id, now);
  }
  const updated = await admin.from("crm_grouped_invoices").update({ removed_at: now, updated_at: now }).eq("id", invoiceId);
  if (updated.error) return fail(400, asError(updated.error, "La facture groupée n’a pas été retirée."));
  await recordAgencyJournal({
    staffId: actor.staffId,
    action: "delete",
    entityType: "client",
    entityId: customerId,
    summary: `Facture pro forma groupée ${row.number} retirée par ${actor.name}. Le fichier reste.`.slice(0, 500),
    path: `/admin/clients/${customerId}`,
    diff: { numero: row.number },
  });
  return { ok: true, data: { id: row.id, number: row.number } };
}

export async function restoreGroupedInvoice(
  admin: SupabaseClient,
  customerId: string,
  invoiceId: string,
  actor: GroupedActor
): Promise<GroupedResult<{ id: string; number: string }>> {
  if (!isUuid(invoiceId)) return fail(400, "Facture introuvable.");
  const existing = await admin
    .from("crm_grouped_invoices")
    .select("id, number, customer_id, removed_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (existing.error) return fail(400, asError(existing.error, "La facture groupée n’est pas lisible."));
  const row = existing.data as { id: string; number: string; customer_id: string; removed_at: string | null } | null;
  if (!row || row.customer_id !== customerId) return fail(404, "Facture introuvable.");
  const links = await admin.from("crm_grouped_invoice_bookings").select("document_id").eq("grouped_invoice_id", invoiceId);
  if (links.error) return fail(400, asError(links.error, "Les justificatifs ne sont pas lisibles."));
  for (const link of (links.data || []) as { document_id: string | null }[]) {
    if (!link.document_id) continue;
    const current = await admin.from("crm_booking_documents").select("extracted").eq("id", link.document_id).maybeSingle();
    const extracted = withoutPieceArchive((current.data as { extracted?: unknown } | null)?.extracted);
    await admin
      .from("crm_booking_documents")
      .update({ extracted, visible_to_client: false })
      .eq("id", link.document_id);
  }
  const now = new Date().toISOString();
  const updated = await admin.from("crm_grouped_invoices").update({ removed_at: null, updated_at: now }).eq("id", invoiceId);
  if (updated.error) return fail(400, asError(updated.error, "La facture groupée n’a pas été restaurée."));
  await recordAgencyJournal({
    staffId: actor.staffId,
    action: "update",
    entityType: "client",
    entityId: customerId,
    summary: `Facture pro forma groupée ${row.number} restaurée par ${actor.name}. Elle reste masquée.`.slice(0, 500),
    path: `/admin/clients/${customerId}`,
    diff: { numero: row.number },
  });
  return { ok: true, data: { id: row.id, number: row.number } };
}

export async function factureGroupee(args: {
  client_id?: string;
  dossiers?: string[];
  facture_id?: string;
  action?: string;
  confirmer?: boolean;
}) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { currentMcpAccess } = await import("@/lib/crm/mcp-auth");
  const { McpWriteError } = await import("@/lib/crm/mcp-write");
  const clientId = (args.client_id || "").trim();
  if (!isUuid(clientId)) throw new McpWriteError("client_id est l’identifiant de la fiche.");
  const action = args.action === "retirer" || args.action === "restaurer" ? args.action : "generer";
  const access = currentMcpAccess();
  const actor = { staffId: access.staff?.id || null, name: access.staff?.name || "Jeton MCP" };
  const admin = createServiceClient();
  if (action !== "generer") {
    const factureId = (args.facture_id || "").trim();
    if (!isUuid(factureId)) throw new McpWriteError("facture_id est l’identifiant de la facture groupée.");
    if (args.confirmer !== true) {
      return {
        apercu: true,
        ecrit: false,
        envoye: false,
        pro_forma: true,
        action,
        message:
          action === "retirer"
            ? "Le retrait masque les justificatifs. Le fichier reste, on peut restaurer."
            : "La restauration remet les justificatifs, toujours masqués. Aucun message.",
      };
    }
    const result =
      action === "retirer"
        ? await removeGroupedInvoice(admin, clientId, factureId, actor)
        : await restoreGroupedInvoice(admin, clientId, factureId, actor);
    if (!result.ok) throw new McpWriteError(result.error);
    return { ok: true, ecrit: true, envoye: false, pro_forma: true, numero: result.data.number };
  }
  const tokens = (args.dossiers || []).map((value) => value.trim()).filter(Boolean);
  const ids: string[] = [];
  for (const token of tokens) {
    if (isUuid(token)) {
      ids.push(token);
      continue;
    }
    const found = await admin.from("crm_bookings").select("id").eq("reference", token).maybeSingle();
    const row = found.data as { id: string } | null;
    if (found.error || !row) throw new McpWriteError(`Dossier ${token} introuvable.`);
    ids.push(row.id);
  }
  const preview = await previewGroupedInvoice(admin, clientId, ids);
  if (!preview.ok) throw new McpWriteError(preview.error);
  if (args.confirmer !== true) return groupedPublicPreview(preview.data.document);
  const created = await generateGroupedInvoice(admin, clientId, ids, actor, args.facture_id);
  if (!created.ok) throw new McpWriteError(created.error);
  return {
    ok: true,
    ecrit: true,
    envoye: false,
    pro_forma: true,
    numero: created.data.number,
    fichier: created.data.fichier,
    total: created.data.document.total,
    paye: created.data.document.paid,
    reste: created.data.document.balance,
    dossiers: created.data.document.sections.map((section) => section.reference),
  };
}

export function groupedPublicPreview(document: GroupedInvoiceDocument) {
  return {
    apercu: true,
    ecrit: false,
    envoye: false,
    pro_forma: true,
    numero: document.number || null,
    payeur: document.payerLabel,
    sections: document.sections.map((section) => ({
      reference: section.reference,
      destination: section.destination,
      dates: section.dates,
      voyageurs: section.travelers,
      commission: section.commission,
      lignes: section.lines.map((line) => ({ libelle: line.label, montant: line.amount })),
      sous_total: section.subtotal,
      paye: section.paid,
      reste: section.balance,
    })),
    total: document.total,
    paye: document.paid,
    reste: document.balance,
    message: "Pro forma. Le PDF reste masqué sur chaque dossier. Aucun e-mail, aucun WhatsApp.",
  };
}
