import "server-only";

import { pliantCardNomination } from "./eta-il-fee";
import { gmailConfigured, searchInbox } from "./gmail";
import { hotelContact, leHotelIdFromItem } from "./hotel-contact";
import { hotelDisplayName } from "./carnet";
import {
  CHECKIN_CARD_CENTS,
  addIsoDays,
  cardCloseDate,
  countryIso,
  emailAddress,
  holidayDatesFromNager,
  hotelChannel,
  isoDate,
  leStayAmount,
  nagerHolidayUrl,
  parisIsoDate,
  documentMoney,
  majorToCents,
  planHotelArrival,
  principalGuest,
  quotedAmount,
  replyPaymentUrl,
  stayProvision,
  classifyPaymentPage,
  type ArrivalTick,
  type StayProvision,
} from "./hotel-arrival";
import { passportPreviewsForStay } from "./preview-files";
import {
  MANUAL_CARD_NOTE,
  manualStayCardDraft,
  stayCardCanBeShared,
  stayCardIsManual,
} from "./manual-stay-card";
import { issuePliantCard, pliantConfigured, setPliantCardLimit } from "./pliant";
import type {
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCustomer,
  CrmHotelArrival,
  CrmTravelDocument,
  HotelArrivalChannel,
} from "./types";
import type { Db } from "../supabase/db";

type Admin = Db;

type Reply = { from: string; subject: string; body: string; receivedAtMs: number };

export type ArrivalDeps = {
  now?: Date;
  fetchImpl?: typeof fetch;
  issueCard?: (body: unknown) => Promise<{ cardId: string | null }>;
  setLimit?: (cardId: string, limit: { value: number; currency: string }, count: number) => Promise<void>;
  findReplies?: (emails: string[], sinceMs: number) => Promise<Reply[]>;
};

type BookingRow = {
  id: string;
  status: string;
  currency: string | null;
  reference: string | null;
  customer_id: string;
};

type ItemRow = CrmBookingItem & { booking?: BookingRow | BookingRow[] | null };

const ACTIVE = new Set(["confirmed", "travelling"]);

function embeddedBooking(item: ItemRow): BookingRow | null {
  const booking = item.booking;
  if (Array.isArray(booking)) return booking[0] || null;
  return booking || null;
}

function sourceFamily(item: CrmBookingItem) {
  const value = item.details?.source_family;
  return typeof value === "string" ? value : "";
}

function channelOf(item: CrmBookingItem): HotelArrivalChannel {
  return hotelChannel({
    sourceFamily: sourceFamily(item),
    supplier: item.supplier,
    leHotelId: leHotelIdFromItem(item),
  });
}

function currencyCode(value: string | null | undefined) {
  const code = (value || "EUR").toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

function safeEmail(value: string) {
  const email = emailAddress(value);
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) ? email : "";
}

function hotelEmails(item: CrmBookingItem) {
  const contact = hotelContact(item);
  const all = [contact.email, ...contact.people.map((person) => person.email)];
  return [...new Set(all.map(safeEmail).filter(Boolean))];
}

function cardBody(input: {
  firstName: string;
  lastName: string;
  limitCents: number;
  currency: string;
  validFrom: string;
  validTo: string;
}) {
  const name = pliantCardNomination({ firstName: input.firstName, lastName: input.lastName });
  const money = { value: input.limitCents, currency: input.currency };
  return {
    holder: `${name.customFirstName} ${name.customLastName}`.trim(),
    body: {
      organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
      cardConfig: "PLIANT_VIRTUAL_TRAVEL",
      label: name.label,
      customFirstName: name.customFirstName,
      customLastName: name.customLastName,
      limit: money,
      transactionLimit: money,
      limitRenewFrequency: "TOTAL" as const,
      maxTransactionCount: input.limitCents === CHECKIN_CARD_CENTS ? 20 : 8,
      validFrom: input.validFrom,
      validTo: input.validTo,
      validTimezone: "Europe/Paris",
    },
  };
}

