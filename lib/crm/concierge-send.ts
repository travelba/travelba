import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { createEntryLink, entryButtonSuffix, entryCodeFromLink } from "./entry-link";
import { tripDocCoverage } from "./trip-documents";
import { entryForFrenchPassport } from "./visa-fr";
import { frenchPassportTrip } from "./visa-trip";
import { proactiveWhatsappAllowed } from "./whatsapp-concierge";
import { sendContentTemplate, type WhatsappSendResult } from "./whatsapp";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmTravelDocument } from "./types";
import {
  conciergeContentSid,
  conciergeContentVariables,
  normalizePieceKind,
  PIECES_WINDOW_MS,
  planFormalityReady,
  planMissingPieceNotices,
  planPiecesNotices,
  planStayNotice,
  stayHasPublishedCover,
  type ConciergeTemplate,
  type PieceStamp,
} from "./concierge-notices";

type Admin = SupabaseClient;

type CustomerRow = {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_out_at?: string | null;
};

type QueuePayload = {
  pieces?: PieceStamp[];
  iso?: string;
};

type QueueRow = {
  id: string;
  customer_id: string | null;
  booking_id: string | null;
  dedupe_key: string | null;
  template_key: string | null;
  body: string;
  status: string;
  payload: QueuePayload | null;
};

function quiet(err: unknown) {
  const message = err instanceof Error ? err.message : "échec";
  console.error("[concierge]", message.replace(/https?:\/\/\S+/g, "").slice(0, 180));
}

async function buttonSuffix(admin: Admin, email: string, path: string) {
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: email.trim().toLowerCase(),
  });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) return null;
  const link = await createEntryLink(admin, siteConfig.url, {
    tokenHash,
    otpType: "magiclink",
    nextPath: path,
  });
  const code = entryCodeFromLink(link);
  if (!code) return null;
  return entryButtonSuffix(code);
}

async function loadBooking(admin: Admin, bookingId: string) {
  const { data } = await admin.from("crm_bookings").select("*").eq("id", bookingId).maybeSingle();
  return (data as CrmBooking | null) || null;
}

async function loadCustomer(admin: Admin, customerId: string) {
  const { data } = await admin
    .from("crm_customers")
    .select("id, email, phone, first_name, whatsapp_opt_in_at, whatsapp_opt_out_at")
    .eq("id", customerId)
    .maybeSingle();
  return (data as CustomerRow | null) || null;
}

async function findByDedupe(admin: Admin, dedupeKey: string) {
  const { data } = await admin
    .from("crm_whatsapp_messages")
    .select("id, customer_id, booking_id, dedupe_key, template_key, body, status, payload")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  return (data as QueueRow | null) || null;
}

async function saveQueue(admin: Admin, input: {
  dedupeKey: string;
  customerId: string;
  bookingId: string;
  templateKey: string;
  body: string;
  payload: QueuePayload;
}) {
  const existing = await findByDedupe(admin, input.dedupeKey);
  if (existing?.status === "sent") return existing;
  if (existing) {
    await admin
      .from("crm_whatsapp_messages")
      .update({ body: input.body, payload: input.payload, template_key: input.templateKey, status: "queued" })
      .eq("id", existing.id);
    return { ...existing, body: input.body, payload: input.payload, status: "queued" };
  }
  const { data, error } = await admin
    .from("crm_whatsapp_messages")
    .insert({
      customer_id: input.customerId,
      booking_id: input.bookingId,
      dedupe_key: input.dedupeKey,
      direction: "outbound",
      template_key: input.templateKey,
      body: input.body,
      payload: input.payload,
      status: "queued",
    })
    .select("id, customer_id, booking_id, dedupe_key, template_key, body, status, payload")
    .single();
  if (error) throw new Error(error.message);
  return data as QueueRow;
}

async function dropQueue(admin: Admin, id: string) {
  await admin.from("crm_whatsapp_messages").delete().eq("id", id).eq("status", "queued");
}

