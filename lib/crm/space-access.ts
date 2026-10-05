import { createServiceClient } from "@/lib/supabase/admin";
import { createEntryLink } from "./entry-link";
import { pathAfterPassword } from "./session";
import { connexionMessage, greetingForWhatsapp, sendConnexionWhatsapp } from "./whatsapp";

/** Lien magique : le mot de passe est déjà posé, on n’ouvre pas sa création. */
export const SPACE_ACCESS_OTP = "magiclink";

/** L’invitation envoie déjà le même texte. On ne le répète pas le jour même. */
export const CONNEXION_REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function connexionRepeatBlocked(sentAt: string | null | undefined, now = Date.now()) {
  if (!sentAt) return false;
  const then = Date.parse(sentAt);
  if (!Number.isFinite(then)) return false;
  return now - then < CONNEXION_REPEAT_WINDOW_MS;
}

export function spaceAccessNextPath(phone: string | null | undefined) {
  return pathAfterPassword(phone, "client");
}

/** Vrai si un « Enchanté » est déjà parti dans la fenêtre. Erreur de lecture : on n’envoie pas. */
export async function connexionAlreadySent(customerId: string) {
  try {
    const admin = createServiceClient();
    const since = new Date(Date.now() - CONNEXION_REPEAT_WINDOW_MS).toISOString();
    const { data, error } = await admin
      .from("crm_whatsapp_messages")
      .select("created_at")
      .eq("customer_id", customerId)
      .eq("direction", "outbound")
      .eq("template_key", "connexion")
      .eq("status", "sent")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return true;
    return (data ?? []).some((row) => connexionRepeatBlocked(row.created_at));
  } catch {
    return true;
  }
}

/**
 * Après l’enregistrement du mot de passe client : même modèle Le Concierge,
 * vers l’espace, pas vers la page mot de passe. N’échoue pas l’enregistrement.
 */
export type SpaceAccessResult = "sent" | "failed" | "skipped";

export async function sendSpaceAccessWhatsapp(input: {
  customerId: string;
  email: string;
  phone: string | null | undefined;
  firstName: string | null | undefined;
  origin: string;
  /** Renvoi demandé sur la fiche : le message part même s’il vient d’être envoyé. */
  repeat?: boolean;
}): Promise<SpaceAccessResult> {
  const phone = input.phone?.trim();
  const email = input.email.trim().toLowerCase();
  if (!phone || !email) return "skipped";
  if (!input.repeat && (await connexionAlreadySent(input.customerId))) return "skipped";

  const admin = createServiceClient();
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) return "failed";

  const link = await createEntryLink(admin, input.origin, {
    tokenHash,
    otpType: SPACE_ACCESS_OTP,
    nextPath: spaceAccessNextPath(phone),
    email,
    channel: "whatsapp",
  });
  const whatsapp = await sendConnexionWhatsapp({
    phone,
    firstName: input.firstName,
    link,
  });
  if (whatsapp.ok || whatsapp.reason !== "no_phone") {
    await admin.from("crm_whatsapp_messages").insert({
      customer_id: input.customerId,
      direction: "outbound",
      template_key: "connexion",
      body: connexionMessage(greetingForWhatsapp(input.firstName) || ""),
      twilio_sid: whatsapp.ok ? whatsapp.sid : null,
      status: whatsapp.ok ? "sent" : "failed",
      error: whatsapp.ok ? null : whatsapp.detail || whatsapp.reason,
    });
  }
  return whatsapp.ok ? "sent" : whatsapp.reason === "no_phone" ? "skipped" : "failed";
}
