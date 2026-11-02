import type { SupabaseClient } from "@supabase/supabase-js";
import type { SandboxOrderSuffix } from "./catalog";
import type { RatehawkConfig } from "./config";
import { requireBookingConfig, requireConfig } from "./config";
import { etgPost, newPartnerOrderId } from "./client";
import {
  decideBookingFinish,
  decideBookingForm,
  decideBookingStatus,
  decideCancel,
  pollPlan,
  type EtgHttp,
} from "./machine";
import { formPriceNeedsAcceptance, moneyNumber, priceDelta, sellFromNet } from "./pricing";
import { readQuote, signQuote, type RateQuote } from "./quote";
import { normalizeHotels, type ShownRate } from "./search";
import { ratehawkDb } from "./store";
import {
  assertSandboxScenario,
  guestsPayload,
  scenarioOrNull,
  validateBookingGuests,
  type FinishGuest,
  type RoomGuests,
} from "./limits";

function httpOf(call: { httpStatus: number; status: string | null; error: string | null }): EtgHttp {
  return { httpStatus: call.httpStatus, status: call.status, error: call.error };
}

export async function prebookRate(hash: string, hid: number, baselineShow: number, config = requireBookingConfig()) {
  if (!hash.startsWith("h-")) return { ok: false as const, error: "Le pré-réservation attend un book_hash d’hôtel (h-)." };
  const call = await etgPost(
    "/api/b2b/v3/hotel/prebook/",
    { hash, price_increase_percent: config.priceIncreasePercent },
    config.prebookTimeoutMs,
    null,
    config
  );
  const hotels = normalizeHotels(call.data, config, [], 50, true);
  const rate = hotels.flatMap((hotel) => hotel.rates).find((item) => item.book_hash.startsWith("p-")) || null;
  if (!rate) return { ok: false as const, error: call.error || "no_available_rates", call, rate: null as ShownRate | null };
  const next = moneyNumber(rate.show_amount) ?? moneyNumber(rate.amount) ?? 0;
  const delta = priceDelta(baselineShow, next);
  const quote: RateQuote = {
    book_hash: rate.book_hash,
    hid,
    amount: rate.amount,
    currency_code: rate.currency_code,
    show_amount: rate.show_amount,
    show_currency_code: rate.show_currency_code,
    payment_type: rate.payment_type,
    price_increased: delta.increased,
  };
  return { ok: true as const, call, rate, quote: signQuote(quote, config), price: { ...delta, before: baselineShow, after: next } };
}

type BookInput = {
  quoteToken: string;
  hid: number;
  hotelName: string;
  checkin: string;
  checkout: string;
  residency: string;
  searched: RoomGuests[];
  rooms: { guests: FinishGuest[] }[];
  priceAccepted: boolean;
  acceptFormPrice: boolean;
  scenario: string | null;
  dossier: string | null;
  userIp: string;
  partnerOrderId?: string | null;
};

type FormPayment = {
  type: string;
  amount: string;
  currency_code: string;
  needsCard: boolean;
  orderId: number | null;
};

function paymentFromForm(data: unknown, preferred: string): FormPayment | null {
  const row = data && typeof data === "object" ? (data as { payment_types?: Record<string, unknown>[]; order_id?: unknown }) : null;
  const types = row?.payment_types || [];
  const chosen = types.find((type) => type.type === preferred) || types.find((type) => type.type === "deposit") || types[0];
  if (!chosen) return null;
  return {
    type: String(chosen.type || ""),
    amount: String(chosen.amount || ""),
    currency_code: String(chosen.currency_code || ""),
    needsCard: Boolean(chosen.is_need_credit_card_data || chosen.is_need_cvc),
    orderId: typeof row?.order_id === "number" ? row.order_id : null,
  };
}

function bookingRow(
  config: RatehawkConfig,
  input: BookInput,
  quote: RateQuote,
  partnerOrderId: string,
  deadline: string,
  status: string,
  payment: FormPayment | null
) {
  const net = moneyNumber(quote.show_amount);
  return {
    partner_order_id: partnerOrderId,
    environment: config.environment,
    status,
    hid: input.hid,
    hotel_name: input.hotelName,
    checkin: input.checkin,
    checkout: input.checkout,
    residency: input.residency,
    guests: input.searched,
    rooms: guestsPayload(input.rooms),
    currency: quote.show_currency_code,
    net_amount: net,
    sell_amount: net == null ? null : sellFromNet(net, config.marginPercent),
    margin_percent: config.marginPercent,
    payment_type: payment?.type || quote.payment_type,
    book_hash: quote.book_hash,
    price_increased: quote.price_increased,
    etg_order_id: payment?.orderId ?? null,
    form_payment: payment,
    booking_started_at: new Date().toISOString(),
    deadline_at: deadline,
    dossier_ref: input.dossier,
  };
}

