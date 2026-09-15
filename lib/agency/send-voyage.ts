import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTripQuotePdf } from "@/lib/agency/pdf";
import {
  buildPublicQuoteUrl,
  buildShortExpenseUrl,
  buildShortTripUrl,
  ensureQuoteToken,
  ensureShortCode,
} from "@/lib/agency/quote-link";
import { leadPassenger } from "@/lib/agency/upsert-client";
import {
  buildClientTripMessage,
  sendWhatsAppOptIn,
  sendWhatsAppText,
} from "@/lib/agency/whatsapp";
import type {
  AgencyMtripGuide,
  VoyageSendRecord,
} from "@/lib/mtrip/guide-types";
import { MtripError } from "@/lib/mtrip/client";
import { publishGuideToMtrip } from "@/lib/mtrip/publish-guide";

export function requireLeadContact(guide: AgencyMtripGuide) {
  const lead = leadPassenger(guide.passengers || []);
  const gaps: string[] = [];
  if (!lead?.phone?.trim()) gaps.push("téléphone client");
  if (!lead?.email?.trim()) gaps.push("email client");
  return { lead, gaps };
}

export function publicationReviewErrors(guide: AgencyMtripGuide) {
  const errors: string[] = [];
  const passengers = guide.passengers || [];
  const leads = passengers.filter((passenger) => passenger.role === "lead_traveler");
  if (!guide.start_date || !guide.end_date) {
    errors.push("dates de voyage à confirmer");
  }
  if (!passengers.length) {
    errors.push("au moins un voyageur requis");
  }
  if (leads.length !== 1) {
    errors.push("désigner exactement un voyageur principal");
  }
  for (const passenger of passengers) {
    const label =
      [passenger.first_name, passenger.last_name].filter(Boolean).join(" ") ||
      "Voyageur";
    if (!passenger.first_name?.trim() || !passenger.last_name?.trim()) {
      errors.push(`${label} : identité incomplète`);
    }
    if (
      passenger.import_status === "review" ||
      (passenger.import_warnings || []).length > 0
    ) {
      errors.push(`${label} : import passeport à valider`);
    }
  }
  const { lead, gaps } = requireLeadContact(guide);
  if (!lead || gaps.length) errors.push(...gaps);
  if (!(guide.documents || []).length && !(guide.quote_lines || []).length) {
    errors.push("au moins une réservation ou prestation requise");
  }
  return [...new Set(errors)];
}

