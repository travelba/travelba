import type { SupabaseClient } from "@supabase/supabase-js";
import { addIsoDays } from "@/lib/crm/dates";
import {
  ESTA_APPLY_URL,
  estaAgencyDraft,
  estaAlerts,
  estaClientAutoSend,
  estaClientDraft,
  estaDispatchDue,
  estaTravelerLine,
  estaWebhookBody,
  estaWebhookConfigured,
  estaWebhookHeader,
  isEstaStatus,
  passportForEsta,
  planEstaCheck,
  tripEstaDates,
  type EstaStatus,
  type EstaTravelerLine,
} from "@/lib/crm/esta";
import { deliverEstaMail, estaAgencyMail, estaClientMail } from "@/lib/crm/esta-mail";
import { parisIsoDate } from "@/lib/crm/hotel-arrival";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { travelerDisplayName } from "@/lib/crm/trip-documents";
import type { CrmBookingItem, CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";
import type { PersonName } from "@/lib/crm/person-match";
import { siteConfig } from "@/lib/site";

type Admin = SupabaseClient;

type CheckRow = {
  id: string;
  booking_id: string;
  traveler_id: string;
  travel_document_id: string | null;
  status: string;
  valid_until: string | null;
  esta_passport_last3: string | null;
  checked_at: string | null;
  note: string | null;
  dispatch_key: string | null;
  dispatch_attempt_at: string | null;
  dispatched_at: string | null;
  client_message_sent_at: string | null;
};

const CHECK_COLUMNS =
  "id, booking_id, traveler_id, travel_document_id, status, valid_until, esta_passport_last3, checked_at, note, dispatch_key, dispatch_attempt_at, dispatched_at, client_message_sent_at";

type EstaBundle = {
  booking: { id: string; start_date?: string | null; end_date?: string | null };
  items: Pick<CrmBookingItem, "kind" | "lifecycle" | "details" | "start_at" | "end_at">[];
  travelers: CrmBookingTraveler[];
  documents: CrmTravelDocument[];
  holder?: PersonName | null;
};

function missingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message || "";
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache|crm_esta_/i.test(message);
}

function dossierHref(bookingId: string) {
  return `${siteConfig.url}/admin/reservations/${bookingId}`;
}

function composeEstaLines(input: {
  travelers: CrmBookingTraveler[];
  documents: CrmTravelDocument[];
  holder?: PersonName | null;
  returnOn: string | null;
  rows: CheckRow[];
}) {
  const byTraveler = new Map(input.rows.map((row) => [row.traveler_id, row]));
  const nowMs = Date.now();
  const lines: EstaTravelerLine[] = [];
  for (const traveler of input.travelers) {
    const row = byTraveler.get(traveler.id);
    if (!row || !isEstaStatus(row.status)) continue;
    const passport = passportForEsta(traveler, input.documents, input.holder);
    lines.push(
      estaTravelerLine({
        traveler,
        status: row.status,
        validUntil: row.valid_until,
        checkedAt: row.checked_at,
        note: row.note,
        returnOn: input.returnOn,
        passport,
        estaPassportLast3: row.esta_passport_last3,
        clientSentAt: row.client_message_sent_at,
        dispatchedAt: row.dispatched_at,
        attemptAt: row.dispatch_attempt_at,
        nowMs,
      })
    );
  }
  return lines;
}

async function fetchChecks(admin: Admin, bookingId: string) {
  const { data, error } = await admin.from("crm_esta_checks").select(CHECK_COLUMNS).eq("booking_id", bookingId);
  if (error) {
    if (missingRelation(error)) console.info("[esta] table absente");
    return null;
  }
  return (data as CheckRow[] | null) || [];
}

async function postEstaWebhook(body: ReturnType<typeof estaWebhookBody>) {
  const url = (process.env.ESTA_WEBHOOK_URL || "").trim();
  const key = productionOnlySecret(process.env.ESTA_WEBHOOK_KEY);
  if (!estaWebhookConfigured(url, key)) {
    console.info("[esta] webhook non configuré");
    return false;
  }
  const header = estaWebhookHeader(key, process.env.ESTA_WEBHOOK_KEY_HEADER);
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
      console.info("[esta] webhook refusé", response.status);
      return false;
    }
    return true;
  } catch {
    console.info("[esta] webhook injoignable");
    return false;
  }
}

