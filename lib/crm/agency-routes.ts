/**
 * Classe chaque route d’agence : droit exigé, action de journal, entité.
 * Le test de couverture parcourt `app/api/admin` et refuse une mutation non classée.
 */

import type { Permission, StaffRole } from "./agency-access";
import { auditSummary, type JournalAction, type JournalEntity } from "./agency-journal";
import type { JournalKind } from "./agency-journal-kinds";

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
  /** Étiquette métier de la ligne écrite par la garde. Null : rangée d’après l’action et l’entité. */
  kind: JournalKind | null;
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
  kind?: JournalKind | null;
}): AgencyRouteClass {
  return {
    audience: input.audience ?? "staff",
    permission: input.permission,
    action: input.action,
    entity: input.entity,
    journal: input.journal,
    sensitive: input.sensitive ?? null,
    summary: input.summary || auditSummary(input.action, input.entity),
    kind: input.kind ?? null,
  };
}

/** Phrase et étiquette du journal pour une route de dossier connue. Null : résumé générique. */
export function dossierRouteLine(method: string, path: string): { summary: string; kind: JournalKind } | null {
  const upper = method.toUpperCase();
  const tail = path.replace(new RegExp(`^/api/admin/bookings/${UUID}`, "i"), "");
  if (tail === "" && upper === "PATCH") return { summary: "Dossier modifié (en-tête, visibilité ou réglages).", kind: "dossier_modifie" };
  if (tail === "" && upper === "DELETE") return { summary: "Dossier archivé.", kind: "dossier_archive" };
  if (tail === "/items" || tail.startsWith("/items/")) {
    if (upper === "DELETE") return { summary: "Étape retirée du carnet.", kind: "etape_retiree" };
    if (upper === "POST") return { summary: "Étape ajoutée au carnet.", kind: "etape_ajoutee" };
    return { summary: "Étape du carnet modifiée.", kind: "etape_modifiee" };
  }
  if (tail.startsWith("/travelers")) {
    return upper === "DELETE"
      ? { summary: "Voyageur retiré.", kind: "voyageurs_modifies" }
      : { summary: "Voyageurs du dossier modifiés.", kind: "voyageurs_modifies" };
  }
  if (tail.startsWith("/documents")) {
    return upper === "DELETE"
      ? { summary: "Pièce retirée du dossier.", kind: "piece_retiree" }
      : { summary: "Pièce déposée sur le dossier.", kind: "piece_deposee" };
  }
  if (tail.startsWith("/cartes-embarquement")) return { summary: "Cartes d’embarquement.", kind: "piece_deposee" };
  if (tail.startsWith("/pliant")) return { summary: "Carte Pliant du dossier.", kind: "carte_plafond" };
  if (tail.startsWith("/cards")) return { summary: "Carte Pliant du dossier : émission, blocage ou ouverture.", kind: "carte_plafond" };
  if (tail.startsWith("/extras")) return { summary: "Options du séjour modifiées (chauffeur, accueil, enregistrement, visa).", kind: "option_posee" };
  if (tail.startsWith("/enregistrement")) return { summary: "Enregistrement en ligne mis à jour.", kind: "etape_modifiee" };
  if (tail.startsWith("/hotel-arrival") || tail.startsWith("/hotel-desk")) return { summary: "Courrier ou arrivée hôtel.", kind: "email_envoye" };
  if (tail.startsWith("/partage")) return { summary: "Carnet partagé.", kind: "message_envoye" };
  if (tail.startsWith("/mb3m")) return { summary: "Facture MB3M.", kind: "dossier_modifie" };
  if (tail.startsWith("/billing-company")) return { summary: "Société facturée modifiée.", kind: "dossier_modifie" };
  if (tail.startsWith("/cover")) return { summary: "Couverture du séjour modifiée.", kind: "dossier_modifie" };
  if (tail.startsWith("/duplicate")) return { summary: "Dossier dupliqué.", kind: "dossier_duplique" };
  if (tail.startsWith("/restore")) return { summary: "Dossier restauré.", kind: "dossier_restaure" };
  if (tail.startsWith("/calendrier")) return { summary: "Calendrier envoyé.", kind: "message_envoye" };
  if (/^\/(visa|visas|esta|eta-il|uk-eta)/.test(tail)) return { summary: "Formalité du dossier.", kind: "formalite" };
  if (tail.startsWith("/restaurants")) return { summary: "Restaurants du séjour.", kind: "etape_modifiee" };
  if (tail.startsWith("/chauffeur-quote")) return { summary: "Devis chauffeur.", kind: "option_posee" };
  if (tail.startsWith("/vu")) return { summary: "Dossier marqué vu.", kind: "dossier_modifie" };
  return null;
}

/** Phrase du journal pour une route de dossier connue. Null : résumé générique. */
export function dossierRouteSummary(method: string, path: string): string | null {
  return dossierRouteLine(method, path)?.summary ?? null;
}

/** Dossier d’un chemin `/api/admin/bookings/{id}/…`, quelle que soit l’entité de la ligne. */
export function bookingIdFromPath(path: string) {
  const booking = path.match(new RegExp(`/bookings/(${UUID})`, "i"));
  return booking ? booking[1] : null;
}