function finishBody(config: RatehawkConfig, input: BookInput, quote: RateQuote, partnerOrderId: string, payment: FormPayment) {
  const net = moneyNumber(quote.show_amount);
  const sell = net == null ? null : sellFromNet(net, config.marginPercent);
  const user: Record<string, string> = { email: config.agencyEmail };
  if (config.agencyPhone) user.phone = config.agencyPhone;
  const partner: Record<string, string> = { partner_order_id: partnerOrderId };
  if (sell != null && quote.show_currency_code === payment.currency_code) partner.amount_sell_b2b2c = sell.toFixed(2);
  return {
    user,
    partner,
    language: config.language,
    rooms: guestsPayload(input.rooms),
    payment_type: { type: payment.type, amount: payment.amount, currency_code: payment.currency_code },
  };
}

async function finishSaved(
  supabase: SupabaseClient,
  config: RatehawkConfig,
  input: BookInput,
  quote: RateQuote,
  row: { id: string; partner_order_id: string },
  payment: FormPayment
) {
  if (payment.needsCard || payment.type === "now") {
    await supabase.from("crm_ratehawk_bookings").update({ status: "failed", status_reason: "credit_card_required" }).eq("id", row.id);
    return { ok: false as const, status: "failed" as const, error: "Ce tarif demande une carte. L’agence réserve en deposit, sans numéro de carte.", partner_order_id: row.partner_order_id };
  }
  const finish = await etgPost(
    "/api/b2b/v3/hotel/order/booking/finish/",
    finishBody(config, input, quote, row.partner_order_id, payment),
    60_000,
    row.partner_order_id,
    config
  );
  const finished = decideBookingFinish(httpOf(finish));
  if (finished.action === "fail") {
    await supabase.from("crm_ratehawk_bookings").update({ status: "failed", status_reason: finished.reason }).eq("id", row.id);
    return { ok: false as const, status: "failed" as const, error: finished.reason, partner_order_id: row.partner_order_id, frontend: "failed" as const };
  }
  const deadline = new Date(Date.now() + config.bookingCutoffSeconds * 1000).toISOString();
  await supabase
    .from("crm_ratehawk_bookings")
    .update({ status: "in_progress", booking_started_at: new Date().toISOString(), deadline_at: deadline, status_reason: null })
    .eq("id", row.id);
  return { ok: true as const, status: "in_progress" as const, partner_order_id: row.partner_order_id, frontend: "in_progress" as const, id: row.id };
}

export async function startBooking(input: BookInput, supabase = ratehawkDb(), config = requireBookingConfig()) {
  const scenarioError = assertSandboxScenario(config.environment, input.scenario);
  if (scenarioError) return { ok: false as const, status: "failed" as const, error: scenarioError };
  const names = validateBookingGuests(input.rooms, input.searched);
  if (names) return { ok: false as const, status: "failed" as const, error: names };
  const quote = readQuote(input.quoteToken, config);
  if (!quote || quote.hid !== input.hid) {
    return { ok: false as const, status: "failed" as const, error: "Le tarif pré-réservé a expiré. Reprenez la fiche hôtel." };
  }
  if (quote.price_increased && !input.priceAccepted) {
    return { ok: false as const, status: "failed" as const, error: "Le prix a augmenté. Confirmez-le avant de réserver." };
  }
  if (quote.payment_type === "now") {
    return { ok: false as const, status: "failed" as const, error: "Le paiement carte ETG n’est pas ouvert. Le type deposit est celui de l’agence." };
  }

  if (input.partnerOrderId && input.acceptFormPrice) {
    const { data } = await supabase.from("crm_ratehawk_bookings").select("id, partner_order_id, form_payment, status, environment").eq("partner_order_id", input.partnerOrderId).maybeSingle();
    const existing = data as { id: string; partner_order_id: string; form_payment: FormPayment | null; status: string; environment: string } | null;
    if (!existing || existing.environment !== config.environment || existing.status !== "price_review" || !existing.form_payment) {
      return { ok: false as const, status: "failed" as const, error: "Aucune hausse de prix en attente pour cette réservation." };
    }
    return finishSaved(supabase, config, input, quote, existing, existing.form_payment);
  }

  let partnerOrderId = newPartnerOrderId(scenarioOrNull(input.scenario));
  const deadline = new Date(Date.now() + config.bookingCutoffSeconds * 1000).toISOString();

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const call = await etgPost(
      "/api/b2b/v3/hotel/order/booking/form/",
      { partner_order_id: partnerOrderId, book_hash: quote.book_hash, language: config.language, user_ip: input.userIp },
      20_000,
      partnerOrderId,
      config
    );
    const decision = decideBookingForm(httpOf(call), attempt);
    if (decision.action === "retry_new_partner_order_id") {
      partnerOrderId = newPartnerOrderId(null, partnerOrderId);
      continue;
    }
    if (decision.action !== "proceed") {
      return { ok: false as const, status: "failed" as const, error: decision.reason, frontend: decision.frontend };
    }
    const payment = paymentFromForm(call.data, config.paymentType);
    if (!payment) return { ok: false as const, status: "failed" as const, error: "Aucun type de paiement dans le formulaire." };
    const quoted = moneyNumber(quote.amount) ?? 0;
    const formAmount = moneyNumber(payment.amount) ?? quoted;
    const { data, error } = await supabase
      .from("crm_ratehawk_bookings")
      .insert(bookingRow(config, input, quote, partnerOrderId, deadline, formPriceNeedsAcceptance(quoted, formAmount, input.acceptFormPrice) ? "price_review" : "in_progress", payment))
      .select("id, partner_order_id")
      .single();
    if (error || !data) return { ok: false as const, status: "failed" as const, error: error?.message || "Enregistrement impossible." };
    const saved = data as { id: string; partner_order_id: string };
    if (formPriceNeedsAcceptance(quoted, formAmount, input.acceptFormPrice)) {
      return {
        ok: false as const,
        status: "price_increase" as const,
        partner_order_id: saved.partner_order_id,
        amount: payment.amount,
        currency_code: payment.currency_code,
        error: "Le formulaire Ratehawk indique un prix plus élevé. Confirmez-le pour lancer la réservation.",
      };
    }
    return finishSaved(supabase, config, input, quote, saved, payment);
  }
  return { ok: false as const, status: "failed" as const, error: "restart_search", frontend: "failed" as const };
}

