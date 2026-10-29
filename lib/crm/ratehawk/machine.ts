/**
 * Machine d’états Ratehawk / ETG v3.
 * Le seul succès est `status: ok` de /order/booking/finish/status/.
 * Un `ok` de /order/booking/finish/ laisse la réservation en cours.
 */

export type FrontendStatus = "success" | "failed" | "in_progress";

export type EtgHttp = {
  httpStatus: number;
  status: string | null;
  error: string | null;
};

export type FormDecision =
  | { action: "proceed"; frontend: "in_progress" }
  | { action: "retry_new_partner_order_id"; frontend: "in_progress"; reason: string }
  | { action: "restart_search"; frontend: "failed"; reason: string }
  | { action: "fail"; frontend: "failed"; reason: string };

export type FinishDecision =
  | { action: "poll"; frontend: "in_progress"; reason?: string }
  | { action: "fail"; frontend: "failed"; reason: string };

export type StatusDecision =
  | { action: "success"; frontend: "success" }
  | { action: "pending"; frontend: "in_progress"; reason: string }
  | { action: "fail"; frontend: "failed"; reason: string };

export const FORM_MAX_ATTEMPTS = 10;
export const STATUS_POLL_INTERVAL_MS = 5_000;

const FORM_RETRY = new Set(["timeout", "unknown", "double_booking_form", "duplicate_reservation"]);

const FORM_FAIL = new Set([
  "contract_mismatch",
  "hotel_not_found",
  "insufficient_b2b_balance",
  "reservation_is_not_allowed",
  "rate_not_found",
  "sandbox_restriction",
]);

const FINISH_FAIL = new Set([
  "booking_form_expired",
  "rate_not_found",
  "return_path_required",
  "book_hash_not_found",
  "chosen_payment_type_was_not_available_on_booking_form",
  "credit_card_required",
  "double_booking_finish",
  "email",
  "incorrect_chosen_payment_type",
  "incorrect_guests_number",
  "incorrect_children_data",
  "incorrect_rooms_number",
  "insufficient_b2b_balance",
  "order_not_found",
  "unauthorized_group_booking",
  "arrival_date_differs_from_checkin_date",
  "not_enough_credit_card_data",
  "incorrect_init_uuid_format",
  "incorrect_pay_uuid_format",
  "sandbox_restriction",
  "supplier_data_required",
]);

/** Erreurs finales de /order/booking/finish/status/, y compris la liste post-réservation. */
export const STATUS_FINAL_ERRORS = [
  "3ds",
  "block",
  "book_limit",
  "booking_finish_did_not_succeed",
  "charge",
  "decoding_json",
  "endpoint_exceeded_limit",
  "endpoint_not_active",
  "endpoint_not_found",
  "incorrect_credentials",
  "invalid_auth_header",
  "invalid_params",
  "lock",
  "no_auth_header",
  "not_allowed",
  "not_allowed_host",
  "order_not_found",
  "overdue_debt",
  "provider",
  "soldout",
  "unexpected_method",
] as const;

const STATUS_FINAL = new Set<string>(STATUS_FINAL_ERRORS);

function retryForm(reason: string, attempt: number): FormDecision {
  if (attempt >= FORM_MAX_ATTEMPTS) return { action: "restart_search", frontend: "failed", reason };
  return { action: "retry_new_partner_order_id", frontend: "in_progress", reason };
}

export function decideBookingForm(outcome: EtgHttp, attempt: number): FormDecision {
  const transient =
    outcome.httpStatus === 0 || outcome.httpStatus >= 500 || (outcome.error != null && FORM_RETRY.has(outcome.error));
  if (transient) return retryForm(outcome.error || `http_${outcome.httpStatus || "timeout"}`, attempt);
  if (outcome.status === "ok" && !outcome.error) return { action: "proceed", frontend: "in_progress" };
  if (outcome.error && FORM_FAIL.has(outcome.error)) return { action: "fail", frontend: "failed", reason: outcome.error };
  if (outcome.error) return { action: "fail", frontend: "failed", reason: outcome.error };
  return { action: "fail", frontend: "failed", reason: outcome.status || "unexpected" };
}

export function decideBookingFinish(outcome: EtgHttp): FinishDecision {
  if (outcome.httpStatus === 0 || outcome.httpStatus >= 500) {
    return { action: "poll", frontend: "in_progress", reason: outcome.httpStatus ? `http_${outcome.httpStatus}` : "timeout" };
  }
  if (outcome.error === "timeout" || outcome.error === "unknown") {
    return { action: "poll", frontend: "in_progress", reason: outcome.error };
  }
  if (outcome.status === "ok" && !outcome.error) return { action: "poll", frontend: "in_progress" };
  if (outcome.error && FINISH_FAIL.has(outcome.error)) return { action: "fail", frontend: "failed", reason: outcome.error };
  if (outcome.error) return { action: "fail", frontend: "failed", reason: outcome.error };
  return { action: "fail", frontend: "failed", reason: outcome.status || "unexpected" };
}

