import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { createEntryLink } from "./entry-link";
import { DESK_LINK_TTL_MS, confirmedClientUser, linkCustomerAuth } from "./desk-mode";
import { isStaffRole } from "./session";

/** Compte de l’agence (table crm_staff ou rôle Auth) : jamais ouvert en mode desk. */
export async function isStaffAccount(admin: SupabaseClient, authUserId: string) {
  const { data: staffRow, error } = await admin
    .from("crm_staff")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  // Lecture en échec : on refuse plutôt que d’ouvrir un compte peut-être de l’agence.
  if (error || staffRow) return true;
  const { data, error: userError } = await admin.auth.admin.getUserById(authUserId);
  if (userError || !data.user) return true;
  return isStaffRole(data.user);
}

export type DeskLinkResult =
  | { ok: true; url: string; expiresAt: string }
  | { ok: false; status: number; error: string };

/**
 * Lien d’ouverture de l’espace d’un client par un agent connecté.
 * Fiche sans compte : un compte confirmé est créé (aucun message, aucun mot de passe).
 * Jamais pour un compte de l’agence. Le lien vit 10 minutes et ne s’ouvre qu’une fois.
 */
export async function createDeskLink(input: {
  customerId: string;
  staffId: string;
  origin: string;
}): Promise<DeskLinkResult> {
  const admin = createServiceClient();
  const { data: customer, error } = await admin
    .from("crm_customers")
    .select("id, email, auth_user_id")
    .eq("id", input.customerId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Fiche client indisponible. Réessayez." };
  const email = typeof customer?.email === "string" ? customer.email.trim().toLowerCase() : "";
  if (!customer?.id) return { ok: false, status: 404, error: "Client introuvable" };
  if (!email) return { ok: false, status: 409, error: "Ajoutez un e-mail à la fiche pour ouvrir son espace." };

  let authUserId = typeof customer.auth_user_id === "string" ? customer.auth_user_id : null;
  if (authUserId && (await isStaffAccount(admin, authUserId))) {
    return { ok: false, status: 403, error: "Réservé à un client" };
  }
  if (!authUserId) {
    authUserId = await linkCustomerAuth(email, {
      async listByEmail(address) {
        const { data, error: listError } = await admin
          .from("crm_customers")
          .select("id, auth_user_id")
          .eq("email", address)
          .limit(2);
        if (listError || !data) return null;
        return data.map((row) => ({
          id: String(row.id),
          authUserId: typeof row.auth_user_id === "string" ? row.auth_user_id : null,
        }));
      },
      async createConfirmedUser(address) {
        const { data, error: createError } = await admin.auth.admin.createUser(confirmedClientUser(address));
        if (data.user?.id) return { id: data.user.id, alreadyExists: false };
        const message = createError?.message || "";
        const alreadyExists = /already been registered|already registered|email_exists|user already exists/i.test(
          message
        );
        return { id: null, alreadyExists };
      },
      async findExistingUserId(address) {
        const { data, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: address });
        const id = linkError ? null : data.user?.id || null;
        // Un e-mail déjà pris par un agent ne se rattache jamais à une fiche client.
        if (!id || (await isStaffAccount(admin, id))) return null;
        return id;
      },
      async attach(customerId, userId) {
        const { data, error: attachError } = await admin
          .from("crm_customers")
          .update({ auth_user_id: userId })
          .eq("id", customerId)
          .is("auth_user_id", null)
          .select("auth_user_id")
          .maybeSingle();
        if (!attachError && typeof data?.auth_user_id === "string") return data.auth_user_id;
        const { data: fresh } = await admin
          .from("crm_customers")
          .select("auth_user_id")
          .eq("id", customerId)
          .maybeSingle();
        return typeof fresh?.auth_user_id === "string" ? fresh.auth_user_id : null;
      },
    });
    if (!authUserId) {
      return { ok: false, status: 409, error: "Compte client impossible à préparer pour cet e-mail." };
    }
    if (await isStaffAccount(admin, authUserId)) return { ok: false, status: 403, error: "Réservé à un client" };
  }

  const { data: userWrap } = await admin.auth.admin.getUserById(authUserId);
  const authEmail = userWrap.user?.email?.trim().toLowerCase();
  if (!authEmail) return { ok: false, status: 409, error: "Compte client incomplet." };

  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: authEmail });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) return { ok: false, status: 502, error: "Lien indisponible. Réessayez." };

  const expiresAt = new Date(Date.now() + DESK_LINK_TTL_MS).toISOString();
  try {
    const url = await createEntryLink(admin, input.origin, {
      tokenHash,
      otpType: "magiclink",
      nextPath: "/mon-compte",
      email: authEmail,
      channel: "desk",
      ttlMs: DESK_LINK_TTL_MS,
      createdByStaffId: input.staffId,
    });
    return { ok: true, url, expiresAt };
  } catch {
    console.error("[desk] lien non créé");
    return { ok: false, status: 500, error: "Lien indisponible. Réessayez." };
  }
}
