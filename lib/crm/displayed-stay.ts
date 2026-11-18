import type { SupabaseClient } from "@supabase/supabase-js";
import { loadResolvedAgencyFees } from "@/lib/crm/agency-fee-rate";
import { bookingTotalFromItems, itemIncludedInLedger, itemSellingAmount } from "@/lib/crm/bookings";
import { commercialDiscountAmount, readCommercialDiscount } from "@/lib/crm/commercial-discount";
import { stayPriceWithExpenses } from "@/lib/crm/ledger-display";
import { chargeableTicketingFee } from "@/lib/crm/ticketing-fee";
import { expenseCountsForClient } from "@/lib/crm/expense-validation";
import { isActiveItem, isExtraItemKind } from "@/lib/crm/types";

type StayRow = {
  id: string;
  status: string;
  total_amount: number | string | null;
  agency_commission?: boolean | null;
  agency_fee_rate?: number | string | null;
  fee_mode?: string | null;
  customer_id?: string | null;
  billing_customer_id?: string | null;
  remise_type?: string | null;
  remise_value?: number | string | null;
};

type StayItemRow = {
  kind?: string | null;
  amount: number | string | null;
  start_at?: string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
  include_in_ledger?: boolean | null;
};

/**
 * Montant lu par le client : cartes + commission d’agence + billetterie + dépenses libres.
 * La commission porte sur le total vendu, billeterie comprise. Une seule formule pour la liste, le détail et l’aperçu.
 */
export function displayedStayAmount(
  booking: Pick<StayRow, "status" | "total_amount" | "agency_commission" | "fee_mode" | "remise_type" | "remise_value">,
  items: StayItemRow[],
  travelerCount: number,
  agencyFeeRate?: number | null
) {
  const active = items.filter((item) => isActiveItem(item));
  const amounts = (keep: (item: StayItemRow) => boolean) =>
    active.filter(keep).map((item) => ({
      amount: item.amount == null ? null : Number(item.amount),
    }));
  return stayPriceWithExpenses({
    stayTotal: Number(booking.total_amount),
    agencyCommission: booking.agency_commission === true,
    // Une dépense automatique « à valider » n’entre pas dans le prix lu par le client.
    expenses: amounts((item) => expenseCountsForClient(item)),
    extras: amounts((item) => isExtraItemKind(item.kind)),
    ticketingFee: chargeableTicketingFee({
      items: active,
      status: booking.status,
      travelerCount,
      feeMode: booking.fee_mode,
    }),
    agencyFeeRate,
    discount: readCommercialDiscount(booking),
  });
}

/** Euros de remise sur le même total que le carnet, avant de la retirer. */
export function stayDiscountEuros(
  booking: Pick<StayRow, "status" | "total_amount" | "agency_commission" | "fee_mode" | "remise_type" | "remise_value">,
  items: StayItemRow[],
  travelerCount: number,
  agencyFeeRate?: number | null
) {
  const spec = readCommercialDiscount(booking);
  if (!spec.type) return 0;
  const gross = displayedStayAmount(
    { ...booking, remise_type: null, remise_value: null },
    items,
    travelerCount,
    agencyFeeRate
  );
  return commercialDiscountAmount(gross, spec);
}

/**
 * Montant des cartes comptées au grand livre.
 * Le total stocké porte les étapes (aller-retour une fois). La billeterie compte une fois :
 * la ligne de dépense si elle existe, sinon le forfait. Un extra inclus (visa) s’ajoute.
 * Un extra hors livre ne s’ajoute pas. Le prix affiché client, lui, laisse l’extra dans l’assiette de la commission seulement.
 */
