import type { SupabaseClient } from "@supabase/supabase-js";
import { schemaMissesColumn } from "./whatsapp-inbox";
import { sendContentTemplate } from "./whatsapp";
import { sendWhatsappSession, sessionAddress } from "./whatsapp-session";
import {
  SPOUSE_TRAVEL_INTRO_TEMPLATE,
  dossierTravelLabel,
  planSpouseTravelDeliveries,
  selectTravelWhatsappAudience,
  type SpouseDelivery,
  type TravelAudienceCompanion,
  type TravelAudienceHolder,
  type TravelAudienceTraveler,
} from "./travel-whatsapp-audience";

type Admin = SupabaseClient;

type SendResult = { ok: boolean };

export type SpouseTravelSend = (input: { phone: string; body: string; intro: boolean }) => Promise<SendResult>;

function columnMissing(error: { code?: string; message?: string } | null | undefined, column: string) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return schemaMissesColumn(error, column);
}

async function defaultSend(input: { phone: string; body: string; intro: boolean; firstName: string; dossier: string }): Promise<SendResult> {
  if (input.intro) {
    const sid = process.env[SPOUSE_TRAVEL_INTRO_TEMPLATE.env]?.trim() || "";
    if (sid) {
      const templated = await sendContentTemplate({
        phone: input.phone,
        contentSid: sid,
        variables: {
          "1": input.firstName.replace(/[\r\n]+/g, " ").trim() || " ",
          "2": input.dossier.replace(/[\r\n]+/g, " ").trim() || "votre séjour",
        },
      });
      if (templated.ok) return { ok: true };
    }
  }
  const to = sessionAddress(input.phone);
  if (!to) return { ok: false };
  const sent = await sendWhatsappSession({ to, body: input.body });
  return { ok: sent.ok };
}

export async function loadTravelWhatsappAudience(admin: Admin, bookingId: string) {
  const booking = await admin
    .from("crm_bookings")
    .select("id, customer_id, reference, title, visible_to_client")
    .eq("id", bookingId)
    .maybeSingle();
  if (booking.error || !booking.data) return null;
  const row = booking.data as {
    id: string;
    customer_id: string;
    reference: string | null;
    title: string | null;
    visible_to_client: boolean | null;
  };
  const customer = await admin
    .from("crm_customers")
    .select("id, phone, phone_secondary, first_name, whatsapp_opt_in_at, whatsapp_opt_out_at")
    .eq("id", row.customer_id)
    .maybeSingle();
  if (customer.error || !customer.data) return null;
  const holderRow = customer.data as {
    id: string;
    phone: string | null;
    phone_secondary?: string | null;
    first_name: string | null;
    whatsapp_opt_in_at: string | null;
    whatsapp_opt_out_at: string | null;
  };
  const travelerQuery = await admin
    .from("crm_booking_travelers")
    .select("id, companion_id, is_account_holder, whatsapp_travel_updates")
    .eq("booking_id", bookingId);
  if (columnMissing(travelerQuery.error, "whatsapp_travel_updates")) return null;
  if (travelerQuery.error) return null;
  const travelerRows = (travelerQuery.data || []) as {
    id: string;
    companion_id: string | null;
    is_account_holder: boolean;
    whatsapp_travel_updates?: boolean | null;
  }[];
  const companionIds = travelerRows.map((item) => item.companion_id).filter((id): id is string => Boolean(id));
  let companionRows: TravelAudienceCompanion[] = [];
  if (companionIds.length) {
    const companions = await admin
      .from("crm_travel_companions")
      .select("id, customer_id, relationship, phone, first_name, whatsapp_opt_out_at, whatsapp_intro_sent_at")
      .in("id", companionIds);
    if (columnMissing(companions.error, "whatsapp_opt_out_at") || columnMissing(companions.error, "whatsapp_intro_sent_at")) {
      return null;
    }
    if (companions.error) return null;
    companionRows = ((companions.data || []) as {
      id: string;
      customer_id: string;
      relationship: string | null;
      phone: string | null;
      first_name: string | null;
      whatsapp_opt_out_at?: string | null;
      whatsapp_intro_sent_at?: string | null;
    }[]).map((item) => ({
      id: item.id,
      customerId: item.customer_id,
      relationship: item.relationship,
      phone: item.phone,
      firstName: item.first_name,
      optOutAt: item.whatsapp_opt_out_at || null,
      introSentAt: item.whatsapp_intro_sent_at || null,
    }));
  }
  const phones = companionRows.map((item) => item.phone).filter((value): value is string => Boolean(value));
  const other: { customerId: string; phone: string | null }[] = [];
  if (phones.length) {
    const [primary, secondary] = await Promise.all([
      admin.from("crm_customers").select("id, phone").in("phone", phones),
      admin.from("crm_customers").select("id, phone_secondary").in("phone_secondary", phones),
    ]);
    for (const item of (primary.data || []) as { id: string; phone: string | null }[]) {
      other.push({ customerId: item.id, phone: item.phone });
    }
    for (const item of (secondary.data || []) as { id: string; phone_secondary: string | null }[]) {
      other.push({ customerId: item.id, phone: item.phone_secondary });
    }
  }
  const holder: TravelAudienceHolder = {
    id: holderRow.id,
    phone: holderRow.phone,
    phoneSecondary: holderRow.phone_secondary,
    firstName: holderRow.first_name,
    optInAt: holderRow.whatsapp_opt_in_at,
    optOutAt: holderRow.whatsapp_opt_out_at,
  };
  const travelers: TravelAudienceTraveler[] = travelerRows.map((item) => ({
    id: item.id,
    companionId: item.companion_id,
    isAccountHolder: item.is_account_holder,
    whatsappTravelUpdates: item.whatsapp_travel_updates,
  }));
  return {
    booking: row,
    audience: selectTravelWhatsappAudience({ holder, travelers, companions: companionRows, otherCustomerPhones: other }),
  };
}

