import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCountryCode } from "@/lib/crm/countries";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import {
  mb3mAccountBalance,
  mb3mAccountBuckets,
  mb3mAccountLines,
  mb3mAccountSyncAllowed,
  mb3mAccountsSplit,
  mb3mChargeKind,
  mb3mFactureHref,
  mb3mFactureMention,
  mb3mInvoiceAction,
  mb3mStaySpan,
  type Mb3mAccountLine,
  type Mb3mLedgerRow,
} from "@/lib/crm/mb3m-account";
import {
  Mb3mError,
  mb3mActivityId,
  mb3mAddInvoice,
  mb3mCancelInvoice,
  mb3mFindPiece,
  mb3mPartnerCode,
  mb3mRealm,
  mb3mRenderPiece,
  mb3mSaveCompany,
  mb3mSaveFolder,
  mb3mSavePerson,
  type Mb3mAddress,
} from "@/lib/crm/mb3m";
import { isAutoTicketingExpense } from "@/lib/crm/ticketing-fee";
import { createServiceClient } from "@/lib/supabase/admin";

type InvoiceRow = {
  id: string;
  customer_uid: string | null;
  folder_id: string | null;
  folder_uid: string | null;
  piece_number: string | null;
  piece_uid: string | null;
  printed_at: string | null;
  storage_path: string | null;
  billing_company_id: string | null;
};

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
};

type CompanyRow = {
  id: string;
  company_name: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  funding: string | null;
  sort_order: number | null;
};

export type Mb3mFactureLink = { text: string; href: string | null };