export function ledgerCountedStayAmount(
  booking: StayRow & { client_settles_stay?: boolean | null; include_in_ledger?: boolean | null },
  items: StayItemRow[],
  travelerCount: number,
  agencyFeeRate?: number | null
) {
  const settles = booking.client_settles_stay === true;
  const active = items.filter((item) => isActiveItem(item));
  const bookingForStay = { ...booking, total_amount: bookingTotalFromItems(stayAmountItems(active)) };
  const extraSum = active.reduce((sum, item) => {
    if (!isExtraItemKind(item.kind) || !itemIncludedInLedger(item, settles)) return sum;
    const amount = item.amount == null || item.amount === "" ? null : Number(item.amount);
    return sum + (itemSellingAmount({ ...item, amount: Number.isFinite(amount) ? amount : null }) || 0);
  }, 0);
  const stayInLedger = !settles && booking.include_in_ledger !== false;
  const headline = stayInLedger
    ? displayedStayAmount(bookingForStay, active, travelerCount, agencyFeeRate)
    : expenseHeadline(booking, active, travelerCount, agencyFeeRate);
  return Math.round((headline + extraSum) * 100) / 100;
}

/** Dépenses, billeterie et commission, sans le montant du séjour (réglé par le client, ou hors livre). */
function expenseHeadline(booking: StayRow, items: StayItemRow[], travelerCount: number, agencyFeeRate?: number | null) {
  return displayedStayAmount({ ...booking, total_amount: 0 }, items, travelerCount, agencyFeeRate);
}

function stayAmountItems(items: StayItemRow[]) {
  return items.map((item) => {
    const raw = item.amount;
    const amount = raw == null || raw === "" ? null : Number(raw);
    return { ...item, amount: amount != null && Number.isFinite(amount) ? amount : null };
  });
}

const STAY_AMOUNT_KINDS = [
  "expense",
  "flight",
  "hotel",
  "transfer",
  "activity",
  "rail",
  "car",
  "cruise",
  "insurance",
  "fee",
  "accueil_vip",
  "chauffeur",
  "greeter",
  "visa",
  "checkin",
] as const;

type ItemQueryRow = StayItemRow & { booking_id: string };

async function loadStayItemRows(supabase: SupabaseClient, ids: string[], columns: string) {
  const [{ data, error }, { data: travelerRows, error: travelerError }] = await Promise.all([
    supabase.from("crm_booking_items").select(columns).in("booking_id", ids).in("kind", [...STAY_AMOUNT_KINDS]),
    supabase.from("crm_booking_travelers").select("booking_id").in("booking_id", ids),
  ]);
  if (error || travelerError) {
    const failed = error || travelerError;
    throw Object.assign(new Error("Lecture du montant impossible."), {
      code: failed?.code,
    });
  }
  return {
    items: (data || []) as unknown as ItemQueryRow[],
    travelers: (travelerRows || []) as { booking_id: string }[],
  };
}

/** Même montant que le dossier, la liste et le règlement quand les frais suivent le séjour. */
export async function loadDisplayedStayAmounts(supabase: SupabaseClient, bookings: StayRow[]) {
  const itemsByBooking = new Map<string, StayItemRow[]>();
  const travelers = new Map<string, number>();
  if (bookings.length) {
    const ids = bookings.map((booking) => booking.id);
    const loaded = await loadStayItemRows(supabase, ids, "booking_id, kind, amount, lifecycle, details, start_at");
    for (const row of loaded.items) {
      const list = itemsByBooking.get(row.booking_id) || [];
      list.push({
        kind: row.kind,
        amount: row.amount,
        start_at: row.start_at,
        lifecycle: row.lifecycle,
        details: row.details,
      });
      itemsByBooking.set(row.booking_id, list);
    }
    for (const row of loaded.travelers) {
      travelers.set(row.booking_id, (travelers.get(row.booking_id) || 0) + 1);
    }
  }
  const fees = await loadResolvedAgencyFees(supabase, bookings);
  const discounts = await loadStoredDiscounts(supabase, bookings.map((booking) => booking.id));
  const amounts = new Map<string, number>();
  for (const booking of bookings) {
    const rows = itemsByBooking.get(booking.id) || [];
    amounts.set(
      booking.id,
      displayedStayAmount(
        {
          ...withStoredDiscount(booking, discounts),
          total_amount: bookingTotalFromItems(stayAmountItems(rows)),
        },
        rows,
        travelers.get(booking.id) || 0,
        fees.get(booking.id)?.rate
      )
    );
  }
  return amounts;
}

