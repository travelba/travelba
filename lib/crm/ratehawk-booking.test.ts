import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { newPartnerOrderId } from "./ratehawk/client";
import { loadRatehawkConfig, RatehawkConfigError } from "./ratehawk/config";
import { formatUtcInParis, mealLabel, metapolicyLines, partitionTaxes, penaltyLines, rgExtEqual } from "./ratehawk/display";
import { validateBookingGuests, validateStay, validPersonName } from "./ratehawk/limits";
import {
  applyCutoff,
  decideBookingFinish,
  decideBookingForm,
  decideBookingStatus,
  decideCancel,
  decideWebhook,
  mergeWebhook,
  nextStatusWaitMs,
  pollPlan,
  reduceStatus,
  type EtgHttp,
} from "./ratehawk/machine";
import { formPriceNeedsAcceptance, marginPercent, sellFromNet } from "./ratehawk/pricing";
import { readQuote, signQuote } from "./ratehawk/quote";
import { redact } from "./ratehawk/redact";
import { searchBody } from "./ratehawk/search";

const today = new Date("2026-10-21T12:00:00Z");

function stay(overrides: Partial<Parameters<typeof validateStay>[0]> = {}) {
  return {
    checkin: "2026-11-20",
    checkout: "2026-11-22",
    residency: "fr",
    guests: [{ adults: 2, children: [] as number[] }],
    ...overrides,
  };
}

test("limites de recherche : chambres, âges, nuits, horizon, résidence, hids", () => {
  assert.equal(validateStay(stay(), today), null);
  assert.match(validateStay(stay({ residency: "" }), today) || "", /nationalité/);
  assert.match(validateStay(stay({ guests: Array.from({ length: 10 }, () => ({ adults: 1, children: [] })) }), today) || "", /Neuf/);
  assert.match(validateStay(stay({ guests: [{ adults: 7, children: [] }] }), today) || "", /6 adultes/);
  assert.match(validateStay(stay({ guests: [{ adults: 2, children: [1, 2, 3, 4, 5] }] }), today) || "", /Quatre enfants/);
  assert.match(validateStay(stay({ guests: [{ adults: 2, children: [18] }] }), today) || "", /17 ans/);
  assert.match(validateStay(stay({ checkin: "2026-11-01", checkout: "2026-12-05" }), today) || "", /30 nuits/);
  assert.match(validateStay(stay({ checkin: "2028-11-01", checkout: "2028-11-03" }), today) || "", /730/);
  assert.match(validateStay(stay({ hids: Array.from({ length: 301 }, (_, index) => index + 1) }), today) || "", /300/);
  assert.equal(validateStay(stay({ hids: [10004834, 8819557] }), today), null);
});

test("au moins un adulte réel par chambre, enfants nommés seulement s’ils sont vrais", () => {
  const searched = [{ adults: 2, children: [3] }, { adults: 2, children: [1, 5, 17] }];
  assert.equal(
    validateBookingGuests(
      [
        { guests: [{ first_name: "Martin", last_name: "Martin" }] },
        { guests: [{ first_name: "Olga", last_name: "Martin" }] },
      ],
      searched
    ),
    null
  );
  assert.match(validateBookingGuests([{ guests: [] }], [{ adults: 2, children: [] }]) || "", /adulte/);
  assert.equal(validPersonName("Test"), false);
  assert.equal(validPersonName("Child"), false);
  assert.match(
    validateBookingGuests([{ guests: [{ first_name: "Test", last_name: "User" }] }], [{ adults: 2, children: [] }]) || "",
    /vrai prénom/
  );
  assert.match(
    validateBookingGuests(
      [{ guests: [{ first_name: "Ada", last_name: "Martin" }, { first_name: "Lina", last_name: "Martin", is_child: true, age: 4 }] }],
      [{ adults: 2, children: [3] }]
    ) || "",
    /âge/
  );
});

test("le repas n’est jamais amélioré et les taxes exclues restent à part", () => {
  assert.equal(mealLabel("nomeal").label, "Sans repas");
  assert.equal(mealLabel("mystery-feast").label, "mystery-feast");
  assert.notEqual(mealLabel("nomeal").label, mealLabel("breakfast").label);
  const taxes = partitionTaxes([
    { name: "city_tax", included_by_supplier: false, amount: "10", currency_code: "EUR" },
    { name: "vat", included_by_supplier: true, amount: "2", currency_code: "EUR" },
  ]);
  assert.equal(taxes.excluded.length, 1);
  assert.equal(taxes.included.length, 1);
  assert.equal(sellFromNet(100, 12), 112);
  assert.equal(marginPercent(5), 12);
  assert.equal(formPriceNeedsAcceptance(100, 110, false), true);
  assert.equal(formPriceNeedsAcceptance(100, 110, true), false);
});