type BookingRow = {
  id: string;
  partner_order_id: string;
  status: "in_progress" | "price_review" | "success" | "failed" | "cancelled";
  status_reason: string | null;
  deadline_at: string | null;
  last_polled_at: string | null;
  confirmed_at: string | null;
  order_info: unknown;
  order_info_at: string | null;
  crm_booking_id: string | null;
  dossier_ref: string | null;
  hid: number | null;
  hotel_name: string | null;
  checkin: string | null;
  checkout: string | null;
  sell_amount: number | null;
  currency: string | null;
  net_amount: number | null;
  environment: string;
};

export async function pollBooking(partnerOrderId: string, supabase = ratehawkDb(), config = requireConfig()) {
  const { data, error } = await supabase.from("crm_ratehawk_bookings").select("*").eq("partner_order_id", partnerOrderId).maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  const row = data as BookingRow | null;
  if (!row) return { ok: false as const, error: "Réservation introuvable." };
  if (row.environment !== config.environment) return { ok: false as const, error: "Cette réservation appartient à un autre environnement Ratehawk." };
  if (row.status === "price_review") {
    return { ok: true as const, status: "price_increase" as const, partner_order_id: row.partner_order_id, frontend: "in_progress" as const };
  }
  if (row.status !== "in_progress") {
    return { ok: true as const, status: row.status, reason: row.status_reason, partner_order_id: row.partner_order_id };
  }

  const now = Date.now();
  const deadline = row.deadline_at ? new Date(row.deadline_at).getTime() : now;
  const last = row.last_polled_at ? new Date(row.last_polled_at).getTime() : null;
  const plan = pollPlan(now, last, deadline);
  if (plan === "wait") return { ok: true as const, status: "in_progress" as const, partner_order_id: row.partner_order_id, frontend: "in_progress" as const };
  if (plan === "fail_cutoff") {
    await supabase.from("crm_ratehawk_bookings").update({ status: "failed", status_reason: "booking_cutoff" }).eq("id", row.id);
    return { ok: true as const, status: "failed" as const, reason: "booking_cutoff", partner_order_id: row.partner_order_id, frontend: "failed" as const };
  }
  const call = await etgPost("/api/b2b/v3/hotel/order/booking/finish/status/", { partner_order_id: partnerOrderId }, 30_000, partnerOrderId, config);
  let decision = decideBookingStatus(httpOf(call));
  if (Date.now() >= deadline && decision.action === "pending") {
    decision = { action: "fail", frontend: "failed", reason: "booking_cutoff" };
  }
  const patch: Record<string, unknown> = { last_polled_at: new Date().toISOString() };
  if (decision.action === "success") {
    patch.status = "success";
    patch.status_reason = null;
    patch.confirmed_at = new Date().toISOString();
  } else if (decision.action === "fail") {
    patch.status = "failed";
    patch.status_reason = decision.reason;
  }
  await supabase.from("crm_ratehawk_bookings").update(patch).eq("id", row.id);
  if (decision.action === "success") await linkDossier(supabase, { ...row, status: "success" });
  return {
    ok: true as const,
    status: decision.action === "pending" ? ("in_progress" as const) : decision.action === "success" ? ("success" as const) : ("failed" as const),
    reason: decision.action === "success" ? null : "reason" in decision ? decision.reason : null,
    partner_order_id: row.partner_order_id,
    frontend: decision.frontend,
    percent: typeof (call.data as { percent?: unknown } | null)?.percent === "number" ? (call.data as { percent: number }).percent : null,
  };
}

