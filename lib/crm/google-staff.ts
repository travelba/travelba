/**
 * Connexion Google de l’équipe. Le fournisseur limite déjà au domaine (`hd=travelba.fr`) ;
 * le serveur revérifie que l’adresse finit par @travelba.fr et correspond à un collègue invité
 * dans l’écran Équipe (ligne `crm_staff`, accès ouvert). Sinon la session est fermée et, si Google
 * vient de créer un compte Auth orphelin (ni collègue ni client), il est supprimé.
 * Le mot de passe et le code e-mail restent possibles : ce n’est qu’une entrée de plus.
 */

import type { User } from "@supabase/supabase-js";
import { googleStaffEmailAllowed } from "@/lib/crm/agency-access";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { createServiceClient } from "@/lib/supabase/admin";

export type GoogleRejectReason = "domaine" | "inconnu" | "desactive";

export type GoogleStaffDecision = { ok: true; staffId: string } | { ok: false; reason: GoogleRejectReason };

/** Le compte vient d’un identifiant Google (seul ou lié à un compte déjà invité). */
export function isGoogleUser(user: Pick<User, "app_metadata" | "identities">) {
  if (user.app_metadata?.provider === "google") return true;
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes("google")) return true;
  return Boolean(user.identities?.some((identity) => identity.provider === "google"));
}

/** Compte créé il y a moins de deux minutes : Google vient de l’inscrire, personne ne l’avait invité. */
export function isFreshAuthUser(user: Pick<User, "created_at">, now = Date.now(), windowMs = 2 * 60 * 1000) {
  const created = Date.parse(user.created_at || "");
  return Number.isFinite(created) && now - created < windowMs;
}

type StaffRow = { id: string; auth_user_id: string; email?: string | null; active?: boolean | null };

async function loadStaffRows(admin: ReturnType<typeof createServiceClient>): Promise<StaffRow[]> {
  const first = await admin.from("crm_staff").select("id, auth_user_id, email, active");
  if (!first.error) return (first.data || []) as StaffRow[];
  const second = await admin.from("crm_staff").select("id, auth_user_id");
  return (second.data || []) as StaffRow[];
}

export async function verifyGoogleStaffLogin(user: User): Promise<GoogleStaffDecision> {
  const admin = createServiceClient({ allowPreview: true });
  const rows = await loadStaffRows(admin);
  const byUser = rows.find((row) => row.auth_user_id === user.id);
  if (byUser) {
    // Compte déjà invité, Google y est rattaché : le domaine reste exigé.
    const domain = googleStaffEmailAllowed(user.email, [user.email || ""]);
    if (!domain.ok) return { ok: false, reason: "domaine" };
    if (byUser.active === false) return { ok: false, reason: "desactive" };
    return { ok: true, staffId: byUser.id };
  }
  // Compte Auth nouveau : l’adresse doit être celle d’un collègue invité, sinon on refuse.
  const decision = googleStaffEmailAllowed(
    user.email,
    rows.map((row) => row.email || "")
  );
  if (!decision.ok) return decision;
  const byEmail = rows.find((row) => (row.email || "").trim().toLowerCase() === decision.email);
  if (!byEmail) return { ok: false, reason: "inconnu" };
  if (byEmail.active === false) return { ok: false, reason: "desactive" };
  // Le collègue existe sous un autre compte Auth (invité, mot de passe jamais posé). On ne fusionne pas
  // les comptes à l’aveugle : il se connecte d’abord par le lien d’invitation ou le mot de passe.
  return { ok: false, reason: "inconnu" };
}

/** Ferme la session et efface un compte Auth que Google vient de créer sans invitation. */
export async function rejectGoogleStaffLogin(user: User, reason: GoogleRejectReason) {
  await recordAgencyJournal({
    staffId: null,
    action: "login_failed",
    entityType: "session",
    summary: `Connexion Google refusée (${reason}).`,
    diff: { email: user.email ? user.email.replace(/^(.).*(@.*)$/, "$1•••$2") : null },
    path: "/auth/callback",
  });
  if (!isFreshAuthUser(user) || !isGoogleUser(user)) return;
  try {
    const admin = createServiceClient({ allowPreview: true });
    const [{ data: staff }, { data: customer }] = await Promise.all([
      admin.from("crm_staff").select("id").eq("auth_user_id", user.id).maybeSingle(),
      admin.from("crm_customers").select("id").eq("auth_user_id", user.id).maybeSingle(),
    ]);
    if (staff || customer) return;
    await admin.auth.admin.deleteUser(user.id);
  } catch {
    /* Le compte orphelin reste sans accès : ni collègue, ni client. */
  }
}