/** Routes qui écrivent elles-mêmes leur ligne métier (montant, carte, option) : la garde se tait. */
function selfJournaledDossierRoute(method: string, path: string) {
  const upper = method.toUpperCase();
  const tail = path.replace(new RegExp(`^/api/admin/bookings/${UUID}`, "i"), "");
  if (upper !== "POST") return false;
  return tail === "/cards" || tail === "/extras" || tail === "/hotel-desk";
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
      kind: "connexion_refusee",
    });
  }
  if (path === "/api/auth/known-password") {
    return classify({
      audience: "public",
      permission: null,
      action: "login",
      entity: "session",
      journal: true,
      kind: "connexion",
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
      summary: mutation ? "Réservation Little Emperors traitée." : undefined,
      kind: mutation ? "dossier_modifie" : null,
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
      kind: path.endsWith("/droits") ? "reglage_modifie" : "equipe_modifiee",
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
      kind: csv ? "export" : "reglage_modifie",
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
      kind: "passeport_ouvert",
    });
  }

  if (path === "/api/admin/pliant/cards" && mutation) {
    // La route écrit la ligne avec le plafond et les quatre chiffres : émission, plafond, blocage.
    return classify({
      permission: "create_pliant_card",
      action: "create",
      entity: "card",
      journal: false,
      summary: "Carte Pliant émise ou plafond modifié.",
      kind: "carte_emise",
    });
  }

  if (/^\/api\/admin\/pliant\/[^/]+$/.test(path) && mutation) {
    // La route écrit le rapprochement d’une dépense Pliant avec le montant et le dossier.
    return classify({
      permission: "pay_supplier",
      action: "update",
      entity: "finance",
      journal: false,
      sensitive: "payment",
      kind: "fournisseur_paye",
    });
  }

  if (/\/pliant/.test(path)) {
    return classify({
      permission: mutation ? "pay_supplier" : "view_finances",
      action,
      entity: "card",
      journal: mutation,
      sensitive: mutation ? "payment" : null,
      kind: mutation ? "carte_plafond" : null,
    });
  }

  if (/\/(revolut|stripe)\/[^/]+$/.test(path) && mutation) {
    // La route journalise le rapprochement avec le montant : pas de seconde ligne.
    return classify({
      permission: "edit_finances",
      action: "update",
      entity: "finance",
      journal: false,
      sensitive: "payment",
      kind: "paiement_rapproche",
    });
  }

  if (path === "/api/admin/transactions" && upper === "POST") {
    // La route écrit « Virement reçu » avec le montant, le client et le dossier.
    return classify({
      permission: "edit_finances",
      action: "create",
      entity: "finance",
      journal: false,
      sensitive: "payment",
      kind: "paiement_recu",
    });
  }

  if (/\/(transactions|revolut|stripe|comptabilite|mb3m)/.test(path)) {
    return classify({
      permission: mutation ? "edit_finances" : "view_finances",
      action,
      entity: "finance",
      journal: mutation,
      summary: mutation ? (/\/mb3m/.test(path) ? "Facture MB3M." : "Écriture au grand livre.") : undefined,
      kind: mutation ? "paiement_recu" : null,
    });
  }

  if (/\/(whatsapp|partage|invite|releve)/.test(path) && mutation) {
    const line = /\/whatsapp/.test(path)
      ? { summary: "Message WhatsApp envoyé au client.", kind: "whatsapp_envoye" as const }
      : /\/partage/.test(path)
        ? { summary: "Carnet partagé avec le client.", kind: "message_envoye" as const }
        : /\/invite/.test(path)
          ? { summary: "Invitation envoyée au client.", kind: "message_envoye" as const }
          : { summary: "Relevé de compte envoyé au client.", kind: "message_envoye" as const };
    return classify({ permission: "message_client", action: "send", entity: "message", journal: true, ...line });
  }

  if (new RegExp(`^/api/admin/bookings/${UUID}/responsable$`, "i").test(path) && mutation) {
    // « Je prends ce dossier » est ouvert à qui modifie les dossiers ; la route tranche et écrit la ligne.
    return classify({ permission: "edit_dossiers", action: "update", entity: "dossier", journal: false, kind: "responsable_attribue" });
  }

  if (new RegExp(`^/api/admin/bookings/${UUID}$`, "i").test(path) && upper === "DELETE") {
    return classify({ permission: "delete_archive", action: "delete", entity: "dossier", journal: true, summary: "Dossier archivé.", kind: "dossier_archive" });
  }

  if (/^\/api\/admin\/bookings(\/from-ingest)?$/.test(path) && upper === "POST") {
    return classify({ permission: "create_dossiers", action: "create", entity: "dossier", journal: true, summary: "Dossier créé.", kind: "dossier_cree" });
  }

  if (/\/(concierge|outils)/.test(path) && mutation) {
    return classify({ permission: "change_settings", action, entity: "setting", journal: true, kind: "reglage_modifie" });
  }

  if (path === "/api/admin/clients" && upper === "POST") {
    return classify({ permission: "edit_dossiers", action: "create", entity: "client", journal: true, summary: "Client créé.", kind: "client_cree" });
  }

  if (/\/clients\/[^/]+$/.test(path) && upper === "DELETE") {
    return classify({ permission: "delete_archive", action: "delete", entity: "client", journal: true, summary: "Client archivé.", kind: "client_archive" });
  }

  if (mutation) {
    const line = dossierRouteLine(upper, path);
    const clientLine =
      entity === "client"
        ? /\/hotels\//.test(path)
          ? { summary: "Séjour hôtel direct : geste de l’agence.", kind: "dossier_modifie" as const }
          : { summary: "Fiche client modifiée.", kind: "client_modifie" as const }
        : null;
    return classify({
      permission: "edit_dossiers",
      action,
      entity,
      journal: !selfJournaledDossierRoute(upper, path),
      summary: line?.summary || clientLine?.summary || undefined,
      kind: line?.kind ?? clientLine?.kind ?? null,
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