export async function fetchOrderInfoIfDue(partnerOrderId: string, supabase = ratehawkDb(), config = requireConfig()) {
  const { data } = await supabase.from("crm_ratehawk_bookings").select("*").eq("partner_order_id", partnerOrderId).maybeSingle();
  const row = data as BookingRow | null;
  if (!row || row.status !== "success" || row.order_info || !row.confirmed_at) return { skipped: true as const };
  const due = new Date(row.confirmed_at).getTime() + config.orderInfoDelaySeconds * 1000;
  if (Date.now() < due) return { skipped: true as const, wait_until: new Date(due).toISOString() };
  const call = await etgPost(
    "/api/b2b/v3/hotel/order/info/",
    {
      ordering: { ordering_type: "desc", ordering_by: "created_at" },
      pagination: { page_size: 1, page_number: 1 },
      search: { partner_order_ids: [partnerOrderId] },
      language: config.language,
    },
    30_000,
    partnerOrderId,
    config
  );
  await supabase.from("crm_ratehawk_bookings").update({ order_info: call.data, order_info_at: new Date().toISOString() }).eq("id", row.id);
  return { skipped: false as const, error: call.error };
}

export async function cancelBooking(partnerOrderId: string, supabase = ratehawkDb(), config = requireConfig()) {
  const { data } = await supabase.from("crm_ratehawk_bookings").select("id, status, environment, crm_booking_item_id").eq("partner_order_id", partnerOrderId).maybeSingle();
  const row = data as { id: string; status: string; environment: string; crm_booking_item_id: string | null } | null;
  if (!row) return { ok: false as const, error: "Réservation introuvable." };
  if (row.environment !== config.environment) return { ok: false as const, error: "Cette réservation appartient à un autre environnement Ratehawk." };
  if (row.status !== "success") return { ok: false as const, error: "Seule une réservation confirmée s’annule." };
  let lastError = "timeout";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const call = await etgPost("/api/b2b/v3/hotel/order/cancel/", { partner_order_id: partnerOrderId }, 30_000, partnerOrderId, config);
    const decision = decideCancel(httpOf(call), attempt);
    if (decision === "ok") {
      await supabase.from("crm_ratehawk_bookings").update({ status: "cancelled", status_reason: null }).eq("id", row.id);
      if (row.crm_booking_item_id) {
        await supabase.from("crm_booking_items").update({ lifecycle: "cancelled" }).eq("id", row.crm_booking_item_id);
      }
      return { ok: true as const, status: "cancelled" as const, partner_order_id: partnerOrderId };
    }
    lastError = call.error || `http_${call.httpStatus}`;
    if (decision === "fail") break;
  }
  return { ok: false as const, error: lastError, partner_order_id: partnerOrderId };
}

async function linkDossier(supabase: SupabaseClient, row: BookingRow) {
  if (!row.dossier_ref || row.crm_booking_id) return;
  const ref = row.dossier_ref.trim();
  const byId = /^[0-9a-f-]{36}$/i.test(ref);
  const found = await supabase.from("crm_bookings").select("id").eq(byId ? "id" : "reference", ref).maybeSingle();
  const bookingId = (found.data as { id?: string } | null)?.id;
  if (!bookingId) {
    await supabase.from("crm_ratehawk_bookings").update({ link_error: "Dossier introuvable." }).eq("id", row.id);
    return;
  }
  const inserted = await supabase
    .from("crm_booking_items")
    .insert({
      booking_id: bookingId,
      kind: "hotel",
      title: row.hotel_name || "Hôtel",
      supplier: "Ratehawk",
      confirmation_ref: row.partner_order_id,
      start_at: row.checkin,
      end_at: row.checkout,
      amount: row.sell_amount,
      visible_to_client: false,
      include_in_ledger: false,
      details: {
        source: "ratehawk",
        partner_order_id: row.partner_order_id,
        hid: row.hid,
        net_amount: row.net_amount,
        currency: row.currency,
        environment: row.environment,
      },
    })
    .select("id")
    .single();
  if (inserted.error) {
    await supabase.from("crm_ratehawk_bookings").update({ crm_booking_id: bookingId, link_error: inserted.error.message }).eq("id", row.id);
    return;
  }
  await supabase
    .from("crm_ratehawk_bookings")
    .update({ crm_booking_id: bookingId, crm_booking_item_id: (inserted.data as { id: string }).id, link_error: null })
    .eq("id", row.id);
}

export type { SandboxOrderSuffix };
