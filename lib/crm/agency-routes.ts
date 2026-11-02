/**
 * Classe chaque route d’agence : droit exigé, action de journal, entité.
 * Le test de couverture parcourt `app/api/admin` et refuse une mutation non classée.
 */

import type { Permission, StaffRole } from "./agency-access";
import { auditSummary, type JournalAction, type JournalEntity } from "./agency-journal";

export type AgencyRouteClass = {
  /** public : mot de passe oublié, sans session. partner : Little Emperors, partenaire compris. */
  audience: "public" | "partner" | "staff";
  permission: Permission | null;
  action: JournalAction;
  entity: JournalEntity;
  /** Écrit une ligne. Les lectures ordinaires ne remplissent pas le journal. */
  journal: boolean;
  sensitive: "passport_reveal" | "card_reveal" | "export" | "payment" | "failed_login" | null;
  summary: string;
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function isMutation(method: string) {
  return method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE";
}

function actionFor(method: string, path: string): JournalAction {
  if (method === "DELETE" && new RegExp(`^/api/admin/bookings/${UUID}$`, "i").test(path)) return "delete";
  if (method === "DELETE") return "delete";
  if (method === "POST") return "create";
  if (method === "PATCH" || method === "PUT") return "update";
  return "view";
}

function entityFor(path: string): JournalEntity {
  if (/\/equipe|\/securite/.test(path)) return "user";
  if (/\/journal/.test(path)) return "setting";
  if (/\/(transactions|revolut|stripe|comptabilite|mb3m)/.test(path)) return "finance";
  if (/\/pliant|\/cards/.test(path)) return "card";
  if (/\/(whatsapp|partage|invite|releve|mails)/.test(path)) return "message";
  if (/\/travel-documents|\/passeport/.test(path)) return "document";
  if (/\/clients\//.test(path)) return "client";
  if (/\/(concierge|outils|droits)/.test(path)) return "setting";
  if (/\/bookings/.test(path)) return "dossier";
  return "dossier";
}

function classify(input: {
  audience?: AgencyRouteClass["audience"];
  permission: Permission | null;
  action: JournalAction;
  entity: JournalEntity;
  journal: boolean;
  sensitive?: AgencyRouteClass["sensitive"];
  /** Phrase lisible dans l’Historique. Sinon « Action · Entité ». */
  summary?: string;
}): AgencyRouteClass {
  return {
    audience: input.audience ?? "staff",
    permission: input.permission,
    action: input.action,
    entity: input.entity,
    journal: input.journal,
    sensitive: input.sensitive ?? null,
    summary: input.summary || auditSummary(input.action, input.entity),
  };
}

/** Phrase du journal pour une route de dossier connue. Null : résumé générique. */
export function dossierRouteSummary(method: string, path: string): string | null {
  const upper = method.toUpperCase();
  const tail = path.replace(new RegExp(`^/api/admin/bookings/${UUID}`, "i"), "");
  if (tail === "" && upper === "PATCH") return "Dossier modifié (en-tête, visibilité ou réglages).";
  if (tail === "" && upper === "DELETE") return "Dossier archivé.";
  if (tail === "/items" || tail.startsWith("/items/")) {
    if (upper === "DELETE") return "Étape retirée du carnet.";
    if (upper === "POST") return "Étape ajoutée au carnet.";
    return "Étape du carnet modifiée.";
  }
  if (tail.startsWith("/travelers")) return upper === "DELETE" ? "Voyageur retiré." : "Voyageurs du dossier modifiés.";
  if (tail.startsWith("/documents")) return upper === "DELETE" ? "Pièce retirée du dossier." : "Pièce déposée sur le dossier.";
  if (tail.startsWith("/cartes-embarquement")) return "Cartes d’embarquement.";
  if (tail.startsWith("/pliant")) return "Carte Pliant du dossier.";
  if (tail.startsWith("/cards")) return "Carte Pliant du dossier : émission, blocage ou ouverture.";
  if (tail.startsWith("/extras")) return "Options du séjour modifiées (chauffeur, accueil, enregistrement, visa).";
  if (tail.startsWith("/enregistrement")) return "Enregistrement en ligne mis à jour.";
  if (tail.startsWith("/hotel-arrival") || tail.startsWith("/hotel-desk")) return "Courrier ou arrivée hôtel.";
  if (tail.startsWith("/partage")) return "Carnet partagé.";
  if (tail.startsWith("/mb3m")) return "Facture MB3M.";
  if (tail.startsWith("/billing-company")) return "Société facturée modifiée.";
  if (tail.startsWith("/cover")) return "Couverture du séjour modifiée.";
  if (tail.startsWith("/duplicate")) return "Dossier dupliqué.";
  if (tail.startsWith("/restore")) return "Dossier restauré.";
  if (tail.startsWith("/calendrier")) return "Calendrier envoyé.";
  if (/^\/(visa|visas|esta|eta-il|uk-eta)/.test(tail)) return "Formalité du dossier.";
  if (tail.startsWith("/restaurants")) return "Restaurants du séjour.";
  if (tail.startsWith("/chauffeur-quote")) return "Devis chauffeur.";
  if (tail.startsWith("/vu")) return "Dossier marqué vu.";
  return null;
}

/** Null hors de l’agence. Toute route `/api/admin` reçoit une classe. */
export function classifyAgencyRoute(method: string, rawPath: string): AgencyRouteClass | null {
  const path = rawPath.split("?")[0].replace(/\/$/, "") || "/";
  const upper = method.toUpperCase();
  if (path === "/api/auth/staff-failure") {
    return classify({
      audience: "public",
      permission: null,
      action: "login_failed",
      entity: "session",
      journal: true,
      sensitive: "failed_login",
    });
  }
  if (path === "/api/auth/known-password") {
    return classify({
      audience: "public",
      permission: null,
      action: "login",
      entity: "session",
      journal: true,
    });
  }
  if (!path.startsWith("/api/admin")) return null;
  const mutation = isMutation(upper);
  const entity = entityFor(path);
  const action = actionFor(upper, path);

  if (path === "/api/admin/password") {
    return classify({ audience: "public", permission: null, action: "login", entity: "session", journal: false });
  }

  if (path.startsWith("/api/admin/little-emperors")) {
    return classify({
      audience: "partner",
      permission: mutation ? "edit_dossiers" : null,
      action,
      entity: "dossier",
      journal: mutation,
    });
  }

  if (path.startsWith("/api/admin/equipe")) {
    // PATCH d’un collègue, fermeture de sessions, départ et grille : la route écrit sa propre ligne, plus précise.
    const selfJournaled =
      (new RegExp(`^/api/admin/equipe/${UUID}$`, "i").test(path) && upper === "PATCH") ||
      path.endsWith("/sessions") ||
      path.endsWith("/depart") ||
      path.endsWith("/droits");
    return classify({
      permission: path.endsWith("/droits") ? "change_settings" : "manage_users",
      action: path.endsWith("/sessions") && upper === "DELETE" ? "logout" : action,
      entity: path.endsWith("/droits") ? "setting" : "user",
      journal: mutation && !selfJournaled,
      summary: upper === "POST" && new RegExp(`^/api/admin/equipe/${UUID}$`, "i").test(path) ? "Lien d’accès renvoyé." : upper === "POST" ? "Collègue ajouté." : upper === "DELETE" ? "Collègue retiré." : undefined,
    });
  }

  if (path.startsWith("/api/admin/journal")) {
    const csv = rawPath.includes("format=csv");
    const params = new URLSearchParams(rawPath.split("?")[1] || "");
    const scoped = Boolean(params.get("entity") && params.get("id"));
    if (!csv && !mutation && scoped) {
      return classify({ permission: null, action: "view", entity: "dossier", journal: false });
    }
    return classify({
      permission: csv ? "export_data" : "view_journal",
      action: csv ? "export" : mutation ? action : "view",
      entity: "setting",
      journal: csv || mutation,
      sensitive: csv ? "export" : null,
    });
  }

  if (/\/travel-documents\/scan$/.test(path)) {
    // La route écrit elle-même la ligne « Lecture d’une pièce » et l’alerte.
    return classify({
      permission: "passport_reveal",
      action: "reveal",
      entity: "document",
      journal: false,
      sensitive: "passport_reveal",
    });
  }

  if (path === "/api/admin/pliant/cards" && mutation) {
    return classify({
      permission: "create_pliant_card",
      action: "create",
      entity: "card",
      journal: true,
      summary: "Carte Pliant émise ou plafond modifié.",
    });
  }

  if (/\/pliant/.test(path)) {
    return classify({
      permission: mutation ? "pay_supplier" : "view_finances",
      action,
      entity: "card",
      journal: mutation,
      sensitive: mutation ? "payment" : null,
    });
  }

  if (/\/revolut\/[^/]+$/.test(path) && mutation) {
    // La route journalise le rapprochement avec le montant : pas de seconde ligne.
    return classify({
      permission: "edit_finances",
      action: "update",
      entity: "finance",
      journal: false,
      sensitive: "payment",
    });
  }

  if (/\/(transactions|revolut|stripe|comptabilite|mb3m)/.test(path)) {
    return classify({
      permission: mutation ? "edit_finances" : "view_finances",
      action,
      entity: "finance",
      journal: mutation,
    });
  }

  if (/\/(whatsapp|partage|invite|releve)/.test(path) && mutation) {
    return classify({ permission: "message_client", action: "send", entity: "message", journal: true });
  }

  if (new RegExp(`^/api/admin/bookings/${UUID}/responsable$`, "i").test(path) && mutation) {
    // « Je prends ce dossier » est ouvert à qui modifie les dossiers ; la route tranche et écrit la ligne.
    return classify({ permission: "edit_dossiers", action: "update", entity: "dossier", journal: false });
  }

  if (new RegExp(`^/api/admin/bookings/${UUID}$`, "i").test(path) && upper === "DELETE") {
    return classify({ permission: "delete_archive", action: "delete", entity: "dossier", journal: true, summary: "Dossier archivé." });
  }

  if (/^\/api\/admin\/bookings(\/from-ingest)?$/.test(path) && upper === "POST") {
    return classify({ permission: "create_dossiers", action: "create", entity: "dossier", journal: true, summary: "Dossier créé." });
  }

  if (/\/(concierge|outils)/.test(path) && mutation) {
    return classify({ permission: "change_settings", action, entity: "setting", journal: true });
  }

  if (/\/clients\/[^/]+$/.test(path) && upper === "DELETE") {
    return classify({ permission: "delete_archive", action: "delete", entity: "client", journal: true });
  }

  if (new RegExp(`^/api/admin/clients/${UUID}/hotels$`, "i").test(path) && mutation) {
    // Le même interrupteur que l’outil activer_option_hotel : une phrase lisible dans l’Historique.
    return classify({
      permission: "edit_dossiers",
      action: "update",
      entity: "client",
      journal: true,
      summary: "Option Hôtels du client modifiée (accès, mode réel ou demande Platinum).",
    });
  }

  if (mutation) {
    return classify({
      permission: "edit_dossiers",
      action,
      entity,
      journal: true,
      summary: dossierRouteSummary(upper, path) || undefined,
    });
  }

  return classify({ permission: null, action: "view", entity, journal: false });
}

export function entityIdFromPath(path: string) {
  const booking = path.match(new RegExp(`/bookings/(${UUID})`, "i"));
  if (booking) return booking[1];
  const client = path.match(new RegExp(`/clients/(${UUID})`, "i"));
  if (client) return client[1];
  const staff = path.match(new RegExp(`/equipe/(${UUID})`, "i"));
  if (staff) return staff[1];
  return null;
}

/** Décision de la garde. Tous les rôles de l’agence voient tous les dossiers : pas de périmètre. */
export function agencyGateDecision(input: {
  role: StaffRole | null;
  active: boolean;
  matrixReady: boolean;
  audience: AgencyRouteClass["audience"];
  permission: Permission | null;
  allows: boolean;
}): { allow: boolean; status: number; reason: string } {
  if (input.audience === "public") return { allow: true, status: 200, reason: "" };
  if (!input.role) return { allow: false, status: 401, reason: "Non authentifié" };
  if (!input.active) return { allow: false, status: 403, reason: "Cet accès est désactivé." };
  if (input.role === "partner") {
    if (input.audience === "partner") return { allow: true, status: 200, reason: "" };
    return { allow: false, status: 403, reason: "Accès réservé à l’agence." };
  }
  const legacy = !input.matrixReady && (input.role === "admin" || input.role === "agent");
  if (!legacy && input.permission && !input.allows) {
    return { allow: false, status: 403, reason: "Cette action n’est pas ouverte pour votre rôle." };
  }
  return { allow: true, status: 200, reason: "" };
}

/** Chemin d’un fichier de route, pour le test de couverture. */
export function samplePathForRouteFile(file: string) {
  const sample = "11111111-1111-4111-8111-111111111111";
  return (
    `/${file
      .replace(/\\/g, "/")
      .replace(/^app\//, "")
      .replace(/\/route\.ts$/, "")
      .replace(/\[[^\]]+\]/g, sample)}`
  );
}
