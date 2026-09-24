import { createServiceClient } from "@/lib/supabase/admin";
import { createEntryLink } from "./entry-link";
import { pathAfterPassword } from "./session";
import { connexionMessage, greetingForWhatsapp, sendConnexionWhatsapp } from "./whatsapp";

/** Lien magique : le mot de passe est déjà posé, on n’ouvre pas sa création. */
export const SPACE_ACCESS_OTP = "magiclink";

export function spaceAccessNextPath(phone: string | null | undefined) {
  return pathAfterPassword(phone, "client");
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
}): Promise<SpaceAccessResult> {
  const phone = input.phone?.trim();
  const email = input.email.trim().toLowerCase();
  if (!phone || !email) return "skipped";

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
