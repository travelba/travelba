import { isInvoicePieceKind, numberMatches, pieceDigits, type PayerHistory, type PayerPiece } from "@/lib/crm/stripe-payer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

const STRIPE_CUSTOMER = /^cus_[A-Za-z0-9]+$/;

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Clients Stripe déjà rapprochés, et pièces dont le numéro est celui de la désignation. */
export async function loadStripeSuggestHints(
  admin: Admin,
  input: { stripeCustomerIds?: string[]; numbers?: string[] }
): Promise<{ history: PayerHistory[]; pieces: PayerPiece[] }> {
  const stripeIds = [...new Set((input.stripeCustomerIds || []).map((id) => id.trim()).filter((id) => STRIPE_CUSTOMER.test(id)))];
  const numbers = [...new Set((input.numbers || []).map((value) => pieceDigits(value)).filter((value): value is string => Boolean(value)))];
  const [history, pieces] = await Promise.all([
    loadHistory(admin, stripeIds),
    loadPieces(admin, numbers),
  ]);
  return { history, pieces };
}

async function loadHistory(admin: Admin, stripeIds: string[]): Promise<PayerHistory[]> {
  if (!stripeIds.length) return [];
  const { data, error } = await admin
    .from("crm_stripe_transactions")
    .select("matched_customer_id, raw")
    .eq("status", "matched")
    .not("matched_customer_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error || !data) return [];
  const wanted = new Set(stripeIds);
  const out: PayerHistory[] = [];
  for (const row of data as { matched_customer_id?: string | null; raw?: unknown }[]) {
    const customerId = clean(row.matched_customer_id);
    const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? (row.raw as Record<string, unknown>) : null;
    const stripeCustomerId = clean(raw?.stripe_customer_id);
    if (!customerId || !wanted.has(stripeCustomerId)) continue;
    out.push({ stripeCustomerId, customerId });
  }
  return out;
}

async function loadPieces(admin: Admin, numbers: string[]): Promise<PayerPiece[]> {
  if (!numbers.length) return [];
  const numberFilter = numbers.map((number) => `piece_number.ilike.%${number}%`).join(",");
  const fileFilter = numbers.map((number) => `file_name.ilike.%${number}%`).join(",");
  const [mb3m, account, documents] = await Promise.all([
    admin.from("crm_mb3m_pieces").select("piece_number, booking_id").or(numberFilter).limit(40),
    admin.from("crm_mb3m_account_invoices").select("piece_number, customer_id").or(numberFilter).limit(40),
    admin.from("crm_booking_documents").select("file_name, kind, booking_id").or(fileFilter).limit(40),
  ]);
  const bookingIds = new Set<string>();
  const pending: { number: string; bookingId: string | null; customerId: string | null }[] = [];
  for (const row of (mb3m.data || []) as { piece_number?: string | null; booking_id?: string | null }[]) {
    const number = clean(row.piece_number);
    const bookingId = clean(row.booking_id);
    if (!number || !numbers.some((digits) => numberMatches(number, digits))) continue;
    if (bookingId) bookingIds.add(bookingId);
    pending.push({ number, bookingId: bookingId || null, customerId: null });
  }
  for (const row of (documents.data || []) as { file_name?: string | null; kind?: string | null; booking_id?: string | null }[]) {
    if (!isInvoicePieceKind(row.kind)) continue;
    const name = clean(row.file_name);
    const bookingId = clean(row.booking_id);
    const number = numbers.find((digits) => numberMatches(name, digits));
    if (!number || !bookingId) continue;
    bookingIds.add(bookingId);
    pending.push({ number, bookingId, customerId: null });
  }
  const bookings = bookingIds.size
    ? await admin
        .from("crm_bookings")
        .select("id, reference, customer_id, billing_customer_id")
        .in("id", [...bookingIds])
    : { data: [] as { id: string; reference?: string | null; customer_id?: string | null; billing_customer_id?: string | null }[] };
  const byBooking = new Map<string, { customerId: string; reference: string | null }>();
  for (const row of (bookings.data || []) as {
    id: string;
    reference?: string | null;
    customer_id?: string | null;
    billing_customer_id?: string | null;
  }[]) {
    const customerId = clean(row.billing_customer_id) || clean(row.customer_id);
    if (row.id && customerId) byBooking.set(row.id, { customerId, reference: clean(row.reference) || null });
  }
  const pieces: PayerPiece[] = [];
  for (const row of pending) {
    const booking = row.bookingId ? byBooking.get(row.bookingId) : undefined;
    if (!booking) continue;
    pieces.push({
      number: row.number,
      customerId: booking.customerId,
      bookingId: row.bookingId,
      reference: booking.reference,
    });
  }
  for (const row of (account.data || []) as { piece_number?: string | null; customer_id?: string | null }[]) {
    const number = clean(row.piece_number);
    const customerId = clean(row.customer_id);
    if (!number || !customerId || !numbers.some((digits) => numberMatches(number, digits))) continue;
    pieces.push({ number, customerId, bookingId: null, reference: null });
  }
  return pieces;
}
