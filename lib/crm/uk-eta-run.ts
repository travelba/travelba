import type { SupabaseClient } from "@supabase/supabase-js";
import { addIsoDays } from "@/lib/crm/dates";
import {
  UK_ETA_APPLY_URL,
  isUkEtaStatus,
  passportForEsta,
  pickUkEtaCronBookings,
  planUkEtaCheck,
  tripUkEtaDates,
  ukEtaAgencyDraft,
  ukEtaCronDeparture,
  ukEtaAlerts,
  ukEtaClientAutoSend,
  ukEtaClientDraft,
  ukEtaDispatchDue,
  ukEtaTravelerLine,
  ukEtaWebhookBody,
  ukEtaWebhookConfigured,
  ukEtaWebhookHeader,
  type UkEtaStatus,
  type UkEtaTravelerLine,
} from "@/lib/crm/uk-eta";
import { deliverUkEtaMail, ukEtaAgencyMail, ukEtaClientMail } from "@/lib/crm/uk-eta-mail";
import { parisIsoDate } from "@/lib/crm/hotel-arrival";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { travelerDisplayName } from "@/lib/crm/trip-documents";
import type { CrmBookingItem, CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";
import type { PersonName } from "@/lib/crm/person-match";
import { siteConfig } from "@/lib/site";

type Admin = SupabaseClient;

const CHECK_COLUMNS =
  "id, booking_id, traveler_id, travel_document_id, status, valid_until, passport_last3, checked_at, note, dispatch_key, dispatch_attempt_at, dispatched_at, client_message_sent_at";

type CheckRow = {
  id: string;
  booking_id: string;
  traveler_id: string;
  travel_document_id: string | null;
  status: string;
  valid_until: string | null;
  passport_last3: string | null;
  checked_at: string | null;
  note: string | null;
  dispatch_key: string | null;
  dispatch_attempt_at: string | null;
  dispatched_at: string | null;
  client_message_sent_at: string | null;
};

type StayBooking = {
  id: string;
  destination?: string | null;
  title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

function missingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message || "";
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache|crm_uk_eta_/i.test(message);
}

function dossierHref(bookingId: string) {
  return `${siteConfig.url}/admin/reservations/${bookingId}`;
}

async function postUkEtaWebhook(body: ReturnType<typeof ukEtaWebhookBody>) {
  const url = (process.env.UK_ETA_WEBHOOK_URL || "").trim();
  const key = productionOnlySecret(process.env.UK_ETA_WEBHOOK_KEY);
  if (!ukEtaWebhookConfigured(url, key)) return false;
  const header = ukEtaWebhookHeader(key, process.env.UK_ETA_WEBHOOK_KEY_HEADER);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [header.name]: header.value,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.info("[uk-eta] webhook refusé", response.status);
      return false;
    }
    return true;
  } catch {
    console.info("[uk-eta] webhook injoignable");
    return false;
  }
}

async function dispatchCheck(admin: Admin, row: CheckRow, desiredKey: string | null, departure: string | null) {
  if (
    !ukEtaDispatchDue({
      desiredKey,
      storedKey: row.dispatch_key,
      dispatchedAt: row.dispatched_at,
      attemptAt: row.dispatch_attempt_at,
      nowMs: Date.now(),
    })
  ) {
    return;
  }
  const url = (process.env.UK_ETA_WEBHOOK_URL || "").trim();
  const key = productionOnlySecret(process.env.UK_ETA_WEBHOOK_KEY);
  if (!ukEtaWebhookConfigured(url, key) || !desiredKey) return;
  const keyChanged = (row.dispatch_key || null) !== desiredKey;
  const { data, error } = await admin.rpc("crm_claim_uk_eta_dispatch", { p_id: row.id, p_key: desiredKey });
  if (error || data !== true) return;
  if (keyChanged) row.dispatched_at = null;
  row.dispatch_key = desiredKey;
  row.dispatch_attempt_at = new Date().toISOString();
  const sent = await postUkEtaWebhook(
    ukEtaWebhookBody({
      id: row.id,
      bookingId: row.booking_id,
      travelerId: row.traveler_id,
      departureDate: departure,
    })
  );
  if (!sent) return;
  row.dispatched_at = new Date().toISOString();
  await admin.from("crm_uk_eta_checks").update({ dispatched_at: row.dispatched_at }).eq("id", row.id).eq("dispatch_key", desiredKey);
}

