import "server-only";

import { pliantCardCaption, pliantCardNomination, pliantDesignation } from "./eta-il-fee";
import { gmailConfigured, searchInbox } from "./gmail";
import { hotelContact, leHotelIdFromItem } from "./hotel-contact";
import { hotelDisplayName } from "./carnet";
import { holidaysFor } from "./holidays";
import {
  CHECKIN_CARD_CENTS,
  addIsoDays,
  emailAddress,
  hotelCardOriginNote,
  hotelCardWindow,
  hotelChannel,
  isoDate,
  leStayAmount,
  parisIsoDate,
  PAST_STAY_LOG,
  pliantEurLimitCents,
  pliantRefusalIsFinal,
  pliantStopCovers,
  pliantStopNote,
  documentMoney,
  majorToCents,
  planHotelArrival,
  principalGuest,
  quotedAmount,
  replyPaymentUrl,
  stayCardDonor,
  stayProvision,
  classifyPaymentPage,
  type ArrivalTick,
  type StayProvision,
} from "./hotel-arrival";
import { passportPreviewsForStay } from "./preview-files";
import { stayDatesOpen } from "./stay-moment";
import {
  MANUAL_CARD_NOTE,
  manualStayCardDraft,
  stayCardIsManual,
} from "./manual-stay-card";
import { manualPliantCardIds, rememberPliantCard, setRememberedCardLimit } from "./pliant-card-run";
import { issuePliantCard, pliantConfigured, readPliantCardFace, setPliantCardLimit } from "./pliant";
import { pliantReferenceRates } from "./visa-ecb";
import { isActiveItem } from "./types";
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
  /** Unités de devise pour 1 euro. Le cron les charge une fois. */
  fxRates?: Record<string, number>;
  issueCard?: (body: unknown) => Promise<{ cardId: string | null }>;
  setLimit?: (cardId: string, limit: { value: number; currency: string }, count: number) => Promise<void>;
  findReplies?: (emails: string[], sinceMs: number) => Promise<Reply[]>;
};

type CardAttempt = {
  cardId: string | null;
  row: CrmHotelArrival;
  note: string;
  final: boolean;
  alert: boolean;
  limitCents: number;
  originNote: string;
};

type BookingRow = {
  id: string;
  status: string;
  currency: string | null;
  reference: string | null;
  customer_id: string;
  end_date?: string | null;
};

