import type { SupabaseClient } from "@supabase/supabase-js";
import { leadPassenger } from "@/lib/agency/upsert-client";
import {
  hasDossierSend,
  hasOptInSend,
  publishGuideRecord,
  requireLeadContact,
  sendDossierToLead,
  sendOptInToLead,
} from "@/lib/agency/send-voyage";
import {
  downloadTwilioMedia,
  type TwilioInbound,
  type TwilioInboundMedia,
} from "@/lib/agency/twilio-inbound";
import {
  adminGuideUrl,
  getAgencyOwnerUserId,
  getStaffWhatsAppDigits,
  isStaffSender,
} from "@/lib/agency/wa-ops-config";
import {
  colleagueHelpCopy,
  decideStaffAction,
  extractConsigne,
  extractPhone,
  isHelpText,
  isNoText,
  isSendConfirmText,
  isYesText,
  runColleagueTurn,
  type ConsigneFields,
} from "@/lib/agency/wa-ops-intent";
import {
  createSession,
  findOpenSession,
  parseSessionNotes,
  saveSessionNotes,
  updateSession,
  wasMessageProcessed,
  type WaOpsAwaiting,
  type WaOpsPendingInbound,
  type WaOpsSession,
  type WaOpsSessionNotes,
} from "@/lib/agency/wa-ops-session";
import { sendWhatsAppReply } from "@/lib/agency/whatsapp";
import { createDraftGuide, loadGuideForUser } from "@/lib/mtrip/create-guide";
import { parsePassportFile } from "@/lib/mtrip/extract-passport";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";
import { ingestDocumentFiles } from "@/lib/mtrip/ingest-documents";
import { ingestPassportFiles } from "@/lib/mtrip/ingest-passports";
import type { IngestFile } from "@/lib/mtrip/ingest-types";
import { passengerCompleteness } from "@/lib/mtrip/passenger-schema";
import { createServiceClient } from "@/lib/supabase/admin";

const UNKNOWN_ACK =
  "Bonjour, je suis Le Concierge de Travel Business Agency. Pour un dossier voyage, contactez votre conseiller.";

function debounceMs() {
  const n = Number(process.env.AGENCY_WA_DEBOUNCE_MS || 4000);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 15000) : 4000;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function phoneTail(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "").slice(-9);
}

function guideHasData(guide: AgencyMtripGuide | null | undefined) {
  if (!guide) return false;
  return Boolean(
    (guide.passengers || []).length ||
      (guide.quote_lines || []).length ||
      (guide.documents || []).length
  );
}

async function reply(toDigits: string, body: string) {
  const text = body.trim();
  if (!text) return;
  await sendWhatsAppReply({ toPhone: toDigits, body: text.slice(0, 1600) });
}

async function loadOwnerGuide(
  supabase: SupabaseClient,
  ownerId: string,
  guideId: string | null
) {
  if (!guideId) return null;
  return loadGuideForUser(supabase, ownerId, guideId);
}

function applyConsigneToGuide(
  guide: AgencyMtripGuide,
  consigne: ConsigneFields
): Partial<AgencyMtripGuide> {
  const passengers = [...(guide.passengers || [])];
  const leadIdx = passengers.findIndex((p) => p.role === "lead_traveler");
  const idx = leadIdx >= 0 ? leadIdx : passengers.length ? 0 : -1;
  if (idx >= 0 && passengers[idx]) {
    if (consigne.client_phone) {
      passengers[idx] = {
        ...passengers[idx],
        phone: `+${consigne.client_phone}`,
      };
    }
    if (consigne.client_email) {
      passengers[idx] = { ...passengers[idx], email: consigne.client_email };
    }
  }

  const genericTitle =
    !guide.title?.trim() || /^nouveau voyage$/i.test(guide.title);
  const nextTitle =
    consigne.title?.trim() &&
    (genericTitle || consigne.title.trim().length > guide.title.length)
      ? consigne.title.trim()
      : guide.title;

  const notes = [...(guide.extraction?.notes || [])];
  if (consigne.notes) notes.push(consigne.notes);

  return {
    passengers,
    title: nextTitle,
    start_date: consigne.start_date || guide.start_date,
    end_date: consigne.end_date || guide.end_date,
    extraction: {
      ...(guide.extraction || {}),
      notes,
    },
  };
}

