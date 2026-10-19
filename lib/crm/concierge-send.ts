import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { cityCoverCached, ensureCityCover } from "@/lib/crm/cover-generate";
import { cityCoverAuthFailed } from "@/lib/crm/cover-retouch";
import { createEntryLink, entryButtonSuffix, entryCodeFromLink } from "./entry-link";
import { tripDocCoverage } from "./trip-documents";
import { entryForFrenchPassport } from "./visa-fr";
import { frenchPassportTrip } from "./visa-trip";
import { toE164 } from "./phone";
import { proactiveWhatsappAllowed } from "./whatsapp-concierge";
import { sendContentTemplate, type WhatsappSendResult } from "./whatsapp";
import { isTravelAuthorization, type CrmBooking, type CrmBookingItem, type CrmBookingTraveler, type CrmTravelDocument } from "./types";
import type { TripStep } from "./layover";
import {
  conciergeContentSid,
  conciergeContentVariables,
  conciergePhotoTemplate,
  conciergeTemplateImage,
  normalizePieceKind,
  PIECES_WINDOW_MS,
  planFormalityReady,
  safeFormalityName,
  travellerFormalityMessage,
  travellerFormalityVariables,
  planMissingPieceNotices,
  planPiecesNotices,
  generatedStayPhotoId,
  liveConciergeImage,
  liveStayCover,
  noticeCardTemplate,
  pieceCardTemplate,
  planStayNotice,
  stayCoverUrl,
  stayHasPublishedCover,
  stayNoticeDispatch,
  STAY_COVER_WAIT_LIMIT,
  stayPlaceName,
  type ConciergeTemplate,
  type PieceStamp,
} from "./concierge-notices";

type Admin = SupabaseClient;

type CustomerRow = {
  id: string;
  email: string | null;
  phone: string | null;
  phone_secondary?: string | null;
  first_name: string | null;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_out_at?: string | null;
  city?: string | null;
};

type QueuePayload = {
  pieces?: PieceStamp[];
  iso?: string;
  travelerId?: string;
  /** Essais du cron pendant que la photo ou le modèle illustré manque. */
  coverWaits?: number;
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

/** Lien court du message. Le code sert aussi de preuve d’accès à la couverture (`?e=CODE`). */
async function entryButton(admin: Admin, email: string, path: string, showCover = false) {
  const cleanEmail = email.trim().toLowerCase();
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: cleanEmail,
  });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) return null;
  const link = await createEntryLink(admin, siteConfig.url, {
    tokenHash,
    otpType: "magiclink",
    nextPath: path,
    email: cleanEmail,
    showCover,
    channel: "whatsapp",
  });
  const code = entryCodeFromLink(link);
  if (!code) return null;
  return { suffix: entryButtonSuffix(code), code };
}

async function loadBooking(admin: Admin, bookingId: string) {
  const { data } = await admin.from("crm_bookings").select("*").eq("id", bookingId).maybeSingle();
  return (data as CrmBooking | null) || null;
}

