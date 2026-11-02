import type { JournalAction, JournalEntity } from "./agency-journal";

const SEND = new Set([
  "publier_carnet",
  "notifier_piece",
  "notifier_carte_embarquement",
  "envoyer_releve",
  "envoyer_facture",
  "inviter_client",
]);

const CREATE = new Set([
  "creer_dossier",
  "creer_client",
  "ajouter_voyageur",
  "ajouter_vol",
  "ajouter_hotel",
  "ajouter_accueil_vip",
  "ajouter_piece",
  "creer_carte_pliant",
  "create_restaurant",
]);

const REMOVE = new Set(["retirer_carte", "retirer_voyageur"]);

const FINANCE = new Set([
  "crediter_virement",
  "crediter_revolut",
  "rapprocher_depense_revolut",
  "crediter_stripe",
  "remettre_non_rattache",
  "rapprocher_pliant",
  "preparer_facture_mb3m",
]);

const PHRASES: Record<string, string> = {
  crediter_virement: "Virement crédité",
  crediter_revolut: "Virement Revolut crédité",
  rapprocher_depense_revolut: "Dépense Revolut rapprochée",
  crediter_stripe: "Paiement Stripe crédité",
  remettre_non_rattache: "Crédit remis en non rattaché",
  rapprocher_pliant: "Dépense Pliant rapprochée",
  creer_carte_pliant: "Carte Pliant créée",
  bloquer_carte_pliant: "Carte Pliant gelée ou rouverte",
  publier_carnet: "Carnet montré ou caché",
  mettre_a_jour_dossier: "Dossier modifié",
  confirmer_service: "Service confirmé",
  traiter_email: "E-mail traité",
  creer_client: "Fiche client créée",
  mettre_a_jour_client: "Fiche client modifiée",
  modifier_titulaire: "Titulaire modifié",
  definir_role_societe: "Rôle de société modifié",
  inviter_client: "Invitation envoyée",
  ajouter_piece: "Pièce déposée",
  requalifier_piece: "Pièce requalifiée",
  notifier_piece: "Pièce notifiée",
  notifier_carte_embarquement: "Carte d’embarquement envoyée",
  creer_dossier: "Dossier créé",
  ajouter_voyageur: "Voyageur ajouté",
  modifier_voyageur: "Voyageur modifié",
  retirer_voyageur: "Voyageur retiré",
  fusionner_compagnon: "Compagnon fusionné",
  ajouter_vol: "Vol ajouté",
  modifier_vol: "Vol modifié",
  retirer_carte: "Carte retirée",
  definir_visibilite_carte: "Visibilité de carte modifiée",
  preparer_message_carnet: "Message de carnet préparé",
  ajouter_hotel: "Hôtel ajouté",
  modifier_hotel: "Hôtel modifié",
  ajouter_accueil_vip: "Accueil ajouté",
  enregistrement_en_ligne: "Enregistrement en ligne mis à jour",
  envoyer_releve: "Relevé envoyé",
  preparer_facture_mb3m: "Facture MB3M préparée",
  envoyer_facture: "Facture envoyée",
  create_restaurant: "Restaurant créé",
  update_restaurant: "Restaurant modifié",
  tables_restaurant: "Table de restaurant mise à jour",
  create_restaurant_whatsapp_templates: "Modèles WhatsApp restaurants déposés",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstUuid(args: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && UUID.test(value.trim())) return value.trim();
  }
  return null;
}

export type McpJournalDraft = {
  action: JournalAction;
  entityType: JournalEntity;
  entityId: string | null;
  summary: string;
};

/** Ligne d’historique pour une écriture faite avec une clé nominative. Sans secret. */
export function mcpWriteJournalDraft(tool: string, args: Record<string, unknown>, name: string): McpJournalDraft {
  const dossierId = firstUuid(args, ["dossier_id", "booking_id"]);
  const clientId = firstUuid(args, ["client_id", "customer_id"]);
  const phrase = PHRASES[tool] || "Action MCP";
  let action: JournalAction = "update";
  if (SEND.has(tool)) action = "send";
  else if (CREATE.has(tool)) action = "create";
  else if (REMOVE.has(tool)) action = "delete";
  let entityType: JournalEntity = "dossier";
  let entityId: string | null = dossierId;
  if (!dossierId && clientId) {
    entityType = "client";
    entityId = clientId;
  } else if (!dossierId && !clientId && FINANCE.has(tool)) {
    entityType = "finance";
    entityId = null;
  }
  return {
    action,
    entityType,
    entityId,
    summary: `${phrase} par ${name}.`.slice(0, 500),
  };
}
