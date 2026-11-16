import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadClientLedger, loadClientLedgerViews } from "@/lib/crm/client-ledger-load";
import { buildTripAccountingView, loadDossierAccountingInputs } from "@/lib/crm/trip-accounting-view";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBooking, CrmBookingItem, CrmCustomer } from "@/lib/crm/types";

async function bookingLedgers(
  supabase: SupabaseClient,
  customer: CrmCustomer | null,
  billingCustomer: CrmCustomer | null
) {
  const options = { reconcile: false as const };
  const accountHolder = billingCustomer || customer;
  if (customer && accountHolder && customer.id === accountHolder.id) {
    const views = await loadClientLedgerViews(supabase, customer, ["client", "staff"], options).catch(() => []);
    return { ledger: views[0] || null, accountLedger: views[1] || null };
  }
  const [ledger, accountLedger] = await Promise.all([
    customer ? loadClientLedger(supabase, customer, "client", options).catch(() => null) : Promise.resolve(null),
    accountHolder
      ? loadClientLedger(supabase, accountHolder, "staff", options).catch(() => null)
      : Promise.resolve(null),
  ]);
  return { ledger, accountLedger };
}

/**
 * Montants de l’onglet Argent après un enregistrement.
 * Grand livre et coûts déjà en base. Pas de Stripe, pas d’appel Pliant, Revolut ou MB3M,
 * pas de la file globale des sorties : l’écran ne l’attend pas.
 */
export async function loadDossierArgent(supabase: SupabaseClient, bookingId: string) {
  const revision = Date.now();
  const { data: bookingRow } = await supabase.from("crm_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!bookingRow) return null;
  const booking = bookingRow as CrmBooking;
  const ids = [
    ...new Set([booking.customer_id, booking.billing_customer_id].filter((id): id is string => Boolean(id))),
  ];
  const { data: people } = ids.length
    ? await supabase.from("crm_customers").select("*").in("id", ids)
    : { data: [] as CrmCustomer[] };
  const party = (people || []) as CrmCustomer[];
  const customer = party.find((row) => row.id === booking.customer_id) || null;
  const billingCustomer =
    party.find((row) => row.id === (booking.billing_customer_id || booking.customer_id)) || customer;
  const admin = createServiceClient();
  const [{ data: itemRows }, ledgers, inputs] = await Promise.all([
    supabase.from("crm_booking_items").select("*").eq("booking_id", bookingId).order("sort_order"),
    bookingLedgers(supabase, customer, billingCustomer),
    loadDossierAccountingInputs(admin, bookingId).catch(() => null),
  ]);
  const items = (itemRows || []) as CrmBookingItem[];
  const accounting = inputs
    ? await buildTripAccountingView(admin, booking, items, inputs, { skipOutgoingQueue: true }).catch(() => null)
    : null;
  return {
    revision,
    layer: 2 as const,
    keepProposed: true,
    agencyCommission: booking.agency_commission === true,
    items,
    ledger: ledgers.ledger,
    accountLedger: ledgers.accountLedger,
    accounting,
  };
}
