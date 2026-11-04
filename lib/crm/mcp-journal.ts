import type { JournalAction, JournalEntity } from "./agency-journal";

const SEND = new Set([
  "publier_carnet",
  "notifier_piece",
  "notifier_carte_embarquement",
  "envoyer_releve",
  "envoyer_facture",
  "inviter_client",
  "renvoyer_acces_whatsapp",
  "annoncer_option_hotel",
]);

const CREATE = new Set([
  "creer_dossier",
  "creer_client",
  "importer_reservation_little_emperors",
  "ajouter_voyageur",
  "ajouter_vol",
  "ajouter_hotel",
  "ajouter_accueil_vip",
  "ajouter_piece",
  "creer_carte_pliant",
  "create_restaurant",
  "dupliquer_dossier",
  "ajouter_carte",
  "deposer_piece_dossier",
]);

const REMOVE = new Set(["retirer_carte", "retirer_voyageur", "supprimer_client", "archiver_dossier", "retirer_piece_dossier", "annuler_mouvement", "fusionner_clients"]);

const FINANCE = new Set([
  "crediter_virement",
  "crediter_revolut",
  "rapprocher_depense_revolut",
  "crediter_stripe",
  "remettre_non_rattache",
  "rapprocher_pliant",
  "preparer_facture_mb3m",
  "reprendre_facture_mb3m",
  "creer_fiche_mb3m",
  "comptabilite_sortie",
  "refuser_encaissement",
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
  importer_reservation_little_emperors: "Réservation Little Emperors importée",
  mettre_a_jour_client: "Fiche client modifiée",
  modifier_titulaire: "Titulaire modifié",
  definir_role_societe: "Rôle de société modifié",
  inviter_client: "Invitation envoyée",
  renvoyer_acces_whatsapp: "Accès renvoyés par WhatsApp",
  annoncer_option_hotel: "Accès Hôtels annoncé",
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
  deposer_modeles_whatsapp: "Modèles WhatsApp accès et facture déposés",
  deposer_modeles_autorisation_whatsapp: "Modèles WhatsApp d’autorisation déposés",
  supprimer_client: "Client supprimé",
  annuler_mouvement: "Mouvement annulé",
  fusionner_clients: "Clients fusionnés",
  enregistrer_societes: "Sociétés de facturation enregistrées",
  regler_acces_hotels: "Accès hôtels modifié",
  archiver_dossier: "Dossier archivé",
  restaurer_dossier: "Dossier rouvert",
  dupliquer_dossier: "Dossier dupliqué",
  cacher_carnet: "Carnet caché",
  ajouter_carte: "Carte ajoutée",
  modifier_carte: "Carte modifiée",
  reordonner_cartes: "Cartes réordonnées",
  deposer_piece_dossier: "Pièce déposée sur le dossier",
  retirer_piece_dossier: "Pièce retirée du dossier",
  reprendre_facture_mb3m: "Facture MB3M reprise",
  creer_fiche_mb3m: "Fiche envoyée à MB3M",
  comptabilite_sortie: "Sortie fournisseur rapprochée",
  refuser_encaissement: "Encaissement refusé",
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