function linesFor(
  booking: StayBooking,
  items: Pick<CrmBookingItem, "kind" | "lifecycle" | "title" | "details" | "start_at" | "end_at">[],
  travelers: CrmBookingTraveler[],
  documents: CrmTravelDocument[],
  holder: PersonName | null,
  byTraveler: Map<string, CheckRow>
) {
  const dates = tripUkEtaDates(items, booking);
  if (!dates.needsUkEta) return [];
  const nowMs = Date.now();
  const lines: UkEtaTravelerLine[] = [];
  for (const traveler of travelers) {
    const row = byTraveler.get(traveler.id);
    if (!row || !isUkEtaStatus(row.status)) continue;
    const passport = passportForEsta(traveler, documents, holder);
    lines.push(
      ukEtaTravelerLine({
        traveler,
        status: row.status,
        validUntil: row.valid_until,
        checkedAt: row.checked_at,
        note: row.note,
        returnOn: dates.returnOn,
        passport,
        passportLast3: row.passport_last3,
        clientSentAt: row.client_message_sent_at,
        dispatchedAt: row.dispatched_at,
        attemptAt: row.dispatch_attempt_at,
        nowMs,
      })
    );
  }
  return lines;
}

export async function syncUkEtaForBooking(
  admin: Admin,
  input: {
    booking: StayBooking;
    items: Pick<CrmBookingItem, "kind" | "lifecycle" | "title" | "details" | "start_at" | "end_at">[];
    travelers: CrmBookingTraveler[];
    documents: CrmTravelDocument[];
    holder?: PersonName | null;
    manual?: { travelerId: string; stamp: string } | null;
  }
): Promise<UkEtaTravelerLine[]> {
  const dates = tripUkEtaDates(input.items, input.booking);
  const { data: existing, error } = await admin.from("crm_uk_eta_checks").select(CHECK_COLUMNS).eq("booking_id", input.booking.id);
  if (error) {
    if (missingRelation(error)) console.info("[uk-eta] table absente");
    return [];
  }
  const byTraveler = new Map(((existing as CheckRow[] | null) || []).map((row) => [row.traveler_id, row]));

  for (const traveler of input.travelers) {
    const passport = passportForEsta(traveler, input.documents, input.holder);
    const previous = byTraveler.get(traveler.id);
    const plan = planUkEtaCheck({
      tripNeedsUkEta: dates.needsUkEta,
      passport: passport
        ? { id: passport.id, nationality: passport.nationality, issuingCountry: passport.issuing_country }
        : null,
      previous:
        previous && isUkEtaStatus(previous.status)
          ? {
              status: previous.status,
              documentId: previous.travel_document_id,
              dispatchKey: previous.dispatch_key,
            }
          : null,
      manualStamp: input.manual?.travelerId === traveler.id ? input.manual.stamp : null,
    });
    if (!plan) continue;
    const unchanged =
      previous &&
      isUkEtaStatus(previous.status) &&
      previous.status === plan.status &&
      previous.travel_document_id === plan.documentId &&
      !plan.clearResult;
    if (unchanged) {
      if (plan.status === "a_verifier") await dispatchCheck(admin, previous, plan.dispatchKey, dates.departure);
      continue;
    }
    const payload: Record<string, unknown> = {
      booking_id: input.booking.id,
      traveler_id: traveler.id,
      travel_document_id: plan.documentId,
      status: plan.status,
    };
    if (plan.clearResult) {
      Object.assign(payload, {
        application_number: null,
        valid_until: null,
        passport_last3: null,
        checked_at: null,
        source: null,
        note: null,
        client_message_sent_at: null,
        dispatch_key: null,
        dispatch_attempt_at: null,
        dispatched_at: null,
      });
    }
    const { data: saved, error: writeError } = await admin
      .from("crm_uk_eta_checks")
      .upsert(payload, { onConflict: "booking_id,traveler_id" })
      .select(CHECK_COLUMNS)
      .maybeSingle();
    if (writeError || !saved) {
      if (writeError && !missingRelation(writeError)) console.info("[uk-eta] écriture ignorée");
      continue;
    }
    const row = saved as CheckRow;
    byTraveler.set(traveler.id, row);
    if (plan.status === "a_verifier") await dispatchCheck(admin, row, plan.dispatchKey, dates.departure);
  }

  return linesFor(input.booking, input.items, input.travelers, input.documents, input.holder || null, byTraveler);
}

