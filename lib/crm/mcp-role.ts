import { roleAllows, type Permission } from "./agency-access";
import type { StaffRole } from "./staff-team";

/**
 * Droit d’un outil pour une clé nominative.
 * `agency` : tout rôle de l’agence, actif (lecture comprise).
 * `admin` : rôle administrateur seulement, même si la matrice ouvre « Gérer l’équipe ».
 * Une permission : la matrice du rôle, sinon les défauts.
 * Le jeton d’environnement n’est pas concerné : il n’a pas de collègue.
 */
export type McpToolGate = "agency" | "admin" | Permission;

export const MCP_ADMIN_DENIAL = "Réservé aux administrateurs.";
export const MCP_ROLE_DENIAL = "Cette action n’est pas ouverte pour votre rôle.";
export const MCP_PARTNER_DENIAL = "Cette clé n’ouvre pas le CRM.";

export const MCP_TOOL_GATES: Record<string, McpToolGate> = {
  tableau_de_bord: "agency",
  chercher_clients: "agency",
  fiche_client: "agency",
  chercher_dossiers: "agency",
  fiche_dossier: "agency",
  passeport_voyageur: "passport_reveal",
  scan_passeport: "passport_reveal",
  formalites: "agency",
  services_a_confirmer: "agency",
  grand_livre: "view_finances",
  revolut_en_attente: "view_finances",
  revolut_debits: "view_finances",
  pliant_debits: "view_finances",
  comptabilite_voyage: "view_margins",
  stripe_en_attente: "view_finances",
  emails_en_attente: "view_inbox",
  lire_email: "view_inbox",
  reservation_little_emperors: "agency",
  little_emperors_en_attente: "agency",
  importer_reservation_little_emperors: "create_dossiers",
  rattacher_reservation_little_emperors: "edit_dossiers",
  crediter_virement: "edit_finances",
  crediter_revolut: "edit_finances",
  rapprocher_depense_revolut: "edit_finances",
  crediter_stripe: "edit_finances",
  completer_payeurs_stripe: "admin",
  remettre_non_rattache: "edit_finances",
  rapprocher_pliant: "edit_finances",
  creer_carte_pliant: "create_pliant_card",
  lire_carte_pliant: "create_pliant_card",
  bloquer_carte_pliant: "create_pliant_card",
  publier_carnet: "message_client",
  mettre_a_jour_dossier: "edit_dossiers",
  confirmer_service: "edit_dossiers",
  traiter_email: "edit_dossiers",
  creer_client: "create_dossiers",
  mettre_a_jour_client: "edit_dossiers",
  modifier_titulaire: "edit_dossiers",
  mettre_a_jour_accompagnant: "edit_dossiers",
  definir_role_societe: "edit_dossiers",
  inviter_client: "message_client",
  renvoyer_acces_whatsapp: "message_client",
  annoncer_option_hotel: "admin",
  ajouter_piece: "edit_dossiers",
  requalifier_piece: "edit_dossiers",
  notifier_piece: "message_client",
  envoyer_message_libre: "message_client",
  notifier_carte_embarquement: "message_client",
  creer_dossier: "create_dossiers",
  ajouter_voyageur: "edit_dossiers",
  modifier_voyageur: "edit_dossiers",
  retirer_voyageur: "edit_dossiers",
  fusionner_compagnon: "edit_dossiers",
  supprimer_compagnon: "admin",
  ajouter_vol: "edit_dossiers",
  modifier_vol: "edit_dossiers",
  retirer_carte: "edit_dossiers",
  definir_visibilite_carte: "edit_dossiers",
  preparer_message_carnet: "message_client",
  ajouter_hotel: "edit_dossiers",
  modifier_hotel: "edit_dossiers",
  ajouter_accueil_vip: "edit_dossiers",
  classer_courrier_hotel: "edit_dossiers",
  enregistrement_en_ligne: "edit_dossiers",
  envoyer_releve: "message_client",
  preparer_facture_mb3m: "edit_finances",
  statut_facture_mb3m: "view_finances",
  envoyer_facture: "message_client",
  sejours_restaurants: "agency",
  list_restaurants: "agency",
  create_restaurant: "edit_dossiers",
  update_restaurant: "edit_dossiers",
  tables_restaurant: "edit_dossiers",
  choix_restaurant: "agency",
  create_restaurant_whatsapp_templates: "change_settings",
  get_restaurant_whatsapp_templates_status: "agency",
  deposer_modeles_whatsapp: "admin",
  statut_modeles_whatsapp: "admin",
  deposer_modeles_autorisation_whatsapp: "admin",
  statut_modeles_autorisation_whatsapp: "admin",
  deposer_modeles_message_libre_whatsapp: "admin",
  statut_modeles_message_libre_whatsapp: "admin",
  lister_membres: "admin",
  ajouter_membre: "admin",
  changer_role_membre: "admin",
  desactiver_membre: "admin",
  lister_cles_api: "admin",
  creer_cle_api: "admin",
  revoquer_cle_api: "admin",
  supprimer_client: "admin",
  enregistrer_societes: "edit_dossiers",
  ajouter_societe: "edit_dossiers",
  modifier_societe: "edit_dossiers",
  regler_acces_hotels: "admin",
  archiver_dossier: "delete_archive",
  supprimer_dossier: "admin",
  restaurer_dossier: "delete_archive",
  dupliquer_dossier: "create_dossiers",
  cacher_carnet: "message_client",
  ajouter_carte: "edit_dossiers",
  modifier_carte: "edit_dossiers",
  reordonner_cartes: "edit_dossiers",
  deposer_piece_dossier: "edit_dossiers",
  retirer_piece_dossier: "edit_dossiers",
  supprimer_piece_client: "admin",
  lire_journal: "agency",
  reactiver_membre: "admin",
  reprendre_facture_mb3m: "edit_finances",
  creer_fiche_mb3m: "edit_finances",
  comptabilite_sortie: "edit_finances",
  refuser_encaissement: "edit_finances",
  statut_formalite: "agency",
  recherches_hotels: "agency",
  lancer_formalite: "edit_dossiers",
  annuler_mouvement: "edit_finances",
  fusionner_clients: "admin",
  changer_client_dossier: "edit_dossiers",
  depenses_types: "admin",
  courrier_hotel: "edit_dossiers",
  relancer_hotel: "edit_dossiers",
  repondre_hotel: "edit_dossiers",
  demande_hotel: "edit_dossiers",
  modifier_plafond_pliant: "create_pliant_card",
  cloturer_carte_pliant: "create_pliant_card",
  importer_pieces: "edit_dossiers",
  deposer_billet: "edit_dossiers",
  detacher_email: "edit_dossiers",
  societe_depense: "edit_dossiers",
  partager_sejour: "message_client",
  file_whatsapp: "message_client",
  proposition_concierge: "message_client",
  envoyer_restaurants: "message_client",
  sejour_hotel: "admin",
  reprendre_formalite: "edit_dossiers",
  ratehawk: "edit_dossiers",
  carte_arrivee: "edit_dossiers",
};

export type McpStaffGate = {
  role: string;
  allows?: Record<string, boolean> | null;
};

/** Null : l’appel continue. Une phrase : refus clair, l’outil ne s’exécute pas. */
export function mcpStaffDenial(tool: string, staff: McpStaffGate | null | undefined): string | null {
  if (!staff) return null;
  if (staff.role === "partner") return MCP_PARTNER_DENIAL;
  if (staff.role === "ratehawk_cert") return MCP_ROLE_DENIAL;
  const gate = MCP_TOOL_GATES[tool];
  if (!gate) return MCP_ROLE_DENIAL;
  if (gate === "agency") return null;
  if (gate === "admin") return staff.role === "admin" ? null : MCP_ADMIN_DENIAL;
  if (staff.allows && typeof staff.allows[gate] === "boolean") {
    return staff.allows[gate] ? null : MCP_ROLE_DENIAL;
  }
  if (staff.role === "admin" || staff.role === "manager" || staff.role === "agent" || staff.role === "comptable" || staff.role === "lecture") {
    return roleAllows(staff.role as StaffRole, gate, null) ? null : MCP_ROLE_DENIAL;
  }
  return MCP_ROLE_DENIAL;
}
