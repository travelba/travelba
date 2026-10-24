import type { SupabaseClient } from "@supabase/supabase-js";
import { toE164 } from "./phone";
import { uploadCrmFile } from "./files";
import { redactIngestText } from "./ingest-redact";
import { looksLikePan } from "./pan";
import { formParams, verifyTwilioSignature } from "./twilio-signature";
import { liveConciergeImage, stayHasPublishedCover } from "./concierge-notices";
import { ensureTripShareCode } from "./trip-share-code";
import { CONCIERGE_BUBBLE_DELAY_MS } from "../concierge/bubbles";
import { withConciergeSignature } from "./whatsapp";
import {
  accessLinkReply,
  buildConciergeDossier,
  isConciergeStop,
  leadReply,
  messageLanguage,
  panRefusedReply,
  pieceSavedLine,
  rateLimitedReply,
  sharedPhoneReply,
  type ConciergePending,
  type HandoffKind,
} from "./whatsapp-concierge";
import { type ConciergeGenerator, type ConciergeHistoryTurn } from "./whatsapp-conversation";
import { signalWhatsappTyping } from "./whatsapp-typing";
import { planPhase2 } from "./concierge-phase2";
import { knowledgeSeed, type KnowledgeChunk } from "./concierge-knowledge";
import type { PlannedFollowup, ProposalDraft, TripBrief } from "./concierge-journey";
import type { QualityMark } from "./concierge-quality";
import { sessionAddress } from "./whatsapp-session";
import { nextParisMorning, threadIsPaused } from "./whatsapp-takeover";
import { loadCollaboratorTripOwnerIds } from "./company-peers";
import { filledLoyaltyLabels, loyaltyFromCustomer } from "./loyalty";

export type WhatsappMessageInsert = {
  customer_id: string | null;
  booking_id: string | null;
  direction: "inbound" | "outbound";
  template_key: string | null;
  body: string;
  twilio_sid: string | null;
  status: "received" | "sent" | "failed";
  error: string | null;
  phone?: string | null;
  tools?: string[] | null;
  author_staff_id?: string | null;
  media_path?: string | null;
};

export type WhatsappRequestInsert = {
  customer_id: string | null;
  phone: string | null;
  booking_id: string | null;
  message_id: string | null;
  kind: HandoffKind;
  body: string;
  status: "open";
};

export type WhatsappCompanion = {
  customerId: string;
  firstName: string | null;
  bookingIds: string[];
};

export type WhatsappCustomer = { id: string; first_name: string | null; email?: string | null };

export type WhatsappPieceResult = "saved" | "pan" | "skipped";

export type WhatsappThreadRow = {
  direction: "inbound" | "outbound";
  body: string;
  twilio_sid: string | null;
  created_at: string;
};

