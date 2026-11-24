/**
 * File d’avis, demande de lien et paiement hôtel autonome.
 * L’envoi réel et le navigateur restent derrière un interrupteur et une boîte d’essai.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAgencyJournal } from "./agency-log";
import {
  HOTEL_AUTO_SETTINGS_OFF,
  autonomousDeskLines,
  buildHotelAutoNotice,
  cardLast4Only,
  chargeMayStart,
  claimChargeJob,
  hotelAutoJournalSummary,
  hotelPayRequestTarget,
  matchHotelChargeDebit,
  mayDeliverHotelPayRequest,
  noticeRetry,
  readHotelAutoSettings,
  type HotelAutoNoticeFacts,
  type HotelAutoSettings,
  type PliantChargeDebit,
} from "./hotel-auto";
import { hotelSendTooSoon } from "./hotel-desk";
import { formatArrivalAmount, hotelLanguage, linkRequestMail } from "./hotel-arrival";
import { productionOnlySecret } from "./preview-secrets";
import { siteConfig } from "../site";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

const SETTINGS_ID = 1;

export async function loadHotelAutoSettings(admin: Admin): Promise<HotelAutoSettings> {
  try {
    const { data, error } = await admin.from("crm_hotel_auto_settings").select("*").eq("id", SETTINGS_ID).maybeSingle();
    if (error) return { ...HOTEL_AUTO_SETTINGS_OFF };
    return readHotelAutoSettings(data as Parameters<typeof readHotelAutoSettings>[0]);
  } catch {
    return { ...HOTEL_AUTO_SETTINGS_OFF };
  }
}

export async function saveHotelAutoSettings(
  admin: Admin,
  input: { payRequest: boolean; chargeEnabled: boolean; chargeMaxCents: number; staffId: string | null }
) {
  const row = {
    id: SETTINGS_ID,
    auto_hotel_pay_request: input.payRequest,
    auto_hotel_charge_enabled: input.chargeEnabled,
    auto_hotel_charge_max_cents: input.chargeMaxCents,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("crm_hotel_auto_settings").upsert(row, { onConflict: "id" });
  if (error) return { ok: false as const, error: "Le réglage n’a pas été enregistré." };
  await recordAgencyJournal({
    staffId: input.staffId,
    action: "update",
    entityType: "setting",
    entityId: "hotel-auto",
    summary: hotelAutoJournalSummary(
      "Réglage hôtel autonome",
      `demande ${input.payRequest ? "oui" : "non"}, paiement ${input.chargeEnabled ? "oui" : "non"}, plafond ${input.chargeMaxCents / 100} €`
    ),
    path: "/admin/reglages/hotels",
  });
  return { ok: true as const };
}

export async function queueHotelAutoNotice(admin: Admin, facts: HotelAutoNoticeFacts) {
  try {
    const notice = buildHotelAutoNotice({ ...facts, cardLast4: cardLast4Only(facts.cardLast4) });
    if (!notice) return false;
    const existing = await admin.from("crm_hotel_notice_outbox").select("id").eq("idempotency_key", notice.key).maybeSingle();
    if (existing.error) return false;
    if (existing.data) return true;
    const inserted = await admin.from("crm_hotel_notice_outbox").insert({
      idempotency_key: notice.key,
      kind: facts.kind,
      stay_id: facts.stayId,
      booking_id: facts.bookingId,
      reference: facts.reference,
      client_name: facts.client.slice(0, 160),
      hotel_name: facts.hotel.slice(0, 160),
      dates: [facts.checkIn, facts.checkOut].filter(Boolean).join(" → ").slice(0, 80),
      subject: notice.subject,
      body: notice.text,
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
    });
    if (inserted.error) return false;
    await admin.from("crm_agency_alerts").insert({
      kind: "hotel_booking",
      summary: notice.subject.slice(0, 240),
      staff_id: null,
      entity_type: "dossier",
      entity_id: facts.bookingId,
    });
    await admin.from("crm_agency_journal").insert({
      staff_id: null,
      action: facts.kind === "confirmed" ? "create" : "update",
      entity_type: "dossier",
      entity_id: facts.bookingId,
      summary: hotelAutoJournalSummary("Avis réservation autonome", notice.subject),
      canonical: `hotel-auto|${notice.key}`,
      row_hash: "pending",
    });
    return true;
  } catch {
    return false;
  }
}

export async function flushHotelAutoNotices(
  admin: Admin,
  deliver: (input: { to: string; subject: string; text: string }) => Promise<boolean>,
  now = new Date()
) {
  let sent = 0;
  let failed = 0;
  try {
    const { data, error } = await admin
      .from("crm_hotel_notice_outbox")
      .select("id, subject, body, status, attempts, next_attempt_at")
      .in("status", ["pending", "sending"])
      .lte("next_attempt_at", now.toISOString())
      .order("created_at", { ascending: true })
      .limit(8);
    if (error || !data) return { sent, failed };
    const inbox = agencyNoticeInbox();
    for (const row of data as { id: string; subject: string; body: string; attempts: number }[]) {
      if (!inbox) {
        await admin
          .from("crm_hotel_notice_outbox")
          .update({ status: "pending", last_error: "Destinataire d’avis absent." })
          .eq("id", row.id);
        continue;
      }
      const attempts = (row.attempts || 0) + 1;
      const claimed = await admin
        .from("crm_hotel_notice_outbox")
        .update({ status: "sending", attempts })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id");
      const claimedRows = claimed.data as { id: string }[] | null;
      if (!Array.isArray(claimedRows) || claimedRows.length === 0) continue;
      const ok = await deliver({ to: inbox, subject: row.subject, text: row.body }).catch(() => false);
      if (ok) {
        sent += 1;
        await admin
          .from("crm_hotel_notice_outbox")
          .update({ status: "sent", sent_at: now.toISOString(), last_error: null })
          .eq("id", row.id);
        continue;
      }
      const next = noticeRetry(attempts, now.getTime());
      if (next.status === "failed") {
        failed += 1;
        await admin.from("crm_hotel_notice_outbox").update({ status: "failed", last_error: "Envoi définitivement en échec." }).eq("id", row.id);
        await admin.from("crm_agency_alerts").insert({
          kind: "hotel_booking",
          summary: "L’avis de réservation autonome n’a pas pu être envoyé.",
          staff_id: null,
          entity_type: "dossier",
          entity_id: null,
        });
      } else {
        await admin
          .from("crm_hotel_notice_outbox")
          .update({ status: "pending", next_attempt_at: new Date(next.nextMs).toISOString(), last_error: "Nouvel essai." })
          .eq("id", row.id);
      }
    }
  } catch {
    return { sent, failed };
  }
  return { sent, failed };
}

export function agencyNoticeInbox() {
  const test = (process.env.HOTEL_DIRECT_TEST_TO || "").trim();
  if (test.includes("@")) return test;
  return (process.env.CONTACT_TO_EMAIL || siteConfig.contactEmail || "").trim();
}

export async function deliverAgencyNotice(input: { to: string; subject: string; text: string }) {
  const apiKey = productionOnlySecret(process.env.RESEND_API_KEY);
  if (!apiKey || !input.to.includes("@")) return false;
  if (PAN_RUN.test(`${input.subject}\n${input.text}`)) return false;
  const { Resend } = await import("resend");
  const result = await new Resend(apiKey).emails.send({
    from: `${siteConfig.name} <${process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev"}>`,
    to: [input.to],
    subject: input.subject,
    text: input.text,
  });
  return !result.error;
}

const PAN_RUN = /(?:\d[ -]?){13,19}/;

export async function sendAutonomousPayRequest(
  admin: Admin,
  input: {
    arrivalId: string;
    bookingId: string;
    hotel: string;
    reference: string;
    checkIn: string;
    checkOut: string;
    amountCents: number | null;
    currency: string;
    emails: string[];
    country: string;
    guest: string;
    relance: boolean;
    status: string;
    requestedAt: string | null;
    lastRelanceAt: string | null;
    relanceCount: number;
    now: Date;
    deliver?: (mail: { to: string; subject: string; text: string }) => Promise<boolean>;
  }
) {
  if (
    hotelSendTooSoon({
      sentAt: input.requestedAt,
      lastFollowUpAt: input.lastRelanceAt,
      status: input.relance ? "follow_up" : input.status || "sent",
      nowMs: input.now.getTime(),
    })
  ) {
    return { sent: false, note: "Cette demande vient d’être envoyée." };
  }
  const live = process.env.HOTEL_AUTO_PAY_LIVE === "1";
  const target = hotelPayRequestTarget({
    live,
    hotelEmail: input.emails[0] || null,
    testInbox: process.env.HOTEL_DIRECT_TEST_TO || null,
  });
  if (!target.to) {
    const note =
      target.blocked === "test_inbox"
        ? "Demande de lien prête. HOTEL_DIRECT_TEST_TO manque : rien n’est envoyé à l’hôtel."
        : "Aucun e-mail d’hôtel. Rien n’est envoyé.";
    return { sent: false, note };
  }
  const lang = hotelLanguage(input.country);
  const letter = linkRequestMail({
    lang,
    hotel: input.hotel,
    reference: input.reference,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    amount: input.amountCents != null ? formatArrivalAmount(input.amountCents, input.currency || "EUR") : null,
    guest: input.guest,
    relance: input.relance,
    charge: false,
  });
  if (PAN_RUN.test(`${letter.subject}\n${letter.text}`)) return { sent: false, note: "Le courrier a été refusé." };
  if (!input.deliver) return { sent: false, note: "Aucun envoi n’est branché." };
  if (!mayDeliverHotelPayRequest({ to: target.to, live, testInbox: process.env.HOTEL_DIRECT_TEST_TO || null })) {
    return { sent: false, note: "Envoi bloqué hors boîte d’essai." };
  }
  const claimed = await claimArrivalRequest(admin, input);
  if (!claimed) return { sent: false, note: "Cette demande vient d’être envoyée." };
  const sent = await input.deliver({ to: target.to, subject: letter.subject, text: letter.text }).catch(() => false);
  if (!sent) {
    await releaseArrivalRequest(admin, input);
    return { sent: false, note: "L’envoi n’a pas abouti." };
  }
  await admin.from("crm_agency_journal").insert({
    staff_id: null,
    action: "send",
    entity_type: "dossier",
    entity_id: input.bookingId,
    summary: hotelAutoJournalSummary(
      input.relance ? "Relance lien de paiement" : "Demande de lien de paiement",
      `${input.hotel} · ${target.redirected ? "boîte d’essai" : "hôtel"}`
    ),
    canonical: `hotel-auto-link|${input.arrivalId}|${input.relance ? input.relanceCount + 1 : 0}`,
    row_hash: "pending",
  });
  return { sent: true, note: target.redirected ? "Demande envoyée vers la boîte d’essai." : "Demande envoyée à l’hôtel." };
}

async function claimArrivalRequest(
  admin: Admin,
  input: { arrivalId: string; relance: boolean; relanceCount: number; now: Date; status: string }
) {
  const now = input.now.toISOString();
  if (!input.relance) {
    const { data } = await admin
      .from("crm_hotel_arrivals")
      .update({ status: "link_requested", requested_at: now, task_open: false, task_note: null, blocked_reason: null })
      .eq("id", input.arrivalId)
      .eq("status", "pending")
      .select("id");
    return Array.isArray(data) && data.length > 0;
  }
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .update({
      status: "link_requested",
      relance_count: input.relanceCount + 1,
      last_relance_at: now,
      task_open: false,
      task_note: null,
    })
    .eq("id", input.arrivalId)
    .eq("status", "link_requested")
    .select("id");
  return Array.isArray(data) && data.length > 0;
}

async function releaseArrivalRequest(
  admin: Admin,
  input: { arrivalId: string; relance: boolean; relanceCount: number; requestedAt: string | null }
) {
  if (!input.relance) {
    await admin
      .from("crm_hotel_arrivals")
      .update({ status: "pending", requested_at: null, task_open: true, task_note: "L’envoi du lien n’a pas abouti.", blocked_reason: "manual" })
      .eq("id", input.arrivalId);
    return;
  }
  await admin
    .from("crm_hotel_arrivals")
    .update({ relance_count: input.relanceCount, last_relance_at: null, task_open: true, task_note: "La relance n’a pas abouti." })
    .eq("id", input.arrivalId);
}

export async function enqueueHotelCharge(
  admin: Admin,
  input: {
    bookingItemId: string;
    bookingId: string;
    arrivalId: string;
    paymentUrl: string;
    amountCents: number;
    currency: string;
    pliantCardId: string | null;
    cardLast4: string | null;
    cardLimitCents: number | null;
    enabled: boolean;
    maxCents: number;
    reference: string | null;
    hotel: string;
    clientName?: string | null;
    dates?: string | null;
  }
) {
  const existing = await admin.from("crm_hotel_charge_jobs").select("id, status").eq("booking_item_id", input.bookingItemId).maybeSingle();
  if (existing.error) return { queued: false, note: "File de paiement indisponible." };
  const prior = existing.data as { id: string; status: string } | null;
  if (prior && !claimChargeJob(prior.status) && prior.status !== "needs_agent") {
    return { queued: false, note: "Un paiement est déjà engagé pour ce séjour." };
  }
  const gate = chargeMayStart({
    enabled: input.enabled,
    amountCents: input.amountCents,
    currency: input.currency,
    cardLimitCents: input.cardLimitCents,
    maxCents: input.maxCents,
    already: Boolean(prior && prior.status !== "needs_agent" && prior.status !== "queued"),
  });
  const last4 = cardLast4Only(input.cardLast4);
  if (!gate.ok) {
    await writeChargeJob(admin, prior?.id || null, {
      booking_item_id: input.bookingItemId,
      booking_id: input.bookingId,
      arrival_id: input.arrivalId,
      payment_url: input.paymentUrl,
      amount_cents: input.amountCents,
      currency: (input.currency || "EUR").toUpperCase(),
      pliant_card_id: input.pliantCardId,
      card_last4: last4,
      card_limit_cents: input.cardLimitCents,
      status: "needs_agent",
      reason: gate.note,
      reference: input.reference,
      hotel_name: input.hotel.slice(0, 160),
      client_name: (input.clientName || "").slice(0, 160) || null,
      dates: (input.dates || "").slice(0, 80) || null,
    });
    await admin.from("crm_agency_alerts").insert({
      kind: "hotel_booking",
      summary: `Paiement hôtel à la main · ${input.hotel} · ${gate.note}`.slice(0, 240),
      staff_id: null,
      entity_type: "dossier",
      entity_id: input.bookingId,
    });
    return { queued: false, note: gate.note };
  }
  await writeChargeJob(admin, prior?.id || null, {
    booking_item_id: input.bookingItemId,
    booking_id: input.bookingId,
    arrival_id: input.arrivalId,
    payment_url: input.paymentUrl,
    amount_cents: input.amountCents,
    currency: "EUR",
    pliant_card_id: input.pliantCardId,
    card_last4: last4,
    card_limit_cents: input.cardLimitCents,
    status: "queued",
    reason: null,
    reference: input.reference,
    hotel_name: input.hotel.slice(0, 160),
    client_name: (input.clientName || "").slice(0, 160) || null,
    dates: (input.dates || "").slice(0, 80) || null,
  });
  await admin.from("crm_agency_journal").insert({
    staff_id: null,
    action: "create",
    entity_type: "dossier",
    entity_id: input.bookingId,
    summary: hotelAutoJournalSummary("Paiement hôtel en file", input.hotel),
    canonical: `hotel-auto-charge|${input.bookingItemId}`,
    row_hash: "pending",
  });
  return { queued: true, note: "Paiement en file. Le navigateur tourne hors de Vercel." };
}

async function writeChargeJob(admin: Admin, id: string | null, row: Record<string, unknown>) {
  if (id) {
    await admin.from("crm_hotel_charge_jobs").update(row).eq("id", id);
    return;
  }
  await admin.from("crm_hotel_charge_jobs").insert(row);
}

export async function reconcileHotelCharges(
  admin: Admin,
  debits: PliantChargeDebit[],
  lock: (cardId: string) => Promise<void>
) {
  const { data, error } = await admin
    .from("crm_hotel_charge_jobs")
    .select("id, booking_id, pliant_card_id, amount_cents, status, arrival_id")
    .in("status", ["submitted", "running"]);
  if (error || !data) return 0;
  let paid = 0;
  for (const row of data as {
    id: string;
    booking_id: string | null;
    pliant_card_id: string | null;
    amount_cents: number;
    status: string;
    arrival_id: string | null;
  }[]) {
    if (!row.pliant_card_id) continue;
    const match = matchHotelChargeDebit(
      { pliantCardId: row.pliant_card_id, amountCents: row.amount_cents, status: row.status },
      debits
    );
    if (match === "wait") continue;
    if (match === "declined") {
      await admin.from("crm_hotel_charge_jobs").update({ status: "needs_agent", reason: "Le débit a été refusé." }).eq("id", row.id);
      await admin.from("crm_agency_alerts").insert({
        kind: "hotel_booking",
        summary: "Paiement hôtel refusé. À payer à la main.",
        staff_id: null,
        entity_type: "dossier",
        entity_id: row.booking_id,
      });
      continue;
    }
    paid += 1;
    const now = new Date().toISOString();
    await admin.from("crm_hotel_charge_jobs").update({ status: "paid", paid_at: now, reason: null }).eq("id", row.id);
    if (row.arrival_id) {
      await admin.from("crm_hotel_arrivals").update({ status: "paid", paid_at: now, blocked_reason: null, task_open: false }).eq("id", row.arrival_id);
    }
    await lock(row.pliant_card_id).catch(() => undefined);
    await admin.from("crm_agency_journal").insert({
      staff_id: null,
      action: "update",
      entity_type: "card",
      entity_id: row.booking_id,
      summary: hotelAutoJournalSummary("Paiement hôtel rapproché", "carte gelée"),
      canonical: `hotel-auto-paid|${row.id}`,
      row_hash: "pending",
    });
  }
  return paid;
}

export async function loadAutonomousDesk(admin: Admin) {
  try {
    const [jobs, notices] = await Promise.all([
      admin
        .from("crm_hotel_charge_jobs")
        .select("id, booking_id, reference, hotel_name, dates, client_name, status, seen_at")
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("crm_hotel_notice_outbox")
        .select("id, booking_id, reference, hotel_name, dates, client_name, kind, seen_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (jobs.error || notices.error) return [];
    return autonomousDeskLines({
      jobs: ((jobs.data || []) as Record<string, unknown>[]).map(jobLine),
      notices: ((notices.data || []) as Record<string, unknown>[]).map(noticeLine),
    });
  } catch {
    return [];
  }
}

function jobLine(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    bookingId: typeof row.booking_id === "string" ? row.booking_id : null,
    reference: typeof row.reference === "string" ? row.reference : null,
    client: typeof row.client_name === "string" ? row.client_name : null,
    hotel: typeof row.hotel_name === "string" ? row.hotel_name : null,
    dates: typeof row.dates === "string" ? row.dates : null,
    status: typeof row.status === "string" ? row.status : "queued",
    seen: Boolean(row.seen_at),
  };
}

function noticeLine(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    bookingId: typeof row.booking_id === "string" ? row.booking_id : null,
    reference: typeof row.reference === "string" ? row.reference : null,
    client: typeof row.client_name === "string" ? row.client_name : null,
    hotel: typeof row.hotel_name === "string" ? row.hotel_name : null,
    dates: typeof row.dates === "string" ? row.dates : null,
    kind: typeof row.kind === "string" ? row.kind : "confirmed",
    seen: Boolean(row.seen_at),
  };
}

export async function markAutonomousSeen(admin: Admin, source: "job" | "notice", id: string) {
  const table = source === "job" ? "crm_hotel_charge_jobs" : "crm_hotel_notice_outbox";
  const now = new Date().toISOString();
  const { data, error } = await admin.from(table).update({ seen_at: now }).eq("id", id).select("booking_id");
  if (error) return false;
  const bookingId = (Array.isArray(data) ? data[0] : data) as { booking_id?: string | null } | undefined;
  if (bookingId?.booking_id) {
    await admin
      .from("crm_agency_alerts")
      .update({ read_at: now })
      .eq("kind", "hotel_booking")
      .eq("entity_id", bookingId.booking_id)
      .is("read_at", null);
  }
  return true;
}

export async function listOpenChargeDebits(admin: SupabaseClient, cardIds: string[]): Promise<PliantChargeDebit[]> {
  if (!cardIds.length) return [];
  const { data, error } = await admin
    .from("crm_pliant_transactions")
    .select("card_id, status, billing_cents, billing_currency")
    .in("card_id", cardIds)
    .limit(80);
  if (error || !data) return [];
  return (data as { card_id: string; status: string | null; billing_cents: number | null; billing_currency: string | null }[]).map(
    (row) => ({
      cardId: row.card_id,
      status: row.status,
      billingCents: row.billing_cents,
      billingCurrency: row.billing_currency,
    })
  );
}
