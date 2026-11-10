import type { SupabaseClient } from "@supabase/supabase-js";
import { decideProposal } from "@/lib/crm/concierge-proposals";
import { runIfConfirmed } from "@/lib/crm/mcp-preview";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { toE164 } from "@/lib/crm/phone";
import { agencySignoff } from "@/lib/crm/whatsapp-takeover";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type ShareRequest = { dossierId: string; reference: string; compagnonId: string };
export type SharePreview = { prenom: string; titre: string; destinataire: string; corps: string; envoie: true };

export type InboxAction = "repondre" | "reprendre" | "rendre" | "traiter" | "noter" | "creer_fiche";
export type InboxRequest = {
  action: InboxAction;
  phone: string;
  texte: string;
  modele: string;
  dossierId: string;
  clientId: string;
  demandeId: string;
  messageId: string;
  note: "good" | "bad" | "clear" | "";
  prenom: string;
  nom: string;
};

export type ProposalAction = "approuver" | "refuser" | "modifier" | "relancer";
export type ProposalRequest = { action: ProposalAction; id: string; texte: string };

type Effects<TPreview, TRequest> = {
  preview: (request: TRequest) => Promise<TPreview>;
  apply?: (request: TRequest) => Promise<Record<string, unknown>>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `•••${digits.slice(-4)}` : "•••";
}

function dossierOf(input: Record<string, unknown>) {
  const dossierId = text(input.dossier_id);
  const reference = text(input.reference);
  if (dossierId && !UUID.test(dossierId)) throw new McpWriteError("Dossier invalide.");
  if (!dossierId && !reference) throw new McpWriteError("Indiquez le dossier.");
  return { dossierId, reference };
}

export function parseShare(input: Record<string, unknown>): ShareRequest {
  const { dossierId, reference } = dossierOf(input);
  const compagnonId = text(input.compagnon_id);
  if (!UUID.test(compagnonId)) throw new McpWriteError("Accompagnateur invalide.");
  return { dossierId, reference, compagnonId };
}

export function parseInbox(input: Record<string, unknown>): InboxRequest {
  const action = text(input.action);
  const allowed: InboxAction[] = ["repondre", "reprendre", "rendre", "traiter", "noter", "creer_fiche"];
  if (!allowed.includes(action as InboxAction)) throw new McpWriteError("Action inconnue.");
  const phone = toE164(text(input.telephone), "FR") || "";
  const request: InboxRequest = {
    action: action as InboxAction,
    phone,
    texte: text(input.texte),
    modele: text(input.modele),
    dossierId: text(input.dossier_id),
    clientId: text(input.client_id),
    demandeId: text(input.demande_id),
    messageId: text(input.message_id),
    note: input.note === "good" || input.note === "bad" || input.note === "clear" ? input.note : "",
    prenom: text(input.prenom),
    nom: text(input.nom),
  };
  if (request.dossierId && !UUID.test(request.dossierId)) throw new McpWriteError("Dossier invalide.");
  if (request.clientId && !UUID.test(request.clientId)) throw new McpWriteError("Client invalide.");
  if ((request.action === "repondre" || request.action === "reprendre" || request.action === "rendre") && !request.phone) {
    throw new McpWriteError("Téléphone manquant.");
  }
  if (request.action === "repondre" && !request.modele && request.texte.length < 2) throw new McpWriteError("Message trop court.");
  if (request.action === "repondre" && request.modele && request.modele !== "sejour_texte" && request.modele !== "rappel") {
    throw new McpWriteError("Ce modèle n’est pas soumis à Meta.");
  }
  if (request.action === "traiter" && !UUID.test(request.demandeId)) throw new McpWriteError("Demande manquante.");
  if (request.action === "noter" && (!UUID.test(request.messageId) || !request.note)) throw new McpWriteError("Note invalide.");
  if (request.action === "creer_fiche" && (request.prenom.length < 2 || request.nom.length < 2 || !request.phone)) {
    throw new McpWriteError("Prénom, nom et téléphone requis.");
  }
  return request;
}