type ItemRow = CrmBookingItem & { booking?: BookingRow | BookingRow[] | null };

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
  /** Nom du compte. Distinct du titulaire imprimé. */
  client?: string | null;
  designation: string;
  reference?: string | null;
  limitCents: number;
  currency: string;
  validFrom: string;
  validTo: string;
}) {
  const name = pliantCardNomination({ firstName: input.firstName, lastName: input.lastName });
  const caption = pliantCardCaption({
    client: (input.client || "").trim() || input.lastName,
    place: input.designation,
    reference: input.reference,
  });
  const money = { value: input.limitCents, currency: input.currency };
  return {
    holder: `${name.customFirstName} ${name.customLastName}`.trim(),
    body: {
      organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
      cardConfig: "PLIANT_VIRTUAL",
      label: caption?.label || pliantDesignation(input.designation) || name.label,
      purpose: caption?.purpose || caption?.label || name.label,
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

/** Carte au montant saisi. Le libellé Pliant porte le client, l’hôtel et la référence. */
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
  const window = hotelCardWindow(today, isoDate(item.end_at));
  if (!window.ok) throw new Error("Ce séjour est déjà passé.");
  const { data: bookingData } = await admin
    .from("crm_bookings")
    .select("reference, customer_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  const booking = bookingData as { reference?: string | null; customer_id?: string | null } | null;
  const { data: customerData } = booking?.customer_id
    ? await admin.from("crm_customers").select("last_name").eq("id", booking.customer_id).maybeSingle()
    : { data: null };
  const account = ((customerData as { last_name?: string | null } | null)?.last_name || "").trim();
  const draft = manualStayCardDraft({
    amount: input.amount,
    firstName: input.firstName,
    lastName: input.lastName,
    validFrom: window.validFrom,
    validTo: window.validTo,
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
    client: account || input.lastName,
    place: hotelDisplayName(item),
    reference: booking?.reference || null,
  });
  if ("error" in draft) throw new Error(draft.error);
  if (!pliantConfigured()) throw new Error("Pliant n'est pas branché.");

  const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", draft.body);
  if (!issued.cardId) throw new Error("Pliant n'a pas créé la carte.");
  const last4 = (await readPliantCardFace(issued.cardId)).last4;

  const patch = {
    pliant_card_id: issued.cardId,
    card_last4: last4,
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

async function referenceRates(deps: ArrivalDeps) {
  if (deps.fxRates) return deps.fxRates;
  const rates = await pliantReferenceRates(deps.fetchImpl || fetch);
  deps.fxRates = rates;
  return rates;
}

async function eurCeilingFor(provision: { ceilingCents: number; currency: string }, deps: ArrivalDeps) {
  const code = currencyCode(provision.currency);
  if (code === "EUR") return pliantEurLimitCents(provision.ceilingCents, "EUR", 1);
  const rates = await referenceRates(deps);
  return pliantEurLimitCents(provision.ceilingCents, code, rates[code]);
}

function keptTaskNote(previous: string | null, originNote: string) {
  if (originNote && (!previous || previous.startsWith("Pliant") || previous === PAST_STAY_LOG)) return originNote;
  if (previous?.startsWith("Pliant") || previous === PAST_STAY_LOG) return originNote || null;
  return previous;
}

/** Carte non créée : séjour passé ou refus définitif, une seule fois. */
async function saveUnissued(
  admin: Admin,
  row: CrmHotelArrival,
  patch: Partial<CrmHotelArrival>,
  ready: CardAttempt
): Promise<CrmHotelArrival | null> {
  if (ready.cardId) return null;
  if (ready.note === PAST_STAY_LOG) {
    if (row.blocked_reason === "past" && row.task_note === PAST_STAY_LOG) return { ...row, ...patch };
    const next: Partial<CrmHotelArrival> = {
      ...patch,
      status: "blocked",
      blocked_reason: "past",
      task_open: false,
      task_note: PAST_STAY_LOG,
    };
    await save(admin, row.id, next);
    return { ...row, ...next, pliant_card_id: null };
  }
  if (ready.final && !ready.alert) return row;
  if (ready.alert) console.error("[hotel-arrival] alerte", ready.note);
  const next: Partial<CrmHotelArrival> = ready.final
    ? { ...patch, status: "blocked", blocked_reason: "pliant", task_open: true, task_note: ready.note }
    : { ...patch, task_open: true, task_note: ready.note || "Pliant n'a pas créé la carte." };
  await save(admin, row.id, next);
  return { ...row, ...next, pliant_card_id: null };
}

/** Émet ou aligne la carte Pliant sur le prix de l'hôtel, plus 30 %. */
async function alignStayCard(input: {
  admin: Admin;
  row: CrmHotelArrival;
  item: CrmBookingItem;
  bookingStatus: string;
  bookingEndDate: string | null;
  bookingCurrency: string | null;
  travelers: CrmBookingTraveler[];
  holder: { first_name: string | null; last_name: string | null } | null;
  le: { cents: number; currency: string } | null;
  parisToday: string;
  deps: ArrivalDeps;
  limitManual?: boolean;
  stayItems?: CrmBookingItem[];
  stayArrivals?: CrmHotelArrival[];
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
  };
  const open = input.bookingStatus === "confirmed" && stayDatesOpen(input.bookingEndDate, input.parisToday);
  const priceMoved =
    row.amount_cents !== provision.baseCents || row.currency !== provision.currency || row.channel !== channel;
  if (!open) {
    if (priceMoved) await save(input.admin, row.id, basePatch);
    return { ...row, ...basePatch };
  }
  if (!row.pliant_card_id) {
    if (!isActiveItem(input.item)) {
      if (priceMoved) await save(input.admin, row.id, basePatch);
      return { ...row, ...basePatch };
    }
    const donor = stayCardDonor(input.item, input.stayItems || [], input.stayArrivals || []);
    if (donor) {
      await save(input.admin, donor.arrivalId, { pliant_card_id: null, card_last4: null });
      const previous = (input.stayArrivals || []).find((entry) => entry.id === donor.arrivalId);
      if (previous) {
        previous.pliant_card_id = null;
        previous.card_last4 = null;
      }
      const eur = await eurCeilingFor(provision, input.deps);
      await save(input.admin, row.id, {
        ...basePatch,
        card_limit_cents: eur ?? row.card_limit_cents,
        pliant_card_id: donor.cardId,
        card_last4: donor.last4,
      });
      return {
        ...row,
        ...basePatch,
        card_limit_cents: eur ?? row.card_limit_cents,
        pliant_card_id: donor.cardId,
        card_last4: donor.last4,
      };
    }
    const ready = await ensureCard({
      admin: input.admin,
      row,
      item: input.item,
      travelers: input.travelers,
      holder: input.holder,
      limitCents: provision.ceilingCents,
      currency: provision.currency,
      parisToday: input.parisToday,
      checkOut: isoDate(input.item.end_at),
      deps: input.deps,
    });
    const stopped = await saveUnissued(input.admin, row, basePatch, ready);
    if (stopped) return stopped;
    const note = keptTaskNote(row.task_note, ready.originNote);
    const reopened = row.blocked_reason === "pliant" || row.blocked_reason === "past";
    const patch = {
      ...basePatch,
      card_limit_cents: ready.limitCents,
      pliant_card_id: ready.cardId,
      card_last4: ready.row.card_last4,
      task_note: note,
      task_open: note && note !== ready.originNote ? row.task_open : false,
      ...(reopened ? { blocked_reason: null, status: row.status === "blocked" ? "pending" : row.status } : {}),
    };
    await save(input.admin, row.id, patch);
    return { ...ready.row, ...patch };
  }
  const eurCeiling = await eurCeilingFor(provision, input.deps);
  const originNote = hotelCardOriginNote(provision.ceilingCents, provision.currency);
  if (
    eurCeiling != null &&
    !input.limitManual &&
    (row.card_limit_cents || 0) < eurCeiling &&
    !pliantStopCovers(row.task_note, provision.ceilingCents, provision.currency)
  ) {
    try {
      if (!pliantConfigured() && !input.deps.setLimit) throw new Error("Pliant n'est pas branché.");
      const setLimit = input.deps.setLimit || setPliantCardLimit;
      await setLimit(row.pliant_card_id, { value: eurCeiling, currency: "EUR" }, 20);
      await rememberPliantCard(input.admin, {
        pliant_card_id: row.pliant_card_id,
        booking_id: row.booking_id,
        limit_cents: eurCeiling,
        currency: "EUR",
        ...(originNote ? { note: originNote } : {}),
      });
      row.card_limit_cents = eurCeiling;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pliant n'a pas modifié le plafond.";
      if (pliantRefusalIsFinal(message)) {
        const note = pliantStopNote(message, provision.ceilingCents, provision.currency);
        if (row.task_note === note && row.blocked_reason === "pliant") return row;
        console.error("[hotel-arrival] alerte", message);
        const patch: Partial<CrmHotelArrival> = {
          ...basePatch,
          status: "blocked",
          blocked_reason: "pliant",
          task_open: true,
          task_note: note,
        };
        await save(input.admin, row.id, patch);
        return { ...row, ...patch };
      }
      const note = message.startsWith("Pliant") ? message : "Pliant n'a pas modifié le plafond.";
      await save(input.admin, row.id, { ...basePatch, task_open: true, task_note: note });
      return { ...row, ...basePatch, task_open: true, task_note: note };
    }
  }
  const note = keptTaskNote(row.task_note, originNote);
  const patch = { ...basePatch, card_limit_cents: row.card_limit_cents, task_note: note };
  if (priceMoved || note !== row.task_note || row.card_limit_cents !== input.row.card_limit_cents) {
    await save(input.admin, row.id, patch);
  }
  return { ...row, ...patch };
}

export async function syncStayCards(
  admin: Admin,
  input: {
    bookingId: string;
    bookingStatus: string;
    bookingEndDate: string | null;
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
  const manualCards = await manualPliantCardIds(
    admin,
    rows.map((row) => row.pliant_card_id || "")
  );
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
      bookingEndDate: input.bookingEndDate,
      bookingCurrency: input.currency,
      travelers: input.travelers,
      holder: input.holder,
      le,
      parisToday,
      deps,
      limitManual: Boolean(row.pliant_card_id && manualCards.has(row.pliant_card_id)),
      stayItems: hotels,
      stayArrivals: rows,
    });
  }
  await raiseSharedStayLimit(admin, rows, deps, manualCards);
  return rows;
}

async function raiseSharedStayLimit(
  admin: Admin,
  rows: Pick<
    CrmHotelArrival,
    "pliant_card_id" | "card_closed_at" | "status" | "card_limit_cents" | "currency" | "booking_id" | "task_note"
  >[],
  deps: ArrivalDeps,
  manualCards: Set<string>
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
  if (!cardId || manualCards.has(cardId)) return;
  const onCard = open.filter((row) => row.pliant_card_id === cardId);
  if (onCard.length < 2) return;
  const sum = onCard.reduce((total, row) => total + (row.card_limit_cents || 0), 0);
  if (sum <= 0) return;
  try {
    if (!pliantConfigured() && !deps.setLimit) return;
    const setLimit = deps.setLimit || ((id, limit, count) => setRememberedCardLimit(admin, id, limit, count, false));
    await setLimit(cardId, { value: sum, currency: "EUR" }, 20);
    if (deps.setLimit) {
      await rememberPliantCard(admin, {
        pliant_card_id: cardId,
        booking_id: onCard.find((row) => row.booking_id)?.booking_id || null,
        limit_cents: sum,
        currency: "EUR",
      });
    }
  } catch (error) {
    console.error("[hotel-arrival] plafond", error instanceof Error ? error.message : "carte");
  }
}

async function save(admin: Admin, id: string, patch: Partial<CrmHotelArrival>) {
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
  ] as const satisfies readonly (keyof CrmHotelArrival)[];
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
    .select("*, booking:crm_bookings!inner(id, status, currency, reference, customer_id, end_date)")
    .eq("kind", "hotel")
    .gte("start_at", windowStart)
    .lte("start_at", `${windowEnd}T23:59:59.999Z`);
  const items = new Map<string, ItemRow>();
  for (const row of (upcoming || []) as ItemRow[]) items.set(row.id, row);
  const missing = open.map((row) => row.booking_item_id).filter((id) => !items.has(id));
  if (missing.length) {
    const { data: extra } = await admin
      .from("crm_booking_items")
      .select("*, booking:crm_bookings!inner(id, status, currency, reference, customer_id, end_date)")
      .in("id", missing);
    for (const row of (extra || []) as ItemRow[]) items.set(row.id, row);
  }
  const arrivals = new Map(open.map((row) => [row.booking_item_id, row]));
  for (const item of items.values()) {
    const booking = embeddedBooking(item);
    if (!booking || booking.status !== "confirmed" || !stayDatesOpen(booking.end_date, parisToday)) continue;
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
        stayItems: [...items.values()].filter((row) => row.booking_id === booking.id),
        stayArrivals: [...arrivals.values()].filter((row) => row.booking_id === booking.id),
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
  stayItems: CrmBookingItem[];
  stayArrivals: CrmHotelArrival[];
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
  const arrivalManual = await manualPliantCardIds(input.admin, [input.arrival.pliant_card_id || ""]);
  let row = await alignStayCard({
    admin: input.admin,
    row: input.arrival,
    item: input.item,
    bookingStatus: input.booking.status,
    bookingEndDate: input.booking.end_date || null,
    bookingCurrency: input.booking.currency,
    travelers: input.travelers,
    holder: input.holder,
    le,
    parisToday: input.parisToday,
    deps: input.deps,
    limitManual: Boolean(input.arrival.pliant_card_id && arrivalManual.has(input.arrival.pliant_card_id)),
    stayItems: input.stayItems,
    stayArrivals: input.stayArrivals,
  });
  const { data: limitRows } = await input.admin
    .from("crm_hotel_arrivals")
    .select("pliant_card_id, card_closed_at, status, card_limit_cents, currency, booking_id, task_note")
    .eq("booking_id", input.booking.id);
  const sharedRows = (limitRows || []) as Pick<
    CrmHotelArrival,
    "pliant_card_id" | "card_closed_at" | "status" | "card_limit_cents" | "currency" | "booking_id" | "task_note"
  >[];
  await raiseSharedStayLimit(
    input.admin,
    sharedRows,
    input.deps,
    await manualPliantCardIds(
      input.admin,
      sharedRows.map((row) => row.pliant_card_id || "")
    )
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
      bookingEndDate: input.booking.end_date || null,
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
        await setLimit(row.pliant_card_id, { value: 0, currency: "EUR" }, 0);
      }
      row = { ...row, status: "closed", card_closed_at: input.now.toISOString(), card_limit_cents: 0 };
      await save(input.admin, row.id, row);
      break;
    }
    if (plan.action === "pay") {
      if (!row.pliant_card_id && !isActiveItem(input.item)) break;
      const provision = stayProvisionFor(input.item, row, input.booking.currency, le);
      const limitCents = provision?.ceilingCents ?? quoted.cents;
      if (limitCents == null) {
        row = { ...row, status: "blocked", blocked_reason: "amount", task_open: true, task_note: "Montant manquant pour émettre la carte." };
        await save(input.admin, row.id, row);
        break;
      }
      const payCurrency = provision?.currency || currencyCode(quoted.currency);
      const ready = await ensureCard({
        admin: input.admin,
        row,
        item: input.item,
        travelers: input.travelers,
        holder: input.holder,
        limitCents,
        currency: payCurrency,
        parisToday: input.parisToday,
        checkOut: isoDate(input.item.end_at),
        deps: input.deps,
      });
      const stopped = await saveUnissued(input.admin, row, {
        amount_cents: provision?.baseCents ?? quoted.cents,
        currency: payCurrency,
      }, ready);
      if (stopped) {
        row = stopped;
        break;
      }
      row = {
        ...ready.row,
        status: "paying",
        card_limit_cents: ready.limitCents,
        amount_cents: provision?.baseCents ?? quoted.cents,
        currency: payCurrency,
        task_note: ready.originNote || row.task_note,
        task_open: ready.originNote ? false : row.task_open,
      };
      await save(input.admin, row.id, {
        pliant_card_id: row.pliant_card_id,
        card_last4: row.card_last4,
        card_limit_cents: ready.limitCents,
        amount_cents: provision?.baseCents ?? quoted.cents,
        currency: payCurrency,
        status: "paying",
        task_note: row.task_note,
        task_open: row.task_open,
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
  item: CrmBookingItem;
  travelers: CrmBookingTraveler[];
  holder: { first_name: string | null; last_name: string | null } | null;
  limitCents: number;
  currency: string;
  parisToday: string;
  checkOut: string;
  deps: ArrivalDeps;
}): Promise<CardAttempt> {
  const empty = (note: string, extra: Partial<CardAttempt> = {}): CardAttempt => ({
    cardId: null,
    row: input.row,
    note,
    final: false,
    alert: false,
    limitCents: input.limitCents,
    originNote: "",
    ...extra,
  });
  if (input.row.pliant_card_id) {
    return { ...empty(""), cardId: input.row.pliant_card_id, limitCents: input.row.card_limit_cents || input.limitCents };
  }
  const window = hotelCardWindow(input.parisToday, input.checkOut);
  if (!window.ok) {
    const already = input.row.task_note === PAST_STAY_LOG && input.row.blocked_reason === "past";
    if (!already) console.error("[hotel-arrival] séjour passé");
    return empty(PAST_STAY_LOG, { final: true });
  }
  const code = currencyCode(input.currency);
  if (pliantStopCovers(input.row.task_note, input.limitCents, code)) {
    return empty(input.row.task_note || "", { final: true });
  }
  const eurCents = await eurCeilingFor({ ceilingCents: input.limitCents, currency: code }, input.deps);
  if (eurCents == null) {
    const message = `Cours indisponible (${code}).`;
    return empty(pliantStopNote(message, input.limitCents, code), { final: true, alert: true });
  }
  if (!pliantConfigured() && !input.deps.issueCard) return empty("Pliant n'est pas branché.", { limitCents: eurCents });
  const originNote = hotelCardOriginNote(input.limitCents, code);
  const guest = guestName(input.travelers, input.holder);
  const { data: bookingRow } = await input.admin
    .from("crm_bookings")
    .select("reference")
    .eq("id", input.row.booking_id)
    .maybeSingle();
  const spec = cardBody({
    firstName: guest.firstName,
    lastName: guest.lastName,
    client: (input.holder?.last_name || "").trim() || guest.lastName,
    designation: hotelDisplayName(input.item),
    reference: (bookingRow as { reference?: string | null } | null)?.reference || null,
    limitCents: eurCents,
    currency: "EUR",
    validFrom: window.validFrom,
    validTo: window.validTo,
  });
  try {
    const issue = input.deps.issueCard || ((body) => issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", body));
    const issued = await issue(spec.body);
    if (!issued.cardId) return empty("Pliant n'a pas créé la carte.", { limitCents: eurCents, originNote });
    const last4 = input.deps.issueCard ? null : (await readPliantCardFace(issued.cardId)).last4;
    const recordLabel = originNote ? `${spec.body.label} · ${originNote.replace(/^Origine /, "")}` : spec.body.label;
    await rememberPliantCard(input.admin, {
      pliant_card_id: issued.cardId,
      booking_id: input.row.booking_id,
      label: recordLabel,
      last4,
      limit_cents: eurCents,
      currency: "EUR",
      ...(originNote ? { note: originNote } : {}),
    });
    const row = {
      ...input.row,
      pliant_card_id: issued.cardId,
      card_last4: last4 || input.row.card_last4,
      card_limit_cents: eurCents,
      currency: input.currency,
    };
    return { cardId: issued.cardId, row, note: originNote, final: false, alert: false, limitCents: eurCents, originNote };
  } catch (error) {
    const message = error instanceof Error ? error.message : "carte";
    console.error("[hotel-arrival] pliant", message);
    if (pliantRefusalIsFinal(message)) {
      return empty(pliantStopNote(message, input.limitCents, code), { final: true, alert: true, limitCents: eurCents });
    }
    return empty("Pliant n'a pas créé la carte.", { limitCents: eurCents });
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
