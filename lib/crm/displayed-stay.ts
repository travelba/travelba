import type { SupabaseClient } from "@supabase/supabase-js";
import { loadResolvedAgencyFees } from "@/lib/crm/agency-fee-rate";
import { bookingTotalFromItems, itemIncludedInLedger, itemSellingAmount } from "@/lib/crm/bookings";
import {
  COMMERCIAL_DISCOUNT_LABEL,
  COMMERCIAL_DISCOUNT_LINE_ID,
  commercialDiscountAmount,
  priceDiscountLines,
  readCommercialDiscount,
  type DiscountLine,
  type PricedDiscountLine,
} from "@/lib/crm/commercial-discount";
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
  /** Présent (même vide) : les lignes remplacent les colonnes. Absent : colonnes. */
  discounts?: DiscountLine[];
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
  booking: Pick<StayRow, "status" | "total_amount" | "agency_commission" | "fee_mode" | "remise_type" | "remise_value" | "discounts">,
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
    ...(Array.isArray(booking.discounts)
      ? { discounts: booking.discounts }
      : { discount: readCommercialDiscount(booking) }),
  });
}

/** Euros de remise sur le même total que le carnet, avant de la retirer. */
export function stayDiscountEuros(
  booking: Pick<StayRow, "status" | "total_amount" | "agency_commission" | "fee_mode" | "remise_type" | "remise_value" | "discounts">,
  items: StayItemRow[],
  travelerCount: number,
  agencyFeeRate?: number | null
) {
  if (Array.isArray(booking.discounts)) {
    const gross = displayedStayAmount(
      { ...booking, discounts: [], remise_type: null, remise_value: null },
      items,
      travelerCount,
      agencyFeeRate
    );
    return priceDiscountLines(gross, booking.discounts).total;
  }
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

/** Lignes chiffrées. Tableau `discounts` : la table. Sinon la remise unique des colonnes. */
export function stayPricedDiscounts(
  booking: Pick<StayRow, "status" | "total_amount" | "agency_commission" | "fee_mode" | "remise_type" | "remise_value" | "discounts">,
  items: StayItemRow[],
  travelerCount: number,
  agencyFeeRate?: number | null
): PricedDiscountLine[] {
  if (Array.isArray(booking.discounts)) {
    const gross = displayedStayAmount(
      { ...booking, discounts: [], remise_type: null, remise_value: null },
      items,
      travelerCount,
      agencyFeeRate
    );
    return priceDiscountLines(gross, booking.discounts).lines;
  }
  const spec = readCommercialDiscount(booking);
  const euros = stayDiscountEuros(booking, items, travelerCount, agencyFeeRate);
  if (!spec.type || spec.value == null || !(euros > 0)) return [];
  return [
    {
      id: COMMERCIAL_DISCOUNT_LINE_ID,
      label: COMMERCIAL_DISCOUNT_LABEL,
      kind: spec.type,
      quantity: 1,
      unitPrice: spec.type === "amount" ? spec.value : null,
      percent: spec.type === "percent" ? spec.value : null,
      euros,
    },
  ];
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

type StoredDiscount =
  | { mode: "lines"; lines: DiscountLine[] }
  | { mode: "columns"; remise_type: string | null; remise_value: number | string | null };

function withStoredDiscount<T extends StayRow>(booking: T, discounts: Map<string, StoredDiscount> | null): T {
  if (!discounts || !discounts.has(booking.id)) return booking;
  const stored = discounts.get(booking.id);
  if (!stored) return booking;
  if (stored.mode === "lines") {
    return { ...booking, discounts: stored.lines, remise_type: null, remise_value: null };
  }
  return { ...booking, remise_type: stored.remise_type, remise_value: stored.remise_value };
}

/**
 * Table lisible : les lignes sont la source, même vides (les colonnes ne comptent plus).
 * Table absente : les colonnes. Colonnes absentes aussi : aucune remise, la lecture continue.
 */
async function loadStoredDiscounts(supabase: SupabaseClient, ids: string[]) {
  const map = new Map<string, StoredDiscount>();
  if (!ids.length) return map;
  const { loadDiscountLines } = await import("@/lib/crm/booking-discounts-db");
  const lines = await loadDiscountLines(ids).catch((error: { code?: string; message?: string }) => {
    if (error?.code === "42P01" || error?.code === "PGRST205") return null;
    throw error;
  });
  if (lines) {
    for (const id of ids) map.set(id, { mode: "lines", lines: lines.get(id) || [] });
    return map;
  }
  const { data, error } = await supabase.from("crm_bookings").select("id, remise_type, remise_value").in("id", ids);
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return null;
    throw error;
  }
  for (const row of (data || []) as { id: string; remise_type: string | null; remise_value: number | string | null }[]) {
    map.set(row.id, { mode: "columns", remise_type: row.remise_type, remise_value: row.remise_value });
  }
  return map;
}

export type StayDiscountLoad =
  | { source: "columns"; lines: PricedDiscountLine[] }
  | { source: "lines"; lines: PricedDiscountLine[] };

/**
 * Lignes chiffrées sur la même vente que le carnet.
 * `columns` : la table n’est pas là, une seule ligne reprend la remise déjà saisie.
 * `lines` : la table est la source, y compris quand elle est vide.
 */
export async function loadStayPricedDiscounts(supabase: SupabaseClient, bookingId: string): Promise<StayDiscountLoad> {
  const { data, error } = await supabase
    .from("crm_bookings")
    .select(
      "id, status, total_amount, agency_commission, agency_fee_rate, fee_mode, customer_id, billing_customer_id, remise_type, remise_value"
    )
    .eq("id", bookingId)
    .limit(1);
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return { source: "columns", lines: [] };
    throw error;
  }
  const booking = (Array.isArray(data) ? data[0] : data) as StayRow | null;
  if (!booking) return { source: "columns", lines: [] };
  const loaded = await loadStayItemRows(supabase, [bookingId], "booking_id, kind, amount, lifecycle, details, start_at");
  const fees = await loadResolvedAgencyFees(supabase, [booking]);
  const rate = fees.get(bookingId)?.rate;
  const items = loaded.items;
  const travelers = loaded.travelers.length;
  const pricedBooking = { ...booking, total_amount: bookingTotalFromItems(stayAmountItems(items)) };
  const { loadDiscountLines } = await import("@/lib/crm/booking-discounts-db");
  let table: Map<string, DiscountLine[]> | null = null;
  try {
    table = await loadDiscountLines([bookingId]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "42P01" && code !== "PGRST205") throw err;
  }
  if (table) {
    return {
      source: "lines",
      lines: stayPricedDiscounts(
        { ...pricedBooking, discounts: table.get(bookingId) || [], remise_type: null, remise_value: null },
        items,
        travelers,
        rate
      ),
    };
  }
  return { source: "columns", lines: stayPricedDiscounts(pricedBooking, items, travelers, rate) };
}

/** Même remise que le carnet, lue en base. 0 si rien n’est en place. */
export async function loadStayDiscountEuros(supabase: SupabaseClient, bookingId: string) {
  const loaded = await loadStayPricedDiscounts(supabase, bookingId);
  return loaded.lines.reduce((sum, line) => sum + line.euros, 0);
}
