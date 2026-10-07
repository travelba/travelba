import type { SupabaseClient } from "@supabase/supabase-js";
import { siteConfig } from "../site";
import { clientLinkToken } from "./client-account";
import { createEntryLink } from "./entry-link";

/** Nouveau lien magique. Jamais un mot de passe, jamais une récupération, jamais un compte de l’agence. */
export async function issueConciergeMagicLink(
  admin: SupabaseClient,
  email: string | null | undefined
) {
  const clean = email?.trim().toLowerCase();
  if (!clean) return null;
  const generated = await clientLinkToken(admin, { type: "magiclink", email: clean });
  if (!generated.ok) return null;
  return createEntryLink(admin, siteConfig.url, {
    tokenHash: generated.hashedToken,
    otpType: "magiclink",
    nextPath: "/mon-compte",
    email: clean,
    channel: "whatsapp",
  });
}