async function markResult(
  admin: Admin,
  id: string,
  result: WhatsappSendResult,
  sent?: { dedupeKey?: string; templateKey?: string }
) {
  if (result.ok) {
    await admin
      .from("crm_whatsapp_messages")
      .update({
        status: "sent",
        twilio_sid: result.sid,
        error: null,
        ...(sent?.dedupeKey ? { dedupe_key: sent.dedupeKey } : {}),
        ...(sent?.templateKey ? { template_key: sent.templateKey } : {}),
      })
      .eq("id", id);
    return;
  }
  if (result.reason === "not_configured" || result.reason === "no_phone") return;
  if (result.reason === "rejected" && !result.detail) return;
  await admin
    .from("crm_whatsapp_messages")
    .update({ status: "failed", error: result.detail || result.reason })
    .eq("id", id);
}

async function deliverTemplate(admin: Admin, input: {
  row: QueueRow;
  customer: CustomerRow;
  template: ConciergeTemplate;
  path: string;
  body: string;
  place?: string | null;
  mediaUrl?: string | null;
  variable?: string | null;
  sentDedupe?: string;
}) {
  const contentSid = conciergeContentSid(input.template);
  if (!contentSid || !input.customer.email || !input.customer.phone || !proactiveWhatsappAllowed(input.customer)) {
    return;
  }
  const suffix = await buttonSuffix(admin, input.customer.email, input.path);
  const variables = suffix
    ? conciergeContentVariables({
        template: input.template,
        buttonSuffix: suffix,
        place: input.place,
        mediaUrl: input.mediaUrl,
        variable: input.variable,
      })
    : null;
  if (!variables) {
    await markResult(admin, input.row.id, { ok: false, reason: "rejected", detail: "lien absent" });
    return;
  }
  if (input.body !== input.row.body) {
    await admin.from("crm_whatsapp_messages").update({ body: input.body, template_key: input.template }).eq("id", input.row.id);
  }
  const result = await sendContentTemplate({
    phone: input.customer.phone,
    contentSid,
    variables,
  });
  await markResult(
    admin,
    input.row.id,
    result,
    result.ok ? { dedupeKey: input.sentDedupe, templateKey: input.template } : undefined
  );
}

async function deliverRow(admin: Admin, row: QueueRow, now: Date) {
  if (!row.booking_id || !row.customer_id || !row.dedupe_key) return;
  const booking = await loadBooking(admin, row.booking_id);
  if (!booking?.visible_to_client) {
    await dropQueue(admin, row.id);
    return;
  }
  const customer = await loadCustomer(admin, row.customer_id);
  if (!customer) return;
  const key = row.dedupe_key;

  if (key.startsWith("sejour:")) {
    const plan = planStayNotice({
      published: true,
      reference: booking.reference,
      destination: booking.destination,
      title: booking.title,
      hasCover: stayHasPublishedCover(booking),
    });
    if (!plan) {
      await dropQueue(admin, row.id);
      return;
    }
    await deliverTemplate(admin, {
      row,
      customer,
      template: plan.template,
      path: plan.path,
      body: plan.body,
      place: plan.place,
      mediaUrl: plan.mediaUrl,
    });
    return;
  }

  if (key.startsWith("pieces-queue:")) {
    const pieces = row.payload?.pieces || [];
    const first = Date.parse(pieces[0]?.at || "");
    if (!pieces.length || !Number.isFinite(first) || now.getTime() - first < PIECES_WINDOW_MS) return;
    const plans = planPiecesNotices({
      published: true,
      reference: booking.reference,
      pieces,
    });
    const plan = plans[0];
    if (!plan) {
      await dropQueue(admin, row.id);
      return;
    }
    await deliverTemplate(admin, {
      row,
      customer,
      template: plan.template,
      path: plan.path,
      body: plan.body,
      variable: plan.variable,
      sentDedupe: `pieces-sent:${booking.id}:${pieces[0].at}`,
    });
    return;
  }

  if (key.startsWith("passeport:") || key.startsWith("formalite-manquante:")) {
    const plans = await missingPlans(admin, booking, now);
    const plan = plans.find((item) => item.dedupe === key);
    if (!plan) {
      await dropQueue(admin, row.id);
      return;
    }
    await deliverTemplate(admin, {
      row,
      customer,
      template: plan.template,
      path: plan.path,
      body: plan.body,
      variable: plan.variable,
    });
    return;
  }

  if (key.startsWith("formalite-prete:")) {
    const name = entryForFrenchPassport(row.payload?.iso).formality;
    const plan = planFormalityReady({ published: true, formality: name });
    if (!plan) {
      await dropQueue(admin, row.id);
      return;
    }
    await deliverTemplate(admin, {
      row,
      customer,
      template: plan.template,
      path: plan.path,
      body: plan.body,
      variable: plan.variable,
    });
  }
}