export function parseProposal(input: Record<string, unknown>): ProposalRequest {
  const action = text(input.action);
  if (action !== "approuver" && action !== "refuser" && action !== "modifier" && action !== "relancer") {
    throw new McpWriteError("Action inconnue.");
  }
  const id = text(input.id);
  if (!UUID.test(id)) throw new McpWriteError(action === "relancer" ? "Relance manquante." : "Proposition manquante.");
  const texte = text(input.texte);
  if (action === "modifier" && texte.length < 10) throw new McpWriteError("Texte trop court.");
  return { action, id, texte };
}

export function sharePreviewBody(input: { prenom: string; titre: string }) {
  const name = input.prenom.replace(/[\r\n]+/g, " ").trim();
  const title = input.titre.replace(/[\r\n]+/g, " ").trim() || "votre voyage";
  const hello = name ? `Bonjour ${name},` : "Bonjour,";
  return [hello, "", `Voici le voyage ${title}.`, "lien personnel", "", "Travel Business Agency"].join("\n");
}

function withoutLink<T extends Record<string, unknown>>(row: T) {
  const corps = typeof row.corps === "string" ? row.corps : "";
  if (/https?:\/\//i.test(corps)) throw new McpWriteError("L’aperçu ne contient pas de lien.");
  return row;
}

async function gated<TRequest, TPreview extends Record<string, unknown>>(
  input: Record<string, unknown>,
  request: TRequest,
  effects: Effects<TPreview, TRequest> | undefined,
  livePreview: (request: TRequest) => Promise<TPreview>,
  liveApply: (request: TRequest) => Promise<Record<string, unknown>>
) {
  const preview = withoutLink(await (effects?.preview ?? livePreview)(request));
  const apercu = { envoye: false, ...preview };
  return runIfConfirmed(input, apercu, async () => {
    const done = await (effects?.apply ?? liveApply)(request);
    return { envoye: preview.envoie === true, ecrit: true, apercu: false, ...preview, ...done };
  });
}

export async function partagerSejour(input: Record<string, unknown>, effects?: Effects<SharePreview, ShareRequest>) {
  return gated(input, parseShare(input), effects, liveSharePreview, liveShareSend);
}

export async function fileWhatsapp(input: Record<string, unknown>, effects?: Effects<Record<string, unknown>, InboxRequest>) {
  return gated(input, parseInbox(input), effects, liveInboxPreview, liveInboxApply);
}

export async function propositionConcierge(
  input: Record<string, unknown>,
  effects?: Effects<Record<string, unknown>, ProposalRequest>
) {
  return gated(input, parseProposal(input), effects, liveProposalPreview, liveProposalApply);
}

export async function envoyerRestaurants(
  input: Record<string, unknown>,
  effects?: Effects<{ messages: { partie: string; texte: string }[]; envoie: true }, { dossierId: string; reference: string; date: string }>
) {
  const { dossierId, reference } = dossierOf(input);
  const date = text(input.date);
  if (!DAY.test(date)) throw new McpWriteError("Date invalide.");
  return gated(input, { dossierId, reference, date }, effects, liveRestaurantPreview, liveRestaurantSend);
}

async function liveSharePreview(request: ShareRequest): Promise<SharePreview> {
  const booking = await loadBooking(request.dossierId, request.reference);
  if (!booking.visible_to_client) throw new McpWriteError("Ce voyage n’est pas publié.");
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const admin = createServiceClient();
  const [{ data: travelers }, { data: companions }] = await Promise.all([
    admin.from("crm_booking_travelers").select("companion_id, is_account_holder").eq("booking_id", booking.id),
    admin.from("crm_travel_companions").select("id, first_name, phone").eq("customer_id", booking.customer_id),
  ]);
  const { planTripShareSend } = await import("@/lib/crm/trip-share");
  const plan = planTripShareSend({
    companionId: request.compagnonId,
    travelers: travelers || [],
    companions: companions || [],
  });
  if (!plan.ok) {
    throw new McpWriteError(plan.reason === "no_phone" ? "Cet accompagnateur n’a pas de téléphone." : "Accompagnateur introuvable sur ce voyage.");
  }
  return {
    prenom: plan.firstName,
    titre: String(booking.title || booking.destination || "Séjour"),
    destinataire: maskPhone(plan.phone),
    corps: sharePreviewBody({ prenom: plan.firstName, titre: String(booking.title || booking.destination || "Séjour") }),
    envoie: true,
  };
}

async function liveShareSend(request: ShareRequest) {
  const booking = await loadBooking(request.dossierId, request.reference);
  if (!booking.visible_to_client) throw new McpWriteError("Ce voyage n’est pas publié.");
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { ensureTripShareCode } = await import("@/lib/crm/trip-share-load");
  const { planTripShareSend, tripShareUrl } = await import("@/lib/crm/trip-share");
  const { deliverTripShareWhatsapp } = await import("@/lib/crm/trip-share-send");
  const { stayTitleFromItems } = await import("@/lib/crm/staff-stay");
  const { clientVisibleItems } = await import("@/lib/crm/carnet");
  const { siteConfig } = await import("@/lib/site");
  const { currentMcpAccess } = await import("@/lib/crm/mcp-auth");
  const admin = createServiceClient();
  const code = await ensureTripShareCode(admin, booking.id);
  if (!code) throw new McpWriteError("Ce voyage n’est pas publié.");
  const [{ data: travelers }, { data: companions }, { data: customer }, { data: items }] = await Promise.all([
    admin.from("crm_booking_travelers").select("companion_id, is_account_holder").eq("booking_id", booking.id),
    admin.from("crm_travel_companions").select("id, first_name, phone").eq("customer_id", booking.customer_id),
    admin.from("crm_customers").select("city").eq("id", booking.customer_id).maybeSingle(),
    admin.from("crm_booking_items").select("kind, title, start_at, end_at, sort_order, details, visible_to_client").eq("booking_id", booking.id),
  ]);
  const plan = planTripShareSend({ companionId: request.compagnonId, travelers: travelers || [], companions: companions || [] });
  if (!plan.ok) throw new McpWriteError(plan.reason === "no_phone" ? "Cet accompagnateur n’a pas de téléphone." : "Accompagnateur introuvable sur ce voyage.");
  const result = await deliverTripShareWhatsapp({
    customerId: String(booking.customer_id),
    bookingId: String(booking.id),
    companionId: request.compagnonId,
    phone: plan.phone,
    firstName: plan.firstName,
    title: stayTitleFromItems(
      booking.title,
      booking.destination,
      clientVisibleItems(items || []),
      "Séjour",
      typeof customer?.city === "string" ? customer.city : null
    ),
    url: tripShareUrl(siteConfig.url, code),
    audience: "staff",
    staffId: currentMcpAccess().staff?.id || null,
  });
  if (!result.ok) throw new McpWriteError("message" in result && result.message ? String(result.message) : "Le message n’est pas parti.");
  return { envoye: true };
}

async function liveInboxPreview(request: InboxRequest) {
  if (request.action === "repondre") {
    return { action: request.action, destinataire: maskPhone(request.phone), corps: request.modele ? `Modèle ${request.modele}` : agencySignoff(request.texte), envoie: true };
  }
  if (request.action === "creer_fiche") {
    return { action: request.action, prenom: request.prenom, nom: request.nom, destinataire: maskPhone(request.phone), envoie: false, invitation: false };
  }
  if (request.action === "noter") return { action: request.action, note: request.note, envoie: false };
  if (request.action === "traiter") return { action: request.action, envoie: false };
  return {
    action: request.action,
    destinataire: maskPhone(request.phone),
    envoie: false,
    corps: request.action === "reprendre" ? "Le Concierge se tait jusqu’au lendemain matin." : "Le fil revient au Concierge.",
  };
}

async function liveInboxApply(request: InboxRequest) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { currentMcpAccess } = await import("@/lib/crm/mcp-auth");
  const admin = createServiceClient();
  const staffId = currentMcpAccess().staff?.id || null;
  if (request.action === "noter") {
    const existing = await admin.from("crm_whatsapp_messages").select("id, direction, template_key").eq("id", request.messageId).maybeSingle();
    const row = existing.data as { direction?: string; template_key?: string | null } | null;
    if (!row || row.direction !== "outbound" || row.template_key === "staff" || row.template_key === "agence") {
      throw new McpWriteError("Seule une réponse du Concierge se note.");
    }
    const mark = request.note === "clear" ? null : request.note;
    const saved = await admin
      .from("crm_whatsapp_messages")
      .update({ concierge_mark: mark, concierge_marked_at: mark ? new Date().toISOString() : null, concierge_marked_by: mark ? staffId : null })
      .eq("id", request.messageId);
    if (saved.error) throw new McpWriteError("La note n’a pas été enregistrée.");
    return { envoye: false };
  }
  if (request.action === "traiter") {
    const { error } = await admin.from("crm_whatsapp_requests").update({ status: "done", resolved_at: new Date().toISOString() }).eq("id", request.demandeId);
    if (error) throw new McpWriteError("La demande n’a pas été classée.");
    return { envoye: false };
  }
  if (request.action === "creer_fiche") {
    const created = await admin
      .from("crm_customers")
      .insert({ first_name: request.prenom, last_name: request.nom, phone: request.phone, email: null, language: "fr" })
      .select("id")
      .single();
    if (created.error || !created.data) throw new McpWriteError("La fiche n’a pas été créée.");
    const id = String(created.data.id);
    await admin.from("crm_whatsapp_messages").update({ customer_id: id }).eq("phone", request.phone);
    await admin.from("crm_whatsapp_threads").update({ customer_id: id }).eq("phone", request.phone);
    return { envoye: false, client_id: id, invitation: false };
  }
  if (request.action === "rendre") {
    const { releaseThreadToConcierge } = await import("@/lib/crm/whatsapp-handoff");
    const released = await releaseThreadToConcierge(admin, { phone: request.phone, customerId: request.clientId || null });
    if (!released.ok) throw new McpWriteError("La conversation n’a pas pu être rendue au Concierge.");
    return { envoye: false };
  }
  if (request.action === "reprendre") {
    const { nextParisMorning } = await import("@/lib/crm/whatsapp-takeover");
    const now = new Date();
    const { error } = await admin.from("crm_whatsapp_threads").upsert({
      phone: request.phone,
      customer_id: request.clientId || null,
      paused_at: now.toISOString(),
      paused_until: nextParisMorning(now).toISOString(),
      paused_by: staffId,
      updated_at: now.toISOString(),
    });
    if (error) throw new McpWriteError("La reprise en main n’a pas abouti.");
    return { envoye: false };
  }
  return liveInboxReply(request, admin, staffId);
}

