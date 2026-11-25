import { McpWriteError } from "@/lib/crm/mcp-write";
import { currentMcpAccess } from "@/lib/crm/mcp-auth";
import {
  createSignupInvitation,
  customerForInvitation,
  listReferralBoard,
  listSignupQueue,
  previewSignupInvitation,
  readSignupAdmin,
  reviewSignup,
  SignupError,
} from "@/lib/crm/signup-run";
import { maskEmail, planRefusal, planValidation } from "@/lib/crm/signup";

function fail(error: unknown): never {
  if (error instanceof SignupError || error instanceof McpWriteError) {
    throw new McpWriteError(error.message);
  }
  throw new McpWriteError("L’inscription n’a pas pu être traitée.");
}

function origin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://travelba.fr").replace(/\/$/, "");
}

function staffId() {
  return currentMcpAccess().staff?.id || null;
}

export async function listerInscriptions(statut?: string) {
  try {
    const queue = await listSignupQueue(statut);
    if (!queue.ready) return { pret: false, message: "La migration des inscriptions n’est pas appliquée." };
    return {
      pret: true,
      auto_validation_invites: queue.autoValidate,
      demandes: queue.rows.map((row) => ({
        id: row.id,
        statut: row.status,
        nom: `${row.first_name} ${row.last_name}`.trim(),
        email: maskEmail(row.email),
        invitee: row.invited_by_staff,
        parrain: row.referral_code,
        deposee: row.submitted_at || row.created_at,
      })),
    };
  } catch (error) {
    fail(error);
  }
}

export async function voirInscription(id: string) {
  try {
    const detail = await readSignupAdmin(id);
    if (!detail.ready) return { pret: false, message: "La migration des inscriptions n’est pas appliquée." };
    const row = detail.request;
    return {
      id: row.id,
      statut: row.status,
      prenom: row.first_name,
      nom: row.last_name,
      email: maskEmail(row.email),
      telephone: row.phone,
      naissance: row.birth_date,
      preferences: row.travel_preferences,
      connu_par: row.heard_about,
      invitee_par_admin: row.invited_by_staff,
      parrain: detail.referrer
        ? { id: detail.referrer.id, nom: `${detail.referrer.first_name} ${detail.referrer.last_name}`.trim(), code: detail.referrer.code }
        : row.referral_raw
          ? { code: row.referral_raw, connu: false }
          : null,
      fiches: detail.matches.map((match) => ({
        id: match.id,
        nom: `${match.first_name} ${match.last_name}`.trim(),
        email: maskEmail(match.email || ""),
      })),
      complement: row.complement_message,
      motif_refus: row.refusal_reason,
    };
  } catch (error) {
    fail(error);
  }
}

export async function validerInscription(args: Record<string, unknown>) {
  const id = typeof args.demande_id === "string" ? args.demande_id : "";
  const mode = args.mode === "rattacher" || args.mode === "creer" ? args.mode : null;
  const clientId = typeof args.client_id === "string" ? args.client_id : null;
  if (args.confirmer !== true) {
    try {
      const detail = await readSignupAdmin(id);
      if (!detail.ready) return { apercu: true, message: "La migration des inscriptions n’est pas appliquée." };
      const plan = planValidation({
        status: detail.request.status,
        emailVerified: Boolean(detail.request.email_verified_at),
        matches: detail.matches,
        mode,
        customerId: clientId,
      });
      return {
        apercu: true,
        nom: `${detail.request.first_name} ${detail.request.last_name}`.trim(),
        fiches: detail.matches.length,
        effet: plan.ok ? plan.mode : plan.error,
        envoi: "L’e-mail de validation et l’invitation d’accès partent seulement avec confirmer true.",
      };
    } catch (error) {
      fail(error);
    }
  }
  const staff = staffId();
  if (!staff) throw new McpWriteError("Cette validation est au nom d’un membre de l’agence.");
  try {
    const result = await reviewSignup({
      id,
      action: "valider",
      mode,
      customerId: clientId,
      staffId: staff,
      origin: origin(),
    });
    return {
      ok: true,
      client_id: result.customerId,
      avertissement: result.inviteWarning || null,
    };
  } catch (error) {
    fail(error);
  }
}

