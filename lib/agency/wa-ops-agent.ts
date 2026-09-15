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
} from "@/lib/agency/twilio-inbound";
import {
  adminGuideUrl,
  getAgencyOwnerUserId,
  getStaffWhatsAppDigits,
  isStaffSender,
} from "@/lib/agency/wa-ops-config";
import {
  isNoText,
  isYesText,
  parseOpsMessage,
  type ConsigneFields,
} from "@/lib/agency/wa-ops-intent";
import {
  createSession,
  findOpenSession,
  updateSession,
  wasMessageProcessed,
  type WaOpsSession,
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

const HELP = [
  "Je crée le voyage CRM à ta place.",
  "Envoie les passeports, les PDFs / captures de résa, puis la consigne (destination, dates, WhatsApp + email client).",
  "Commandes : nouveau · c'est tout · envoyer · annuler · lien",
].join("\n");

const UNKNOWN_ACK =
  "Bonjour, je suis Le Concierge de Travel Business Agency. Pour un dossier voyage, contactez votre conseiller.";

function phoneTail(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "").slice(-9);
}

async function reply(toDigits: string, body: string) {
  await sendWhatsAppReply({ toPhone: toDigits, body });
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

type PendingContact = { phone?: string; email?: string };

function parseSessionContact(notes: string | null): PendingContact {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes) as PendingContact;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore
  }
  return {};
}