async function liveInboxReply(request: InboxRequest, admin: SupabaseClient, staffId: string | null) {
  const { isVercelPreview } = await import("@/lib/crm/preview-secrets");
  const { draftTemplateRefused } = await import("@/lib/crm/whatsapp-inbox");
  const { sessionAddress } = await import("@/lib/crm/whatsapp-session");
  if (isVercelPreview()) throw new McpWriteError("Envoi coupé sur l’aperçu.");
  if (request.modele && draftTemplateRefused(request.modele)) throw new McpWriteError("Ce modèle n’est pas soumis à Meta.");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await admin.from("crm_whatsapp_messages").select("id").eq("direction", "inbound").eq("phone", request.phone).gte("created_at", since).limit(1);
  const windowOpen = !recent.error && (recent.data || []).length > 0;
  const to = sessionAddress(request.phone);
  if (!to) throw new McpWriteError("Téléphone manquant.");
  const text = agencySignoff(request.texte);
  let sentBody = text;
  let sentSid: string | null = null;
  if (request.modele) {
    const { conciergeContentSid, conciergeContentVariables } = await import("@/lib/crm/concierge-notices");
    const { stayDestinationLine } = await import("@/lib/crm/stay-phrase");
    const { sendContentTemplate } = await import("@/lib/crm/whatsapp");
    const key = request.modele as "sejour_texte" | "rappel";
    const sid = conciergeContentSid(key);
    if (!sid || !request.dossierId) throw new McpWriteError("Ce modèle approuvé a besoin du séjour.");
    const booking = await admin.from("crm_bookings").select("reference, title, destination, share_code").eq("id", request.dossierId).maybeSingle();
    const variables = conciergeContentVariables({
      template: key,
      buttonSuffix: "",
      place: booking.data ? stayDestinationLine(booking.data) : "",
      reference: booking.data?.reference || "",
    });
    if (!variables) throw new McpWriteError("Hors des 24 heures. Le modèle approuvé attend le lien du séjour.");
    const sent = await sendContentTemplate({ phone: request.phone, contentSid: sid, variables });
    if (!sent.ok) throw new McpWriteError("WhatsApp n’a pas accepté le modèle.");
    sentSid = sent.sid;
    sentBody = text || `Modèle ${request.modele}`;
  } else {
    if (!windowOpen) throw new McpWriteError("Hors des 24 heures. Choisissez un modèle approuvé.");
    if (text.length < 2 || text.length > 1200) throw new McpWriteError("Message trop court.");
    const { sendWhatsappSession } = await import("@/lib/crm/whatsapp-session");
    const sent = await sendWhatsappSession({ to, body: text });
    if (!sent.ok) throw new McpWriteError("WhatsApp n’a pas accepté le message.");
    sentSid = sent.sid;
  }
  const now = new Date();
  await admin.from("crm_whatsapp_messages").insert({
    customer_id: request.clientId || null,
    booking_id: request.dossierId || null,
    direction: "outbound",
    template_key: request.modele || "staff",
    body: sentBody,
    twilio_sid: sentSid,
    status: "sent",
    error: null,
    phone: request.phone,
    author_staff_id: staffId,
  });
  const { nextParisMorning } = await import("@/lib/crm/whatsapp-takeover");
  await admin.from("crm_whatsapp_threads").upsert({
    phone: request.phone,
    customer_id: request.clientId || null,
    paused_at: now.toISOString(),
    paused_until: nextParisMorning(now).toISOString(),
    paused_by: staffId,
    updated_at: now.toISOString(),
  });
  return { envoye: true, corps: request.modele ? `Modèle ${request.modele}` : text };
}

