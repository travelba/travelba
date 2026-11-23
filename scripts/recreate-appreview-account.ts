/**
 * Recrée le compte de revue App Store appreview@travelba.fr (is_test).
 * À lancer après une suppression par l’équipe de revue. N’écrit rien d’autre.
 *
 *   APPREVIEW_PASSWORD='…' APPREVIEW_CONFIRM=1 npx tsx scripts/recreate-appreview-account.ts
 *
 * Le mot de passe n’est pas affiché. Au moins 12 caractères, sans espace.
 * Une fiche déjà supprimée reste anonymisée (dossiers, factures). Celle-ci est neuve.
 */
import { createServiceClient } from "../lib/supabase/admin";
import {
  APPREVIEW_EMAIL,
  APPREVIEW_FIRST_NAME,
  APPREVIEW_LAST_NAME,
  APPREVIEW_PHONE,
  appreviewAccountDecision,
  appreviewPasswordAccepted,
} from "../lib/crm/appreview-account";
import { isDeletedAccountEmail } from "../lib/crm/account-deletion-copy";

async function main() {
  const password = process.env.APPREVIEW_PASSWORD || "";
  if (process.env.APPREVIEW_CONFIRM !== "1" || !appreviewPasswordAccepted(password)) {
    console.error(
      "Relancer avec APPREVIEW_CONFIRM=1 et APPREVIEW_PASSWORD (12 caractères minimum, sans espace). Rien n’a été écrit."
    );
    process.exit(1);
  }

  const admin = createServiceClient();
  const staff = await admin.from("crm_staff").select("id").eq("email", APPREVIEW_EMAIL).maybeSingle();
  if (staff.error) throw new Error(staff.error.message);
  if (staff.data) {
    console.error("Cette adresse est un compte d’agence. Rien n’a été écrit.");
    process.exit(1);
  }

  let existing = await admin
    .from("crm_customers")
    .select("id, auth_user_id, email, account_deleted_at, is_test")
    .eq("email", APPREVIEW_EMAIL)
    .maybeSingle();
  if (existing.error && /account_deleted_at/.test(existing.error.message || "")) {
    existing = await admin
      .from("crm_customers")
      .select("id, auth_user_id, email, is_test")
      .eq("email", APPREVIEW_EMAIL)
      .maybeSingle();
  }
  if (existing.error) throw new Error(existing.error.message);

  const row = existing.data as {
    id: string;
    auth_user_id: string | null;
    email: string | null;
    account_deleted_at?: string | null;
  } | null;

  const linked = await admin.auth.admin.generateLink({ type: "magiclink", email: APPREVIEW_EMAIL });
  const authUserId = linked.error ? null : linked.data.user?.id || null;
  if (authUserId) {
    const staffAuth = await admin.from("crm_staff").select("id").eq("auth_user_id", authUserId).maybeSingle();
    if (staffAuth.data) {
      console.error("Cette adresse est un compte d’agence. Rien n’a été écrit.");
      process.exit(1);
    }
  }

  const decision = appreviewAccountDecision({
    staff: false,
    customer: row
      ? {
          id: row.id,
          authUserId: row.auth_user_id,
          deleted: Boolean(row.account_deleted_at) || isDeletedAccountEmail(row.email),
        }
      : null,
    authUserId,
  });
  if (decision.action === "refuse") {
    console.error("Cette adresse est un compte d’agence. Rien n’a été écrit.");
    process.exit(1);
  }

  const metadata = { crm_role: "client", must_set_password: false };

  async function ensureAuth(current: string | null) {
    if (current) {
      const { error } = await admin.auth.admin.updateUserById(current, {
        password,
        email_confirm: true,
        app_metadata: metadata,
      });
      if (error) throw new Error(error.message);
      return current;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: APPREVIEW_EMAIL,
      password,
      email_confirm: true,
      app_metadata: metadata,
    });
    if (data.user?.id) return data.user.id;
    if (
      error &&
      /already been registered|already registered|email_exists|user already exists/i.test(error.message) &&
      authUserId
    ) {
      const { error: updateError } = await admin.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
        app_metadata: metadata,
      });
      if (updateError) throw new Error(updateError.message);
      return authUserId;
    }
    throw new Error(error?.message || "Compte Auth non créé");
  }

  if (decision.action === "refresh") {
    const userId = await ensureAuth(decision.authUserId);
    const { error } = await admin
      .from("crm_customers")
      .update({
        auth_user_id: userId,
        is_test: true,
        first_name: APPREVIEW_FIRST_NAME,
        last_name: APPREVIEW_LAST_NAME,
      })
      .eq("id", decision.customerId);
    if (error) throw new Error(error.message);
    console.log("Compte de revue mis à jour. Le mot de passe n’est pas affiché.");
    return;
  }

  const userId = await ensureAuth(decision.authUserId);
  const { error } = await admin.from("crm_customers").insert({
    email: APPREVIEW_EMAIL,
    first_name: APPREVIEW_FIRST_NAME,
    last_name: APPREVIEW_LAST_NAME,
    phone: APPREVIEW_PHONE,
    auth_user_id: userId,
    is_test: true,
    language: "fr",
  });
  if (error) throw new Error(error.message);
  console.log("Compte de revue créé. Le mot de passe n’est pas affiché.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Échec";
  console.error(message);
  process.exit(1);
});