export async function publishGuideRecord(
  supabase: SupabaseClient,
  userId: string,
  guide: AgencyMtripGuide
): Promise<AgencyMtripGuide> {
  const reviewErrors = publicationReviewErrors(guide);
  if (reviewErrors.length) {
    throw new Error(
      `Revue humaine requise avant publication : ${reviewErrors.join(" ; ")}.`
    );
  }
  const docsWithUrls = [];
  for (const doc of guide.documents || []) {
    const { data: signed } = await supabase.storage
      .from("agency-mtrip")
      .createSignedUrl(doc.storage_path, 60 * 60 * 24 * 30);
    docsWithUrls.push({
      ...doc,
      signed_url: signed?.signedUrl || null,
    });
  }

  try {
    const result = await publishGuideToMtrip({
      ...guide,
      documents: docsWithUrls as AgencyMtripGuide["documents"],
    });

    const { data: updated, error: updateError } = await supabase
      .from("agency_mtrip_guides")
      .update({
        status: "published",
        title: result.title || guide.title,
        mtrip_identifier: result.identifier,
        mtrip_trip_id: result.trip_id,
        payload: {
          trip: result.payload,
          traveler_passwords: result.travelers,
        },
        app_links: result.app_links,
        published_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", guide.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message || "Publication mTrip : sauvegarde impossible");
    }
    return updated as AgencyMtripGuide;
  } catch (err) {
    const message =
      err instanceof MtripError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Publication mTrip impossible";
    await supabase
      .from("agency_mtrip_guides")
      .update({
        status: "error",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", guide.id)
      .eq("user_id", userId);
    throw err instanceof Error ? err : new Error(message);
  }
}

export async function sendOptInToLead(
  supabase: SupabaseClient,
  userId: string,
  guide: AgencyMtripGuide
) {
  const { lead, gaps } = requireLeadContact(guide);
  if (!lead?.phone?.trim()) {
    throw new Error("Téléphone du voyageur principal requis pour WhatsApp");
  }
  if (gaps.includes("email client")) {
    // opt-in only needs phone; email required later for dossier / mTrip
  }

  const sendResult = await sendWhatsAppOptIn({
    toPhone: lead.phone!,
    firstName: lead.first_name || "voyageur",
  });

  const record: VoyageSendRecord = {
    id: crypto.randomUUID(),
    channel:
      sendResult.channel === "twilio_template" ? "twilio" : sendResult.channel,
    kind: "optin",
    to: lead.phone!,
    body_preview: sendResult.body.slice(0, 280),
    deep_link: sendResult.deep_link || null,
    message_id: sendResult.message_id || null,
    sent_at: new Date().toISOString(),
  };

  const sends = [...(guide.sends || []), record];
  const { data: updated, error: updateError } = await supabase
    .from("agency_mtrip_guides")
    .update({
      sends,
      updated_at: new Date().toISOString(),
    })
    .eq("id", guide.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message || "Enregistrement opt-in impossible");
  }

  return {
    guide: updated as AgencyMtripGuide,
    send: sendResult,
    body: sendResult.body,
  };
}

export async function sendDossierToLead(
  supabase: SupabaseClient,
  userId: string,
  guideInput: AgencyMtripGuide,
  opts?: { publish?: boolean }
) {
  let guide = guideInput;
  const { lead } = requireLeadContact(guide);
  if (!lead?.phone?.trim()) {
    throw new Error("Téléphone du voyageur principal requis pour WhatsApp");
  }
  if (!lead.email?.trim()) {
    throw new Error("Email du voyageur principal requis");
  }
  let passwords: Array<{
    identifier?: string;
    password?: string;
    email?: string;
  }> = [];
  let appLinks = guide.app_links || {};

  if (opts?.publish === true && guide.status !== "published") {
    guide = await publishGuideRecord(supabase, userId, guide);
    if (guide.payload && typeof guide.payload === "object") {
      const p = guide.payload as {
        traveler_passwords?: Array<{ identifier?: string; password?: string }>;
      };
      passwords = p.traveler_passwords || [];
    }
    appLinks = guide.app_links || {};
  } else if (guide.payload && typeof guide.payload === "object") {
    const p = guide.payload as {
      traveler_passwords?: Array<{ identifier?: string; password?: string }>;
    };
    passwords = p.traveler_passwords || [];
  }
  if (
    guide.status !== "published" ||
    !guide.mtrip_identifier ||
    !Object.keys(appLinks).length
  ) {
    throw new Error(
      "Publiez et vérifiez le voyage mTrip avant d’envoyer le dossier au client."
    );
  }

  const leadCredentials = passwords.find((t) => t.identifier === lead.id);
  const leadPwd = leadCredentials?.password || null;
  const leadLoginEmail = leadCredentials?.email || lead.email;
  const appLink = appLinks[lead.id] || null;
  if (!leadCredentials?.password || !appLink) {
    throw new Error(
      "Les accès mTrip du voyageur principal ne correspondent pas à la publication. Republiez le voyage."
    );
  }

  let quoteToken = guide.quote_token;
  let shortCode = guide.short_code;
  if (!quoteToken || !shortCode || shortCode.length < 16) {
    quoteToken = quoteToken || ensureQuoteToken();
    shortCode = !shortCode || shortCode.length < 16 ? ensureShortCode() : shortCode;
    await supabase
      .from("agency_mtrip_guides")
      .update({
        quote_token: quoteToken,
        short_code: shortCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", guide.id)
      .eq("user_id", userId);
    guide = { ...guide, quote_token: quoteToken, short_code: shortCode };
  }

  const publicQuoteUrl = buildPublicQuoteUrl(quoteToken);
  const expenseUrl = buildShortExpenseUrl(shortCode) || publicQuoteUrl;
  const tripUrl = appLink
    ? buildShortTripUrl(shortCode) || appLink
    : null;

  const quotePdf = buildTripQuotePdf({
    clientName: `${lead.first_name} ${lead.last_name}`,
    title: guide.title,
    startDate: guide.start_date,
    endDate: guide.end_date,
    lines: (guide.quote_lines || []).map((l) => ({
      title: l.title,
      kind: l.kind,
      confirmation: l.confirmation,
      start_date: l.start_date,
      end_date: l.end_date,
      amount: l.amount,
      currency: l.currency,
    })),
  });

  const quotePath = `${userId}/${guide.id}/devis-${Date.now()}.pdf`;
  await supabase.storage.from("agency-mtrip").upload(quotePath, quotePdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  const { data: quoteSigned } = await supabase.storage
    .from("agency-mtrip")
    .createSignedUrl(quotePath, 60 * 60 * 24 * 14);

  const message = buildClientTripMessage({
    firstName: lead.first_name,
    destination: guide.title,
    startDate: guide.start_date,
    endDate: guide.end_date,
    appLink,
    email: leadLoginEmail,
    password: leadPwd,
    quoteUrl: publicQuoteUrl || quoteSigned?.signedUrl || null,
    expenseUrl,
    tripUrl,
  });

  const sendResult = await sendWhatsAppText({
    toPhone: lead.phone!,
    body: message,
    firstName: lead.first_name,
    destination: guide.title,
    appLink: tripUrl,
    quoteUrl: expenseUrl,
  });

  const record: VoyageSendRecord = {
    id: crypto.randomUUID(),
    channel:
      sendResult.channel === "twilio_template" ? "twilio" : sendResult.channel,
    kind: "dossier",
    to: lead.phone!,
    body_preview: message.slice(0, 280),
    quote_url: expenseUrl || publicQuoteUrl || quoteSigned?.signedUrl || null,
    deep_link: sendResult.deep_link || null,
    message_id: sendResult.message_id || null,
    sent_at: new Date().toISOString(),
  };

  const sends = [...(guide.sends || []), record];
  const { data: updated, error: updateError } = await supabase
    .from("agency_mtrip_guides")
    .update({
      sends,
      quote_token: quoteToken,
      short_code: shortCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", guide.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message || "Enregistrement envoi impossible");
  }

  return {
    guide: updated as AgencyMtripGuide,
    message,
    send: sendResult,
    quote_url: expenseUrl || publicQuoteUrl || quoteSigned?.signedUrl || null,
    expense_url: expenseUrl,
    trip_url: tripUrl,
    app_links: appLinks,
    traveler_passwords: passwords,
  };
}

export function lastSendKind(guide: AgencyMtripGuide) {
  const sends = guide.sends || [];
  return sends[sends.length - 1]?.kind || null;
}

export function hasDossierSend(guide: AgencyMtripGuide) {
  return (guide.sends || []).some((s) => s.kind === "dossier");
}

export function hasOptInSend(guide: AgencyMtripGuide) {
  return (guide.sends || []).some((s) => s.kind === "optin");
}
