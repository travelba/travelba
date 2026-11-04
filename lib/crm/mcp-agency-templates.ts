import { McpWriteError } from "./mcp-write";
import type { ContentSidStore } from "./whatsapp-content-sid-store";
import {
  AGENCY_TEMPLATE_CATEGORY,
  agencyTemplatesStatus,
  authorizationTemplatesStatus,
  ensureAgencyTemplates,
  ensureAuthorizationTemplates,
  type AgencyTemplateReport,
} from "./agency-templates-arm";

const STATUS_FR: Record<AgencyTemplateReport["statut"], string> = {
  approved: "Approuvé par Meta",
  pending: "En attente d’approbation",
  received: "Reçu par Meta, en attente",
  rejected: "Refusé par Meta",
  paused: "Mis en pause par Meta",
  disabled: "Désactivé par Meta",
  unsubmitted: "Créé, pas encore soumis",
  absent: "Absent chez Twilio",
  inconnu: "Statut inconnu",
};

function present(row: AgencyTemplateReport) {
  return {
    nom: row.nom,
    variable: row.variable,
    content_sid: row.content_sid,
    statut: row.statut,
    statut_libelle: STATUS_FR[row.statut],
    source: row.source,
    ...(row.cree !== undefined ? { cree: row.cree } : {}),
    ...(row.soumis !== undefined ? { soumis: row.soumis } : {}),
    ...(row.motif_refus ? { motif_refus: row.motif_refus } : {}),
    ...(row.erreur ? { erreur: row.erreur } : {}),
  };
}

const NOTE =
  "Aucun WhatsApp n’est envoyé. Le SID est enregistré dans le réglage crm_whatsapp_content_sids. L’envoi le lit sans redéploiement, et retombe sur la variable du même nom si le réglage est vide.";

const AUTORISATION_NOTE =
  "Aucun WhatsApp n’est envoyé. Les SID v1 et v2 sont dans crm_whatsapp_content_sids. L’envoi utilise autorisation_validee_document_v2 et autorisation_validee_image_v2 dès que Meta les a approuvés, sinon les modèles v1. Un envoi v1 ou v2 compte comme déjà envoyé.";

function authorizationReady(rows: AgencyTemplateReport[]) {
  const next = rows.filter((row) => row.nom.endsWith("_v2"));
  return next.length > 0 && next.every((row) => row.statut === "approved");
}

/** Dépose espace_client_lien, option_hotel_activee et facture_paiement. Réservé aux administrateurs. */
export async function deposerModelesWhatsapp(input: Record<string, unknown>, fetchImpl?: typeof fetch) {
  void input;
  const result = await ensureAgencyTemplates(fetchImpl);
  if (!result.ok && result.message) throw new McpWriteError(result.message);
  return {
    ok: result.ok,
    categorie: AGENCY_TEMPLATE_CATEGORY,
    modeles: result.modeles.map(present),
    note: NOTE,
  };
}

function presentAuthorization(row: AgencyTemplateReport) {
  return { ...present(row), pret: row.statut === "approved" };
}

/** Dépose les modèles v2, et garde les v1. Réservé aux administrateurs. */
export async function deposerModelesAutorisationWhatsapp(
  input: Record<string, unknown>,
  fetchImpl?: typeof fetch,
  store?: ContentSidStore
) {
  void input;
  const result = await ensureAuthorizationTemplates(fetchImpl, store);
  if (!result.ok && result.message) throw new McpWriteError(result.message);
  return {
    ok: result.ok,
    categorie: AGENCY_TEMPLATE_CATEGORY,
    modeles: result.modeles.map(presentAuthorization),
    pret: authorizationReady(result.modeles),
    note: AUTORISATION_NOTE,
  };
}

/** Statut Meta des modèles d’autorisation, v2 puis v1. Lecture. Réservé aux administrateurs. */
export async function statutModelesAutorisationWhatsapp(
  input: Record<string, unknown>,
  fetchImpl?: typeof fetch,
  store?: ContentSidStore
) {
  void input;
  const result = await authorizationTemplatesStatus(fetchImpl, store);
  return {
    ok: result.ok,
    modeles: result.modeles.map(presentAuthorization),
    pret: authorizationReady(result.modeles),
    ...(result.message ? { message: result.message } : {}),
    note: AUTORISATION_NOTE,
  };
}

/** Statut Meta des trois modèles. Lecture. Réservé aux administrateurs. */
export async function statutModelesWhatsapp(input: Record<string, unknown>, fetchImpl?: typeof fetch) {
  void input;
  const result = await agencyTemplatesStatus(fetchImpl);
  return {
    ok: result.ok,
    modeles: result.modeles.map(present),
    ...(result.message ? { message: result.message } : {}),
    pret: result.modeles.length > 0 && result.modeles.every((row) => row.statut === "approved"),
    note: NOTE,
  };
}