async function loadCustomer(admin: Admin, customerId: string) {
  const { data } = await admin
    .from("crm_customers")
    .select("id, email, phone, phone_secondary, first_name, city, whatsapp_opt_in_at, whatsapp_opt_out_at")
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
  reference?: string | null;
  mediaUrl?: string | null;
  variable?: string | null;
  sentDedupe?: string;
  card?: ConciergeTemplate | null;
  /** Message du séjour avec couverture : la photo est servie par le code du lien de ce message. */
  stayCover?: boolean;
  /** La photo est attendue : un 404 laisse la file, sans basculer sur le texte. */
  holdWithoutCover?: boolean;
}): Promise<"done" | "held"> {
  if (!input.customer.email || !input.customer.phone || !proactiveWhatsappAllowed(input.customer)) {
    return "done";
  }
  const button = await entryButton(
    admin,
    input.customer.email,
    input.path,
    input.template === "sejour" && input.stayCover === true
  );
  if (!button) {
    await markResult(admin, input.row.id, { ok: false, reason: "rejected", detail: "lien absent" });
    return "done";
  }
  const suffix = button.suffix;
  let template = input.template;
  let mediaUrl = input.mediaUrl ?? null;
  if (template === "sejour") {
    const cover = input.stayCover && input.reference
      ? await liveStayCover(stayCoverUrl(input.reference, true, { entryCode: button.code }))
      : null;
    mediaUrl = cover;
    if (!cover) {
      if (input.holdWithoutCover) return "held";
      template = "sejour_texte";
    }
  }
  const photoTemplate = conciergePhotoTemplate(input.card || template);
  const photoSid = photoTemplate ? conciergeContentSid(photoTemplate) : "";
  const photoMedia = photoTemplate ? await liveConciergeImage(conciergeTemplateImage(photoTemplate)) : null;
  const photoVariables =
    photoTemplate && photoSid && photoMedia
      ? conciergeContentVariables({
          template: photoTemplate,
          buttonSuffix: suffix,
          place: input.place,
          reference: input.reference,
          mediaUrl: photoMedia,
          variable: input.variable,
        })
      : null;
  if (photoTemplate && photoVariables && photoSid) {
    if (input.body !== input.row.body) {
      await admin.from("crm_whatsapp_messages").update({ body: input.body, template_key: photoTemplate }).eq("id", input.row.id);
    }
    const photoResult = await sendContentTemplate({
      phone: input.customer.phone,
      contentSid: photoSid,
      variables: photoVariables,
    });
    if (photoResult.ok) {
      await markResult(admin, input.row.id, photoResult, {
        dedupeKey: input.sentDedupe,
        templateKey: photoTemplate,
      });
      return "done";
    }
  }
  const cardSid = input.card ? conciergeContentSid(input.card) : "";
  const cardVariables =
    input.card && cardSid
      ? conciergeContentVariables({
          template: input.card,
          buttonSuffix: suffix,
          place: input.place,
          reference: input.reference,
          mediaUrl,
          variable: input.variable,
        })
      : null;
  if (input.card && cardVariables && cardSid) {
    if (input.body !== input.row.body) {
      await admin.from("crm_whatsapp_messages").update({ body: input.body, template_key: input.card }).eq("id", input.row.id);
    }
    const cardResult = await sendContentTemplate({
      phone: input.customer.phone,
      contentSid: cardSid,
      variables: cardVariables,
    });
    if (cardResult.ok) {
      await markResult(admin, input.row.id, cardResult, {
        dedupeKey: input.sentDedupe,
        templateKey: input.card,
      });
      return "done";
    }
  }
  const contentSid = conciergeContentSid(template);
  if (!contentSid) return input.holdWithoutCover ? "held" : "done";
  const variables = conciergeContentVariables({
    template,
    buttonSuffix: suffix,
    place: input.place,
    reference: input.reference,
    mediaUrl,
    variable: input.variable,
  });
  if (!variables) {
    await markResult(admin, input.row.id, { ok: false, reason: "rejected", detail: "lien absent" });
    return "done";
  }
  if (input.body !== input.row.body || template !== input.row.template_key) {
    await admin.from("crm_whatsapp_messages").update({ body: input.body, template_key: template }).eq("id", input.row.id);
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
    result.ok ? { dedupeKey: input.sentDedupe, templateKey: template } : undefined
  );
  return "done";
}

/**
 * Photo du lieu déjà là, ou à générer.
 * `generate` reste faux au moment où l’on montre le dossier : la requête admin ne lance pas l’image.
 */
async function openStayNotice(
  booking: { destination: string | null; title: string | null; cover_image_path: string | null },
  waits: number,
  generate: boolean
) {
  if (!stayHasPublishedCover(booking)) return "text" as const;
  const photo = generatedStayPhotoId(booking);
  let coverReady = !photo || (await cityCoverCached(photo));
  if (photo && !coverReady && generate) {
    const made = await ensureCityCover(photo);
    coverReady = Boolean(made?.byteLength);
    if (!coverReady && cityCoverAuthFailed()) return "text" as const;
  }
  if (booking.cover_image_path) coverReady = true;
  return stayNoticeDispatch({
    hasCover: true,
    coverReady,
    templateReady: Boolean(conciergeContentSid("sejour")),
    waits,
  });
}