function withPendingContact(
  guide: AgencyMtripGuide,
  pending: { phone?: string; email?: string }
): Partial<AgencyMtripGuide> | null {
  if (!pending.phone && !pending.email) return null;
  if (!(guide.passengers || []).length) return null;
  return applyConsigneToGuide(guide, {
    client_phone: pending.phone || null,
    client_email: pending.email || null,
  });
}

export function buildVoyageRecap(guide: AgencyMtripGuide) {
  const pax = guide.passengers || [];
  const lines = guide.quote_lines || [];
  const { lead } = requireLeadContact(guide);
  const paxLines = pax.length
    ? pax
        .map((p) => {
          const { complete, label } = passengerCompleteness(p);
          return `• ${p.first_name} ${p.last_name} (${complete ? "OK" : label})`;
        })
        .join("\n")
    : "• aucun passager";
  const devis = lines.length
    ? lines
        .slice(0, 8)
        .map((l) => `• ${l.title}`)
        .join("\n")
    : "• aucune résa pour l’instant";
  const firstName = lead?.first_name || "le client";
  const missing: string[] = [];
  if (!pax.length) missing.push("passeports");
  if (!lead?.phone) missing.push("WhatsApp client");
  if (!lead?.email) missing.push("email client");

  const tail = missing.length
    ? `Il me manque : ${missing.join(", ")}.`
    : `Je peux envoyer à ${firstName} ?`;

  return [
    `${guide.title}`,
    guide.start_date || guide.end_date
      ? `Dates : ${guide.start_date || "?"} → ${guide.end_date || "?"}`
      : null,
    `Passagers (${pax.length}) :`,
    paxLines,
    `Résas (${lines.length}) :`,
    devis,
    `Contact : ${lead?.phone || "pas de WhatsApp"} / ${lead?.email || "pas d’email"}`,
    tail,
  ]
    .filter(Boolean)
    .join("\n");
}

function blockingGaps(guide: AgencyMtripGuide) {
  const { lead } = requireLeadContact(guide);
  const gaps: string[] = [];
  if (!(guide.passengers || []).length) gaps.push("passeports");
  if (!lead?.phone?.trim()) gaps.push("WhatsApp client");
  return { lead, gaps };
}

function snapshotForLlm(guide: AgencyMtripGuide) {
  const { lead, gaps } = requireLeadContact(guide);
  return [
    `titre=${guide.title}`,
    `dates=${guide.start_date || "?"} → ${guide.end_date || "?"}`,
    `passagers=${(guide.passengers || [])
      .map((p) => `${p.first_name} ${p.last_name}`)
      .join(", ") || "aucun"}`,
    `resas=${(guide.quote_lines || []).map((l) => l.title).join(" | ") || "aucune"}`,
    `wa=${lead?.phone || "manquant"}`,
    `email=${lead?.email || "manquant"}`,
    `trous=${gaps.join(",") || "aucun"}`,
  ].join("\n");
}

function pushHistory(
  notes: WaOpsSessionNotes,
  role: "staff" | "agent",
  text: string
) {
  const trimmed = text.trim();
  if (!trimmed) return;
  notes.history = [
    ...(notes.history || []),
    { role, text: trimmed.slice(0, 400), at: new Date().toISOString() },
  ].slice(-8);
}

function mergeBatch(pending: WaOpsPendingInbound[]): {
  body: string;
  media: TwilioInboundMedia[];
  sids: string[];
} {
  const bodies: string[] = [];
  const media: TwilioInboundMedia[] = [];
  const sids: string[] = [];
  for (const item of pending) {
    if (item.sid) sids.push(item.sid);
    const text = [item.buttonPayload, item.body].filter(Boolean).join(" ").trim();
    if (text) bodies.push(text);
    media.push(...(item.media || []));
  }
  return { body: bodies.join("\n"), media, sids };
}

async function persistGuidePatch(
  supabase: SupabaseClient,
  ownerId: string,
  guideId: string,
  patch: Partial<AgencyMtripGuide>
) {
  const { data, error } = await supabase
    .from("agency_mtrip_guides")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", guideId)
    .eq("user_id", ownerId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "MAJ voyage impossible");
  return data as AgencyMtripGuide;
}

