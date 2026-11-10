import { billingCompanyTabLabel, parseBillingCompanyId } from "@/lib/crm/billing-companies";
import { runIfConfirmed } from "@/lib/crm/mcp-preview";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { isActiveItem, isLedgerExpenseKind } from "@/lib/crm/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExpenseCompanyRequest = {
  dossierId: string;
  reference: string;
  carteId: string;
  societeId: string | null;
};

export type ExpenseCompanyLoaded = {
  dossier_id: string;
  reference: string | null;
  customer_id: string;
  billing_customer_id: string | null;
  libelle: string;
  companies: { id: string; company_name: string | null }[];
  bookingCompanyId: string | null;
  itemCompanyId: string | null;
};

export type ExpenseCompanyEffects = {
  load: (request: ExpenseCompanyRequest) => Promise<ExpenseCompanyLoaded>;
  write?: (request: ExpenseCompanyRequest, loaded: ExpenseCompanyLoaded) => Promise<void>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** Société demandée, ou le voyage. Les deux ensemble, ou aucun des deux, est refusé. */
export function parseExpenseCompanyRequest(input: Record<string, unknown>): ExpenseCompanyRequest {
  const dossierId = text(input.dossier_id);
  const reference = text(input.reference);
  const carteId = text(input.carte_id);
  if (dossierId && !UUID.test(dossierId)) throw new McpWriteError("Dossier invalide.");
  if (!dossierId && !reference) throw new McpWriteError("Indiquez le dossier.");
  if (!UUID.test(carteId)) throw new McpWriteError("Dépense invalide.");
  if (input.suivre_voyage != null && input.suivre_voyage !== true && input.suivre_voyage !== false) {
    throw new McpWriteError("suivre_voyage est vrai ou faux.");
  }
  const follow = input.suivre_voyage === true;
  const raw = input.societe_id;
  const hasCompany = raw != null && String(raw).trim() !== "";
  if (follow && hasCompany) throw new McpWriteError("Indiquez la société, ou suivre_voyage, pas les deux.");
  if (!follow && !hasCompany) {
    throw new McpWriteError("Indiquez la société, ou suivre_voyage pour reprendre celle du voyage.");
  }
  if (!hasCompany) return { dossierId, reference, carteId, societeId: null };
  const parsed = parseBillingCompanyId(raw);
  if ("error" in parsed || !parsed.id) throw new McpWriteError("error" in parsed ? parsed.error : "Société inconnue.");
  return { dossierId, reference, carteId, societeId: parsed.id };
}

export function describeExpenseCompany(input: {
  libelle: string;
  companies: { id: string; company_name: string | null }[];
  bookingCompanyId: string | null;
  itemCompanyId: string | null;
  nextCompanyId: string | null;
}) {
  if (input.companies.length < 2) {
    throw new McpWriteError("Une seule société sur le compte : la dépense suit le voyage.");
  }
  const societes = input.companies.map((company, index) => ({
    id: company.id,
    nom: billingCompanyTabLabel(company.company_name, index, input.companies.length),
  }));
  const names = new Map(societes.map((row) => [row.id, row.nom]));
  if (input.nextCompanyId && !names.has(input.nextCompanyId)) {
    throw new McpWriteError("Cette société n’est pas sur le compte facturé.");
  }
  const suit = input.nextCompanyId == null;
  return {
    libelle: input.libelle,
    societes,
    avant: {
      societe_id: input.itemCompanyId,
      societe: input.itemCompanyId ? names.get(input.itemCompanyId) || null : null,
      suit_le_voyage: input.itemCompanyId == null,
    },
    societe_id: input.nextCompanyId,
    societe: suit ? null : names.get(input.nextCompanyId || "") || null,
    suit_le_voyage: suit,
    societe_voyage: input.bookingCompanyId ? names.get(input.bookingCompanyId) || null : null,
  };
}

export async function societeDepense(input: Record<string, unknown>, effects?: ExpenseCompanyEffects) {
  const request = parseExpenseCompanyRequest(input);
  const loaded = await (effects?.load ?? liveLoad)(request);
  const described = describeExpenseCompany({
    libelle: loaded.libelle,
    companies: loaded.companies,
    bookingCompanyId: loaded.bookingCompanyId,
    itemCompanyId: loaded.itemCompanyId,
    nextCompanyId: request.societeId,
  });
  const apercu = {
    action: "societe_depense",
    dossier_id: loaded.dossier_id,
    reference: loaded.reference,
    carte_id: request.carteId,
    ...described,
  };
  return runIfConfirmed(input, apercu, async () => {
    await (effects?.write ?? liveWrite)(request, loaded);
    return { envoye: false, ecrit: true, apercu: false, ...apercu };
  });
}

async function liveLoad(request: ExpenseCompanyRequest): Promise<ExpenseCompanyLoaded> {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const admin = createServiceClient();
  let query = admin.from("crm_bookings").select("id, reference, customer_id, billing_customer_id, billing_company_id");
  query = request.dossierId ? query.eq("id", request.dossierId) : query.eq("reference", request.reference);
  const { data, error } = await query.limit(2);
  if (error) throw new McpWriteError("Dossier introuvable.");
  const bookings = (data || []) as {
    id: string;
    reference: string | null;
    customer_id: string;
    billing_customer_id: string | null;
    billing_company_id: string | null;
  }[];
  if (!bookings.length) throw new McpWriteError("Dossier introuvable.");
  if (bookings.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  const booking = bookings[0];
  const { data: item, error: itemError } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, billing_company_id, lifecycle")
    .eq("id", request.carteId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (itemError) throw new McpWriteError("Dépense introuvable.");
  const row = item as {
    id: string;
    kind: string | null;
    title: string | null;
    billing_company_id: string | null;
    lifecycle: string | null;
  } | null;
  if (!row) throw new McpWriteError("Cette dépense n’est pas sur ce dossier.");
  if (!isLedgerExpenseKind(row.kind)) throw new McpWriteError("Cette carte n’est pas une dépense.");
  if (!isActiveItem(row)) throw new McpWriteError("Cette dépense est archivée.");
  const payerId = booking.billing_customer_id || booking.customer_id;
  const { data: companies, error: companyError } = await admin
    .from("crm_billing_companies")
    .select("id, company_name, sort_order")
    .eq("customer_id", payerId)
    .order("sort_order");
  if (companyError) throw new McpWriteError("Les sociétés n’ont pas pu être lues.");
  return {
    dossier_id: booking.id,
    reference: booking.reference,
    customer_id: booking.customer_id,
    billing_customer_id: booking.billing_customer_id,
    libelle: row.title || "Dépense",
    companies: (companies || []) as { id: string; company_name: string | null }[],
    bookingCompanyId: booking.billing_company_id,
    itemCompanyId: row.billing_company_id,
  };
}

async function liveWrite(request: ExpenseCompanyRequest, loaded: ExpenseCompanyLoaded) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { writeBillingAssignment } = await import("@/lib/crm/billing-companies");
  const { refreshBookingLedger } = await import("@/lib/crm/bookings");
  const admin = createServiceClient();
  const written = await writeBillingAssignment(
    admin,
    {
      id: loaded.dossier_id,
      customer_id: loaded.customer_id,
      billing_customer_id: loaded.billing_customer_id,
    },
    { billing_company_id: request.societeId, item_id: request.carteId }
  );
  if ("error" in written) throw new McpWriteError(written.error);
  await refreshBookingLedger(admin, loaded.dossier_id);
}