export async function refuserInscription(args: Record<string, unknown>) {
  const id = typeof args.demande_id === "string" ? args.demande_id : "";
  const motif = typeof args.motif === "string" ? args.motif : "";
  const envoyer = args.envoyer === true;
  if (args.confirmer !== true) {
    const plan = planRefusal({ status: "en_attente", reason: motif, notify: envoyer });
    return {
      apercu: true,
      envoi: plan.ok && plan.send !== "none" ? "Le demandeur recevra le refus." : "Le demandeur n’est pas prévenu.",
    };
  }
  const staff = staffId();
  if (!staff) throw new McpWriteError("Ce refus est au nom d’un membre de l’agence.");
  try {
    await reviewSignup({
      id,
      action: "refuser",
      reason: motif,
      notify: envoyer,
      staffId: staff,
      origin: origin(),
    });
    return { ok: true, envoye: envoyer };
  } catch (error) {
    fail(error);
  }
}

export async function completerInscription(args: Record<string, unknown>) {
  const id = typeof args.demande_id === "string" ? args.demande_id : "";
  const message = typeof args.message === "string" ? args.message : "";
  if (args.confirmer !== true) {
    return { apercu: true, message: message.trim(), envoi: "Rien ne part sans confirmer true." };
  }
  const staff = staffId();
  if (!staff) throw new McpWriteError("Cette demande est au nom d’un membre de l’agence.");
  try {
    await reviewSignup({
      id,
      action: "completer",
      message,
      staffId: staff,
      origin: origin(),
    });
    return { ok: true, envoye: true };
  } catch (error) {
    fail(error);
  }
}

export async function creerInvitationInscription(args: Record<string, unknown>) {
  const parrainId = typeof args.parrain_id === "string" ? args.parrain_id.trim() : "";
  const clientId = typeof args.client_id === "string" ? args.client_id.trim() : "";
  let firstName = typeof args.prenom === "string" ? args.prenom : "";
  let lastName = typeof args.nom === "string" ? args.nom : "";
  let phone = typeof args.telephone === "string" ? args.telephone : "";
  let email = typeof args.email === "string" ? args.email : "";
  let referrerFirstName = "";
  if (parrainId) {
    const parrain = await customerForInvitation(parrainId);
    if (!parrain) throw new McpWriteError("Membre introuvable.");
    referrerFirstName = parrain.first_name;
  } else if (clientId) {
    const fiche = await customerForInvitation(clientId);
    if (!fiche) throw new McpWriteError("Fiche introuvable.");
    firstName = firstName || fiche.first_name;
    lastName = lastName || fiche.last_name;
    phone = phone || fiche.phone || "";
    email = email || fiche.email || "";
  }
  if (args.confirmer !== true) {
    const preview = await previewSignupInvitation({ firstName: referrerFirstName || firstName, phone, origin: origin() });
    return { ...preview, prenom: firstName, nom: lastName, parrain: referrerFirstName || null };
  }
  const staff = staffId();
  if (!staff) throw new McpWriteError("Cette invitation est au nom d’un membre de l’agence.");
  try {
    return await createSignupInvitation({
      firstName,
      lastName,
      phone,
      email,
      customerId: parrainId ? null : clientId || null,
      staffId: staff,
      origin: origin(),
      send: args.envoyer === true,
      kind: parrainId ? "parrainage" : "admin",
      referrerCustomerId: parrainId || null,
      referrerFirstName,
    });
  } catch (error) {
    fail(error);
  }
}

export async function listerParrainages() {
  try {
    const board = await listReferralBoard();
    if (!board.ready) return { pret: false, message: "La migration des inscriptions n’est pas appliquée." };
    return {
      pret: true,
      parrains: board.groups.map((group) => ({
        client_id: group.id,
        nom: group.name,
        code: group.code,
        en_attente: group.enAttente,
        valides: group.valides,
        lignes: group.lignes.map((row) => ({
          id: row.id,
          statut: row.status,
          filleul: row.filleul,
          recompense: row.rewardNote,
        })),
      })),
    };
  } catch (error) {
    fail(error);
  }
}
