import { McpWriteError } from "./mcp-write";
import {
  ensureRestaurantTemplates,
  restaurantTemplatesStatus,
  RESTAURANT_TEMPLATE_CATEGORY,
  type RestaurantTemplateReport,
} from "./restaurant-templates-arm";

const STATUS_FR: Record<RestaurantTemplateReport["statut"], string> = {
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

function present(row: RestaurantTemplateReport) {
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
  "Aucun WhatsApp n’est envoyé par cet outil. Un modèle approuvé est utilisé par le cron de 16 h dès que la variable est posée, ou retrouvé par son nom si elle ne l’est pas.";

/**
 * Outil MCP create_restaurant_whatsapp_templates : crée chez Twilio les trois modèles restaurants
 * (restaurant_selection, restaurant_proposition, restaurant_proposition_carte), soumet chacun à Meta
 * en catégorie Utility, et renvoie nom, SID et statut. Idempotent. N’envoie aucun message.
 */
export async function createRestaurantWhatsappTemplates(input: Record<string, unknown>, fetchImpl?: typeof fetch) {
  void input;
  const result = await ensureRestaurantTemplates(fetchImpl);
  if (!result.ok && result.message) throw new McpWriteError(result.message);
  return {
    ok: result.ok,
    categorie: RESTAURANT_TEMPLATE_CATEGORY,
    modeles: result.modeles.map(present),
    note: NOTE,
  };
}

/** Outil MCP get_restaurant_whatsapp_templates_status : statut d’approbation par modèle. Lecture seule. */
export async function getRestaurantWhatsappTemplatesStatus(input: Record<string, unknown>, fetchImpl?: typeof fetch) {
  void input;
  const result = await restaurantTemplatesStatus(fetchImpl);
  return {
    ok: result.ok,
    modeles: result.modeles.map(present),
    ...(result.message ? { message: result.message } : {}),
    pret: result.modeles.filter((row) => row.statut === "approved").length === result.modeles.length,
    note: NOTE,
  };
}