async function ensureStaffSession(
  supabase: SupabaseClient,
  ownerId: string,
  inbound: TwilioInbound
): Promise<{ session: WaOpsSession; guide: AgencyMtripGuide }> {
  let session = await findOpenSession(supabase, inbound.fromDigits);
  if (session?.guide_id) {
    const guide = await loadOwnerGuide(supabase, ownerId, session.guide_id);
    if (guide) {
      await updateSession(supabase, session.id, {
        last_inbound_sid: inbound.messageSid,
      });
      return { session, guide };
    }
  }

  const guide = await createDraftGuide(supabase, ownerId, {
    title: "Nouveau voyage",
  });
  if (session) {
    session = await updateSession(supabase, session.id, {
      guide_id: guide.id,
      status: "collecting",
      last_inbound_sid: inbound.messageSid,
    });
  } else {
    session = await createSession(supabase, {
      fromDigits: inbound.fromDigits,
      ownerUserId: ownerId,
      guideId: guide.id,
      inboundSid: inbound.messageSid,
    });
  }
  return { session, guide };
}

async function ingestMediaList(
  supabase: SupabaseClient,
  ownerId: string,
  guide: AgencyMtripGuide,
  media: TwilioInboundMedia[]
) {
  const passportFiles: IngestFile[] = [];
  const parsedByName = new Map<
    string,
    Awaited<ReturnType<typeof parsePassportFile>>
  >();
  const docFiles: IngestFile[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < media.length; i++) {
    const item = media[i];
    try {
      const file = await downloadTwilioMedia(item.url, item.contentType, i);
      const isPdf = file.type.includes("pdf") || file.name.endsWith(".pdf");
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) {
        skipped.push(`${file.name} (format ${file.type})`);
        continue;
      }
      const parsed = await parsePassportFile(file.buffer, file.name, file.type);
      if (parsed.passengers.length) {
        passportFiles.push(file);
        parsedByName.set(file.name, parsed);
      } else {
        docFiles.push(file);
      }
    } catch (err) {
      skipped.push(
        `média ${i + 1}: ${err instanceof Error ? err.message : "échec"}`
      );
    }
  }

  const parts: string[] = [];
  let next = guide;

  if (passportFiles.length) {
    const result = await ingestPassportFiles({
      supabase,
      userId: ownerId,
      guide: next,
      files: passportFiles.map((f) => ({
        ...f,
        parsed: parsedByName.get(f.name),
      })),
    });
    next = result.guide || next;
    const ok = result.results.filter((r) => r.status !== "failed");
    const names = ok
      .map((r) => r.passenger_name)
      .filter(Boolean)
      .join(", ");
    parts.push(
      ok.length
        ? `Passeports : ${result.summary}${names ? ` (${names})` : ""}`
        : result.summary
    );
  }

  if (docFiles.length) {
    const result = await ingestDocumentFiles({
      supabase,
      userId: ownerId,
      guide: next,
      files: docFiles,
      strict: false,
    });
    next = result.guide;
    parts.push(
      `Résas : ${result.added} document(s) → ${(next.quote_lines || []).length} ligne(s) devis`
    );
    for (const err of result.errors) {
      parts.push(`⚠ ${err.file}: ${err.message}`);
    }
  }

  if (skipped.length) {
    parts.push(`Ignoré : ${skipped.join(" · ")}`);
  }

  return { guide: next, parts };
}

