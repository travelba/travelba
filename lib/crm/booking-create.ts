import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateBookingInput } from "@/lib/crm/admin-schemas";
import { ledgerWarning, nextBookingReference, parseIncludeInLedger, syncBookingLedger } from "@/lib/crm/bookings";
import { resolveBillingCustomerId } from "@/lib/crm/company-role";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import { assignPayer, defaultPayer, resolveFeesFollowStay, type PayerCompany } from "@/lib/crm/payer";
import { shownClientNote } from "@/lib/crm/public-booking";
import type { CrmBooking, CrmCustomer } from "@/lib/crm/types";

/** Refus de création, avec le statut HTTP de la route agence. */
export class StaffWriteError extends Error {
  status: number;
  issues?: { field: string; message: string }[];

  constructor(message: string, status = 400, issues?: { field: string; message: string }[]) {
    super(message);
    this.name = "StaffWriteError";
    this.status = status;
    this.issues = issues;
  }
}

/** Même saisie que POST /api/admin/bookings, devise libre (THB compris). */
export type StaffBookingInput = Omit<CreateBookingInput, "currency"> & { currency: string };

function dbFail(error: DbErrorLike, status: number, fallback: string): never {
  console.error("[bookings]", error?.code ?? "?");
  throw new StaffWriteError(dbErrorMessage(error, fallback), status);
}

/**
 * Crée le dossier comme l’agence : référence `crm_next_booking_reference`,
 * caché au client, grand livre seulement si le séjour est déjà visible.
 * `referenceFrom` porte la RPC (service role) : le rôle authenticated ne l’exécute plus.
 */
export async function createStaffBooking(
  supabase: SupabaseClient,
  body: StaffBookingInput,
  referenceFrom: SupabaseClient = supabase
) {
  const customerId = body.customer_id;
  const title = body.title;
  const { data: traveler, error: travelerError } = await supabase
    .from("crm_customers")
    .select("id, company_role, billing_parent_id")
    .eq("id", customerId)
    .maybeSingle();
  if (travelerError) dbFail(travelerError, 500, "Client introuvable.");
  if (!traveler) {
    throw new StaffWriteError("Client introuvable.", 404, [{ field: "customer_id", message: "Client introuvable." }]);
  }
  const billingCustomerId = body.billing_customer_id || resolveBillingCustomerId(traveler as CrmCustomer);
  const { data: companyRows, error: companyError } = await supabase
    .from("crm_billing_companies")
    .select("id, sort_order")
    .eq("customer_id", billingCustomerId)
    .order("sort_order");
  if (companyError) dbFail(companyError, 500, "Société introuvable.");
  const companies = (companyRows || []) as PayerCompany[];
  const payer = body.payer_kind
    ? assignPayer({ payerKind: body.payer_kind, companyId: body.billing_company_id, companies })
    : defaultPayer(companies);
  if ("error" in payer) throw new StaffWriteError(payer.error);
  let reference: string;
  try {
    reference = await nextBookingReference(referenceFrom);
  } catch (err) {
    console.error("[bookings] reference:", err);
    throw new StaffWriteError("Impossible de générer la référence du dossier. Réessayez.", 500);
  }
  const { data, error } = await supabase
    .from("crm_bookings")
    .insert({
      customer_id: customerId,
      billing_customer_id: billingCustomerId,
      billing_company_id: payer.billing_company_id,
      payer_kind: payer.payer_kind,
      fees_follow_stay: resolveFeesFollowStay({
        stayKind: payer.payer_kind,
        requested: parseIncludeInLedger(body.fees_follow_stay, true),
        companyCount: companies.length,
      }),
      reference,
      title,
      destination: body.destination?.trim() || null,
      status: body.status || "draft",
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      currency: body.currency,
      total_amount: 0,
      include_in_ledger: parseIncludeInLedger(body.include_in_ledger, true),
      agency_commission: parseIncludeInLedger(body.agency_commission, false),
      client_settles_stay: parseIncludeInLedger(body.client_settles_stay, false),
      notes_client: shownClientNote(body.notes_client),
      notes_internal: body.notes_internal?.trim() || null,
      visible_to_client: false,
    })
    .select("*")
    .single();
  if (error || !data) dbFail(error, 400, "Dossier non créé.");
  const booking = data as CrmBooking;
  const ledgerWarningText = await ledgerWarning(`Dossier ${reference} créé`, () =>
    syncBookingLedger(supabase, booking)
  );
  return { booking, ledgerWarning: ledgerWarningText };
}