/** Même lecture que le prix affiché, plus les extras inclus au grand livre (visa). Une erreur n’est pas un zéro. */
export async function loadLedgerCountedStayAmounts(
  supabase: SupabaseClient,
  bookings: (StayRow & { client_settles_stay?: boolean | null; include_in_ledger?: boolean | null })[]
) {
  const itemsByBooking = new Map<string, StayItemRow[]>();
  const travelers = new Map<string, number>();
  if (bookings.length) {
    const ids = bookings.map((booking) => booking.id);
    const loaded = await loadStayItemRows(
      supabase,
      ids,
      "booking_id, kind, amount, lifecycle, details, start_at, include_in_ledger"
    );
    for (const row of loaded.items) {
      const list = itemsByBooking.get(row.booking_id) || [];
      list.push(row);
      itemsByBooking.set(row.booking_id, list);
    }
    for (const row of loaded.travelers) {
      travelers.set(row.booking_id, (travelers.get(row.booking_id) || 0) + 1);
    }
  }
  const fees = await loadResolvedAgencyFees(supabase, bookings);
  const discounts = await loadStoredDiscounts(supabase, bookings.map((booking) => booking.id));
  const amounts = new Map<string, number>();
  for (const booking of bookings) {
    amounts.set(
      booking.id,
      ledgerCountedStayAmount(
        withStoredDiscount(booking, discounts),
        itemsByBooking.get(booking.id) || [],
        travelers.get(booking.id) || 0,
        fees.get(booking.id)?.rate
      )
    );
  }
  return amounts;
}

function withStoredDiscount<T extends StayRow>(booking: T, discounts: Map<string, CommercialDiscountRow> | null): T {
  if (!discounts || !discounts.has(booking.id)) return booking;
  const stored = discounts.get(booking.id);
  return { ...booking, remise_type: stored?.remise_type ?? null, remise_value: stored?.remise_value ?? null };
}

type CommercialDiscountRow = { remise_type: string | null; remise_value: number | string | null };

/** Colonnes absentes tant que la migration n’est pas jouée : aucune remise, la lecture continue. */
async function loadStoredDiscounts(supabase: SupabaseClient, ids: string[]) {
  const map = new Map<string, CommercialDiscountRow>();
  if (!ids.length) return map;
  const { data, error } = await supabase.from("crm_bookings").select("id, remise_type, remise_value").in("id", ids);
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return null;
    throw error;
  }
  for (const row of (data || []) as { id: string; remise_type: string | null; remise_value: number | string | null }[]) {
    map.set(row.id, { remise_type: row.remise_type, remise_value: row.remise_value });
  }
  return map;
}

/** Même remise que le carnet, lue en base. 0 si les colonnes ne sont pas encore là. */
export async function loadStayDiscountEuros(supabase: SupabaseClient, bookingId: string) {
  const { data, error } = await supabase
    .from("crm_bookings")
    .select(
      "id, status, total_amount, agency_commission, agency_fee_rate, fee_mode, customer_id, billing_customer_id, remise_type, remise_value"
    )
    .eq("id", bookingId)
    .limit(1);
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return 0;
    throw error;
  }
  const booking = (Array.isArray(data) ? data[0] : data) as StayRow | null;
  if (!booking || !readCommercialDiscount(booking).type) return 0;
  const loaded = await loadStayItemRows(supabase, [bookingId], "booking_id, kind, amount, lifecycle, details, start_at");
  const fees = await loadResolvedAgencyFees(supabase, [booking]);
  return stayDiscountEuros(
    { ...booking, total_amount: bookingTotalFromItems(stayAmountItems(loaded.items)) },
    loaded.items,
    loaded.travelers.length,
    fees.get(bookingId)?.rate
  );
}