function addressOf(
  name: string,
  line: string | null,
  postal: string | null,
  city: string | null,
  country: string | null
): Mb3mAddress | null {
  const line1 = (line || "").trim();
  const postalCode = (postal || "").trim();
  const cityName = (city || "").trim();
  if (!line1 || !postalCode || !cityName) return null;
  const countryCode = resolveCountryCode(country);
  return { name, line1, postalCode, city: cityName, ...(countryCode ? { countryCode } : {}) };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function dbMessage(error: { message?: string } | null) {
  return error?.message || "Lecture impossible.";
}

export async function syncMb3mAccountQuiet(customerId: string | null | undefined) {
  if (!customerId || !mb3mAccountSyncAllowed(customerId)) return;
  try {
    await syncMb3mAccount(customerId);
  } catch (error) {
    console.error("mb3m", error instanceof Error ? error.message : "sync");
  }
}

export async function syncMb3mAccount(customerId: string) {
  if (!mb3mAccountSyncAllowed(customerId)) return;
  const admin = createServiceClient();
  const customer = await loadCustomer(admin, customerId);
  if (!customer) return;
  const companies = await loadCompanies(admin, customerId);
  const rows = await attachChargeKinds(admin, await loadRows(admin, customerId));
  const split = mb3mAccountsSplit(companies);
  for (const bucket of mb3mAccountBuckets(companies, rows)) {
    try {
      await syncBucket(admin, customer, companies, rows, bucket.companyId, split);
    } catch (error) {
      console.error("mb3m", error instanceof Error ? error.message : "sync");
    }
  }
}

export async function mb3mFactureLinksFor(transactionIds: string[]): Promise<Map<string, Mb3mFactureLink>> {
  const links = new Map<string, Mb3mFactureLink>();
  const ids = [...new Set(transactionIds.filter(Boolean))];
  if (!ids.length) return links;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_mb3m_account_lines")
    .select("transaction_id, invoice_id")
    .in("transaction_id", ids);
  if (error) throw new Error(dbMessage(error));
  const lineRows = (data || []) as { transaction_id: string; invoice_id: string }[];
  const invoiceIds = [...new Set(lineRows.map((row) => row.invoice_id))];
  if (!invoiceIds.length) return links;
  const { data: invoices, error: invoiceError } = await admin
    .from("crm_mb3m_account_invoices")
    .select("id, piece_number, printed_at, storage_path")
    .in("id", invoiceIds)
    .eq("realm", mb3mRealm());
  if (invoiceError) throw new Error(dbMessage(invoiceError));
  const byId = new Map(
    ((invoices || []) as Pick<InvoiceRow, "id" | "piece_number" | "printed_at" | "storage_path">[]).map((row) => [
      row.id,
      row,
    ])
  );
  for (const line of lineRows) {
    const invoice = byId.get(line.invoice_id);
    const number = (invoice?.piece_number || "").trim();
    if (!number) continue;
    const issued = Boolean(invoice?.printed_at);
    const mention = mb3mFactureMention(number, issued);
    const href = mention.openPdf && invoice?.storage_path ? mb3mFactureHref(invoice.storage_path, number) : null;
    links.set(line.transaction_id, { text: mention.text, href });
  }
  return links;
}

async function syncBucket(
  admin: SupabaseClient,
  customer: CustomerRow,
  companies: CompanyRow[],
  rows: Mb3mLedgerRow[],
  companyId: string | null,
  split: boolean
) {
  if (mb3mRealm() !== "production" && !mb3mActivityId()) return;
  const printedIds = await printedTransactionIds(admin, customer.id, companyId);
  const balance = roundMoney(mb3mAccountBalance(rows, companyId, split));
  let open = await openInvoice(admin, customer.id, companyId);
  if (open?.piece_number) {
    const state = await mb3mFindPiece(open.piece_number);
    if (state === "printed") {
      const frozen = await invoiceLines(admin, open.id);
      for (const line of frozen) printedIds.add(line.transactionId);
      await closePrinted(admin, customer.id, open);
      open = null;
    } else if (state === "missing") {
      open = { ...open, piece_number: null };
    }
  }
  const next = mb3mAccountLines(rows, companyId, split).filter((line) => !printedIds.has(line.transactionId));
  const current = open ? await invoiceLines(admin, open.id) : null;
  const action = mb3mInvoiceAction(current, next);
  if ((action === "create" || action === "replace") && next.some((line) => line.activityId == null)) return;
  if (action === "keep") {
    if (open) await touchBalance(admin, open.id, balance);
    return;
  }
  if (action === "clear") {
    if (open) await dropOpenInvoice(admin, open);
    return;
  }
  if (!open) open = await claimOpenInvoice(admin, customer.id, companyId, balance);
  if (!open) return;
  const party = partyOf(customer, companies, companyId);
  if (!party) {
    if (!open.piece_number) await admin.from("crm_mb3m_account_invoices").delete().eq("id", open.id);
    return;
  }
  const savedParty = await ensureParty(admin, open, party);
  const span = mb3mStaySpan(rows, companyId, split);
  const folder = await ensureFolder(admin, savedParty, span);
  if (action === "replace" && folder.piece_number && folder.folder_id) {
    await mb3mCancelInvoice(folder.folder_id, folder.piece_number);
  }
  const created = await mb3mAddInvoice({
    folderId: folder.folder_id!,
    customerUid: folder.customer_uid!,
    title: "Compte",
    lines: next.map((line) => ({
      label: line.label,
      quantity: 1,
      netPriceUnit: line.amount,
      netPriceTotal: line.amount,
      activityId: line.activityId ?? undefined,
      type: "Standard" as const,
    })),
    dateStart: span.start,
    dateEnd: span.end,
  });
  const { error } = await admin
    .from("crm_mb3m_account_invoices")
    .update({
      piece_number: created.number,
      piece_uid: created.uid || null,
      balance,
      updated_at: new Date().toISOString(),
    })
    .eq("id", folder.id);
  if (error) throw new Error(dbMessage(error));
  await replaceLines(admin, folder.id, next);
}

async function closePrinted(admin: SupabaseClient, customerId: string, invoice: InvoiceRow) {
  const number = invoice.piece_number || "";
  let storagePath = invoice.storage_path;
  if (!storagePath && number) {
    const rendered = await mb3mRenderPiece({ number });
    storagePath = `customers/${customerId}/mb3m/${safeFileName(`facture-${number}.pdf`)}`;
    await uploadCrmFile(storagePath, rendered.bytes, "application/pdf", { upsert: true });
  }
  const { error } = await admin
    .from("crm_mb3m_account_invoices")
    .update({
      printed_at: new Date().toISOString(),
      storage_path: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id);
  if (error) throw new Error(dbMessage(error));
}

async function dropOpenInvoice(admin: SupabaseClient, invoice: InvoiceRow) {
  if (invoice.piece_number && invoice.folder_id) {
    const state = await mb3mFindPiece(invoice.piece_number);
    if (state === "open") await mb3mCancelInvoice(invoice.folder_id, invoice.piece_number);
  }
  const { error } = await admin.from("crm_mb3m_account_invoices").delete().eq("id", invoice.id);
  if (error) throw new Error(dbMessage(error));
}

type Party =
  | {
      kind: "person";
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      address: Mb3mAddress;
    }
  | { kind: "company"; id: string; name: string; email: string | null; address: Mb3mAddress };

function partyOf(customer: CustomerRow, companies: CompanyRow[], companyId: string | null): Party | null {
  if (companyId) {
    const company = companies.find((row) => row.id === companyId);
    const name = (company?.company_name || "").trim();
    const address = company
      ? addressOf(name || "Société", company.billing_address_line, company.billing_postal_code, company.billing_city, company.billing_country)
      : null;
    if (!company || !name || !address) return null;
    return { kind: "company", id: company.id, name, email: blank(company.billing_email), address };
  }
  const firstName = (customer.first_name || "").trim();
  const lastName = (customer.last_name || "").trim();
  const named = [firstName, lastName].filter(Boolean).join(" ").trim() || "Client";
  const address =
    addressOf(named, customer.billing_address_line, customer.billing_postal_code, customer.billing_city, customer.billing_country) ||
    addressOf(named, customer.address_line, customer.postal_code, customer.city, customer.country);
  if (!firstName || !lastName || !address) return null;
  return {
    kind: "person",
    id: customer.id,
    firstName,
    lastName,
    email: blank(customer.billing_email) || blank(customer.email),
    address,
  };
}

async function ensureParty(admin: SupabaseClient, invoice: InvoiceRow, party: Party) {
  if (invoice.customer_uid) return invoice;
  const saved =
    party.kind === "company"
      ? await mb3mSaveCompany({
          partnerId: mb3mPartnerCode(party.id),
          name: party.name,
          email: party.email || undefined,
          address: party.address,
        })
      : await mb3mSavePerson({
          partnerId: mb3mPartnerCode(party.id),
          firstName: party.firstName,
          name: party.lastName,
          email: party.email || undefined,
          address: party.address,
        });
  const { error } = await admin
    .from("crm_mb3m_account_invoices")
    .update({ customer_uid: saved.uid, updated_at: new Date().toISOString() })
    .eq("id", invoice.id);
  if (error) throw new Error(dbMessage(error));
  return { ...invoice, customer_uid: saved.uid };
}

async function ensureFolder(
  admin: SupabaseClient,
  invoice: InvoiceRow,
  span: { start: string; end: string }
) {
  if (invoice.folder_id && invoice.customer_uid) return invoice;
  if (!invoice.customer_uid) throw new Mb3mError("La fiche MB3M manque.", -1);
  const saved = await mb3mSaveFolder({
    customerUid: invoice.customer_uid,
    title: "Compte",
    folderType: "Prestation",
    dateStart: span.start,
    dateEnd: span.end,
    codeRef: invoice.id,
  });
  const { error } = await admin
    .from("crm_mb3m_account_invoices")
    .update({
      folder_id: saved.id,
      folder_uid: saved.uid || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id);
  if (error) throw new Error(dbMessage(error));
  return { ...invoice, folder_id: saved.id, folder_uid: saved.uid || null };
}

async function claimOpenInvoice(
  admin: SupabaseClient,
  customerId: string,
  companyId: string | null,
  balance: number
) {
  const existing = await openInvoice(admin, customerId, companyId);
  if (existing) return existing;
  const { data, error } = await admin
    .from("crm_mb3m_account_invoices")
    .insert({
      customer_id: customerId,
      billing_company_id: companyId,
      balance,
      currency: "EUR",
      realm: mb3mRealm(),
    })
    .select("id, customer_uid, folder_id, folder_uid, piece_number, piece_uid, printed_at, storage_path, billing_company_id")
    .single();
  if (error?.code === "23505") return openInvoice(admin, customerId, companyId);
  if (error) throw new Error(dbMessage(error));
  return data as InvoiceRow;
}

async function openInvoice(admin: SupabaseClient, customerId: string, companyId: string | null) {
  let query = admin
    .from("crm_mb3m_account_invoices")
    .select("id, customer_uid, folder_id, folder_uid, piece_number, piece_uid, printed_at, storage_path, billing_company_id")
    .eq("customer_id", customerId)
    .eq("realm", mb3mRealm())
    .is("printed_at", null);
  query = companyId ? query.eq("billing_company_id", companyId) : query.is("billing_company_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(dbMessage(error));
  return (data as InvoiceRow | null) || null;
}

async function invoiceLines(admin: SupabaseClient, invoiceId: string): Promise<Mb3mAccountLine[]> {
  const { data, error } = await admin
    .from("crm_mb3m_account_lines")
    .select("transaction_id, label, amount, activity_id")
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(dbMessage(error));
  return ((data || []) as { transaction_id: string; label: string; amount: number | string; activity_id: number | null }[])
    .map((row) => ({
      transactionId: row.transaction_id,
      label: row.label,
      amount: Number(row.amount),
      activityId: row.activity_id == null ? null : Number(row.activity_id),
    }))
    .sort((left, right) => left.transactionId.localeCompare(right.transactionId));
}

async function replaceLines(admin: SupabaseClient, invoiceId: string, lines: Mb3mAccountLine[]) {
  const { error: deleteError } = await admin.from("crm_mb3m_account_lines").delete().eq("invoice_id", invoiceId);
  if (deleteError) throw new Error(dbMessage(deleteError));
  if (!lines.length) return;
  const { error } = await admin.from("crm_mb3m_account_lines").insert(
    lines.map((line) => ({
      invoice_id: invoiceId,
      transaction_id: line.transactionId,
      label: line.label,
      amount: line.amount,
      activity_id: line.activityId,
      realm: mb3mRealm(),
    }))
  );
  if (error) throw new Error(dbMessage(error));
}

async function touchBalance(admin: SupabaseClient, invoiceId: string, balance: number) {
  const { error } = await admin
    .from("crm_mb3m_account_invoices")
    .update({ balance, updated_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (error) throw new Error(dbMessage(error));
}

async function printedTransactionIds(admin: SupabaseClient, customerId: string, companyId: string | null) {
  let query = admin
    .from("crm_mb3m_account_invoices")
    .select("id")
    .eq("customer_id", customerId)
    .eq("realm", mb3mRealm())
    .not("printed_at", "is", null);
  query = companyId ? query.eq("billing_company_id", companyId) : query.is("billing_company_id", null);
  const { data, error } = await query;
  if (error) throw new Error(dbMessage(error));
  const ids = ((data || []) as { id: string }[]).map((row) => row.id);
  if (!ids.length) return new Set<string>();
  const { data: lines, error: lineError } = await admin
    .from("crm_mb3m_account_lines")
    .select("transaction_id")
    .in("invoice_id", ids);
  if (lineError) throw new Error(dbMessage(lineError));
  return new Set(((lines || []) as { transaction_id: string }[]).map((row) => row.transaction_id));
}

async function loadCustomer(admin: SupabaseClient, customerId: string) {
  const { data, error } = await admin
    .from("crm_customers")
    .select(
      "id, first_name, last_name, email, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country, address_line, postal_code, city, country"
    )
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(dbMessage(error));
  return (data as CustomerRow | null) || null;
}

async function loadCompanies(admin: SupabaseClient, customerId: string) {
  const { data, error } = await admin
    .from("crm_billing_companies")
    .select(
      "id, company_name, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country, funding, sort_order"
    )
    .eq("customer_id", customerId);
  if (error) throw new Error(dbMessage(error));
  return (data || []) as CompanyRow[];
}

async function loadRows(admin: SupabaseClient, customerId: string) {
  const { data, error } = await admin
    .from("crm_transactions")
    .select("id, direction, status, currency, amount, label, billing_company_id, occurred_on, external_id, booking_id")
    .eq("customer_id", customerId)
    .eq("status", "posted");
  if (error) throw new Error(dbMessage(error));
  return (data || []) as Mb3mLedgerRow[];
}

const ITEM_ID = /:(?:item|expense):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

async function attachChargeKinds(admin: SupabaseClient, rows: Mb3mLedgerRow[]) {
  const ids = [
    ...new Set(
      rows
        .map((row) => row.external_id?.match(ITEM_ID)?.[1] || "")
        .filter(Boolean)
    ),
  ];
  const items = new Map<string, { kind: string | null; ticketing: boolean }>();
  if (ids.length) {
    const { data, error } = await admin.from("crm_booking_items").select("id, kind, details").in("id", ids);
    if (error) throw new Error(dbMessage(error));
    for (const item of (data || []) as { id: string; kind: string | null; details: Record<string, unknown> | null }[]) {
      items.set(item.id, { kind: item.kind, ticketing: isAutoTicketingExpense(item) });
    }
  }
  return rows.map((row) => {
    const item = items.get(row.external_id?.match(ITEM_ID)?.[1] || "");
    return {
      ...row,
      chargeKind: mb3mChargeKind({
        external_id: row.external_id,
        booking_id: row.booking_id,
        itemKind: item?.kind,
        ticketing: item?.ticketing,
      }),
    };
  });
}

function blank(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}