async function loadStay(admin: Admin, bookingId: string) {
  const { data: booking, error } = await admin
    .from("crm_bookings")
    .select("id, customer_id, reference, start_date, end_date, destination, title")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking) return null;
  const row = booking as StayBooking & { customer_id: string; reference: string };
  const [items, travelers, documents, customer] = await Promise.all([
    admin.from("crm_booking_items").select("kind, lifecycle, title, details, start_at, end_at").eq("booking_id", bookingId),
    admin.from("crm_booking_travelers").select("*").eq("booking_id", bookingId),
    admin.from("crm_travel_documents").select("*").eq("customer_id", row.customer_id),
    admin.from("crm_customers").select("first_name, last_name, email").eq("id", row.customer_id).maybeSingle(),
  ]);
  return {
    booking: row,
    items: (items.data || []) as CrmBookingItem[],
    travelers: (travelers.data || []) as CrmBookingTraveler[],
    documents: (documents.data || []) as CrmTravelDocument[],
    holder: (customer.data as (PersonName & { email?: string | null }) | null) || null,
  };
}

export async function syncUkEtaForBookingId(
  admin: Admin,
  bookingId: string,
  manual?: { travelerId: string; stamp: string } | null
) {
  const stay = await loadStay(admin, bookingId);
  if (!stay) return [];
  return syncUkEtaForBooking(admin, {
    booking: stay.booking,
    items: stay.items,
    travelers: stay.travelers,
    documents: stay.documents,
    holder: stay.holder,
    manual,
  });
}

export async function readUkEtaLines(admin: Admin, bookingId: string) {
  const stay = await loadStay(admin, bookingId);
  if (!stay) return [];
  const { data, error } = await admin.from("crm_uk_eta_checks").select(CHECK_COLUMNS).eq("booking_id", bookingId);
  if (error) {
    if (missingRelation(error)) console.info("[uk-eta] table absente");
    return [];
  }
  const byTraveler = new Map(((data as CheckRow[] | null) || []).map((row) => [row.traveler_id, row]));
  return linesFor(stay.booking, stay.items, stay.travelers, stay.documents, stay.holder, byTraveler);
}

export async function syncUkEtaForCustomer(customerId: string, admin: Admin) {
  const today = parisIsoDate(new Date());
  const { data, error } = await admin
    .from("crm_bookings")
    .select("id")
    .eq("customer_id", customerId)
    .is("archived_at", null)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (error || !data) return;
  for (const row of data) {
    await syncUkEtaForBookingId(admin, (row as { id: string }).id);
  }
}