async function dispatchCheck(
  admin: Admin,
  row: CheckRow,
  desiredKey: string | null,
  departure: string | null
) {
  if (
    !estaDispatchDue({
      desiredKey,
      storedKey: row.dispatch_key,
      dispatchedAt: row.dispatched_at,
      attemptAt: row.dispatch_attempt_at,
      nowMs: Date.now(),
    })
  ) {
    return;
  }
  const url = (process.env.ESTA_WEBHOOK_URL || "").trim();
  const key = productionOnlySecret(process.env.ESTA_WEBHOOK_KEY);
  if (!estaWebhookConfigured(url, key) || !desiredKey) {
    console.info("[esta] webhook non configuré");
    return;
  }
  const keyChanged = (row.dispatch_key || null) !== desiredKey;
  const { data, error } = await admin.rpc("crm_claim_esta_dispatch", { p_id: row.id, p_key: desiredKey });
  if (error || data !== true) return;
  if (keyChanged) row.dispatched_at = null;
  row.dispatch_key = desiredKey;
  row.dispatch_attempt_at = new Date().toISOString();
  const sent = await postEstaWebhook(
    estaWebhookBody({
      id: row.id,
      bookingId: row.booking_id,
      travelerId: row.traveler_id,
      departureDate: departure,
    })
  );
  if (!sent) return;
  row.dispatched_at = new Date().toISOString();
  await admin.from("crm_esta_checks").update({ dispatched_at: row.dispatched_at }).eq("id", row.id).eq("dispatch_key", desiredKey);
}