export type WhatsappStore = {
  findBySid(sid: string): Promise<boolean>;
  customersByPhone(e164: string): Promise<WhatsappCustomer[]>;
  loadDossier(customerId: string): Promise<Parameters<typeof buildConciergeDossier>[0]>;
  insertMessage(
    row: WhatsappMessageInsert
  ): Promise<{ id: string } | { duplicate: true }>;
  insertRequest(row: WhatsappRequestInsert): Promise<void>;
  optOut?(customerId: string): Promise<void>;
  savePiece?(input: {
    customerId: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<WhatsappPieceResult>;
  recentThread?(customerId: string): Promise<WhatsappThreadRow[]>;
  /** Derniers messages des 24 h, pour la mémoire du Concierge. Distinct de la rafale. */
  conversationHistory?(customerId: string): Promise<WhatsappThreadRow[]>;
  tagMessage?(id: string, bookingId: string): Promise<void>;
  /** Accompagnateur dont le téléphone n’est pas celui de la fiche. Séjours liés seulement. */
  companionByPhone?(e164: string): Promise<WhatsappCompanion | null>;
  /** Faux si un humain a repris le fil et que la pause tient encore. */
  threadOpen?(phone: string): Promise<boolean>;
  pauseThread?(phone: string, customerId: string | null): Promise<void>;
  loadBrief?(phone: string): Promise<TripBrief | null>;
  saveBrief?(brief: TripBrief, customerId: string | null): Promise<void>;
  insertProposal?(row: ProposalDraft & { phone: string; customerId: string | null; bookingId: string | null }): Promise<void>;
  insertQuality?(marks: QualityMark[]): Promise<void>;
  /** Savoir publié. Tableau vide si la migration n’est pas là : l’appelant reprend le dépôt. */
  loadKnowledge?(): Promise<KnowledgeChunk[]>;
  saveFollowups?(phone: string, customerId: string | null, rows: PlannedFollowup[]): Promise<void>;
  updateStatus?(sid: string, status: string): Promise<void>;
  /** Chemin de la dernière pièce enregistrée, puis oublié. */
  takePiecePath?(): string | null;
  /** Demandes encore ouvertes, pour ne pas les oublier au tour suivant. */
  openRequests?(customerId: string): Promise<ConciergePending[]>;
};

const PIECE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const PIECE_MARK = "Pièce reçue sur WhatsApp.";

/** Vrai si le fichier contient un PAN. Ne journalise pas les chiffres. */
export function bytesContainPan(bytes: Uint8Array) {
  const text = Buffer.from(bytes).toString("latin1");
  const matches = text.match(/\d(?:[ \t.-]?\d){12,18}/g) || [];
  return matches.some((raw) => looksLikePan(raw));
}

export function pieceContentType(value: string | null | undefined) {
  const type = (value || "").split(";")[0].trim().toLowerCase();
  return PIECE_TYPES.has(type) ? type : null;
}

export async function downloadTwilioMedia(input: {
  url: string;
  accountSid: string;
  authToken: string;
  fetchImpl?: typeof fetch;
}) {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "api.twilio.com") return null;
  const auth = Buffer.from(`${input.accountSid}:${input.authToken}`).toString("base64");
  const response = await (input.fetchImpl || fetch)(parsed.toString(), {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) return null;
  const contentType = pieceContentType(response.headers.get("content-type"));
  if (!contentType) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > 8_000_000) return null;
  return { bytes, contentType };
}

/** Le dernier message du paquet répond, avec le texte des précédents. */
export function burstReply(sid: string, rows: WhatsappThreadRow[]) {
  if (!rows.length) return { send: true as const, text: null as string | null };
  const index = rows.findIndex((row) => row.twilio_sid === sid);
  if (index === -1) return { send: true as const, text: null as string | null };
  if (rows.slice(index + 1).some((row) => row.direction === "inbound")) {
    return { send: false as const, text: null as string | null };
  }
  let start = 0;
  rows.forEach((row, i) => {
    if (row.direction === "outbound" && i < index) start = i + 1;
  });
  const text = rows
    .slice(start, index + 1)
    .filter((row) => row.direction === "inbound")
    .map((row) => row.body.trim())
    .filter(Boolean)
    .join("\n");
  return { send: true as const, text };
}

export function phoneFromWhatsapp(from: string | null | undefined) {
  const raw = (from || "").replace(/^whatsapp:/i, "").trim();
  if (!raw) return null;
  return toE164(raw, "FR");
}

function inboundBody(params: Record<string, string>) {
  const text = (params.Body || "").trim();
  if (text) return text;
  const media = Number(params.NumMedia || "0");
  if (Number.isFinite(media) && media > 0) return "Document reçu sur WhatsApp.";
  return "";
}

function prefixSigned(signed: string, line: string) {
  const body = signed
    .split("\n")
    .filter((row) => !/^le concierge\.?$/i.test(row.trim()))
    .join("\n")
    .trim();
  return withConciergeSignature(`${line}\n${body}`.trim());
}

function statusCallbackOnly(params: Record<string, string>) {
  return Boolean(params.MessageStatus) && !inboundBody(params);
}

type DossierRaw = Awaited<ReturnType<WhatsappStore["loadDossier"]>>;

/** L’accompagnateur ne voit que ses séjours. Pas l’encours, pas le coffre du titulaire. */
export function scopeCompanionDossier(raw: DossierRaw, bookingIds: string[]): DossierRaw {
  const ids = new Set(bookingIds);
  const bookings = (raw.bookings || []).filter((booking) => ids.has(booking.id));
  return {
    ...raw,
    bookings,
    items: (raw.items || []).filter((item) => ids.has(item.booking_id)),
    bookingDocuments: (raw.bookingDocuments || []).filter((doc) => ids.has(doc.booking_id)),
    visaRequests: (raw.visaRequests || []).filter((row) => ids.has(row.booking_id)),
    transactions: [],
    balances: [],
    travelDocuments: [],
  };
}

/** Seuls `1` et `true` ouvrent la réponse automatique. Tout le reste, y compris l’absence, la coupe. */
export function conciergeAutoreplyEnabled(env: Record<string, string | undefined> = process.env) {
  const raw = (env.CONCIERGE_AUTOREPLY || "").trim().toLowerCase();
  return raw === "1" || raw === "true";
}

export function whatsappPieceInsert(input: { customerId: string; path: string; contentType: string; ext: string }) {
  return {
    customer_id: input.customerId,
    doc_type: "other" as const,
    storage_path: input.path,
    file_name: `piece-whatsapp.${input.ext}`,
    mime_type: input.contentType,
  };
}

export async function receiveWhatsappWebhook(input: {
  url: string;
  signature: string | null;
  params: URLSearchParams | Record<string, string>;
  authToken: string | null | undefined;
  accountSid?: string | null;
  burstWaitMs?: number;
  fetchImpl?: typeof fetch;
  openAccess?(customer: WhatsappCustomer): Promise<string | null>;
  converse?: ConciergeGenerator;
  /** Faux : pas d’appel au modèle. Le routeur répond quand même. */
  allow?: (phone: string) => Promise<boolean>;
  /** Numéro de l’agence. Un message qui en part est une prise de main, sans réponse du bot. */
  agencyFrom?: string | null;
  alert?: (row: WhatsappRequestInsert) => Promise<void>;
  /** Réponse du Concierge. Coupé par défaut (`CONCIERGE_AUTOREPLY`). */
  autoreply?: boolean;
  /** Pause entre deux bulles. Défaut 1,2 s. */
  bubbleDelayMs?: number;
  /** Indicateur de saisie WhatsApp. Absent : on n’appelle pas Twilio. */
  typingFetch?: typeof fetch;
  /** Instant du message. Les tests figent le jeudi. */
  now?: Date;
  env?: Record<string, string | undefined>;
  store: WhatsappStore;
  /**
   * Avant de répondre. `stop` : la remise au Concierge a déjà traité ce message
   * (ou une réponse est déjà partie). `continue` : la pause habituelle s’applique.
   */
  beforeReply?(phone: string): Promise<"stop" | "continue">;
  send(message: { to: string; body: string; mediaUrl?: string | null }): Promise<{
    ok: boolean;
    sid?: string;
    detail?: string;
  }>;
}): Promise<{ status: number }> {
  const token = input.authToken?.trim() || "";
  if (!token) return { status: 503 };
  const autoreply = input.autoreply ?? conciergeAutoreplyEnabled(input.env);
  const params = formParams(input.params);
  if (!verifyTwilioSignature({ authToken: token, url: input.url, params, signature: input.signature })) {
    return { status: 403 };
  }
  if (statusCallbackOnly(params)) {
    const sid = (params.MessageSid || "").trim();
    const state = (params.MessageStatus || "").trim();
    if (sid && state) await input.store.updateStatus?.(sid, state);
    return { status: 200 };
  }

  const sid = (params.MessageSid || "").trim();
  if (!sid) return { status: 400 };
  if (await input.store.findBySid(sid)) return { status: 200 };

  const typing =
    input.typingFetch && input.accountSid
      ? signalWhatsappTyping({
          messageSid: sid,
          accountSid: input.accountSid,
          authToken: token,
          fetchImpl: input.typingFetch,
        })
      : Promise.resolve();
  const done = async (status: number) => {
    await typing;
    return { status };
  };

  const e164 = phoneFromWhatsapp(params.From);
  const to = e164 ? sessionAddress(e164) : null;
  const clientText = redactIngestText(inboundBody(params) || "Message vide.");
  if (!to || !e164) return done(200);

  const agency = phoneFromWhatsapp(input.agencyFrom);
  if (agency && e164 === agency) {
    const clientPhone = phoneFromWhatsapp(params.To);
    const holders = clientPhone ? await input.store.customersByPhone(clientPhone) : [];
    const holder = holders.length === 1 ? holders[0] : null;
    await input.store.insertMessage({
      customer_id: holder?.id || null,
      booking_id: null,
      direction: "outbound",
      template_key: "staff",
      body: clientText,
      twilio_sid: sid,
      status: "received",
      error: null,
      phone: clientPhone,
    });
    if (clientPhone) await input.store.pauseThread?.(clientPhone, holder?.id || null);
    return done(200);
  }

  const customers = await input.store.customersByPhone(e164);
  let customer = customers.length === 1 ? customers[0] : null;
  let companion: WhatsappCompanion | null = null;
  if (!customer && customers.length === 0) {
    companion = (await input.store.companionByPhone?.(e164)) || null;
    if (companion) customer = { id: companion.customerId, first_name: companion.firstName };
  }
  const mediaCount = Number(params.NumMedia || "0");
  const mediaOnly = !(params.Body || "").trim() && Number.isFinite(mediaCount) && mediaCount > 0;
  let piece: WhatsappPieceResult | null = null;
  if (customer && mediaCount > 0 && input.store.savePiece && input.accountSid && token) {
    piece = await storeInboundPieces({
      params,
      customerId: customer.id,
      accountSid: input.accountSid,
      authToken: token,
      fetchImpl: input.fetchImpl,
      savePiece: input.store.savePiece.bind(input.store),
    });
  }

  let journal = clientText;
  if (mediaOnly && piece === "saved") journal = PIECE_MARK;
  if (piece === "pan") journal = "Numéro de carte non conservé.";

  const inbound = await input.store.insertMessage({
    customer_id: customer?.id || null,
    booking_id: null,
    direction: "inbound",
    template_key: null,
    body: journal,
    twilio_sid: sid,
    status: "received",
    error: null,
    phone: e164,
    media_path: piece === "saved" ? input.store.takePiecePath?.() || null : null,
  });
  if ("duplicate" in inbound) return done(200);

  if (input.beforeReply) {
    const gate = await input.beforeReply(e164);
    if (gate === "stop") return done(200);
  }

  if (customer && (await input.store.threadOpen?.(e164)) === false) return done(200);

  if (!autoreply) {
    await holdInboundForAgency({
      store: input.store,
      alert: input.alert,
      customer,
      shared: customers.length > 1,
      phone: e164,
      messageId: inbound.id,
      body: journal,
    });
    return done(200);
  }

  let said = journal;
  if (customer && input.store.recentThread) {
    const wait = input.burstWaitMs || 0;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const decision = burstReply(sid, await input.store.recentThread(customer.id));
    if (!decision.send) return done(200);
    if (decision.text) said = decision.text;
  }

  let bookingId: string | null = null;
  let handoff: HandoffKind | null = null;
  let tools: string[] | null = null;
  let reply = leadReply(messageLanguage(clientText));
  let turnMessages: string[] | null = null;
  let mediaUrl: string | null = null;
  const lang = messageLanguage(clientText);
  const allowed = input.allow ? await input.allow(e164) : true;

  if (!customer) {
    if (customers.length > 1) {
      reply = sharedPhoneReply(lang);
      handoff = "question";
    } else {
      handoff = "lead";
    }
  } else if (piece === "pan") {
    reply = panRefusedReply(lang);
  } else {
    const parts = said
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const stopping = parts.some((line) => isConciergeStop(line));
    const hadPiece = piece === "saved" || parts.some((line) => line === PIECE_MARK);
    const content = parts.filter((line) => !isConciergeStop(line) && line !== PIECE_MARK).join("\n");
    const loaded = await input.store.loadDossier(customer.id);
    const raw = companion ? scopeCompanionDossier(loaded, companion.bookingIds) : loaded;
    const dossier = buildConciergeDossier({ ...raw, firstName: customer.first_name });
    if (!content && hadPiece && !stopping) {
      reply = withConciergeSignature(pieceSavedLine(lang));
    } else {
      const history = input.store.conversationHistory ? await input.store.conversationHistory(customer.id) : [];
      const prior: ConciergeHistoryTurn[] = history
        .filter((row) => row.twilio_sid !== sid && !row.body.startsWith("Conversation rendue au Concierge"))
        .slice(-16)
        .map((row) => ({ direction: row.direction, body: row.body, at: row.created_at }));
      const brief = (await input.store.loadBrief?.(e164)) || null;
      const storedKnowledge = await input.store.loadKnowledge?.();
      const pending = (await input.store.openRequests?.(customer.id)) || [];
      const phase = await planPhase2({
        phone: e164,
        message: content || said,
        dossier,
        history: prior,
        brief,
        generate: allowed ? input.converse : undefined,
        knowledge: storedKnowledge?.length ? storedKnowledge : knowledgeSeed(),
        balance: dossier.balances[0]?.balance ?? null,
        currency: dossier.balances[0]?.currency || "EUR",
        now: input.now,
        pending,
      });
      const turn = phase.turn;
      tools = turn.tools?.length ? turn.tools : null;
      bookingId = turn.bookingId;
      handoff = turn.handoff;
      const replyLang = messageLanguage(content || said);
      const limited = !allowed && !turn.handoff && !turn.access && !turn.optOut;
      reply = limited
        ? rateLimitedReply(replyLang)
        : turn.access
          ? accessLinkReply(replyLang, (await input.openAccess?.(customer)) || null)
          : turn.text;
      if (!limited && !turn.access && turn.messages?.length) turnMessages = turn.messages;
      if (limited) {
        handoff = null;
        mediaUrl = null;
      } else if (!turn.access) {
        mediaUrl = turn.cover;
        if (hadPiece) reply = prefixSigned(reply, pieceSavedLine(replyLang));
        if (phase.brief) await input.store.saveBrief?.(phase.brief, customer.id);
        if (phase.proposal) {
          await input.store.insertProposal?.({
            ...phase.proposal,
            phone: e164,
            customerId: customer.id,
            bookingId,
          });
        }
        if (phase.marks.length) await input.store.insertQuality?.(phase.marks.map((mark) => ({ ...mark, phone: e164 })));
        if (phase.followups.length) await input.store.saveFollowups?.(e164, customer.id, phase.followups);
      }
      if (stopping) {
        await input.store.optOut?.(customer.id);
        if (content && !turn.optOut) {
          const stopLine =
            lang === "en"
              ? "The agency’s proactive messages are stopped."
              : lang === "he"
                ? "ההודעות היזומות של הסוכנות הופסקו."
                : "Les messages de l’agence sont coupés.";
          reply = prefixSigned(reply, stopLine);
        }
      }
    }
    if (mediaOnly && piece === "skipped") {
      reply = withConciergeSignature(
        lang === "en"
          ? "I couldn’t save that document. You can send it again, or I can ask the agency."
          : lang === "he"
            ? "לא הצלחתי לשמור את המסמך. אפשר לשלוח שוב, או שאעביר לסוכנות."
            : "Je n’ai pas pu enregistrer cette pièce. Vous pouvez la renvoyer, ou j’en parle à l’agence."
      );
      handoff = null;
      mediaUrl = null;
    }
  }

  if (customer && bookingId) await input.store.tagMessage?.(inbound.id, bookingId);

  if (mediaUrl) mediaUrl = await liveConciergeImage(mediaUrl, input.fetchImpl);
  const planned = turnMessages;
  const bubbles = (planned && reply === planned.join("\n\n") ? planned : [reply]).filter((line) => line.trim()).slice(0, 3);
  const delayMs = input.bubbleDelayMs ?? CONCIERGE_BUBBLE_DELAY_MS;
  let outbound: { id: string } | { duplicate: true } = { duplicate: true };
  for (let index = 0; index < bubbles.length; index += 1) {
    if (index > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const sent = await input.send({ to, body: bubbles[index], mediaUrl: index === 0 ? mediaUrl : null });
    const stored = await input.store.insertMessage({
      customer_id: customer?.id || null,
      booking_id: bookingId,
      direction: "outbound",
      template_key: "chat",
      body: bubbles[index],
      twilio_sid: sent.ok ? sent.sid || null : null,
      status: sent.ok ? "sent" : "failed",
      error: sent.ok ? null : sent.detail || "rejected",
      phone: e164,
      tools: index === 0 ? tools : null,
    });
    if (index === 0) outbound = stored;
  }
  if (handoff && !("duplicate" in outbound)) {
    const request: WhatsappRequestInsert = {
      customer_id: customers.length === 1 || companion ? customer?.id || null : null,
      phone: e164,
      booking_id: bookingId,
      message_id: inbound.id,
      kind: handoff,
      body: redactIngestText(clientText),
      status: "open",
    };
    await input.store.insertRequest(request);
    try {
      await input.alert?.(request);
    } catch (err) {
      console.error("[whatsapp-concierge] alerte", err instanceof Error ? err.name : "error");
    }
  }
  return done(200);
}

/** Le message est déjà dans le fil. L’agence est prévenue. Rien ne part sur WhatsApp. */
async function holdInboundForAgency(input: {
  store: WhatsappStore;
  alert?: (row: WhatsappRequestInsert) => Promise<void>;
  customer: WhatsappCustomer | null;
  shared: boolean;
  phone: string;
  messageId: string;
  body: string;
}) {
  const request: WhatsappRequestInsert = {
    customer_id: input.shared ? null : input.customer?.id || null,
    phone: input.phone,
    booking_id: null,
    message_id: input.messageId,
    kind: input.customer || input.shared ? "question" : "lead",
    body: redactIngestText(input.body),
    status: "open",
  };
  await input.store.insertRequest(request);
  try {
    await input.alert?.(request);
  } catch (err) {
    console.error("[whatsapp-concierge] alerte", err instanceof Error ? err.name : "error");
  }
}

async function storeInboundPieces(input: {
  params: Record<string, string>;
  customerId: string;
  accountSid: string;
  authToken: string;
  fetchImpl?: typeof fetch;
  savePiece: NonNullable<WhatsappStore["savePiece"]>;
}): Promise<WhatsappPieceResult> {
  const count = Math.min(Number(input.params.NumMedia || "0") || 0, 5);
  let result: WhatsappPieceResult = "skipped";
  for (let i = 0; i < count; i += 1) {
    const url = input.params[`MediaUrl${i}`] || "";
    if (!url) continue;
    const file = await downloadTwilioMedia({
      url,
      accountSid: input.accountSid,
      authToken: input.authToken,
      fetchImpl: input.fetchImpl,
    });
    if (!file) continue;
    if (bytesContainPan(file.bytes)) return "pan";
    const saved = await input.savePiece({
      customerId: input.customerId,
      bytes: file.bytes,
      contentType: file.contentType,
    });
    if (saved === "pan") return "pan";
    if (saved === "saved") result = "saved";
  }
  return result;
}

export function createWhatsappSupabaseStore(admin: SupabaseClient): WhatsappStore {
  let lastPiecePath: string | null = null;
  return {
    async findBySid(sid) {
      const { data, error } = await admin
        .from("crm_whatsapp_messages")
        .select("id")
        .eq("twilio_sid", sid)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async customersByPhone(e164) {
      const [primary, secondary] = await Promise.all([
        admin.from("crm_customers").select("id, first_name, email").eq("phone", e164),
        admin.from("crm_customers").select("id, first_name, email").eq("phone_secondary", e164),
      ]);
      if (primary.error) throw primary.error;
      if (secondary.error) throw secondary.error;
      const map = new Map<string, WhatsappCustomer>();
      for (const row of [...(primary.data || []), ...(secondary.data || [])]) {
        map.set(row.id, { id: row.id, first_name: row.first_name, email: row.email });
      }
      return [...map.values()];
    },
    async loadDossier(customerId) {
      const { data: holder, error: holderError } = await admin
        .from("crm_customers")
        .select("id, company_role, billing_parent_id, language, flying_blue, loyalty")
        .eq("id", customerId)
        .maybeSingle();
      if (holderError) throw holderError;
      const ownerIds = holder ? await loadCollaboratorTripOwnerIds(admin, holder) : [customerId];
      const { data: bookings, error: bookingError } = await admin
        .from("crm_bookings")
        .select(
          "id, reference, title, destination, start_date, end_date, currency, total_amount, notes_client, visible_to_client, prices_visible, cover_image_path, share_code"
        )
        .in("customer_id", ownerIds)
        .is("archived_at", null);
      if (bookingError) throw bookingError;
      // La photo du séjour exige le code de partage : on le crée pour un séjour publié qui en a une.
      for (const booking of bookings || []) {
        if (!booking.visible_to_client || booking.share_code || !stayHasPublishedCover(booking)) continue;
        try {
          booking.share_code = await ensureTripShareCode(admin, booking.id);
        } catch {
          booking.share_code = null;
        }
      }
      const ids = (bookings || []).map((booking) => booking.id);
      const [items, docs, visas, txs, balances, papers] = await Promise.all([
        ids.length
          ? admin
              .from("crm_booking_items")
              .select("id, booking_id, kind, title, supplier, start_at, end_at, amount, details, visible_to_client")
              .in("booking_id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? admin
              .from("crm_booking_documents")
              .select("id, booking_id, kind, file_name, visible_to_client")
              .in("booking_id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? admin
              .from("crm_visa_requests")
              .select("booking_id, country, status, step")
              .in("booking_id", ids)
          : Promise.resolve({ data: [], error: null }),
        admin
          .from("crm_transactions")
          .select("booking_id, direction, kind, amount, currency, occurred_on, label, status")
          .eq("customer_id", customerId)
          .eq("status", "posted")
          .order("occurred_on", { ascending: false })
          .limit(12),
        admin.from("crm_customer_balances").select("currency, balance").eq("customer_id", customerId),
        admin
          .from("crm_travel_documents")
          .select("doc_type, first_name, last_name, expires_on")
          // Le numéro et la MRZ ne sont pas lus.
          .eq("customer_id", customerId),
      ]);
      for (const result of [items, docs, visas, txs, balances, papers]) {
        if (result.error) throw result.error;
      }
      return {
        bookings: bookings || [],
        items: items.data || [],
        bookingDocuments: docs.data || [],
        visaRequests: visas.data || [],
        transactions: txs.data || [],
        balances: balances.data || [],
        travelDocuments: papers.data || [],
        preferences: filledLoyaltyLabels(loyaltyFromCustomer(holder || {})),
        language: holder && "language" in holder ? String(holder.language || "") : null,
      };
    },
    async insertMessage(row) {
      const base = {
        customer_id: row.customer_id,
        booking_id: row.booking_id,
        direction: row.direction,
        template_key: row.template_key,
        body: row.body,
        twilio_sid: row.twilio_sid,
        status: row.status,
        error: row.error,
      };
      const extra = {
        phone: row.phone ?? null,
        tools: row.tools ?? null,
        author_staff_id: row.author_staff_id ?? null,
        media_path: row.media_path ?? null,
      };
      let attempt = await admin
        .from("crm_whatsapp_messages")
        .insert({ ...base, ...extra })
        .select("id")
        .single();
      if (attempt.error && /column|schema cache/i.test(attempt.error.message || "")) {
        attempt = await admin.from("crm_whatsapp_messages").insert(base).select("id").single();
      }
      if (attempt.error?.code === "23505") return { duplicate: true };
      if (attempt.error || !attempt.data) throw attempt.error || new Error("journal WhatsApp");
      return { id: attempt.data.id as string };
    },
    async updateStatus(sid, status) {
      const mapped = status === "undelivered" ? "failed" : status;
      if (!["queued", "sent", "delivered", "read", "failed", "received"].includes(mapped)) return;
      const { error } = await admin.from("crm_whatsapp_messages").update({ status: mapped }).eq("twilio_sid", sid);
      if (error) console.error("[whatsapp-concierge] statut", error.code || "error");
    },
    takePiecePath() {
      const path = lastPiecePath;
      lastPiecePath = null;
      return path;
    },
    async insertRequest(row) {
      const { error } = await admin.from("crm_whatsapp_requests").insert(row);
      if (error) throw error;
    },
    async optOut(customerId) {
      const { error } = await admin
        .from("crm_customers")
        .update({ whatsapp_opt_out_at: new Date().toISOString() })
        .eq("id", customerId);
      if (error) throw error;
    },
    async recentThread(customerId) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data, error } = await admin
        .from("crm_whatsapp_messages")
        .select("direction, body, twilio_sid, created_at")
        .eq("customer_id", customerId)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data || []) as WhatsappThreadRow[];
    },
    async conversationHistory(customerId) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await admin
        .from("crm_whatsapp_messages")
        .select("direction, body, twilio_sid, created_at")
        .eq("customer_id", customerId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(17);
      if (error) throw error;
      return ((data || []) as WhatsappThreadRow[]).reverse();
    },
    async tagMessage(id, bookingId) {
      const { error } = await admin.from("crm_whatsapp_messages").update({ booking_id: bookingId }).eq("id", id);
      if (error) throw error;
    },
    async companionByPhone(e164) {
      const { data, error } = await admin
        .from("crm_travel_companions")
        .select("id, customer_id, first_name")
        .eq("phone", e164);
      if (error || data?.length !== 1) return null;
      const companion = data[0];
      const { data: links, error: linkError } = await admin
        .from("crm_booking_travelers")
        .select("booking_id")
        .eq("companion_id", companion.id);
      if (linkError) return null;
      return {
        customerId: companion.customer_id,
        firstName: companion.first_name,
        bookingIds: (links || []).map((row) => row.booking_id as string),
      };
    },
    async threadOpen(phone) {
      const { data, error } = await admin
        .from("crm_whatsapp_threads")
        .select("paused_until")
        .eq("phone", phone)
        .maybeSingle();
      if (error || !data?.paused_until) return true;
      return !threadIsPaused(data.paused_until, new Date());
    },
    async pauseThread(phone, customerId) {
      const now = new Date();
      const { error } = await admin.from("crm_whatsapp_threads").upsert({
        phone,
        customer_id: customerId,
        paused_at: now.toISOString(),
        paused_until: nextParisMorning(now).toISOString(),
        updated_at: now.toISOString(),
      });
      if (error) console.error("[whatsapp-concierge] pause", error.code || "error");
    },
    async loadBrief(phone) {
      const { data, error } = await admin
        .from("crm_concierge_briefs")
        .select("phone, destination, start_on, end_on, travellers, budget, wishes, stage")
        .eq("phone", phone)
        .maybeSingle();
      if (error || !data) return null;
      return {
        phone,
        destination: data.destination,
        start: data.start_on,
        end: data.end_on,
        travellers: data.travellers,
        budget: data.budget,
        wishes: data.wishes,
        stage: data.stage,
      };
    },
    async saveBrief(brief, customerId) {
      const { error } = await admin.from("crm_concierge_briefs").upsert({
        phone: brief.phone,
        customer_id: customerId,
        destination: brief.destination,
        start_on: brief.start,
        end_on: brief.end,
        travellers: brief.travellers,
        budget: brief.budget,
        wishes: brief.wishes,
        stage: brief.stage,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error("[whatsapp-concierge] brief", error.code || "error");
    },
    async insertProposal(row) {
      const { error } = await admin.from("crm_concierge_proposals").insert({
        phone: row.phone,
        customer_id: row.customerId,
        booking_id: row.bookingId,
        kind: row.kind,
        status: "pending",
        draft_body: row.draftBody,
        amounts: row.amounts,
        simulated: row.simulated,
      });
      if (error) console.error("[whatsapp-concierge] proposition", error.code || "error");
    },
    async insertQuality(marks) {
      if (!marks.length) return;
      const { error } = await admin.from("crm_concierge_quality").insert(
        marks.map((mark) => ({ phone: mark.phone, flag: mark.flag, note: mark.note, marked_at: mark.at }))
      );
      if (error) console.error("[whatsapp-concierge] qualite", error.code || "error");
    },
    async loadKnowledge() {
      const { data, error } = await admin
        .from("crm_concierge_knowledge")
        .select("id, kind, title, body, locale, tags, published")
        .eq("published", true)
        .limit(80);
      if (error || !data?.length) return [];
      return data.flatMap((row) => {
        const kind = row.kind;
        if (
          kind !== "service" &&
          kind !== "tone" &&
          kind !== "conditions" &&
          kind !== "faq" &&
          kind !== "partner" &&
          kind !== "formality" &&
          kind !== "example"
        ) {
          return [];
        }
        return [
          {
            id: String(row.id),
            kind,
            title: String(row.title || ""),
            body: String(row.body || ""),
            locale: String(row.locale || "fr"),
            tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
            published: true,
          },
        ];
      });
    },
    async saveFollowups(phone, customerId, rows) {
      if (!rows.length) return;
      const { error } = await admin.from("crm_concierge_followups").upsert(
        rows.map((row) => ({
          phone,
          customer_id: customerId,
          kind: row.kind,
          channel: row.channel,
          template_key: row.templateKey,
          draft_body: row.body,
          due_at: row.dueAt,
          status: "planned",
        })),
        { onConflict: "phone,kind" }
      );
      if (error) console.error("[whatsapp-concierge] relance", error.code || "error");
    },
    async openRequests(customerId) {
      const { data, error } = await admin
        .from("crm_whatsapp_requests")
        .select("kind, booking_id, body")
        .eq("customer_id", customerId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) {
        console.error("[whatsapp-concierge] demandes", error.code || "error");
        return [];
      }
      return (data || []).flatMap((row) => {
        const kind = row.kind as HandoffKind;
        if (!row.body) return [];
        return [{ kind, bookingId: row.booking_id, body: String(row.body) }];
      });
    },
    async savePiece({ customerId, bytes, contentType }) {
      const type = pieceContentType(contentType);
      if (!type) return "skipped";
      if (bytesContainPan(bytes)) return "pan";
      const ext = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const path = `customers/${customerId}/whatsapp/${crypto.randomUUID()}.${ext}`;
      await uploadCrmFile(path, Buffer.from(bytes), type);
      lastPiecePath = path;
      const { error } = await admin.from("crm_travel_documents").insert(
        whatsappPieceInsert({ customerId, path, contentType: type, ext })
      );
      if (error) throw error;
      return "saved";
    },
  };
}