export async function markUkEtaNoticesSeen(admin: Admin, bookingId: string) {
  const { error } = await admin
    .from("crm_uk_eta_notices")
    .update({ seen_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .is("seen_at", null);
  if (error && !missingRelation(error)) console.info("[uk-eta] notification non marquée");
}

export type UkEtaNoticeLine = { id: string; href: string; label: string };

export async function loadOpenUkEtaNotices(admin: Admin): Promise<UkEtaNoticeLine[]> {
  const { data, error } = await admin
    .from("crm_uk_eta_notices")
    .select("id, booking_id, traveler_id, kind, status")
    .is("seen_at", null)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error || !data?.length) return [];
  const rows = data as { id: string; booking_id: string; traveler_id: string; kind: string; status: string }[];
  const bookingIds = [...new Set(rows.map((row) => row.booking_id))];
  const travelerIds = [...new Set(rows.map((row) => row.traveler_id))];
  const [bookings, travelers] = await Promise.all([
    admin.from("crm_bookings").select("id, reference").in("id", bookingIds),
    admin.from("crm_booking_travelers").select("id, first_name, last_name").in("id", travelerIds),
  ]);
  const references = new Map(
    ((bookings.data || []) as { id: string; reference: string }[]).map((row) => [row.id, row.reference])
  );
  const names = new Map(
    ((travelers.data || []) as CrmBookingTraveler[]).map((row) => [row.id, travelerDisplayName(row)])
  );
  return rows.map((row) => {
    const name = names.get(row.traveler_id) || "Un voyageur";
    const reference = references.get(row.booking_id) || "Dossier";
    const label =
      row.kind === "valable"
        ? `${name} · ${reference} · ETA Royaume-Uni valable`
        : `${name} · ${reference} · ETA Royaume-Uni à traiter`;
    return { id: row.id, href: `/admin/reservations/${row.booking_id}`, label };
  });
}

async function stayContext(admin: Admin, bookingId: string) {
  const stay = await loadStay(admin, bookingId);
  if (!stay) return null;
  const dates = tripUkEtaDates(stay.items, stay.booking);
  return { booking: stay.booking, dates };
}

export async function sendUkEtaToClient(admin: Admin, bookingId: string, travelerId: string) {
  const stay = await stayContext(admin, bookingId);
  if (!stay) return { ok: false as const, error: "Dossier introuvable." };
  const { data: check } = await admin
    .from("crm_uk_eta_checks")
    .select("id, status, valid_until, passport_last3, travel_document_id, client_message_sent_at")
    .eq("booking_id", bookingId)
    .eq("traveler_id", travelerId)
    .maybeSingle();
  const row = check as {
    id: string;
    status: string;
    valid_until: string | null;
    passport_last3: string | null;
    travel_document_id: string | null;
    client_message_sent_at: string | null;
  } | null;
  if (!row || !isUkEtaStatus(row.status)) return { ok: false as const, error: "Pas de vérification ETA." };
  if (row.client_message_sent_at) return { ok: true as const };
  const loaded = await loadStay(admin, bookingId);
  const email = (loaded?.holder && "email" in loaded.holder ? loaded.holder.email || "" : "").trim();
  if (!email) return { ok: false as const, error: "Pas d’adresse pour ce client." };
  let passport: CrmTravelDocument | null = null;
  if (row.travel_document_id) {
    const { data } = await admin.from("crm_travel_documents").select("number, expires_on").eq("id", row.travel_document_id).maybeSingle();
    passport = (data as CrmTravelDocument | null) || null;
  }
  const status = row.status as UkEtaStatus;
  const alerts = ukEtaAlerts({
    status,
    validUntil: row.valid_until,
    returnOn: stay.dates.returnOn,
    passportExpires: passport?.expires_on,
    passportNumber: passport?.number,
    passportLast3: row.passport_last3,
  });
  const draft = ukEtaClientDraft({
    status,
    validUntil: row.valid_until,
    alerts,
    reference: stay.booking.reference,
    passportExpires: passport?.expires_on,
  });
  if (!draft) return { ok: false as const, error: "Rien à envoyer pour ce voyageur." };
  const numbers = passport?.number ? [passport.number] : [];
  const mail = ukEtaClientMail(draft, UK_ETA_APPLY_URL, numbers);
  const claimed = await admin
    .from("crm_uk_eta_checks")
    .update({ client_message_sent_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("client_message_sent_at", null)
    .select("id");
  if (claimed.error || !claimed.data?.length) return { ok: true as const };
  const sent = await deliverUkEtaMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  if (!sent) {
    await admin.from("crm_uk_eta_checks").update({ client_message_sent_at: null }).eq("id", row.id);
    return { ok: false as const, error: "L’e-mail n’est pas parti." };
  }
  return { ok: true as const };
}

export async function flushUkEtaNotices(admin: Admin) {
  const { data, error } = await admin
    .from("crm_uk_eta_notices")
    .select("id, check_id, booking_id, traveler_id")
    .is("emailed_at", null)
    .order("created_at", { ascending: true })
    .limit(30);
  if (error || !data?.length) return 0;
  let sent = 0;
  for (const notice of data as { id: string; check_id: string; booking_id: string; traveler_id: string }[]) {
    const stay = await stayContext(admin, notice.booking_id);
    const { data: check } = await admin
      .from("crm_uk_eta_checks")
      .select("status, valid_until, passport_last3, travel_document_id, note")
      .eq("id", notice.check_id)
      .maybeSingle();
    const { data: traveler } = await admin
      .from("crm_booking_travelers")
      .select("id, first_name, last_name, booking_id, companion_id, is_account_holder, created_at")
      .eq("id", notice.traveler_id)
      .maybeSingle();
    if (!stay || !check || !traveler || !isUkEtaStatus((check as { status: string }).status)) continue;
    const stored = check as {
      status: UkEtaStatus;
      valid_until: string | null;
      passport_last3: string | null;
      travel_document_id: string | null;
      note: string | null;
    };
    let passport: { number: string | null; expires_on: string | null } | null = null;
    if (stored.travel_document_id) {
      const { data: doc } = await admin
        .from("crm_travel_documents")
        .select("number, expires_on")
        .eq("id", stored.travel_document_id)
        .maybeSingle();
      passport = (doc as { number: string | null; expires_on: string | null } | null) || null;
    }
    const alerts = ukEtaAlerts({
      status: stored.status,
      validUntil: stored.valid_until,
      returnOn: stay.dates.returnOn,
      passportExpires: passport?.expires_on,
      passportNumber: passport?.number,
      passportLast3: stored.passport_last3,
    });
    const numbers = passport?.number ? [passport.number] : [];
    const draft = ukEtaAgencyDraft({
      reference: stay.booking.reference || "",
      travelerName: travelerDisplayName(traveler as CrmBookingTraveler),
      status: stored.status,
      validUntil: stored.valid_until,
      alerts,
      href: dossierHref(notice.booking_id),
      note: stored.note,
      passportNumbers: numbers,
    });
    const mail = ukEtaAgencyMail(
      { subject: draft.subject, text: draft.text, intro: draft.intro, href: dossierHref(notice.booking_id) },
      numbers
    );
    const ok = await deliverUkEtaMail({
      to: siteConfig.contactEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ccAgency: false,
    });
    if (!ok) continue;
    await admin.from("crm_uk_eta_notices").update({ emailed_at: new Date().toISOString() }).eq("id", notice.id);
    sent += 1;
  }
  return sent;
}

export async function flushUkEtaClientMails(admin: Admin) {
  if (!ukEtaClientAutoSend(process.env.UK_ETA_CLIENT_AUTO_SEND)) return 0;
  const { data, error } = await admin
    .from("crm_uk_eta_checks")
    .select("booking_id, traveler_id")
    .is("client_message_sent_at", null)
    .not("checked_at", "is", null)
    .filter("status", "not.in", "(a_verifier,non_concerne,erreur)")
    .limit(20);
  if (error || !data?.length) return 0;
  let sent = 0;
  for (const row of data as { booking_id: string; traveler_id: string }[]) {
    const result = await sendUkEtaToClient(admin, row.booking_id, row.traveler_id);
    if (result.ok) sent += 1;
  }
  return sent;
}

const UK_ETA_CRON_SCAN = 1000;

async function itemStartsByBooking(admin: Admin, bookingIds: string[]) {
  const grouped = new Map<string, { start_at: string | null; lifecycle: string | null }[]>();
  for (let index = 0; index < bookingIds.length; index += 100) {
    const slice = bookingIds.slice(index, index + 100);
    const { data } = await admin
      .from("crm_booking_items")
      .select("booking_id, start_at, lifecycle")
      .in("booking_id", slice)
      .not("start_at", "is", null);
    for (const item of (data || []) as { booking_id: string; start_at: string | null; lifecycle: string | null }[]) {
      const list = grouped.get(item.booking_id) || [];
      list.push({ start_at: item.start_at, lifecycle: item.lifecycle });
      grouped.set(item.booking_id, list);
    }
  }
  return grouped;
}

export async function runUkEtaCron(admin: Admin) {
  const today = parisIsoDate(new Date());
  const until = addIsoDays(today, 90);
  const { data: dated } = await admin
    .from("crm_bookings")
    .select("id, start_date")
    .gte("start_date", today)
    .lte("start_date", until)
    .is("archived_at", null)
    .neq("status", "cancelled")
    .order("start_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(UK_ETA_CRON_SCAN);
  const { data: undated } = await admin
    .from("crm_bookings")
    .select("id")
    .is("start_date", null)
    .is("archived_at", null)
    .neq("status", "cancelled")
    .order("id", { ascending: true })
    .limit(UK_ETA_CRON_SCAN);
  const rows: { id: string; departure: string | null }[] = ((dated || []) as { id: string; start_date: string | null }[]).map(
    (row) => ({ id: row.id, departure: ukEtaCronDeparture({ startDate: row.start_date }) })
  );
  const missing = ((undated || []) as { id: string }[]).map((row) => row.id);
  if (missing.length) {
    const items = await itemStartsByBooking(admin, missing);
    for (const id of missing) {
      rows.push({ id, departure: ukEtaCronDeparture({ startDate: null, items: items.get(id) || [] }) });
    }
  }
  const chosen = pickUkEtaCronBookings(rows, today, 200);
  let synced = 0;
  for (const row of chosen) {
    await syncUkEtaForBookingId(admin, row.id);
    synced += 1;
  }
  const mailed = await flushUkEtaNotices(admin);
  const clients = await flushUkEtaClientMails(admin);
  return { synced, mailed, clients };
}