async function markIntro(admin: Admin, phone: string, companionId: string) {
  const now = new Date().toISOString();
  const byId = await admin.from("crm_travel_companions").update({ whatsapp_intro_sent_at: now }).eq("id", companionId);
  if (byId.error) return false;
  await admin.from("crm_travel_companions").update({ whatsapp_intro_sent_at: now }).eq("phone", phone);
  return true;
}

/** Envoie le texte voyage aux conjoints du dossier. Le titulaire est déjà prévenu par l’appelant. */
export async function copyTravelNoticeToSpouses(
  admin: Admin,
  input: {
    bookingId: string;
    kind: string;
    body: string;
    visible: boolean;
    dossierTitle?: string | null;
    dossierReference?: string | null;
    exceptPhones?: string[];
    send?: SpouseTravelSend;
  }
): Promise<{ sent: string[]; intros: string[] }> {
  const empty = { sent: [] as string[], intros: [] as string[] };
  try {
    if (!input.visible) return empty;
    const loaded = await loadTravelWhatsappAudience(admin, input.bookingId);
    if (!loaded) return empty;
    const dossier = dossierTravelLabel({
      title: input.dossierTitle ?? loaded.booking.title,
      reference: input.dossierReference ?? loaded.booking.reference,
    });
    const plan = planSpouseTravelDeliveries({
      kind: input.kind,
      visible: input.visible,
      body: input.body,
      dossier,
      audience: loaded.audience,
      exceptPhones: input.exceptPhones,
    });
    return await runSpouseDeliveries(admin, plan, dossier, input.send);
  } catch {
    return empty;
  }
}

export async function runSpouseDeliveries(
  admin: Admin,
  plan: SpouseDelivery[],
  dossier: string,
  send?: SpouseTravelSend
): Promise<{ sent: string[]; intros: string[] }> {
  const sent: string[] = [];
  const intros: string[] = [];
  for (const row of plan) {
    if (row.intro) {
      const introSend = send
        ? await send({ phone: row.phone, body: row.intro, intro: true })
        : await defaultSend({ phone: row.phone, body: row.intro, intro: true, firstName: row.firstName, dossier });
      if (!introSend.ok) continue;
      const marked = await markIntro(admin, row.phone, row.companionId);
      if (marked) intros.push(row.phone);
    }
    const bodySend = send
      ? await send({ phone: row.phone, body: row.body, intro: false })
      : await defaultSend({ phone: row.phone, body: row.body, intro: false, firstName: row.firstName, dossier });
    if (bodySend.ok) sent.push(row.phone);
  }
  return { sent, intros };
}

/** Premier message explicatif, une fois par numéro, avant un envoi déjà adressé à ce conjoint. */
export async function ensureSpouseTravelIntro(
  admin: Admin,
  input: { bookingId: string; phone: string; dossierTitle?: string | null; dossierReference?: string | null; send?: SpouseTravelSend }
) {
  try {
    const loaded = await loadTravelWhatsappAudience(admin, input.bookingId);
    if (!loaded) return false;
    const match = loaded.audience.recipients.find((row) => row.role === "spouse" && row.phone === input.phone);
    if (!match?.companionId || match.introSent) return false;
    const dossier = dossierTravelLabel({
      title: input.dossierTitle ?? loaded.booking.title,
      reference: input.dossierReference ?? loaded.booking.reference,
    });
    const intro = planSpouseTravelDeliveries({
      kind: "touchpoint",
      visible: true,
      body: "Informations de voyage.",
      dossier,
      audience: { recipients: [match] },
    })[0];
    if (!intro?.intro) return false;
    const result = input.send
      ? await input.send({ phone: match.phone, body: intro.intro, intro: true })
      : await defaultSend({ phone: match.phone, body: intro.intro, intro: true, firstName: match.firstName, dossier });
    if (!result.ok) return false;
    return markIntro(admin, match.phone, match.companionId);
  } catch {
    return false;
  }
}
