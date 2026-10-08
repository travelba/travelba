import type { SupabaseClient } from "@supabase/supabase-js";
import { siteConfig } from "../site";
import { whatsappEntryLink } from "./whatsapp-entry";

/**
 * Lien d’accès envoyé en réponse au client. Jamais un mot de passe, jamais une récupération,
 * jamais un compte de l’agence. Sans mot de passe choisi, le lien mène à /connexion.
 */
export async function issueConciergeMagicLink(
  admin: SupabaseClient,
  email: string | null | undefined
) {
  const entry = await whatsappEntryLink(admin, siteConfig.url, { email, nextPath: "/mon-compte" });
  return entry?.link ?? null;
}