function withPendingContact(
  guide: AgencyMtripGuide,
  pending: PendingContact
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
  const { lead, gaps } = requireLeadContact(guide);
  const paxLines = pax.length
    ? pax
        .map((p) => {
          const { complete, label } = passengerCompleteness(p);
          return `• ${p.first_name} ${p.last_name} (${complete ? "MRZ OK" : label})`;
        })
        .join("\n")
    : "• aucun passager";
  const devis = lines.length
    ? lines
        .slice(0, 8)
        .map((l) => `• ${l.title}`)
        .join("\n")
    : "• aucune résa";
  const missing = [
    ...gaps,
    pax.length ? null : "passeports",
    lines.length ? null : "confirmations",
  ].filter(Boolean);

  return [
    `Voyage : ${guide.title}`,
    guide.start_date || guide.end_date
      ? `Dates : ${guide.start_date || "?"} → ${guide.end_date || "?"}`
      : "Dates : à préciser",
    `Passagers (${pax.length}) :`,
    paxLines,
    `Résas (${lines.length}) :`,
    devis,
    `Contact client : ${lead?.phone || "manquant"} / ${lead?.email || "manquant"}`,
    missing.length ? `À compléter : ${missing.join(", ")}` : "Prêt à envoyer.",
    `CRM : ${adminGuideUrl(guide.id)}`,
    "",
    "Réponds « Envoyer » pour publier mTrip et envoyer l’opt-in au client.",
  ].join("\n");
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

async function ingestInboundMedia(
  supabase: SupabaseClient,
  ownerId: string,
  guide: AgencyMtripGuide,
  inbound: TwilioInbound
) {
  const passportFiles: IngestFile[] = [];
  const parsedByName = new Map<
    string,
    Awaited<ReturnType<typeof parsePassportFile>>
  >();
  const docFiles: IngestFile[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < inbound.media.length; i++) {
    const item = inbound.media[i];
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

async function handleStaff(supabase: SupabaseClient, inbound: TwilioInbound) {
  const ownerId = getAgencyOwnerUserId();
  const parsed = await parseOpsMessage({
    body: inbound.body,
    buttonPayload: inbound.buttonPayload,
  });

  if (parsed.intent === "aide" && !inbound.media.length) {
    await reply(inbound.fromDigits, HELP);
    return;
  }

  if (parsed.intent === "nouveau") {
    const open = await findOpenSession(supabase, inbound.fromDigits);
    if (open) await updateSession(supabase, open.id, { status: "cancelled" });
    const guide = await createDraftGuide(supabase, ownerId);
    await createSession(supabase, {
      fromDigits: inbound.fromDigits,
      ownerUserId: ownerId,
      guideId: guide.id,
      inboundSid: inbound.messageSid,
    });
    await reply(
      inbound.fromDigits,
      `Nouveau voyage créé.\n${HELP}\n\nCRM : ${adminGuideUrl(guide.id)}`
    );
    return;
  }

  if (parsed.intent === "annuler") {
    const open = await findOpenSession(supabase, inbound.fromDigits);
    if (open) await updateSession(supabase, open.id, { status: "cancelled" });
    await reply(inbound.fromDigits, "Voyage WhatsApp annulé. Le brouillon CRM est conservé. Envoie « nouveau » pour recommencer.");
    return;
  }

  const { session, guide: initial } = await ensureStaffSession(
    supabase,
    ownerId,
    inbound
  );
  let guide = initial;

  if (parsed.intent === "lien") {
    await reply(inbound.fromDigits, `CRM : ${adminGuideUrl(guide.id)}`);
    return;
  }

  const ack: string[] = [];

  if (inbound.media.length) {
    const ingested = await ingestInboundMedia(
      supabase,
      ownerId,
      guide,
      inbound
    );
    guide = ingested.guide;
    ack.push(...ingested.parts);
    const pending = parseSessionContact(session.notes);
    const contactPatch = withPendingContact(guide, pending);
    if (contactPatch) {
      guide = await persistGuidePatch(supabase, ownerId, guide.id, contactPatch);
    }
    if (session.status === "ready") {
      await updateSession(supabase, session.id, { status: "collecting" });
    }
  }

  if (parsed.intent === "consigne" && inbound.body.trim()) {
    const patch = applyConsigneToGuide(guide, parsed.consigne);
    guide = await persistGuidePatch(supabase, ownerId, guide.id, patch);
    if (
      !(guide.passengers || []).length &&
      (parsed.consigne.client_phone || parsed.consigne.client_email)
    ) {
      const prev = parseSessionContact(session.notes);
      await updateSession(supabase, session.id, {
        notes: JSON.stringify({
          phone: parsed.consigne.client_phone || prev.phone,
          email: parsed.consigne.client_email || prev.email,
        }),
      });
    }
    const bits = [];
    if (parsed.consigne.title) bits.push(`titre « ${guide.title} »`);
    if (parsed.consigne.start_date || parsed.consigne.end_date)
      bits.push(`dates ${guide.start_date || "?"} → ${guide.end_date || "?"}`);
    if (parsed.consigne.client_phone) bits.push(`WA ${parsed.consigne.client_phone}`);
    if (parsed.consigne.client_email) bits.push(parsed.consigne.client_email);
    ack.push(
      bits.length ? `Consigne enregistrée (${bits.join(", ")}).` : "Consigne notée."
    );
  }

  if (parsed.intent === "recap") {
    await updateSession(supabase, session.id, { status: "ready" });
    await reply(inbound.fromDigits, buildVoyageRecap(guide));
    return;
  }

  const wantSend =
    parsed.intent === "envoyer" ||
    (parsed.intent === "oui" && session.status === "ready");

  if (parsed.intent === "non" && session.status === "ready") {
    await updateSession(supabase, session.id, { status: "collecting" });
    await reply(
      inbound.fromDigits,
      "OK, j’attends encore des docs ou une consigne. « c'est tout » pour le récap."
    );
    return;
  }

  if (wantSend) {
    const pending = parseSessionContact(session.notes);
    const contactPatch = withPendingContact(guide, pending);
    if (contactPatch) {
      guide = await persistGuidePatch(supabase, ownerId, guide.id, contactPatch);
    }
    const { gaps } = requireLeadContact(guide);
    if (!guide.passengers?.length) {
      await reply(
        inbound.fromDigits,
        "Il manque les passeports. Envoie-les puis « Envoyer »."
      );
      return;
    }
    if (gaps.length) {
      await updateSession(supabase, session.id, { status: "ready" });
      await reply(
        inbound.fromDigits,
        `Impossible d’envoyer : ${gaps.join(" et ")} manquant(s).\nIndique le WhatsApp et l’email du client, puis « Envoyer ».\n\n${buildVoyageRecap(guide)}`
      );
      return;
    }

    await updateSession(supabase, session.id, { status: "sending" });
    try {
      if (guide.status !== "published") {
        guide = await publishGuideRecord(supabase, ownerId, guide);
        ack.push("mTrip publié.");
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
        ack.push("Dossier client envoyé (/d/ + /v/).");
        await updateSession(supabase, session.id, { status: "sent" });
        await reply(inbound.fromDigits, ack.join("\n"));
        return;
      } else {
        ack.push("Dossier déjà envoyé au client.");
      }
      await updateSession(supabase, session.id, {
        status: hasDossierSend(guide) ? "sent" : "ready",
      });
      await reply(
        inbound.fromDigits,
        `${ack.join("\n")}\n\nCRM : ${adminGuideUrl(guide.id)}`
      );
    } catch (err) {
      await updateSession(supabase, session.id, { status: "ready" });
      await reply(
        inbound.fromDigits,
        `Échec envoi : ${err instanceof Error ? err.message : "erreur"}. Le lien /v/ n’a pas été envoyé.\n${adminGuideUrl(guide.id)}`
      );
    }
    return;
  }

  if (!ack.length && !inbound.media.length && parsed.intent === "ignore") {
    await reply(inbound.fromDigits, HELP);
    return;
  }

  if (!ack.length && parsed.intent === "consigne" && !inbound.body.trim()) {
    await reply(inbound.fromDigits, HELP);
    return;
  }

  const created = (guide.passengers || []).length && ack.some((a) => /Passeports/i.test(a));
  const prefix =
    created && (guide.passengers || []).length
      ? `Voyage créé — ${(guide.passengers || []).length} passager(s). `
      : "";
  await reply(
    inbound.fromDigits,
    [
      prefix + (ack.join("\n") || "OK."),
      "Envoie les résas ou la consigne (destination, dates, WhatsApp client). Écris « c'est tout » quand tu as fini.",
      `CRM : ${adminGuideUrl(guide.id)}`,
    ]
      .filter(Boolean)
      .join("\n")
  );
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
    await handleStaff(supabase, inbound);
    return;
  }

  try {
    await handleClient(supabase, inbound);
  } catch (err) {
    console.error("[wa-ops] client inbound", err);
  }
}