async function missingPlans(admin: Admin, booking: CrmBooking, now: Date) {
  const [{ data: items }, { data: travelers }, { data: docs }, { data: visas }, { data: sent }] = await Promise.all([
    admin.from("crm_booking_items").select("kind, details").eq("booking_id", booking.id),
    admin.from("crm_booking_travelers").select("*").eq("booking_id", booking.id),
    admin.from("crm_travel_documents").select("*").eq("customer_id", booking.customer_id),
    admin.from("crm_visa_requests").select("country, status").eq("booking_id", booking.id),
    admin
      .from("crm_whatsapp_messages")
      .select("dedupe_key, status")
      .eq("booking_id", booking.id)
      .in("status", ["sent", "failed"]),
  ]);
  const party = (travelers || []) as CrmBookingTraveler[];
  const papers = (docs || []) as CrmTravelDocument[];
  const coverage = tripDocCoverage(party, papers);
  const trip = frenchPassportTrip((items || []) as CrmBookingItem[], party.length);
  const filedRequests = new Set(
    ((visas || []) as { country?: string; status?: string }[])
      .filter((row) => row.status === "piece" && row.country)
      .map((row) => row.country as string)
  );
  const filedDocs = new Set(
    papers
      .filter((doc) => doc.doc_type === "visa" && doc.booking_id === booking.id && doc.issuing_country)
      .map((doc) => doc.issuing_country as string)
  );
  const sentKeys = new Set(
    ((sent || []) as { dedupe_key?: string | null }[]).map((row) => row.dedupe_key).filter(Boolean) as string[]
  );
  const formalityNames = [...sentKeys]
    .filter((key) => key.startsWith(`formalite-manquante:${booking.id}:`))
    .map((key) => key.slice(`formalite-manquante:${booking.id}:`.length));
  return planMissingPieceNotices({
    published: booking.visible_to_client,
    reference: booking.reference,
    bookingId: booking.id,
    startDate: booking.start_date,
    today: now.toISOString().slice(0, 10),
    missingPassports: Math.max(0, coverage.total - coverage.ready),
    formalities: trip.entries.map((entry) => ({
      name: entry.formality,
      filed: filedRequests.has(entry.iso) || filedDocs.has(entry.iso),
    })),
    alreadySent: {
      passport: sentKeys.has(`passeport:${booking.id}`),
      formalityNames,
    },
  });
}

export async function notifyStayPublished(bookingId: string) {
  const admin = createServiceClient();
  const booking = await loadBooking(admin, bookingId);
  if (!booking?.visible_to_client) return;
  const plan = planStayNotice({
    published: true,
    reference: booking.reference,
    destination: booking.destination,
    title: booking.title,
    hasCover: stayHasPublishedCover(booking),
  });
  if (!plan) return;
  const row = await saveQueue(admin, {
    dedupeKey: `sejour:${booking.id}`,
    customerId: booking.customer_id,
    bookingId: booking.id,
    templateKey: plan.template,
    body: plan.body,
    payload: {},
  });
  if (row.status === "sent") return;
  await deliverRow(admin, row, new Date());
}

