import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isStaffRole } from "./session";

/**
 * Un compte de l’agence (ligne `crm_staff` ou rôle Auth `admin` / `agent`) ne reçoit jamais
 * un lien client : invitation, lien magique du Concierge, carte de séjour, pièce, formalité.
 * Le jeton ouvrirait la session de l’agent, et le middleware l’enverrait sur /admin.
 */
export const STAFF_ACCOUNT_BLOCK = "Réservé à un client : cet e-mail est un compte de l’agence.";

type AuthRole = { app_metadata?: Record<string, unknown> | null };

/** Décision pure. Une lecture en échec ou un user introuvable vaut compte de l’agence : on n’ouvre pas. */
export function staffAccountDecision(input: {
  staffRow: unknown;
  readError: unknown;
  user: AuthRole | null | undefined;
}) {
  if (input.readError || input.staffRow) return true;
  if (!input.user) return true;
  return isStaffRole(input.user);
}

/** Compte de l’agence (table `crm_staff` ou rôle Auth). `known` évite une lecture Auth de plus. */
export async function isStaffAccount(admin: SupabaseClient, authUserId: string, known?: AuthRole | null) {
  const { data: staffRow, error } = await admin
    .from("crm_staff")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error || staffRow) return true;
  let user: AuthRole | null = known ?? null;
  if (!user) {
    const { data, error: userError } = await admin.auth.admin.getUserById(authUserId);
    user = userError ? null : data.user ?? null;
  }
  return staffAccountDecision({ staffRow, readError: error, user });
}

export type ClientLinkType = "magiclink" | "invite" | "recovery";

export type ClientLinkToken =
  | { ok: true; user: User; hashedToken: string }
  | { ok: false; reason: "staff" | "error"; message: string };

/**
 * Jeton Supabase pour un lien client. Le compte derrière l’e-mail est vérifié après génération :
 * un compte de l’agence ne reçoit rien, le jeton n’est ni stocké ni envoyé.
 */
export async function clientLinkToken(
  admin: SupabaseClient,
  input: { email: string; type: ClientLinkType; data?: Record<string, unknown> }
): Promise<ClientLinkToken> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, reason: "error", message: "Cette fiche n'a pas d'e-mail." };
  const generated = await admin.auth.admin.generateLink(
    input.type === "invite"
      ? { type: "invite", email, options: input.data ? { data: input.data } : undefined }
      : { type: input.type, email }
  );
  const hashedToken = generated.data?.properties?.hashed_token;
  if (generated.error || !hashedToken) {
    return { ok: false, reason: "error", message: generated.error?.message || "Lien indisponible. Réessayez." };
  }
  const user = generated.data?.user ?? null;
  if (!user?.id) return { ok: false, reason: "error", message: "Compte introuvable" };
  if (await isStaffAccount(admin, user.id, user)) {
    return { ok: false, reason: "staff", message: STAFF_ACCOUNT_BLOCK };
  }
  return { ok: true, user, hashedToken };
}

function isMissingFunction(error: { code?: string | null; message?: string | null }) {
  if (error.code === "42883" || error.code === "PGRST202") return true;
  return /could not find the function|does not exist/i.test(error.message || "");
}

/**
 * Avant de créer une fiche ou de changer son e-mail : l’adresse d’un compte de l’agence est refusée.
 * RPC `crm_is_staff_email` (migration `staff_customer_overlap`). Sans la fonction, le trigger
 * de la même migration reste le filet ; une autre erreur de lecture refuse.
 */
export async function staffEmailBlock(admin: SupabaseClient, email: string): Promise<string | null> {
  const clean = email.trim().toLowerCase();
  if (!clean) return null;
  const { data, error } = await admin.rpc("crm_is_staff_email", { p_email: clean });
  if (error) {
    if (isMissingFunction(error)) {
      console.warn("[client] migration staff_customer_overlap non appliquée");
      return null;
    }
    return STAFF_ACCOUNT_BLOCK;
  }
  return data === true ? STAFF_ACCOUNT_BLOCK : null;
}