async function enqueueInbound(
  supabase: SupabaseClient,
  session: WaOpsSession,
  inbound: TwilioInbound
): Promise<{ notes: WaOpsSessionNotes; isFirstOfBatch: boolean }> {
  for (let i = 0; i < 5; i++) {
    const fresh =
      (await findOpenSession(supabase, inbound.fromDigits)) || session;
    const notes = parseSessionNotes(fresh.notes);
    const already = notes.pending.some((p) => p.sid === inbound.messageSid);
    const isFirstOfBatch = notes.pending.length === 0 && !already;
    if (!already) {
      notes.pending.push({
        sid: inbound.messageSid,
        body: inbound.body || "",
        buttonPayload: inbound.buttonPayload,
        media: inbound.media || [],
        at: new Date().toISOString(),
      });
      notes.seenSids = [...notes.seenSids, inbound.messageSid].slice(-80);
      await saveSessionNotes(supabase, fresh, notes, {
        last_inbound_sid: inbound.messageSid,
      });
    }
    const reloaded =
      (await findOpenSession(supabase, inbound.fromDigits)) || fresh;
    const next = parseSessionNotes(reloaded.notes);
    if (next.pending.some((p) => p.sid === inbound.messageSid)) {
      return { notes: next, isFirstOfBatch };
    }
  }
  return {
    notes: parseSessionNotes(session.notes),
    isFirstOfBatch: false,
  };
}

async function drainIfLeader(
  supabase: SupabaseClient,
  fromDigits: string,
  messageSid: string
): Promise<WaOpsPendingInbound[] | null> {
  const session = await findOpenSession(supabase, fromDigits);
  if (!session) return null;
  const notes = parseSessionNotes(session.notes);
  const last = notes.pending[notes.pending.length - 1];
  if (!last || last.sid !== messageSid) return null;
  const batch = [...notes.pending];
  notes.pending = [];
  await saveSessionNotes(supabase, session, notes);
  return batch;
}

async function sendVoyageFromStaff(
  supabase: SupabaseClient,
  ownerId: string,
  session: WaOpsSession,
  guideInput: AgencyMtripGuide
) {
  let guide = guideInput;
  const notes = parseSessionNotes(session.notes);
  const contactPatch = withPendingContact(guide, notes.contact);
  if (contactPatch) {
    guide = await persistGuidePatch(supabase, ownerId, guide.id, contactPatch);
  }
  const { gaps } = blockingGaps(guide);
  if (gaps.length) {
    notes.awaiting = "contact";
    await saveSessionNotes(supabase, session, notes, { status: "collecting" });
    return {
      guide,
      notes,
      ok: false as const,
      message: `Je ne peux pas encore envoyer : il me manque ${gaps.join(" et ")}.`,
    };
  }

  await updateSession(supabase, session.id, { status: "sending" });
  const ack: string[] = [];
  try {
    if (guide.status !== "published") {
      guide = await publishGuideRecord(supabase, ownerId, guide);
      ack.push("mTrip est publié.");
    }
    if (!hasOptInSend(guide)) {
      const opt = await sendOptInToLead(supabase, ownerId, guide);
      guide = opt.guide;
      ack.push(
        `Opt-in envoyé à ${leadPassenger(guide.passengers)?.first_name || "le client"} (${leadPassenger(guide.passengers)?.phone}). Le dossier partira quand iel répondra Oui.`
      );
    } else if (!hasDossierSend(guide)) {
      const dossier = await sendDossierToLead(supabase, ownerId, guide);
      guide = dossier.guide;
      ack.push("Dossier client envoyé.");
    } else {
      ack.push("Dossier déjà envoyé au client.");
    }
    notes.awaiting = null;
    pushHistory(notes, "agent", ack.join(" "));
    await saveSessionNotes(supabase, session, notes, {
      status: hasDossierSend(guide) ? "sent" : "ready",
    });
    return {
      guide,
      notes,
      ok: true as const,
      message: `${ack.join("\n")}\nCRM : ${adminGuideUrl(guide.id)}`,
    };
  } catch (err) {
    notes.awaiting = "send_confirm";
    await saveSessionNotes(supabase, session, notes, { status: "ready" });
    return {
      guide,
      notes,
      ok: false as const,
      message: `Échec envoi : ${err instanceof Error ? err.message : "erreur"}. Le lien /v/ n’a pas été envoyé.\n${adminGuideUrl(guide.id)}`,
    };
  }
}

async function startNewDraft(
  supabase: SupabaseClient,
  ownerId: string,
  inbound: TwilioInbound,
  previous: WaOpsSession | null
) {
  if (previous) {
    await updateSession(supabase, previous.id, { status: "cancelled" });
  }
  const guide = await createDraftGuide(supabase, ownerId);
  const session = await createSession(supabase, {
    fromDigits: inbound.fromDigits,
    ownerUserId: ownerId,
    guideId: guide.id,
    inboundSid: inbound.messageSid,
  });
  return { session, guide };
}