test("les pénalités UTC s’affichent à l’heure de Paris", () => {
  const lines = penaltyLines(
    [{ start_at: null, end_at: "2025-10-21T08:59:00", amount_show: "0.00" }],
    "2025-10-21T08:59:00",
    "EUR"
  );
  assert.match(lines[0].text, /10:59/);
  assert.match(lines[0].text, /heure de Paris/);
  assert.match(formatUtcInParis("2025-10-21T08:59:00") || "", /10:59/);
  assert.equal(rgExtEqual({ class: 3, quality: 2, bedding: 3 }, { class: 3, quality: 2, bedding: 3 }), true);
  assert.equal(rgExtEqual({ class: 3, quality: 2 }, { class: 3, quality: 1 }), false);
  assert.deepEqual(metapolicyLines({ pets: "no" }, "<b>Passeport</b> requis"), ["pets : no", "Passeport requis"]);
});

test("le formulaire régénère l’identifiant puis abandonne au dixième essai", () => {
  const ok: EtgHttp = { httpStatus: 200, status: "ok", error: null };
  assert.equal(decideBookingForm(ok, 1).action, "proceed");
  assert.equal(decideBookingForm(ok, 1).frontend, "in_progress");
  for (const error of ["timeout", "unknown", "double_booking_form", "duplicate_reservation"]) {
    const decision = decideBookingForm({ httpStatus: 200, status: "error", error }, 1);
    assert.equal(decision.action, "retry_new_partner_order_id", error);
    assert.equal(decision.frontend, "in_progress");
  }
  assert.equal(decideBookingForm({ httpStatus: 500, status: null, error: null }, 10).action, "restart_search");
  assert.equal(decideBookingForm({ httpStatus: 0, status: null, error: "timeout" }, 10).frontend, "failed");
  for (const error of ["contract_mismatch", "hotel_not_found", "insufficient_b2b_balance", "reservation_is_not_allowed", "rate_not_found", "sandbox_restriction"]) {
    const decision = decideBookingForm({ httpStatus: 400, status: "error", error }, 1);
    assert.equal(decision.action, "fail", error);
    assert.equal(decision.frontend, "failed");
  }
});

test("finish ok, timeout, unknown et 5xx restent en cours ; les autres erreurs échouent", () => {
  assert.equal(decideBookingFinish({ httpStatus: 200, status: "ok", error: null }).action, "poll");
  assert.equal(decideBookingFinish({ httpStatus: 200, status: "ok", error: null }).frontend, "in_progress");
  assert.equal(decideBookingFinish({ httpStatus: 504, status: null, error: null }).action, "poll");
  assert.equal(decideBookingFinish({ httpStatus: 200, status: "error", error: "timeout" }).frontend, "in_progress");
  assert.equal(decideBookingFinish({ httpStatus: 200, status: "error", error: "unknown" }).action, "poll");
  for (const error of ["booking_form_expired", "rate_not_found", "return_path_required"]) {
    const decision = decideBookingFinish({ httpStatus: 400, status: "error", error });
    assert.equal(decision.action, "fail", error);
    assert.equal(decision.frontend, "failed");
  }
});

test("seul le status ok confirme ; unknown continue ; soldout et book_limit échouent", () => {
  assert.equal(decideBookingStatus({ httpStatus: 200, status: "ok", error: null }).frontend, "success");
  assert.equal(decideBookingStatus({ httpStatus: 200, status: "processing", error: null }).frontend, "in_progress");
  assert.equal(decideBookingStatus({ httpStatus: 200, status: "error", error: "timeout" }).action, "pending");
  assert.equal(decideBookingStatus({ httpStatus: 200, status: "error", error: "unknown" }).action, "pending");
  assert.equal(decideBookingStatus({ httpStatus: 502, status: null, error: null }).action, "pending");
  for (const error of ["block", "charge", "3ds", "soldout", "provider", "book_limit", "not_allowed", "booking_finish_did_not_succeed"]) {
    const decision = decideBookingStatus({ httpStatus: 200, status: "error", error });
    assert.equal(decision.frontend, "failed", error);
    assert.equal("reason" in decision ? decision.reason : "", error);
  }
  const pending = decideBookingStatus({ httpStatus: 200, status: "error", error: "unknown" });
  const cutoff = applyCutoff(pending, 1_000, 1_000);
  assert.equal(cutoff.action, "fail");
  if (cutoff.action === "fail") assert.equal(cutoff.reason, "booking_cutoff");
});

test("les scénarios unknown du bac à sable suivent la machine jusqu’au bout", () => {
  const start = 0;
  const deadline = 30_000;
  const unknown: EtgHttp = { httpStatus: 200, status: "error", error: "unknown" };
  assert.equal(reduceStatus([unknown, { httpStatus: 200, status: "ok", error: null }], start, deadline).frontend, "success");
  assert.equal(reduceStatus([unknown, { httpStatus: 200, status: "error", error: "soldout" }], start, deadline).reason, "soldout");
  assert.equal(reduceStatus([unknown, { httpStatus: 200, status: "error", error: "book_limit" }], start, deadline).reason, "book_limit");
  assert.equal(reduceStatus([unknown], start, 1_000).reason, "booking_cutoff");
});