async function noteCoverWait(admin: Admin, row: QueueRow) {
  const waits = (row.payload?.coverWaits || 0) + 1;
  const payload = { ...(row.payload || {}), coverWaits: waits };
  await admin.from("crm_whatsapp_messages").update({ payload }).eq("id", row.id).eq("status", "queued");
}

async function loadStaySteps(admin: Admin, bookingId: string) {
  const { data } = await admin
    .from("crm_booking_items")
    .select("kind, title, start_at, end_at, sort_order, details, lifecycle")
    .eq("booking_id", bookingId);
  return (data || []) as TripStep[];
}

/** Villes du séjour. Seul le modèle « Votre séjour » porte la couverture : les autres cartes ont leur image de type. */
function stayPlace(
  booking: { destination: string | null; title: string | null },
  steps?: TripStep[] | null,
  homeCity?: string | null
) {
  return stayPlaceName(booking.destination, booking.title, steps, homeCity);
}

/** Modèle sans bouton. Le numéro vient du compagnon, jamais du client du séjour. */
async function deliverTravellerPlain(admin: Admin, row: QueueRow, booking: CrmBooking) {
  const sid = conciergeContentSid("formalite_prete_voyageur");
  if (!sid || !row.payload?.travelerId) return;
  const handset = await loadTravellerHandset(admin, booking.id, row.payload.travelerId);
  if (!handset) {
    await markResult(admin, row.id, { ok: false, reason: "no_phone" });
    return;
  }
  const formality = safeFormalityName(entryForFrenchPassport(row.payload.iso).formality);
  const variables = formality
    ? travellerFormalityVariables({
        firstName: handset.firstName,
        formality,
        reference: booking.reference,
        startDate: booking.start_date,
        endDate: booking.end_date,
      })
    : null;
  if (!variables) {
    await markResult(admin, row.id, { ok: false, reason: "rejected", detail: "variables absentes" });
    return;
  }
  const body = travellerFormalityMessage(variables);
  if (body !== row.body) {
    await admin
      .from("crm_whatsapp_messages")
      .update({ body, template_key: "formalite_prete_voyageur" })
      .eq("id", row.id);
  }
  const result = await sendContentTemplate({ phone: handset.phone, contentSid: sid, variables });
  await markResult(
    admin,
    row.id,
    result,
    result.ok ? { templateKey: "formalite_prete_voyageur" } : undefined
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
  const steps = await loadStaySteps(admin, booking.id);
  const homeCity = customer.city || null;
  const key = row.dedupe_key;

  if (key.startsWith("sejour:")) {
    const preview = planStayNotice({
      published: true,
      reference: booking.reference,
      destination: booking.destination,
      title: booking.title,
      items: steps,
      homeCity,
      hasCover: stayHasPublishedCover(booking),
    });
    if (!preview) {
      await dropQueue(admin, row.id);
      return;
    }
    const waits = row.payload?.coverWaits || 0;
    const dispatch = await openStayNotice(booking, waits, true);
    if (dispatch === "wait") {
      await noteCoverWait(admin, row);
      return;
    }
    const plan =
      dispatch === "photo"
        ? preview
        : planStayNotice({
            published: true,
            reference: booking.reference,
            destination: booking.destination,
            title: booking.title,
            items: steps,
            homeCity,
            hasCover: false,
          }) || preview;
    const outcome = await deliverTemplate(admin, {
      row,
      customer,
      template: plan.template,
      path: plan.path,
      body: plan.body,
      place: plan.place,
      reference: booking.reference,
      stayCover: dispatch === "photo",
      holdWithoutCover: dispatch === "photo",
    });
    if (outcome === "held") {
      const next = waits + 1;
      if (next >= STAY_COVER_WAIT_LIMIT) {
        const text = planStayNotice({
          published: true,
          reference: booking.reference,
          destination: booking.destination,
          title: booking.title,
          items: steps,
          homeCity,
          hasCover: false,
        });
        if (text) {
          await deliverTemplate(admin, {
            row,
            customer,
            template: text.template,
            path: text.path,
            body: text.body,
            place: text.place,
            reference: booking.reference,
          });
        }
        return;
      }
      await noteCoverWait(admin, row);
    }
    return;
  }

  if (key.startsWith("pieces-queue:")) {
    const pieces = row.payload?.pieces || [];
    const first = Date.parse(pieces[0]?.at || "");
    if (!pieces.length || !Number.isFinite(first) || now.getTime() - first < PIECES_WINDOW_MS) return;
    const plans = planPiecesNotices({
      published: true,
      reference: booking.reference,
      destination: booking.destination,
      title: booking.title,
      items: steps,
      homeCity,
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
      place: plan.place,
      reference: booking.reference,
      variable: plan.variable,
      card: pieceCardTemplate(plan),
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
      place: stayPlace(booking, steps, homeCity),
      reference: booking.reference,
      card: noticeCardTemplate(plan.template),
    });
    return;
  }

  if (row.template_key === "formalite_prete_voyageur") {
    await deliverTravellerPlain(admin, row, booking);
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
      place: stayPlace(booking, steps, homeCity),
      reference: booking.reference,
      card: noticeCardTemplate(plan.template),
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
      .filter((doc) => isTravelAuthorization(doc.doc_type) && doc.booking_id === booking.id && doc.issuing_country)
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
    visaOffered: booking.offer_visa === true,
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
  const [steps, customer] = await Promise.all([
    loadStaySteps(admin, booking.id),
    loadCustomer(admin, booking.customer_id),
  ]);
  const plan = planStayNotice({
    published: true,
    reference: booking.reference,
    destination: booking.destination,
    title: booking.title,
    items: steps,
    homeCity: customer?.city || null,
    hasCover: stayHasPublishedCover(booking),
  });
  if (!plan) return;
  const dedupeKey = `sejour:${booking.id}`;
  const previous = await findByDedupe(admin, dedupeKey);
  const row = await saveQueue(admin, {
    dedupeKey,
    customerId: booking.customer_id,
    bookingId: booking.id,
    templateKey: plan.template,
    body: plan.body,
    payload: previous?.payload?.coverWaits ? { coverWaits: previous.payload.coverWaits } : {},
  });
  if (row.status === "sent") return;
  const dispatch = await openStayNotice(booking, row.payload?.coverWaits || 0, false);
  if (dispatch === "wait") return;
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
  const [steps, customer] = await Promise.all([
    loadStaySteps(admin, booking.id),
    loadCustomer(admin, booking.customer_id),
  ]);
  const plans = planPiecesNotices({
    published: true,
    reference: booking.reference,
    destination: booking.destination,
    title: booking.title,
    items: steps,
    homeCity: customer?.city || null,
    pieces,
  });
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

export type FormalityAudience = "tous" | "client" | "voyageur";

export type FormalityRecipient = {
  qui: "client" | "voyageur";
  notifie: boolean;
  raison: string | null;
};

export type FormalityNotice = {
  iso: string;
  notifie: boolean;
  raison: string | null;
  destinataires: FormalityRecipient[];
};

export type FormalityNotifyOptions = {
  /** Voyageurs concernés par la pièce. Vide : le client seulement, sauf audience voyageur. */
  travelerIds?: string[];
  audience?: FormalityAudience;
};

function handset(value: string | null | undefined) {
  const text = (value || "").trim();
  if (!text) return null;
  return toE164(text, "FR");
}

function sameHandset(client: { phone: string | null; phone_secondary?: string | null }, phone: string | null) {
  const traveler = handset(phone);
  if (!traveler) return false;
  return [client.phone, client.phone_secondary].some((value) => handset(value) === traveler);
}

function summarizeFormality(iso: string, destinataires: FormalityRecipient[]): FormalityNotice {
  const notifie = destinataires.some((row) => row.notifie);
  const reasons = [...new Set(destinataires.map((row) => row.raison).filter((row): row is string => Boolean(row)))];
  return { iso, notifie, raison: notifie ? null : reasons[0] || "Message non parti.", destinataires };
}

function blockedNotice(iso: string, raison: string, options: FormalityNotifyOptions): FormalityNotice {
  const audience = options.audience ?? "tous";
  const destinataires: FormalityRecipient[] = [];
  if (audience !== "voyageur") destinataires.push({ qui: "client", notifie: false, raison });
  if (audience === "voyageur" || (audience === "tous" && options.travelerIds?.length)) {
    destinataires.push({ qui: "voyageur", notifie: false, raison });
  }
  if (!destinataires.length) destinataires.push({ qui: "client", notifie: false, raison });
  return summarizeFormality(iso, destinataires);
}

async function consentedCustomer(admin: Admin, phone: string) {
  const keys = [...new Set([phone.trim(), handset(phone)].filter((value): value is string => Boolean(value)))];
  const found: CustomerRow[] = [];
  for (const key of keys) {
    const [byPhone, bySecond] = await Promise.all([
      admin
        .from("crm_customers")
        .select("id, email, phone, phone_secondary, first_name, whatsapp_opt_in_at, whatsapp_opt_out_at")
        .eq("phone", key)
        .limit(5),
      admin
        .from("crm_customers")
        .select("id, email, phone, phone_secondary, first_name, whatsapp_opt_in_at, whatsapp_opt_out_at")
        .eq("phone_secondary", key)
        .limit(5),
    ]);
    found.push(...((byPhone.data || []) as CustomerRow[]), ...((bySecond.data || []) as CustomerRow[]));
  }
  const unique = [...new Map(found.map((row) => [row.id, row])).values()];
  return (
    unique.find(
      (row) => row.email && row.phone && proactiveWhatsappAllowed(row) && sameHandset(row, phone)
    ) || null
  );
}

async function loadTravellerHandset(admin: Admin, bookingId: string, travelerId: string) {
  const { data } = await admin
    .from("crm_booking_travelers")
    .select("id, booking_id, companion_id, is_account_holder, first_name")
    .eq("id", travelerId)
    .maybeSingle();
  const traveler = data as {
    id: string;
    booking_id: string;
    companion_id: string | null;
    is_account_holder: boolean;
    first_name: string | null;
  } | null;
  if (!traveler || traveler.booking_id !== bookingId) return null;
  let phone: string | null = null;
  if (traveler.companion_id) {
    const { data: companion } = await admin
      .from("crm_travel_companions")
      .select("phone")
      .eq("id", traveler.companion_id)
      .maybeSingle();
    phone = handset((companion as { phone?: string | null } | null)?.phone);
  }
  return { traveler, phone, firstName: (traveler.first_name || "").trim() };
}

/** Compagnon différent du client. Une fiche opt-in garde le bouton ; sinon le modèle sans lien. */
async function travelerTarget(admin: Admin, booking: CrmBooking, client: CustomerRow | null, travelerId: string) {
  const loaded = await loadTravellerHandset(admin, booking.id, travelerId);
  if (!loaded) return { kind: "skip" as const, raison: "La pièce n’est pas liée à un voyageur." };
  if (loaded.traveler.is_account_holder) return { kind: "same" as const };
  if (!loaded.phone) return { kind: "skip" as const, raison: "Le voyageur n’a pas de numéro WhatsApp." };
  if (client && sameHandset(client, loaded.phone)) return { kind: "same" as const };
  const consented = await consentedCustomer(admin, loaded.phone);
  if (consented && consented.id !== booking.customer_id) {
    return { kind: "send" as const, customerId: consented.id };
  }
  if (consented?.id === booking.customer_id) return { kind: "same" as const };
  return { kind: "plain" as const, firstName: loaded.firstName };
}

async function sendFormalityRecipient(
  admin: Admin,
  booking: CrmBooking,
  plan: { template: "formalite_prete"; body: string },
  input: { qui: "client" | "voyageur"; dedupeKey: string; customerId: string; iso: string; travelerId?: string }
): Promise<FormalityRecipient> {
  const previous = await findByDedupe(admin, input.dedupeKey);
  if (previous?.status === "sent") return { qui: input.qui, notifie: false, raison: "Déjà envoyé." };
  const row = await saveQueue(admin, {
    dedupeKey: input.dedupeKey,
    customerId: input.customerId,
    bookingId: booking.id,
    templateKey: plan.template,
    body: plan.body,
    payload: { iso: input.iso, ...(input.travelerId ? { travelerId: input.travelerId } : {}) },
  });
  if (row.status === "sent") return { qui: input.qui, notifie: false, raison: "Déjà envoyé." };
  await deliverRow(admin, row, new Date());
  const after = await findByDedupe(admin, input.dedupeKey);
  if (after?.status === "sent") return { qui: input.qui, notifie: true, raison: null };
  const fresh = await loadBooking(admin, booking.id);
  if (!fresh?.visible_to_client) return { qui: input.qui, notifie: false, raison: "Le séjour n’est pas visible." };
  const customer = await loadCustomer(admin, input.customerId);
  const quiet = input.qui === "voyageur" ? "Le voyageur n’a pas activé WhatsApp." : "Le client n’a pas activé WhatsApp.";
  if (!customer?.email || !customer.phone || !proactiveWhatsappAllowed(customer)) {
    return { qui: input.qui, notifie: false, raison: quiet };
  }
  return { qui: input.qui, notifie: false, raison: "Message non parti." };
}

const TRAVELLER_TEMPLATE_PENDING = "Modèle WhatsApp voyageur pas encore approuvé.";

/** Numéro d’agence, sans fiche : modèle Utility sans bouton. Rien n’est mis en file si le SID manque. */
async function sendPlainTraveller(
  admin: Admin,
  booking: CrmBooking,
  input: { dedupeKey: string; iso: string; travelerId: string; firstName: string }
): Promise<FormalityRecipient> {
  const previous = await findByDedupe(admin, input.dedupeKey);
  if (previous?.status === "sent") return { qui: "voyageur", notifie: false, raison: "Déjà envoyé." };
  if (!conciergeContentSid("formalite_prete_voyageur")) {
    return { qui: "voyageur", notifie: false, raison: TRAVELLER_TEMPLATE_PENDING };
  }
  const formality = safeFormalityName(entryForFrenchPassport(input.iso).formality);
  const variables = formality
    ? travellerFormalityVariables({
        firstName: input.firstName,
        formality,
        reference: booking.reference,
        startDate: booking.start_date,
        endDate: booking.end_date,
      })
    : null;
  if (!variables) return { qui: "voyageur", notifie: false, raison: "Message non parti." };
  const row = await saveQueue(admin, {
    dedupeKey: input.dedupeKey,
    customerId: booking.customer_id,
    bookingId: booking.id,
    templateKey: "formalite_prete_voyageur",
    body: travellerFormalityMessage(variables),
    payload: { iso: input.iso, travelerId: input.travelerId },
  });
  if (row.status === "sent") return { qui: "voyageur", notifie: false, raison: "Déjà envoyé." };
  await deliverRow(admin, row, new Date());
  const after = await findByDedupe(admin, input.dedupeKey);
  if (after?.status === "sent") return { qui: "voyageur", notifie: true, raison: null };
  return { qui: "voyageur", notifie: false, raison: "Message non parti." };
}

/** WhatsApp « formalité prête ». Client et voyageur ont chacun leur envoi et leur dédoublonnage. */
export async function notifyFormalitiesReady(
  bookingId: string,
  countries: string[],
  admin: Admin = createServiceClient(),
  options: FormalityNotifyOptions = {}
): Promise<FormalityNotice[]> {
  const booking = await loadBooking(admin, bookingId);
  if (!booking) {
    return countries.map((iso) => blockedNotice(iso.trim().toUpperCase(), "Dossier introuvable.", options));
  }
  if (!booking.visible_to_client) {
    return countries.map((iso) => blockedNotice(iso.trim().toUpperCase(), "Le séjour n’est pas visible.", options));
  }
  const { data: papers } = await admin
    .from("crm_travel_documents")
    .select("doc_type, issuing_country, booking_id")
    .eq("customer_id", booking.customer_id)
    .in("doc_type", ["visa", "eta"]);
  const filed = new Set(
    ((papers || []) as { doc_type?: string | null; issuing_country?: string | null; booking_id?: string | null }[])
      .filter(
        (row) =>
          isTravelAuthorization(row.doc_type) &&
          row.issuing_country &&
          (!row.booking_id || row.booking_id === booking.id)
      )
      .map((row) => String(row.issuing_country).toUpperCase())
  );
  const audience = options.audience ?? "tous";
  const travelerIds = [...new Set((options.travelerIds || []).map((id) => id.trim()).filter(Boolean))];
  const results: FormalityNotice[] = [];
  for (const iso of countries) {
    const code = iso.trim().toUpperCase();
    try {
      if (!/^[A-Z]{2}$/.test(code)) {
        results.push(blockedNotice(code, "Pays émetteur manquant.", options));
        continue;
      }
      if (!filed.has(code)) {
        results.push(blockedNotice(code, "La pièce n’est pas dans l’espace.", options));
        continue;
      }
      const plan = planFormalityReady({
        published: true,
        formality: entryForFrenchPassport(code).formality,
      });
      if (!plan) {
        results.push(blockedNotice(code, "Formalité inconnue pour ce pays.", options));
        continue;
      }
      const client = await loadCustomer(admin, booking.customer_id);
      const destinataires: FormalityRecipient[] = [];
      const clientKey = `formalite-prete:${booking.id}:${code}`;
      if (audience !== "voyageur") {
        try {
          destinataires.push(
            await sendFormalityRecipient(admin, booking, plan, {
              qui: "client",
              dedupeKey: clientKey,
              customerId: booking.customer_id,
              iso: code,
            })
          );
        } catch (err) {
          console.error("[concierge] formalité", err instanceof Error ? err.message : "error");
          destinataires.push({ qui: "client", notifie: false, raison: "Message non parti." });
        }
      }
      if (audience !== "client") {
        if (!travelerIds.length && audience === "voyageur") {
          destinataires.push({ qui: "voyageur", notifie: false, raison: "La pièce n’est pas liée à un voyageur." });
        }
        for (const travelerId of travelerIds) {
          try {
            const target = await travelerTarget(admin, booking, client, travelerId);
            if (target.kind === "same") {
              if (audience === "voyageur") {
                destinataires.push(
                  await sendFormalityRecipient(admin, booking, plan, {
                    qui: "voyageur",
                    dedupeKey: clientKey,
                    customerId: booking.customer_id,
                    iso: code,
                    travelerId,
                  })
                );
              } else {
                destinataires.push({ qui: "voyageur", notifie: false, raison: "Même numéro que le client." });
              }
              continue;
            }
            if (target.kind === "skip") {
              destinataires.push({ qui: "voyageur", notifie: false, raison: target.raison });
              continue;
            }
            if (target.kind === "plain") {
              destinataires.push(
                await sendPlainTraveller(admin, booking, {
                  dedupeKey: `formalite-prete:${booking.id}:${code}:voyageur:${travelerId}`,
                  iso: code,
                  travelerId,
                  firstName: target.firstName,
                })
              );
              continue;
            }
            destinataires.push(
              await sendFormalityRecipient(admin, booking, plan, {
                qui: "voyageur",
                dedupeKey: `formalite-prete:${booking.id}:${code}:voyageur:${travelerId}`,
                customerId: target.customerId,
                iso: code,
                travelerId,
              })
            );
          } catch (err) {
            console.error("[concierge] formalité", err instanceof Error ? err.message : "error");
            destinataires.push({ qui: "voyageur", notifie: false, raison: "Message non parti." });
          }
        }
      }
      results.push(summarizeFormality(code, destinataires));
    } catch (err) {
      console.error("[concierge] formalité", err instanceof Error ? err.message : "error");
      results.push(blockedNotice(code, "Message non parti.", options));
    }
  }
  return results;
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