function fallbackReply(input: {
  guide: AgencyMtripGuide;
  ingestParts: string[];
  awaiting: WaOpsAwaiting;
  action: string;
}): { text: string; awaiting: WaOpsAwaiting } {
  const { lead, gaps } = blockingGaps(input.guide);
  const recap = buildVoyageRecap(input.guide);
  const ingest = input.ingestParts.length
    ? `${input.ingestParts.join("\n")}\n\n`
    : "";

  if (input.action === "help") {
    return { text: colleagueHelpCopy(), awaiting: input.awaiting };
  }
  if (input.action === "cancel") {
    return {
      text: "OK, j’arrête. Le brouillon reste dans le CRM.",
      awaiting: null,
    };
  }
  if (input.action === "new_draft") {
    return {
      text: "OK, nouveau dossier. Envoie les pièces et 2 phrases.",
      awaiting: null,
    };
  }
  if (gaps.includes("passeports") && !input.ingestParts.length) {
    return {
      text: `${ingest}Envoie-moi les passeports (et les PDFs si tu les as).`,
      awaiting: input.awaiting,
    };
  }
  if (gaps.includes("WhatsApp client")) {
    return {
      text: `${ingest}${recap}\n\nIl me manque le WhatsApp du client.`,
      awaiting: "contact",
    };
  }
  return {
    text: `${ingest}${recap}\n\nJe peux envoyer à ${lead?.first_name || "le client"} ?`,
    awaiting: "send_confirm",
  };
}

