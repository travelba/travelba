import type { SupabaseClient } from "@supabase/supabase-js";
import { siteConfig } from "../site";
import { createEntryLink } from "./entry-link";

/** Nouveau lien magique. Jamais un mot de passe, jamais une récupération. */
export async function issueConciergeMagicLink(
  admin: SupabaseClient,
  email: string | null | undefined
) {
  const clean = email?.trim().toLowerCase();
  if (!clean) return null;
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: clean,
  });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) return null;
  return createEntryLink(admin, siteConfig.url, {
    tokenHash,
    otpType: "magiclink",
    nextPath: "/mon-compte",
  });
}