async function liveProposalPreview(request: ProposalRequest) {
  if (request.action === "relancer") return liveFollowupPreview(request.id);
  const row = await loadProposal(request.id);
  const { conciergeOutboundArmed } = await import("@/lib/crm/concierge-proposals");
  const decision = decideProposal(
    { draftBody: String(row.draft_body || "") },
    request.action === "approuver" ? "approve" : request.action === "modifier" ? "edit" : "reject",
    request.texte || null,
    conciergeOutboundArmed()
  );
  if ("error" in decision && decision.error) throw new McpWriteError(decision.error);
  return {
    action: request.action,
    statut: decision.status,
    corps: decision.body,
    envoie: decision.send,
    destinataire: maskPhone(String(row.phone || "")),
  };
}

async function liveProposalApply(request: ProposalRequest) {
  if (request.action === "relancer") return liveFollowupSend(request.id);
  const row = await loadProposal(request.id);
  const { conciergeOutboundArmed } = await import("@/lib/crm/concierge-proposals");
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { currentMcpAccess } = await import("@/lib/crm/mcp-auth");
  const decision = decideProposal(
    { draftBody: String(row.draft_body || "") },
    request.action === "approuver" ? "approve" : request.action === "modifier" ? "edit" : "reject",
    request.texte || null,
    conciergeOutboundArmed()
  );
  if ("error" in decision && decision.error) throw new McpWriteError(decision.error);
  const admin = createServiceClient();
  const { error } = await admin
    .from("crm_concierge_proposals")
    .update({
      status: decision.status,
      draft_body: decision.body || row.draft_body,
      decided_by: currentMcpAccess().staff?.id || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", request.id);
  if (error) throw new McpWriteError("La proposition n’a pas été mise à jour.");
  if (decision.send && decision.body) {
    const phone = toE164(String(row.phone || ""), "FR");
    const { sessionAddress, sendWhatsappSession } = await import("@/lib/crm/whatsapp-session");
    const to = phone ? sessionAddress(phone) : null;
    if (!to) throw new McpWriteError("Pas de téléphone pour WhatsApp.");
    const sent = await sendWhatsappSession({ to, body: decision.body });
    if (!sent.ok) throw new McpWriteError("WhatsApp n’a pas accepté le message.");
    await admin.from("crm_whatsapp_messages").insert({
      customer_id: row.customer_id,
      booking_id: row.booking_id,
      direction: "outbound",
      template_key: "chat",
      body: decision.body,
      twilio_sid: sent.sid,
      status: "sent",
      error: null,
    });
  }
  return { envoye: decision.send, statut: decision.status };
}

async function liveFollowupPreview(id: string) {
  const row = await loadFollowup(id);
  const decision = await followupDecision(row);
  const { clientTouchpointBody } = await import("@/lib/crm/concierge-touchpoints");
  const { withConciergeSignature } = await import("@/lib/crm/whatsapp");
  const plain = clientTouchpointBody(String(row.draft_body || ""));
  return { action: "relancer", corps: plain ? withConciergeSignature(plain) : null, envoie: decision.send, destinataire: maskPhone(String(row.phone || "")) };
}

async function liveFollowupSend(id: string) {
  const row = await loadFollowup(id);
  await followupDecision(row);
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { clientTouchpointBody } = await import("@/lib/crm/concierge-touchpoints");
  const { withConciergeSignature } = await import("@/lib/crm/whatsapp");
  const { sessionAddress, sendWhatsappSession } = await import("@/lib/crm/whatsapp-session");
  const plain = clientTouchpointBody(String(row.draft_body || ""));
  if (!plain || /[A-Z0-9<]{20,}/.test(plain)) throw new McpWriteError("Le message n’est pas parti.");
  const admin = createServiceClient();
  const claimed = await admin.from("crm_concierge_followups").update({ status: "sent" }).eq("id", id).eq("status", "planned").select("id");
  if (claimed.error || !claimed.data?.length) throw new McpWriteError("Cette relance est déjà traitée.");
  const phone = toE164(String(row.phone || ""), "FR");
  const to = phone ? sessionAddress(phone) : null;
  if (!to) throw new McpWriteError("Pas de téléphone pour WhatsApp.");
  const text = withConciergeSignature(plain);
  const result = await sendWhatsappSession({ to, body: text });
  if (!result.ok) {
    await admin.from("crm_concierge_followups").update({ status: "planned" }).eq("id", id).eq("status", "sent");
    throw new McpWriteError("Le message n’est pas parti.");
  }
  await admin.from("crm_whatsapp_messages").insert({
    customer_id: row.customer_id,
    booking_id: row.booking_id,
    phone,
    direction: "outbound",
    template_key: "chat",
    body: text,
    twilio_sid: result.sid,
    status: "sent",
    error: null,
  });
  return { envoye: true };
}

async function followupDecision(row: { kind: string; template_key: string | null; draft_body: string; due_at: string; status: string; phone: string; customer_id: string | null }) {
  if (row.status !== "planned") throw new McpWriteError("Cette relance est déjà traitée.");
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { proactiveWhatsappAllowed } = await import("@/lib/crm/whatsapp-concierge");
  const { sessionWindowOpen } = await import("@/lib/crm/whatsapp-inbox");
  const { decideFollowupDelivery } = await import("@/lib/crm/carnet-addition");
  const { isVercelPreview } = await import("@/lib/crm/preview-secrets");
  const admin = createServiceClient();
  if (row.customer_id) {
    const customer = await admin.from("crm_customers").select("whatsapp_opt_in_at, whatsapp_opt_out_at").eq("id", row.customer_id).maybeSingle();
    const person = customer.data as { whatsapp_opt_in_at?: string | null; whatsapp_opt_out_at?: string | null } | null;
    if (!person || !proactiveWhatsappAllowed({ whatsapp_opt_in_at: person.whatsapp_opt_in_at, whatsapp_opt_out_at: person.whatsapp_opt_out_at })) {
      throw new McpWriteError("Le client a coupé WhatsApp.");
    }
  }
  const phone = toE164(String(row.phone || ""), "FR");
  const last = phone
    ? await admin.from("crm_whatsapp_messages").select("created_at").eq("phone", phone).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const now = new Date();
  const decision = decideFollowupDelivery({
    kind: row.kind,
    templateKey: row.template_key,
    windowOpen: sessionWindowOpen((last.data as { created_at?: string } | null)?.created_at || null, now),
    preview: isVercelPreview(),
    dueAt: row.due_at,
    now,
  });
  if (!decision.send) throw new McpWriteError(decision.error);
  return decision;
}

async function liveRestaurantPreview(request: { dossierId: string; reference: string; date: string }) {
  const booking = await loadBooking(request.dossierId, request.reference);
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { sendRestaurantEvening } = await import("@/lib/crm/restaurants-run");
  const result = await sendRestaurantEvening(createServiceClient(), String(booking.id), request.date, { dry: true });
  if ("error" in result && result.error) throw new McpWriteError(result.error);
  const messages = "messages" in result && result.messages ? result.messages : [];
  return { date: request.date, dossier_id: String(booking.id), messages, envoie: true as const };
}

async function liveRestaurantSend(request: { dossierId: string; reference: string; date: string }) {
  const booking = await loadBooking(request.dossierId, request.reference);
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { sendRestaurantEvening } = await import("@/lib/crm/restaurants-run");
  const result = await sendRestaurantEvening(createServiceClient(), String(booking.id), request.date);
  if ("error" in result && result.error) throw new McpWriteError(result.error);
  return { envoye: true };
}

async function loadBooking(dossierId: string, reference: string) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const admin = createServiceClient();
  const query = admin.from("crm_bookings").select("id, title, destination, visible_to_client, customer_id, reference");
  const filtered = dossierId ? query.eq("id", dossierId) : query.eq("reference", reference);
  const { data, error } = await filtered.limit(2);
  if (error) throw new McpWriteError("Dossier introuvable.");
  const rows = data || [];
  if (!rows.length) throw new McpWriteError("Dossier introuvable.");
  if (rows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return rows[0];
}

async function loadProposal(id: string) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { data, error } = await createServiceClient().from("crm_concierge_proposals").select("id, draft_body, status, phone, customer_id, booking_id").eq("id", id).maybeSingle();
  if (error || !data) throw new McpWriteError("Proposition introuvable.");
  return data as { draft_body: string | null; phone: string | null; customer_id: string | null; booking_id: string | null };
}

async function loadFollowup(id: string) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const { data, error } = await createServiceClient()
    .from("crm_concierge_followups")
    .select("id, phone, customer_id, booking_id, kind, template_key, draft_body, due_at, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new McpWriteError("Relance introuvable.");
  return data as { phone: string; customer_id: string | null; booking_id: string | null; kind: string; template_key: string | null; draft_body: string; due_at: string; status: string };
}