async function handleStaff(supabase: SupabaseClient, inbound: TwilioInbound) {
  const ownerId = getAgencyOwnerUserId();
  const staffText = [inbound.buttonPayload, inbound.body]
    .filter(Boolean)
    .join(" ")
    .trim();
  const helpOnly =
    isHelpText(staffText) && !inbound.media.length && !extractPhone(staffText);

  let session = await findOpenSession(supabase, inbound.fromDigits);
  if (helpOnly && !guideHasData(session ? await loadOwnerGuide(supabase, ownerId, session.guide_id) : null)) {
    await reply(inbound.fromDigits, colleagueHelpCopy());
    return;
  }

  const ensured = await ensureStaffSession(supabase, ownerId, inbound);
  session = ensured.session;
  let guide = ensured.guide;
  let notes = parseSessionNotes(session.notes);

  const queued = await enqueueInbound(supabase, session, inbound);
  notes = queued.notes;
  const batchHasMedia =
    queued.notes.pending.some((p) => (p.media || []).length > 0) ||
    inbound.media.length > 0;

  if (queued.isFirstOfBatch && batchHasMedia) {
    try {
      await reply(inbound.fromDigits, "Reçu, je m'en occupe.");
      notes.ackedBatchAt = new Date().toISOString();
      await saveSessionNotes(supabase, session, notes);
    } catch (err) {
      console.error("[wa-ops] ack", err);
    }
  }

  if (batchHasMedia) {
    const wait = debounceMs();
    if (wait > 0) await sleep(wait);
  }

  const batch = await drainIfLeader(
    supabase,
    inbound.fromDigits,
    inbound.messageSid
  );
  if (!batch) return;

  const merged = mergeBatch(batch);
  session = (await findOpenSession(supabase, inbound.fromDigits)) || session;
  notes = parseSessionNotes(session.notes);
  if (session.guide_id) {
    guide =
      (await loadOwnerGuide(supabase, ownerId, session.guide_id)) || guide;
  }

  pushHistory(notes, "staff", merged.body || `(${merged.media.length} fichier(s))`);

  const hasData = guideHasData(guide);
  let action = decideStaffAction({
    text: merged.body,
    awaiting: notes.awaiting,
    hasOpenDraftWithData: hasData,
  });

  if (
    action === "new_draft" &&
    hasData &&
    notes.awaiting !== "new_or_same" &&
    !merged.media.length &&
    merged.body.length < 80
  ) {
    notes.awaiting = "new_or_same";
    const question = "C’est un autre voyage, ou je continue sur celui-ci ?";
    pushHistory(notes, "agent", question);
    await saveSessionNotes(supabase, session, notes, { status: "collecting" });
    await reply(inbound.fromDigits, question);
    return;
  }

  if (action === "new_draft") {
    const started = await startNewDraft(supabase, ownerId, inbound, session);
    session = started.session;
    guide = started.guide;
    notes = parseSessionNotes(session.notes);
  }

  const ingestParts: string[] = [];
  if (merged.media.length) {
    const ingested = await ingestMediaList(
      supabase,
      ownerId,
      guide,
      merged.media
    );
    guide = ingested.guide;
    ingestParts.push(...ingested.parts);
  }

  const consigne = extractConsigne(merged.body);
  if (
    action === "send" ||
    action === "cancel" ||
    action === "help" ||
    action === "same_trip"
  ) {
    consigne.title = null;
    consigne.destination = null;
    consigne.notes = null;
  }
  if (
    consigne.client_phone ||
    consigne.client_email ||
    consigne.title ||
    consigne.start_date ||
    consigne.end_date ||
    consigne.notes
  ) {
    const patch = applyConsigneToGuide(
      guide,
      action === "new_draft"
        ? {
            ...consigne,
            title: null,
            destination: null,
            notes: null,
          }
        : consigne
    );
    guide = await persistGuidePatch(supabase, ownerId, guide.id, patch);
    if (consigne.client_phone) notes.contact.phone = consigne.client_phone;
    if (consigne.client_email) notes.contact.email = consigne.client_email;
  }

  const contactPatch = withPendingContact(guide, notes.contact);
  if (contactPatch) {
    guide = await persistGuidePatch(supabase, ownerId, guide.id, contactPatch);
  }

  if (action === "cancel") {
    notes.awaiting = null;
    await saveSessionNotes(supabase, session, notes, { status: "cancelled" });
    await reply(
      inbound.fromDigits,
      `OK, j’arrête. Le brouillon reste dans le CRM.\n${adminGuideUrl(guide.id)}`
    );
    return;
  }

  if (action === "same_trip") {
    notes.awaiting = null;
  }

  const turn = await runColleagueTurn({
    staffText: merged.body,
    awaiting: notes.awaiting,
    snapshot: snapshotForLlm(guide),
    history: notes.history,
    ingestParts,
    hasPassengers: Boolean((guide.passengers || []).length),
    hasClientPhone: Boolean(requireLeadContact(guide).lead?.phone),
    hasMedia: merged.media.length > 0,
  });

  if (turn?.consigne) {
    const c = turn.consigne;
    if (
      c.client_phone ||
      c.client_email ||
      c.title ||
      c.start_date ||
      c.end_date ||
      c.notes
    ) {
      const patch = applyConsigneToGuide(guide, c);
      guide = await persistGuidePatch(supabase, ownerId, guide.id, patch);
      if (c.client_phone) notes.contact.phone = c.client_phone;
      if (c.client_email) notes.contact.email = c.client_email;
      const again = withPendingContact(guide, notes.contact);
      if (again) {
        guide = await persistGuidePatch(supabase, ownerId, guide.id, again);
      }
    }
  }

  if (turn?.action && action === "continue") {
    action = turn.action;
  }

  if (action === "send" || turn?.action === "send") {
    const { gaps } = blockingGaps(guide);
    if (
      !gaps.length &&
      (notes.awaiting === "send_confirm" ||
        (notes.awaiting !== "contact" && isSendConfirmText(merged.body)))
    ) {
      const sent = await sendVoyageFromStaff(supabase, ownerId, session, guide);
      await reply(inbound.fromDigits, sent.message);
      return;
    }
    action = "propose_send";
  }

  const { gaps } = blockingGaps(guide);
  if (!gaps.length && (action === "propose_send" || action === "continue" || action === "ask")) {
    notes.awaiting = "send_confirm";
    await updateSession(supabase, session.id, { status: "ready" });
  } else if (gaps.includes("WhatsApp client")) {
    notes.awaiting = "contact";
    await updateSession(supabase, session.id, { status: "collecting" });
  } else {
    notes.awaiting = turn?.awaiting || notes.awaiting;
  }

  const fallback = fallbackReply({
    guide,
    ingestParts,
    awaiting: notes.awaiting,
    action,
  });
  if (action === "help") {
    notes.awaiting = fallback.awaiting;
  } else if (fallback.awaiting) {
    notes.awaiting = fallback.awaiting;
  }

  const text =
    (turn?.reply && action !== "send" ? turn.reply : "") || fallback.text;
  const withCrm =
    text.includes("CRM :") || action === "help"
      ? text
      : `${text}\nCRM : ${adminGuideUrl(guide.id)}`;

  pushHistory(notes, "agent", withCrm);
  await saveSessionNotes(supabase, session, notes, {
    status: notes.awaiting === "send_confirm" ? "ready" : "collecting",
  });
  await reply(inbound.fromDigits, withCrm);
}

