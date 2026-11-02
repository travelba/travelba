import { McpWriteError } from "./mcp-write";
import {
  AGENCY_TEMPLATE_CATEGORY,
  agencyTemplatesStatus,
  ensureAgencyTemplates,
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

/** Dépose acces_client, option_hotel_activee et facture_paiement. Réservé aux administrateurs. */
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