/** Pièces d’une même heure : un seul message, parti une heure après la première. */
export async function queuePublishedPieces(
  bookingId: string,
  incoming: { id: string; kind: string | null }[],
  now = new Date()
) {
  const admin = createServiceClient();
  const booking = await loadBooking(admin, bookingId);
  if (!booking?.visible_to_client) return;
  const dedupeKey = `pieces-queue:${booking.id}`;
  const existing = await findByDedupe(admin, dedupeKey);
  let pieces = [...(existing?.payload?.pieces || [])];
  const first = Date.parse(pieces[0]?.at || "");
  if (pieces.length && Number.isFinite(first) && now.getTime() - first >= PIECES_WINDOW_MS && existing) {
    await deliverRow(admin, existing, now);
    const after = await findByDedupe(admin, dedupeKey);
    if (!after || after.status === "sent") pieces = [];
  }
  const at = now.toISOString();
  for (const piece of incoming) {
    const kind = normalizePieceKind(piece.kind);
    if (!kind || pieces.some((row) => row.id === piece.id)) continue;
    pieces.push({ id: piece.id, kind, at });
  }
  if (!pieces.length) return;
  const { data: sent } = await admin
    .from("crm_whatsapp_messages")
    .select("id")
    .eq("booking_id", booking.id)
    .eq("status", "sent")
    .like("dedupe_key", `pieces-sent:${booking.id}:%`)
    .gte("created_at", pieces[0].at)
    .limit(1);
  if (sent?.length) return;
  const plans = planPiecesNotices({ published: true, reference: booking.reference, pieces });
  const plan = plans[0];
  if (!plan) return;
  await saveQueue(admin, {
    dedupeKey,
    customerId: booking.customer_id,
    bookingId: booking.id,
    templateKey: "pieces-queue",
    body: plan.body,
    payload: { pieces },
  });
}

export async function notifyFormalitiesReady(bookingId: string, countries: string[]) {
  const admin = createServiceClient();
  const booking = await loadBooking(admin, bookingId);
  if (!booking?.visible_to_client) return;
  const { data: papers } = await admin
    .from("crm_travel_documents")
    .select("doc_type, issuing_country, booking_id")
    .eq("customer_id", booking.customer_id)
    .eq("doc_type", "visa");
  const filed = new Set(
    ((papers || []) as { issuing_country?: string | null; booking_id?: string | null }[])
      .filter((row) => row.issuing_country && (!row.booking_id || row.booking_id === booking.id))
      .map((row) => String(row.issuing_country).toUpperCase())
  );
  for (const iso of countries) {
    const code = iso.trim().toUpperCase();
    if (!filed.has(code)) continue;
    const plan = planFormalityReady({
      published: true,
      formality: entryForFrenchPassport(code).formality,
    });
    if (!plan) continue;
    const row = await saveQueue(admin, {
      dedupeKey: `formalite-prete:${booking.id}:${code}`,
      customerId: booking.customer_id,
      bookingId: booking.id,
      templateKey: plan.template,
      body: plan.body,
      payload: { iso: code },
    });
    if (row.status === "sent") continue;
    await deliverRow(admin, row, new Date());
  }
}

export async function remindMissingPieces(bookingId: string, now = new Date()) {
  const admin = createServiceClient();
  const booking = await loadBooking(admin, bookingId);
  if (!booking?.visible_to_client) return;
  const plans = await missingPlans(admin, booking, now);
  for (const plan of plans) {
    const row = await saveQueue(admin, {
      dedupeKey: plan.dedupe,
      customerId: booking.customer_id,
      bookingId: booking.id,
      templateKey: plan.template,
      body: plan.body,
      payload: {},
    });
    if (row.status === "sent") continue;
    await deliverRow(admin, row, now);
  }
}

export async function flushConcierge(now = new Date()) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_whatsapp_messages")
    .select("id, customer_id, booking_id, dedupe_key, template_key, body, status, payload")
    .eq("status", "queued")
    .order("created_at")
    .limit(40);
  for (const row of (data || []) as QueueRow[]) {
    try {
      await deliverRow(admin, row, now);
    } catch (err) {
      quiet(err);
    }
  }
  const today = now.toISOString().slice(0, 10);
  const { data: bookings } = await admin
    .from("crm_bookings")
    .select("id")
    .eq("visible_to_client", true)
    .gte("start_date", today)
    .order("start_date")
    .limit(30);
  let reminded = 0;
  for (const booking of (bookings || []) as { id: string }[]) {
    try {
      await remindMissingPieces(booking.id, now);
      reminded += 1;
    } catch (err) {
      quiet(err);
    }
  }
  return { queued: (data || []).length, reminded };
}

export async function safeConcierge(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (err) {
    quiet(err);
  }
}