async function findPendingClientGuide(
  supabase: SupabaseClient,
  ownerId: string,
  fromDigits: string
): Promise<AgencyMtripGuide | null> {
  const tail = phoneTail(fromDigits);
  if (tail.length < 8) return null;
  const { data, error } = await supabase
    .from("agency_mtrip_guides")
    .select("*")
    .eq("user_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  const rows = (data || []) as AgencyMtripGuide[];
  return (
    rows.find((g) => {
      if (hasDossierSend(g)) return false;
      if (!hasOptInSend(g)) return false;
      const lead = leadPassenger(g.passengers || []);
      return phoneTail(lead?.phone) === tail;
    }) || null
  );
}

async function handleClient(supabase: SupabaseClient, inbound: TwilioInbound) {
  let ownerId: string;
  try {
    ownerId = getAgencyOwnerUserId();
  } catch {
    return;
  }

  const guide = await findPendingClientGuide(
    supabase,
    ownerId,
    inbound.fromDigits
  );
  if (!guide) {
    await reply(inbound.fromDigits, UNKNOWN_ACK);
    return;
  }

  const text = [inbound.buttonPayload, inbound.body].filter(Boolean).join(" ");
  if (isNoText(text) || isNoText(inbound.body)) {
    await reply(
      inbound.fromDigits,
      "D’accord. N’hésite pas si tu changes d’avis — Le Concierge"
    );
    return;
  }

  if (!isYesText(text) && !isYesText(inbound.body)) {
    await reply(
      inbound.fromDigits,
      "Pour recevoir ton dossier voyage, réponds Oui. — Le Concierge"
    );
    return;
  }

  if (guide.status !== "published" || !Object.keys(guide.app_links || {}).length) {
    await reply(
      inbound.fromDigits,
      "Ton dossier n’est pas encore prêt. Ton conseiller revient vers toi."
    );
    return;
  }

  try {
    await sendDossierToLead(supabase, ownerId, guide);
  } catch (err) {
    console.error("[wa-ops] dossier client", err);
    await reply(
      inbound.fromDigits,
      "Je n’ai pas pu envoyer le dossier. Ton conseiller est prévenu."
    );
  }
}

export async function handleTwilioWhatsAppInbound(inbound: TwilioInbound) {
  if (!inbound.fromDigits) return;

  const supabase = createServiceClient();

  if (!getStaffWhatsAppDigits().length) {
    console.warn("[wa-ops] AGENCY_STAFF_WHATSAPP vide — aucun staff reconnu");
  }

  if (inbound.messageSid) {
    const dup = await wasMessageProcessed(
      supabase,
      inbound.fromDigits,
      inbound.messageSid
    );
    if (dup) return;
  }

  if (isStaffSender(inbound.fromDigits)) {
    try {
      await handleStaff(supabase, inbound);
    } catch (err) {
      console.error("[wa-ops] staff inbound", err);
      try {
        await reply(
          inbound.fromDigits,
          "J’ai un souci pour traiter ça. Réessaie dans un instant, ou ouvre le CRM."
        );
      } catch (sendErr) {
        console.error("[wa-ops] staff error reply", sendErr);
      }
    }
    return;
  }

  try {
    await handleClient(supabase, inbound);
  } catch (err) {
    console.error("[wa-ops] client inbound", err);
  }
}
