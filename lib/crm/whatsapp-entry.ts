import type { SupabaseClient } from "@supabase/supabase-js";
import { clientLinkToken } from "./client-account";
import { createEntryLink, entryButtonSuffix, entryCodeFromLink } from "./entry-link";

export type WhatsappEntryLink = {
  link: string;
  code: string;
  /** Suffixe du bouton `https://travelba.fr/e/{{2}}`. */
  suffix: string;
  /** Vrai : le lien pose la session (mot de passe déjà choisi). Faux : il mène à /connexion. */
  session: boolean;
};

/**
 * Lien court d’un message WhatsApp vers l’espace client.
 * - mot de passe déjà choisi : lien magique, la session s’ouvre directement ;
 * - pas encore de mot de passe : lien sans jeton, l’aperçu puis /connexion ;
 * - compte de l’agence ou e-mail inconnu : rien.
 */
export async function whatsappEntryLink(
  admin: SupabaseClient,
  origin: string,
  input: { email: string | null | undefined; nextPath: string; showCover?: boolean }
): Promise<WhatsappEntryLink | null> {
  const email = (input.email || "").trim().toLowerCase();
  if (!email) return null;
  const generated = await clientLinkToken(admin, { type: "magiclink", email });
  if (!generated.ok && generated.reason !== "no_password") return null;
  const link = await createEntryLink(admin, origin, {
    tokenHash: generated.ok ? generated.hashedToken : null,
    otpType: "magiclink",
    nextPath: input.nextPath,
    email,
    showCover: input.showCover === true,
    channel: "whatsapp",
  });
  const code = entryCodeFromLink(link);
  if (!code) return null;
  return { link, code, suffix: entryButtonSuffix(code), session: generated.ok };
}