export async function syncEstaForBooking(
  admin: Admin,
  input: {
    booking: { id: string; start_date?: string | null; end_date?: string | null };
    items: Pick<CrmBookingItem, "kind" | "lifecycle" | "details" | "start_at" | "end_at">[];
    travelers: CrmBookingTraveler[];
    documents: CrmTravelDocument[];
    holder?: PersonName | null;
    manual?: { travelerId: string; stamp: string } | null;
  }
): Promise<EstaTravelerLine[]> {
  const dates = tripEstaDates(input.items, input.booking);
  const { data: existing, error } = await admin.from("crm_esta_checks").select(CHECK_COLUMNS).eq("booking_id", input.booking.id);
  if (error) {
    if (missingRelation(error)) console.info("[esta] table absente");
    return [];
  }
  const byTraveler = new Map((existing as CheckRow[] | null || []).map((row) => [row.traveler_id, row]));

  for (const traveler of input.travelers) {
    const passport = passportForEsta(traveler, input.documents, input.holder);
    const previous = byTraveler.get(traveler.id);
    const plan = planEstaCheck({
      tripNeedsEsta: dates.needsEsta,
      passport: passport
        ? { id: passport.id, nationality: passport.nationality, issuingCountry: passport.issuing_country }
        : null,
      previous:
        previous && isEstaStatus(previous.status)
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
      isEstaStatus(previous.status) &&
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
        esta_passport_last3: null,
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
      .from("crm_esta_checks")
      .upsert(payload, { onConflict: "booking_id,traveler_id" })
      .select(CHECK_COLUMNS)
      .maybeSingle();
    if (writeError || !saved) {
      if (writeError && !missingRelation(writeError)) console.info("[esta] écriture ignorée");
      continue;
    }
    const row = saved as CheckRow;
    byTraveler.set(traveler.id, row);
    if (plan.status === "a_verifier") {
      await dispatchCheck(admin, row, plan.dispatchKey, dates.departure);
    }
  }

  if (!dates.needsEsta) return [];
  const fresh = await fetchChecks(admin, input.booking.id);
  return composeEstaLines({
    travelers: input.travelers,
    documents: input.documents,
    holder: input.holder,
    returnOn: dates.returnOn,
    rows: fresh || [...byTraveler.values()],
  });
}

async function loadEstaBundle(admin: Admin, bookingId: string): Promise<EstaBundle | null> {
  const { data: booking, error } = await admin
    .from("crm_bookings")
    .select("id, customer_id, start_date, end_date")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking) return null;
  const customerId = (booking as { customer_id: string }).customer_id;
  const [items, travelers, documents, customer] = await Promise.all([
    admin.from("crm_booking_items").select("kind, lifecycle, details, start_at, end_at").eq("booking_id", bookingId),
    admin.from("crm_booking_travelers").select("*").eq("booking_id", bookingId),
    admin.from("crm_travel_documents").select("*").eq("customer_id", customerId),
    admin.from("crm_customers").select("first_name, last_name").eq("id", customerId).maybeSingle(),
  ]);
  return {
    booking: booking as { id: string; start_date: string | null; end_date: string | null },
    items: (items.data || []) as CrmBookingItem[],
    travelers: (travelers.data || []) as CrmBookingTraveler[],
    documents: (documents.data || []) as CrmTravelDocument[],
    holder: (customer.data as PersonName | null) || null,
  };
}

export async function syncEstaForBookingId(
  admin: Admin,
  bookingId: string,
  manual?: { travelerId: string; stamp: string } | null
) {
  const bundle = await loadEstaBundle(admin, bookingId);
  if (!bundle) return [];
  return syncEstaForBooking(admin, { ...bundle, manual });
}

/** Lecture seule : le sondage de la fiche ne relance pas le webhook. */
export async function loadEstaForBookingId(admin: Admin, bookingId: string) {
  const bundle = await loadEstaBundle(admin, bookingId);
  if (!bundle) return [];
  const dates = tripEstaDates(bundle.items, bundle.booking);
  if (!dates.needsEsta) return [];
  const rows = await fetchChecks(admin, bookingId);
  if (!rows) return [];
  return composeEstaLines({
    travelers: bundle.travelers,
    documents: bundle.documents,
    holder: bundle.holder,
    returnOn: dates.returnOn,
    rows,
  });
}

export async function syncEstaForCustomer(customerId: string, admin: Admin) {
  const today = parisIsoDate(new Date());
  const { data, error } = await admin
    .from("crm_bookings")
    .select("id")
    .eq("customer_id", customerId)
    .is("archived_at", null)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (error || !data) return;
  for (const row of data) {
    await syncEstaForBookingId(admin, (row as { id: string }).id);
  }
}

export async function markEstaNoticesSeen(admin: Admin, bookingId: string) {
  const { error } = await admin
    .from("crm_esta_notices")
    .update({ seen_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .is("seen_at", null);
  if (error && !missingRelation(error)) console.info("[esta] notification non marquée");
}

export type EstaNoticeLine = { id: string; href: string; label: string };

export async function loadOpenEstaNotices(admin: Admin): Promise<EstaNoticeLine[]> {
  const { data, error } = await admin
    .from("crm_esta_notices")
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
    const label = row.kind === "valable" ? `${name} · ${reference} · ESTA valable` : `${name} · ${reference} · ESTA à traiter`;
    return { id: row.id, href: `/admin/reservations/${row.booking_id}`, label };
  });
}

async function stayContext(admin: Admin, bookingId: string) {
  const { data: booking } = await admin
    .from("crm_bookings")
    .select("id, reference, customer_id, start_date, end_date")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;
  const row = booking as {
    id: string;
    reference: string;
    customer_id: string;
    start_date: string | null;
    end_date: string | null;
  };
  const { data: items } = await admin
    .from("crm_booking_items")
    .select("kind, lifecycle, details, start_at, end_at")
    .eq("booking_id", bookingId);
  const dates = tripEstaDates((items || []) as CrmBookingItem[], row);
  return { booking: row, dates };
}

export async function sendEstaToClient(admin: Admin, bookingId: string, travelerId: string) {
  const stay = await stayContext(admin, bookingId);
  if (!stay) return { ok: false as const, error: "Dossier introuvable." };
  const { data: check } = await admin
    .from("crm_esta_checks")
    .select("id, status, valid_until, esta_passport_last3, travel_document_id, client_message_sent_at")
    .eq("booking_id", bookingId)
    .eq("traveler_id", travelerId)
    .maybeSingle();
  const row = check as {
    id: string;
    status: string;
    valid_until: string | null;
    esta_passport_last3: string | null;
    travel_document_id: string | null;
    client_message_sent_at: string | null;
  } | null;
  if (!row || !isEstaStatus(row.status)) return { ok: false as const, error: "Pas de vérification ESTA." };
  if (row.client_message_sent_at) return { ok: true as const };
  const { data: customer } = await admin
    .from("crm_customers")
    .select("email")
    .eq("id", stay.booking.customer_id)
    .maybeSingle();
  const email = ((customer as { email?: string | null } | null)?.email || "").trim();
  if (!email) return { ok: false as const, error: "Pas d’adresse pour ce client." };
  let passport: CrmTravelDocument | null = null;
  if (row.travel_document_id) {
    const { data } = await admin
      .from("crm_travel_documents")
      .select("number, expires_on")
      .eq("id", row.travel_document_id)
      .maybeSingle();
    passport = (data as CrmTravelDocument | null) || null;
  }
  const status = row.status as EstaStatus;
  const alerts = estaAlerts({
    status,
    validUntil: row.valid_until,
    returnOn: stay.dates.returnOn,
    passportExpires: passport?.expires_on,
    passportNumber: passport?.number,
    estaPassportLast3: row.esta_passport_last3,
  });
  const draft = estaClientDraft({
    status,
    validUntil: row.valid_until,
    alerts,
    reference: stay.booking.reference,
    passportExpires: passport?.expires_on,
  });
  if (!draft) return { ok: false as const, error: "Rien à envoyer pour ce voyageur." };
  const numbers = passport?.number ? [passport.number] : [];
  const mail = estaClientMail(draft, ESTA_APPLY_URL, numbers);
  const claimed = await admin
    .from("crm_esta_checks")
    .update({ client_message_sent_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("client_message_sent_at", null)
    .select("id");
  if (claimed.error || !claimed.data?.length) return { ok: true as const };
  const sent = await deliverEstaMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  if (!sent) {
    await admin.from("crm_esta_checks").update({ client_message_sent_at: null }).eq("id", row.id);
    return { ok: false as const, error: "L’e-mail n’est pas parti." };
  }
  return { ok: true as const };
}

export async function flushEstaNotices(admin: Admin) {
  const { data, error } = await admin
    .from("crm_esta_notices")
    .select("id, check_id, booking_id, traveler_id")
    .is("emailed_at", null)
    .order("created_at", { ascending: true })
    .limit(30);
  if (error || !data?.length) return 0;
  let sent = 0;
  for (const notice of data as { id: string; check_id: string; booking_id: string; traveler_id: string }[]) {
    const stay = await stayContext(admin, notice.booking_id);
    const { data: check } = await admin
      .from("crm_esta_checks")
      .select("status, valid_until, esta_passport_last3, travel_document_id")
      .eq("id", notice.check_id)
      .maybeSingle();
    const { data: traveler } = await admin
      .from("crm_booking_travelers")
      .select("id, first_name, last_name, booking_id, companion_id, is_account_holder, created_at")
      .eq("id", notice.traveler_id)
      .maybeSingle();
    if (!stay || !check || !traveler || !isEstaStatus((check as { status: string }).status)) continue;
    const stored = check as {
      status: EstaStatus;
      valid_until: string | null;
      esta_passport_last3: string | null;
      travel_document_id: string | null;
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
    const alerts = estaAlerts({
      status: stored.status,
      validUntil: stored.valid_until,
      returnOn: stay.dates.returnOn,
      passportExpires: passport?.expires_on,
      passportNumber: passport?.number,
      estaPassportLast3: stored.esta_passport_last3,
    });
    const draft = estaAgencyDraft({
      reference: stay.booking.reference,
      travelerName: travelerDisplayName(traveler as CrmBookingTraveler),
      status: stored.status,
      validUntil: stored.valid_until,
      alerts,
      href: dossierHref(notice.booking_id),
    });
    const mail = estaAgencyMail(
      { subject: draft.subject, text: draft.text, intro: draft.intro, href: dossierHref(notice.booking_id) },
      passport?.number ? [passport.number] : []
    );
    const ok = await deliverEstaMail({
      to: siteConfig.contactEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ccAgency: false,
    });
    if (!ok) continue;
    await admin.from("crm_esta_notices").update({ emailed_at: new Date().toISOString() }).eq("id", notice.id);
    sent += 1;
  }
  return sent;
}

export async function flushEstaClientMails(admin: Admin) {
  if (!estaClientAutoSend(process.env.ESTA_CLIENT_AUTO_SEND)) return 0;
  const { data, error } = await admin
    .from("crm_esta_checks")
    .select("booking_id, traveler_id")
    .is("client_message_sent_at", null)
    .not("checked_at", "is", null)
    .filter("status", "not.in", "(a_verifier,non_concerne,erreur)")
    .limit(20);
  if (error || !data?.length) return 0;
  let sent = 0;
  for (const row of data as { booking_id: string; traveler_id: string }[]) {
    const result = await sendEstaToClient(admin, row.booking_id, row.traveler_id);
    if (result.ok) sent += 1;
  }
  return sent;
}

export async function runEstaCron(admin: Admin) {
  const today = parisIsoDate(new Date());
  const until = addIsoDays(today, 90);
  const { data } = await admin
    .from("crm_bookings")
    .select("id")
    .gte("start_date", today)
    .lte("start_date", until)
    .is("archived_at", null)
    .neq("status", "cancelled")
    .limit(200);
  let synced = 0;
  for (const row of data || []) {
    await syncEstaForBookingId(admin, (row as { id: string }).id);
    synced += 1;
  }
  const mailed = await flushEstaNotices(admin);
  const clients = await flushEstaClientMails(admin);
  return { synced, mailed, clients };
}