async function defaultFindReplies(emails: string[], sinceMs: number): Promise<Reply[]> {
  const replies: Reply[] = [];
  const safe = emails.map(safeEmail).filter(Boolean);
  if (gmailConfigured() && safe.length) {
    const since = new Date(sinceMs);
    const stamp = `${since.getUTCFullYear()}/${String(since.getUTCMonth() + 1).padStart(2, "0")}/${String(since.getUTCDate()).padStart(2, "0")}`;
    const query = `after:${stamp} (${safe.map((email) => `from:${email}`).join(" OR ")})`;
    try {
      const messages = await searchInbox(query, 8);
      for (const message of messages) {
        const receivedAtMs = message.receivedAt ? Date.parse(message.receivedAt) : sinceMs;
        replies.push({
          from: message.fromEmail || message.from,
          subject: message.subject,
          body: message.text || message.html,
          receivedAtMs: Number.isFinite(receivedAtMs) ? receivedAtMs : sinceMs,
        });
      }
    } catch (error) {
      console.error("[hotel-arrival] gmail", error instanceof Error ? error.message : "search");
    }
  }
  return replies;
}

async function holidaysFor(
  country: string,
  checkIn: string,
  fetchImpl: typeof fetch,
  cache: Map<string, string[]>
) {
  const iso = countryIso(country);
  const year = Number((checkIn || "").slice(0, 4));
  if (!iso || !year) return [];
  const key = `${iso}:${year}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dates: string[] = [];
  for (const current of [year - 1, year]) {
    try {
      const res = await fetchImpl(nagerHolidayUrl(current, iso), { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      dates.push(...holidayDatesFromNager(await res.json()));
    } catch {
      continue;
    }
  }
  cache.set(key, dates);
  return dates;
}

export async function ensureHotelArrivals(admin: Admin, bookingId: string, items: CrmBookingItem[]) {
  const hotels = items.filter((item) => item.kind === "hotel");
  if (!hotels.length) return;
  const { data, error } = await admin.from("crm_hotel_arrivals").select("booking_item_id").eq("booking_id", bookingId);
  if (error) return;
  const have = new Set(((data || []) as { booking_item_id?: string }[]).map((row) => row.booking_item_id));
  const rows = hotels
    .filter((item) => !have.has(item.id))
    .map((item) => ({
      booking_id: bookingId,
      booking_item_id: item.id,
      channel: channelOf(item),
    }));
  if (rows.length) await admin.from("crm_hotel_arrivals").insert(rows);
}

/** Carte au montant saisi, libellée nom et prénom, sans restriction, sur le porteur configuré. */
export async function issueManualStayCard(
  admin: Admin,
  input: { bookingId: string; itemId: string; amount: string; firstName: string; lastName: string }
) {
  const { data: itemData } = await admin
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", input.bookingId)
    .eq("id", input.itemId)
    .maybeSingle();
  const item = itemData as CrmBookingItem | null;
  if (!item || item.kind !== "hotel") throw new Error("Hôtel introuvable.");

  const { data: existingData } = await admin
    .from("crm_hotel_arrivals")
    .select("id, pliant_card_id")
    .eq("booking_id", input.bookingId)
    .eq("booking_item_id", input.itemId)
    .maybeSingle();
  const existing = existingData as { id: string; pliant_card_id: string | null } | null;
  if (existing?.pliant_card_id) throw new Error("Une carte est déjà liée à ce séjour.");

  const today = parisIsoDate(new Date());
  const checkout = isoDate(item.end_at) || isoDate(item.start_at) || today;
  const closeOn = cardCloseDate(checkout);
  const draft = manualStayCardDraft({
    amount: input.amount,
    firstName: input.firstName,
    lastName: input.lastName,
    validFrom: today,
    validTo: closeOn < today ? today : closeOn,
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
  });
  if ("error" in draft) throw new Error(draft.error);
  if (!pliantConfigured()) throw new Error("Pliant n'est pas branché.");

  const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", draft.body);
  if (!issued.cardId) throw new Error("Pliant n'a pas créé la carte.");

  const patch = {
    pliant_card_id: issued.cardId,
    card_limit_cents: draft.body.limit.value,
    currency: "EUR",
    task_open: false,
    task_note: MANUAL_CARD_NOTE,
  };
  if (existing?.id) {
    await admin.from("crm_hotel_arrivals").update(patch).eq("id", existing.id);
  } else {
    await admin.from("crm_hotel_arrivals").insert({
      booking_id: input.bookingId,
      booking_item_id: input.itemId,
      channel: channelOf(item),
      ...patch,
    });
  }
  return { ok: true as const };
}

function stayProvisionFor(
  item: CrmBookingItem,
  row: Pick<CrmHotelArrival, "channel" | "net_cents">,
  bookingCurrency: string | null,
  le: { cents: number; currency: string } | null
): StayProvision | null {
  const document = documentMoney(item.details);
  return stayProvision({
    channel: row.channel,
    itemCents: majorToCents(item.amount),
    documentCents: document.cents,
    documentCurrency: document.currency,
    leCents: le?.cents ?? null,
    leCurrency: le?.currency ?? null,
    netCents: row.net_cents,
    savedBaseCents: null,
    bookingCurrency,
  });
}

/** Émet ou aligne la carte Pliant sur le prix de l'hôtel, plus 30 %. */
async function alignStayCard(input: {
  admin: Admin;
  row: CrmHotelArrival;
  item: CrmBookingItem;
  bookingStatus: string;
  bookingCurrency: string | null;
  travelers: CrmBookingTraveler[];
  holder: { first_name: string | null; last_name: string | null } | null;
  le: { cents: number; currency: string } | null;
  parisToday: string;
  deps: ArrivalDeps;
  reuseCardId?: string | null;
}) {
  const channel = channelOf(input.item);
  const row = input.row.channel === channel ? input.row : { ...input.row, channel };
  if (row.pliant_card_id && stayCardIsManual(row.task_note)) {
    if (row.channel !== input.row.channel) await save(input.admin, row.id, { channel });
    return row;
  }
  if (row.status === "closed" || row.card_closed_at) {
    if (row.channel !== input.row.channel) await save(input.admin, row.id, { channel });
    return row;
  }
  const provision = stayProvisionFor(input.item, row, input.bookingCurrency, input.le);
  if (!provision) {
    if (row.channel !== input.row.channel) await save(input.admin, row.id, { channel });
    return row;
  }
  const basePatch = {
    channel,
    amount_cents: provision.baseCents,
    currency: provision.currency,
    card_limit_cents: provision.ceilingCents,
  };
  const open = ACTIVE.has(input.bookingStatus);
  const aligned =
    row.amount_cents === provision.baseCents &&
    row.card_limit_cents === provision.ceilingCents &&
    row.currency === provision.currency &&
    row.channel === channel;
  if (!open) {
    if (!aligned) await save(input.admin, row.id, basePatch);
    return { ...row, ...basePatch };
  }
  if (!row.pliant_card_id) {
    if (input.reuseCardId) {
      const cleared = row.task_note?.startsWith("Pliant") ? { task_open: false, task_note: null } : {};
      await save(input.admin, row.id, { ...basePatch, pliant_card_id: input.reuseCardId, ...cleared });
      return { ...row, ...basePatch, pliant_card_id: input.reuseCardId, ...cleared };
    }
    const ready = await ensureCard({
      admin: input.admin,
      row,
      travelers: input.travelers,
      holder: input.holder,
      limitCents: provision.ceilingCents,
      currency: provision.currency,
      parisToday: input.parisToday,
      checkOut: isoDate(input.item.end_at) || isoDate(input.item.start_at),
      deps: input.deps,
    });
    if (!ready.cardId) {
      const note = ready.note || "Pliant n'a pas créé la carte.";
      await save(input.admin, row.id, { ...basePatch, task_open: true, task_note: note });
      return { ...row, ...basePatch, pliant_card_id: null, task_open: true, task_note: note };
    }
    const cleared = row.task_note?.startsWith("Pliant") ? { task_open: false, task_note: null } : {};
    await save(input.admin, row.id, { ...basePatch, pliant_card_id: ready.cardId, ...cleared });
    return { ...ready.row, ...basePatch, pliant_card_id: ready.cardId, ...cleared };
  }
  if (aligned && !row.task_note?.startsWith("Pliant")) return row;
  if (row.card_limit_cents !== provision.ceilingCents) {
    try {
      if (!pliantConfigured() && !input.deps.setLimit) throw new Error("Pliant n'est pas branché.");
      const setLimit = input.deps.setLimit || setPliantCardLimit;
      await setLimit(row.pliant_card_id, { value: provision.ceilingCents, currency: provision.currency }, 20);
    } catch (error) {
      const note = error instanceof Error && error.message.startsWith("Pliant") ? error.message : "Pliant n'a pas modifié le plafond.";
      await save(input.admin, row.id, { ...basePatch, task_open: true, task_note: note });
      return { ...row, ...basePatch, task_open: true, task_note: note };
    }
  }
  const cleared = row.task_note?.startsWith("Pliant") ? { task_open: false, task_note: null } : {};
  await save(input.admin, row.id, { ...basePatch, ...cleared });
  return { ...row, ...basePatch, ...cleared };
}

export async function syncStayCards(
  admin: Admin,
  input: {
    bookingId: string;
    bookingStatus: string;
    currency: string | null;
    items: CrmBookingItem[];
    travelers: CrmBookingTraveler[];
    holder: { first_name: string | null; last_name: string | null } | null;
    deps?: ArrivalDeps;
  }
) {
  await ensureHotelArrivals(admin, input.bookingId, input.items);
  const { data } = await admin.from("crm_hotel_arrivals").select("*").eq("booking_id", input.bookingId);
  const rows = (data || []) as CrmHotelArrival[];
  const hotels = input.items.filter((item) => item.kind === "hotel");
  if (!hotels.length) return rows;
  const { data: leData } = await admin
    .from("crm_le_bookings")
    .select("hotel_name, check_in, total_cost, currency")
    .eq("crm_booking_id", input.bookingId);
  const leRows = ((leData || []) as { hotel_name?: string | null; check_in?: string | null; total_cost?: string | null; currency?: string | null }[]).map(
    (row) => ({
      checkIn: row.check_in || null,
      hotelName: row.hotel_name || null,
      total: row.total_cost || null,
      currency: row.currency || null,
    })
  );
  const parisToday = parisIsoDate(input.deps?.now || new Date());
  const deps = input.deps || {};
  let sharedCardId = rows.find((row) => stayCardCanBeShared(row))?.pliant_card_id || null;
  for (const item of hotels) {
    const row = rows.find((entry) => entry.booking_item_id === item.id);
    if (!row) continue;
    const le = leStayAmount({ checkIn: isoDate(item.start_at), hotelName: hotelDisplayName(item) }, leRows);
    const index = rows.findIndex((entry) => entry.id === row.id);
    rows[index] = await alignStayCard({
      admin,
      row,
      item,
      bookingStatus: input.bookingStatus,
      bookingCurrency: input.currency,
      travelers: input.travelers,
      holder: input.holder,
      le,
      parisToday,
      deps,
      reuseCardId: sharedCardId,
    });
    const issued = rows[index];
    if (stayCardCanBeShared(issued) && !sharedCardId) {
      sharedCardId = issued.pliant_card_id;
    }
  }
  await raiseSharedStayLimit(rows, deps);
  return rows;
}

async function raiseSharedStayLimit(
  rows: Pick<CrmHotelArrival, "pliant_card_id" | "card_closed_at" | "status" | "card_limit_cents" | "currency" | "task_note">[],
  deps: ArrivalDeps
) {
  const open = rows.filter(
    (row) =>
      row.pliant_card_id &&
      !row.card_closed_at &&
      row.status !== "closed" &&
      (row.card_limit_cents || 0) > 0 &&
      !stayCardIsManual(row.task_note)
  );
  const ids = [...new Set(open.map((row) => row.pliant_card_id))];
  if (ids.length !== 1) return;
  const cardId = ids[0];
  if (!cardId) return;
  const onCard = open.filter((row) => row.pliant_card_id === cardId);
  if (onCard.length < 2) return;
  const currency = onCard[0].currency;
  if (!currency || onCard.some((row) => row.currency !== currency)) return;
  const sum = onCard.reduce((total, row) => total + (row.card_limit_cents || 0), 0);
  if (sum <= 0) return;
  try {
    if (!pliantConfigured() && !deps.setLimit) return;
    const setLimit = deps.setLimit || setPliantCardLimit;
    await setLimit(cardId, { value: sum, currency }, 20);
  } catch (error) {
    console.error("[hotel-arrival] plafond", error instanceof Error ? error.message : "carte");
  }
}

async function save(admin: Admin, id: string, patch: Record<string, unknown>) {
  const allowed = [
    "channel",
    "status",
    "net_cents",
    "amount_cents",
    "currency",
    "pliant_card_id",
    "card_last4",
    "card_limit_cents",
    "payment_url",
    "requested_at",
    "relance_count",
    "last_relance_at",
    "paid_at",
    "vip_sent_at",
    "card_closed_at",
    "blocked_reason",
    "task_open",
    "task_note",
  ];
  const row: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in patch) row[key] = patch[key];
  }
  await admin.from("crm_hotel_arrivals").update(row).eq("id", id);
}

export async function runHotelArrivals(admin: Admin, deps: ArrivalDeps = {}, onlyItemId?: string) {
  const now = deps.now || new Date();
  const parisToday = parisIsoDate(now);
  const fetchImpl = deps.fetchImpl || fetch;
  const { data: openRows } = await admin.from("crm_hotel_arrivals").select("*").neq("status", "closed");
  const open = (openRows || []) as CrmHotelArrival[];
  const windowStart = addIsoDays(parisToday, -8);
  const windowEnd = addIsoDays(parisToday, 45);
  const { data: upcoming } = await admin
    .from("crm_booking_items")
    .select("*, booking:crm_bookings!inner(id, status, currency, reference, customer_id)")
    .eq("kind", "hotel")
    .gte("start_at", windowStart)
    .lte("start_at", `${windowEnd}T23:59:59.999Z`);
  const items = new Map<string, ItemRow>();
  for (const row of (upcoming || []) as ItemRow[]) items.set(row.id, row);
  const missing = open.map((row) => row.booking_item_id).filter((id) => !items.has(id));
  if (missing.length) {
    const { data: extra } = await admin
      .from("crm_booking_items")
      .select("*, booking:crm_bookings!inner(id, status, currency, reference, customer_id)")
      .in("id", missing);
    for (const row of (extra || []) as ItemRow[]) items.set(row.id, row);
  }
  const arrivals = new Map(open.map((row) => [row.booking_item_id, row]));
  for (const item of items.values()) {
    const booking = embeddedBooking(item);
    if (!booking || !ACTIVE.has(booking.status)) continue;
    if (arrivals.has(item.id)) continue;
    const channel = channelOf(item);
    const { data: inserted } = await admin
      .from("crm_hotel_arrivals")
      .insert({ booking_id: booking.id, booking_item_id: item.id, channel })
      .select("*")
      .maybeSingle();
    if (inserted) arrivals.set(item.id, inserted as CrmHotelArrival);
  }

  const bookingIds = [...new Set([...items.values()].map((item) => item.booking_id))];
  const customerIds = [
    ...new Set(
      [...items.values()]
        .map((item) => embeddedBooking(item)?.customer_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const [{ data: travelerRows }, { data: customerRows }, { data: docRows }, { data: leRows }] = await Promise.all([
    bookingIds.length
      ? admin.from("crm_booking_travelers").select("*").in("booking_id", bookingIds)
      : Promise.resolve({ data: [] }),
    customerIds.length
      ? admin.from("crm_customers").select("id, first_name, last_name").in("id", customerIds)
      : Promise.resolve({ data: [] }),
    customerIds.length
      ? admin.from("crm_travel_documents").select("*").in("customer_id", customerIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin
          .from("crm_le_bookings")
          .select("crm_booking_id, hotel_name, check_in, total_cost, currency")
          .in("crm_booking_id", bookingIds)
      : Promise.resolve({ data: [] }),
  ]);
  const travelers = (travelerRows || []) as CrmBookingTraveler[];
  const customers = new Map(
    ((customerRows || []) as Pick<CrmCustomer, "id" | "first_name" | "last_name">[]).map((row) => [row.id, row])
  );
  const documents = (docRows || []) as CrmTravelDocument[];
  const leByBooking = new Map<string, { checkIn: string | null; hotelName: string | null; total: string | null; currency: string | null }[]>();
  for (const row of (leRows || []) as {
    crm_booking_id?: string | null;
    hotel_name?: string | null;
    check_in?: string | null;
    total_cost?: string | null;
    currency?: string | null;
  }[]) {
    if (!row.crm_booking_id) continue;
    const list = leByBooking.get(row.crm_booking_id) || [];
    list.push({
      checkIn: row.check_in || null,
      hotelName: row.hotel_name || null,
      total: row.total_cost || null,
      currency: row.currency || null,
    });
    leByBooking.set(row.crm_booking_id, list);
  }

  const holidayCache = new Map<string, string[]>();
  let acted = 0;
  for (const arrival of arrivals.values()) {
    if (onlyItemId && arrival.booking_item_id !== onlyItemId) continue;
    const item = items.get(arrival.booking_item_id);
    if (!item) continue;
    const booking = embeddedBooking(item);
    if (!booking) continue;
    try {
      const steps = await stepArrival({
        admin,
        arrival,
        item,
        booking,
        travelers: travelers.filter((row) => row.booking_id === booking.id),
        holder: customers.get(booking.customer_id) || null,
        documents: documents.filter((row) => row.customer_id === booking.customer_id),
        leRows: leByBooking.get(booking.id) || [],
        now,
        parisToday,
        fetchImpl,
        holidayCache,
        deps,
      });
      acted += steps;
    } catch (error) {
      console.error("[hotel-arrival]", arrival.id, error instanceof Error ? error.message : "échec");
    }
  }
  return { acted, watched: arrivals.size };
}

async function stepArrival(input: {
  admin: Admin;
  arrival: CrmHotelArrival;
  item: CrmBookingItem;
  booking: BookingRow;
  travelers: CrmBookingTraveler[];
  holder: { first_name: string | null; last_name: string | null } | null;
  documents: CrmTravelDocument[];
  leRows: { checkIn: string | null; hotelName: string | null; total: string | null; currency: string | null }[];
  now: Date;
  parisToday: string;
  fetchImpl: typeof fetch;
  holidayCache: Map<string, string[]>;
  deps: ArrivalDeps;
}) {
  const contact = hotelContact(input.item);
  const emails = hotelEmails(input.item);
  const checkIn = isoDate(input.item.start_at);
  const checkOut = isoDate(input.item.end_at) || checkIn;
  const holidays = await holidaysFor(contact.country, checkIn, input.fetchImpl, input.holidayCache);
  const channel = channelOf(input.item);
  const le = leStayAmount({ checkIn, hotelName: hotelDisplayName(input.item) }, input.leRows);
  const quoted = quotedAmount({
    channel,
    leCents: le?.cents ?? null,
    leCurrency: le?.currency ?? null,
    netCents: input.arrival.net_cents,
    bookingCurrency: input.booking.currency,
  });
  const { data: siblings } = await input.admin
    .from("crm_hotel_arrivals")
    .select("pliant_card_id, card_closed_at, status, task_note")
    .eq("booking_id", input.booking.id);
  const reuseCardId =
    ((siblings || []) as Pick<CrmHotelArrival, "pliant_card_id" | "card_closed_at" | "status" | "task_note">[]).find(
      (row) => stayCardCanBeShared(row)
    )?.pliant_card_id || null;
  let row = await alignStayCard({
    admin: input.admin,
    row: input.arrival,
    item: input.item,
    bookingStatus: input.booking.status,
    bookingCurrency: input.booking.currency,
    travelers: input.travelers,
    holder: input.holder,
    le,
    parisToday: input.parisToday,
    deps: input.deps,
    reuseCardId,
  });
  const { data: limitRows } = await input.admin
    .from("crm_hotel_arrivals")
    .select("pliant_card_id, card_closed_at, status, card_limit_cents, currency, task_note")
    .eq("booking_id", input.booking.id);
  await raiseSharedStayLimit(
    (limitRows || []) as Pick<
      CrmHotelArrival,
      "pliant_card_id" | "card_closed_at" | "status" | "card_limit_cents" | "currency" | "task_note"
    >[],
    input.deps
  );
  if (!row.payment_url && row.requested_at && emails.length) {
    const since = Date.parse(row.requested_at);
    const find = input.deps.findReplies || defaultFindReplies;
    const replies = await find(emails, since);
    const ingest = await ingestReplies(input.admin, emails, since);
    const url = [...replies, ...ingest]
      .map((reply) => replyPaymentUrl({ ...reply, requestedAtMs: since, hotelEmails: emails }))
      .find((value): value is string => Boolean(value));
    if (url) {
      row = { ...row, payment_url: url, status: row.status === "link_requested" ? "link_received" : row.status };
      await save(input.admin, row.id, { payment_url: url, status: row.status });
    }
  }

  const passports = passportPreviewsForStay(input.travelers, input.documents, input.holder, input.booking.reference);
  const namedTravelers = input.travelers.filter((traveler) => (traveler.first_name || traveler.last_name || "").trim());
  let steps = 0;
  for (let guard = 0; guard < 4; guard += 1) {
    const tick: ArrivalTick = {
      status: row.status,
      channel,
      parisToday: input.parisToday,
      nowMs: input.now.getTime(),
      checkIn,
      checkOut,
      holidays,
      emails,
      amountCents: channel === "expedia" ? CHECKIN_CARD_CENTS : quoted.cents,
      passportCount: passports.length,
      travelerCount: namedTravelers.length,
      requestedAtMs: row.requested_at ? Date.parse(row.requested_at) : null,
      relanceCount: row.relance_count || 0,
      lastRelanceAtMs: row.last_relance_at ? Date.parse(row.last_relance_at) : null,
      paymentUrl: row.payment_url,
      bookingStatus: input.booking.status,
      cardId: row.pliant_card_id,
      cardClosed: Boolean(row.card_closed_at),
      blockedReason: row.blocked_reason,
    };
    const plan = planHotelArrival(tick);
    if (plan.action === "wait") break;
    steps += 1;
    if (plan.action === "task") {
      row = {
        ...row,
        status: "blocked",
        blocked_reason: plan.reason,
        task_open: true,
        task_note: plan.note,
      };
      await save(input.admin, row.id, row);
      break;
    }
    if (plan.action === "close") {
      if (row.pliant_card_id && !row.card_closed_at) {
        const setLimit = input.deps.setLimit || setPliantCardLimit;
        await setLimit(row.pliant_card_id, { value: 0, currency: currencyCode(row.currency) }, 0);
      }
      row = { ...row, status: "closed", card_closed_at: input.now.toISOString(), card_limit_cents: 0 };
      await save(input.admin, row.id, row);
      break;
    }
    if (plan.action === "pay") {
      const provision = stayProvisionFor(input.item, row, input.booking.currency, le);
      const limitCents = provision?.ceilingCents ?? quoted.cents;
      if (limitCents == null) {
        row = { ...row, status: "blocked", blocked_reason: "amount", task_open: true, task_note: "Montant manquant pour émettre la carte." };
        await save(input.admin, row.id, row);
        break;
      }
      const ready = await ensureCard({
        admin: input.admin,
        row,
        travelers: input.travelers,
        holder: input.holder,
        limitCents,
        currency: provision?.currency || currencyCode(quoted.currency),
        parisToday: input.parisToday,
        checkOut,
        deps: input.deps,
      });
      if (!ready.cardId) {
        row = { ...row, status: "blocked", blocked_reason: "pliant", task_open: true, task_note: ready.note };
        await save(input.admin, row.id, row);
        break;
      }
      row = { ...ready.row, status: "paying", card_limit_cents: limitCents, amount_cents: provision?.baseCents ?? quoted.cents };
      await save(input.admin, row.id, {
        pliant_card_id: row.pliant_card_id,
        card_limit_cents: limitCents,
        amount_cents: provision?.baseCents ?? quoted.cents,
        currency: provision?.currency || currencyCode(quoted.currency),
        status: "paying",
      });
      const outcome = await classifyLink(row.payment_url || "", input.fetchImpl);
      if (outcome === "paid") {
        row = { ...row, status: "paid", paid_at: input.now.toISOString(), blocked_reason: null };
        await save(input.admin, row.id, { status: "paid", paid_at: row.paid_at, blocked_reason: null });
        continue;
      }
      row = {
        ...row,
        status: "blocked",
        blocked_reason: "payment",
        task_open: true,
        task_note:
          outcome === "failed"
            ? "Le lien de paiement n'a pas répondu."
            : "La page de paiement demande une validation. Le lien est prêt.",
      };
      await save(input.admin, row.id, row);
      break;
    }
  }
  return steps;
}

async function ingestReplies(admin: Admin, emails: string[], sinceMs: number): Promise<Reply[]> {
  const { data } = await admin
    .from("crm_email_ingest")
    .select("from_email, subject, body_text, body_html, received_at")
    .gte("received_at", new Date(sinceMs).toISOString())
    .order("received_at", { ascending: false })
    .limit(80);
  const known = new Set(emails.map(emailAddress));
  const replies: Reply[] = [];
  for (const row of (data || []) as {
    from_email?: string | null;
    subject?: string | null;
    body_text?: string | null;
    body_html?: string | null;
    received_at?: string | null;
  }[]) {
    const from = row.from_email || "";
    if (!known.has(emailAddress(from))) continue;
    replies.push({
      from,
      subject: row.subject || "",
      body: row.body_text || row.body_html || "",
      receivedAtMs: row.received_at ? Date.parse(row.received_at) : sinceMs,
    });
  }
  return replies;
}

async function classifyLink(url: string, fetchImpl: typeof fetch) {
  if (!url.startsWith("https://")) return "failed" as const;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
    const body = await res.text();
    return classifyPaymentPage({ ok: res.ok, url: res.url || url, body });
  } catch {
    return "failed" as const;
  }
}

function guestName(
  travelers: CrmBookingTraveler[],
  holder: { first_name: string | null; last_name: string | null } | null
) {
  return principalGuest({
    travelers,
    holder: holder
      ? { first_name: holder.first_name || "", last_name: holder.last_name || "" }
      : null,
  });
}

async function ensureCard(input: {
  admin: Admin;
  row: CrmHotelArrival;
  travelers: CrmBookingTraveler[];
  holder: { first_name: string | null; last_name: string | null } | null;
  limitCents: number;
  currency: string;
  parisToday: string;
  checkOut: string;
  deps: ArrivalDeps;
}) {
  if (input.row.pliant_card_id) return { cardId: input.row.pliant_card_id, row: input.row, note: "" };
  if (!pliantConfigured() && !input.deps.issueCard) return { cardId: null, row: input.row, note: "Pliant n'est pas branché." };
  const guest = guestName(input.travelers, input.holder);
  const spec = cardBody({
    firstName: guest.firstName,
    lastName: guest.lastName,
    limitCents: input.limitCents,
    currency: input.currency,
    validFrom: input.parisToday,
    validTo: cardCloseDate(input.checkOut || input.parisToday),
  });
  try {
    const issue = input.deps.issueCard || ((body) => issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", body));
    const issued = await issue(spec.body);
    if (!issued.cardId) return { cardId: null, row: input.row, note: "Pliant n'a pas créé la carte." };
    const row = {
      ...input.row,
      pliant_card_id: issued.cardId,
      card_limit_cents: input.limitCents,
      currency: input.currency,
    };
    return { cardId: issued.cardId, row, note: "" };
  } catch (error) {
    console.error("[hotel-arrival] pliant", error instanceof Error ? error.message : "carte");
    return { cardId: null, row: input.row, note: "Pliant n'a pas créé la carte." };
  }
}

export async function advanceHotelItem(admin: Admin, bookingId: string, itemId: string, deps: ArrivalDeps = {}) {
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("booking_item_id", itemId)
    .maybeSingle();
  if (!data) return null;
  await runHotelArrivals(admin, deps, itemId);
  const { data: fresh } = await admin.from("crm_hotel_arrivals").select("*").eq("id", (data as CrmHotelArrival).id).maybeSingle();
  return (fresh || null) as CrmHotelArrival | null;
}