test("le dernier appel de statut part dans la dernière seconde", () => {
  assert.equal(nextStatusWaitMs(0, 12_000), 5_000);
  assert.equal(nextStatusWaitMs(7_000, 12_000), 4_000);
  assert.equal(pollPlan(0, null, 20_000), "call");
  assert.equal(pollPlan(1_000, 0, 20_000), "wait");
  assert.equal(pollPlan(19_100, 0, 20_000), "call");
  assert.equal(pollPlan(20_000, 19_100, 20_000), "fail_cutoff");
});

test("l’annulation retente une fois sur timeout, le webhook ne confirme pas", () => {
  assert.equal(decideCancel({ httpStatus: 200, status: "ok", error: null }, 1), "ok");
  assert.equal(decideCancel({ httpStatus: 0, status: null, error: "timeout" }, 1), "retry");
  assert.equal(decideCancel({ httpStatus: 200, status: "error", error: "timeout" }, 2), "fail");
  assert.equal(decideCancel({ httpStatus: 200, status: "error", error: "order_not_found" }, 1), "fail");
  const merged = mergeWebhook("in_progress", decideWebhook("confirmed"));
  assert.equal(merged.status, "in_progress");
  assert.equal(merged.webhook_status, "confirmed");
  assert.equal(mergeWebhook("in_progress", decideWebhook("failed")).status, "in_progress");
});

test("l’identifiant de scénario survit à une régénération, les environnements ne se mélangent pas", () => {
  const next = newPartnerOrderId(null, "11111111-1111-1111-1111-111111111111_unknown_soldout");
  assert.match(next, /unknown_soldout$/);
  assert.notEqual(next, "11111111-1111-1111-1111-111111111111_unknown_soldout");
  const sandbox = loadRatehawkConfig({ RATEHAWK_ENV: "sandbox", RATEHAWK_KEY_ID: "key", RATEHAWK_API_KEY: "secret" });
  assert.equal(sandbox.baseUrl, "https://api-sandbox.ratehawk.com");
  assert.equal(sandbox.language, "en");
  assert.throws(
    () => loadRatehawkConfig({ RATEHAWK_ENV: "sandbox", RATEHAWK_BASE_URL: "https://api.ratehawk.com" }),
    RatehawkConfigError
  );
  assert.throws(
    () => loadRatehawkConfig({ RATEHAWK_ENV: "production", VERCEL_ENV: "preview", RATEHAWK_BASE_URL: "https://api.ratehawk.com" }),
    RatehawkConfigError
  );
  assert.equal(loadRatehawkConfig({ RATEHAWK_MARGIN_PERCENT: "5", RATEHAWK_PRICE_INCREASE_PERCENT: "10" }).marginPercent, 12);
});

test("les secrets sortent du journal, hotelpage et prebook ne sont pas un cache", () => {
  const redacted = redact({ authorization: "Basic abc", api_key: "secret-key", note: "secret-key dans le texte" }, ["secret-key"]) as {
    authorization: string;
    note: string;
  };
  assert.equal(redacted.authorization, "[redacted]");
  assert.equal(redacted.note, "[redacted] dans le texte");
  const client = readFileSync(new URL("./ratehawk/client.ts", import.meta.url), "utf8");
  const search = readFileSync(new URL("./ratehawk/search.ts", import.meta.url), "utf8");
  assert.match(client, /no-store/);
  assert.doesNotMatch(search, /content\/v1|region\/dump|hotel\/static/);
  assert.doesNotMatch(search, /match_hash/);
  const body = searchBody(
    { checkin: "2026-11-20", checkout: "2026-11-22", residency: "uz", guests: [{ adults: 2, children: [3] }], currency: "EUR", timeout: 30 },
    { hids: [10004834] },
    "en"
  );
  assert.equal(body.residency, "uz");
  assert.deepEqual(body.guests, [{ adults: 2, children: [3] }]);
  const token = signQuote(
    {
      book_hash: "p-64bf9aa1-e848-48f5-a23c-f7732b90b3c8",
      hid: 10004834,
      amount: "100.00",
      currency_code: "EUR",
      show_amount: "100.00",
      show_currency_code: "EUR",
      payment_type: "deposit",
      price_increased: false,
    },
    { apiKey: "secret", environment: "sandbox" }
  );
  assert.equal(readQuote(token, { apiKey: "secret", environment: "production" }), null);
  assert.equal(readQuote(token, { apiKey: "secret", environment: "sandbox" })?.hid, 10004834);
});