export function decideBookingStatus(outcome: EtgHttp): StatusDecision {
  if (outcome.status === "ok" && !outcome.error) return { action: "success", frontend: "success" };
  if (outcome.httpStatus === 0 || outcome.httpStatus >= 500) {
    return { action: "pending", frontend: "in_progress", reason: outcome.httpStatus ? `http_${outcome.httpStatus}` : "timeout" };
  }
  if (outcome.status === "processing" && !outcome.error) {
    return { action: "pending", frontend: "in_progress", reason: "processing" };
  }
  if (outcome.error === "timeout" || outcome.error === "unknown") {
    return { action: "pending", frontend: "in_progress", reason: outcome.error };
  }
  if (outcome.status === "3ds" || outcome.error === "3ds") return { action: "fail", frontend: "failed", reason: "3ds" };
  if (outcome.error && STATUS_FINAL.has(outcome.error)) return { action: "fail", frontend: "failed", reason: outcome.error };
  if (outcome.error) return { action: "fail", frontend: "failed", reason: outcome.error };
  return { action: "pending", frontend: "in_progress", reason: outcome.status || "processing" };
}

export function applyCutoff(decision: StatusDecision, nowMs: number, deadlineMs: number): StatusDecision {
  if (decision.action !== "pending") return decision;
  if (nowMs >= deadlineMs) return { action: "fail", frontend: "failed", reason: "booking_cutoff" };
  return decision;
}

/** Attente avant le prochain status. Le dernier appel part dans la dernière seconde. */
export function nextStatusWaitMs(nowMs: number, deadlineMs: number, intervalMs = STATUS_POLL_INTERVAL_MS): number | "stop" {
  const remaining = deadlineMs - nowMs;
  if (remaining <= 0) return "stop";
  if (remaining <= intervalMs + 1000) return Math.max(0, remaining - 1000);
  return intervalMs;
}

export type PollPlan = "call" | "wait" | "fail_cutoff";

export function pollPlan(nowMs: number, lastPolledMs: number | null, deadlineMs: number, intervalMs = STATUS_POLL_INTERVAL_MS): PollPlan {
  const finalWindow = deadlineMs - 1000;
  if (nowMs >= deadlineMs) {
    if (lastPolledMs != null && lastPolledMs >= finalWindow) return "fail_cutoff";
    return "call";
  }
  if (nowMs >= finalWindow) {
    if (lastPolledMs != null && lastPolledMs >= finalWindow) return "wait";
    return "call";
  }
  if (lastPolledMs == null || nowMs - lastPolledMs >= intervalMs) return "call";
  return "wait";
}

export type CancelDecision = "ok" | "retry" | "fail";

/** Un seul nouvel essai, et seulement sur timeout. */
export function decideCancel(outcome: EtgHttp, attempt: number): CancelDecision {
  if (outcome.status === "ok" && !outcome.error) return "ok";
  const timeout = outcome.httpStatus === 0 || outcome.error === "timeout";
  if (timeout && attempt < 2) return "retry";
  return "fail";
}

export type WebhookSignal = "confirmed" | "failed" | "ignore";

export function decideWebhook(status: string | null | undefined): WebhookSignal {
  const value = (status || "").trim().toLowerCase();
  if (value === "confirmed" || value === "completed") return "confirmed";
  if (value === "failed" || value === "fail") return "failed";
  return "ignore";
}

export type BookingPhase = "in_progress" | "success" | "failed" | "cancelled";

/** Le webhook est enregistré. Il ne confirme pas et n’échoue pas la réservation. */
export function mergeWebhook(current: BookingPhase, signal: WebhookSignal): { status: BookingPhase; webhook_status: WebhookSignal } {
  return { status: current, webhook_status: signal };
}

export type StatusStep = { at: number; outcome: EtgHttp };

/** Rejoue une suite de réponses status jusqu’au succès, à l’échec, ou à l’échéance. */
export function reduceStatus(
  script: EtgHttp[],
  startMs: number,
  deadlineMs: number,
  intervalMs = STATUS_POLL_INTERVAL_MS
): { frontend: FrontendStatus; reason: string | null; calls: number } {
  let now = startMs;
  let calls = 0;
  let last: number | null = null;
  let index = 0;
  while (index < script.length) {
    const plan = pollPlan(now, last, deadlineMs, intervalMs);
    if (plan === "fail_cutoff") return { frontend: "failed", reason: "booking_cutoff", calls };
    if (plan === "wait") {
      const wait = nextStatusWaitMs(now, deadlineMs, intervalMs);
      if (wait === "stop") return { frontend: "failed", reason: "booking_cutoff", calls };
      now += Math.max(typeof wait === "number" ? wait : 0, 1);
      if (now >= deadlineMs) return { frontend: "failed", reason: "booking_cutoff", calls };
      continue;
    }
    const outcome = script[index];
    index += 1;
    calls += 1;
    last = now;
    const decision = applyCutoff(decideBookingStatus(outcome), now, deadlineMs);
    if (decision.action === "success") return { frontend: "success", reason: null, calls };
    if (decision.action === "fail") return { frontend: "failed", reason: decision.reason, calls };
    const wait = nextStatusWaitMs(now, deadlineMs, intervalMs);
    if (wait === "stop") {
      now = deadlineMs;
      continue;
    }
    now += Math.max(wait, 1);
  }
  if (pollPlan(deadlineMs, last, deadlineMs, intervalMs) === "fail_cutoff") {
    return { frontend: "failed", reason: "booking_cutoff", calls };
  }
  return { frontend: "in_progress", reason: "processing", calls };
}
