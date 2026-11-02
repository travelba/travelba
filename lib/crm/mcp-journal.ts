/**
 * Ligne d’Historique d’un outil MCP en écriture. Pur : le nom de l’outil, ses arguments et sa réponse donnent
 * l’étiquette métier, le dossier, le montant et la phrase. L’auteur est le jeton (connecteur), jamais un collègue.
 * Aucun numéro de carte ni de passeport n’entre ici : seulement un montant et quatre chiffres.
 */

import type { JournalAction, JournalEntity } from "./agency-journal";
import { cardLast4Of, centsFromAmount, formatJournalAmount, type JournalKind } from "./agency-journal-kinds";

type ToolLine = { kind: JournalKind; summary: string; entity: JournalEntity; action: JournalAction; amount?: boolean; sensitive?: "payment" | "card_reveal" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MCP_TOOL_JOURNAL: Record<string, ToolLine> = {
  crediter_virement: { kind: "paiement_recu", summary: "Virement crédité au client (connecteur)", entity: "finance", action: "create", amount: true, sensitive: "payment" },
  crediter_revolut: { kind: "paiement_rapproche", summary: "Virement Revolut rapproché et crédité (connecteur)", entity: "finance", action: "update", amount: true, sensitive: "payment" },
  rapprocher_depense_revolut: { kind: "fournisseur_paye", summary: "Sortie Revolut rattachée au dossier (connecteur)", entity: "finance", action: "update", amount: true, sensitive: "payment" },
  crediter_stripe: { kind: "paiement_rapproche", summary: "Paiement Stripe rapproché et crédité (connecteur)", entity: "finance", action: "update", amount: true, sensitive: "payment" },
  rapprocher_pliant: { kind: "fournisseur_paye", summary: "Dépense Pliant rattachée au dossier (connecteur)", entity: "finance", action: "update", amount: true, sensitive: "payment" },
  creer_carte_pliant: { kind: "carte_emise", summary: "Carte Pliant émise (connecteur)", entity: "card", action: "create", amount: true, sensitive: "payment" },
  bloquer_carte_pliant: { kind: "carte_bloquee", summary: "Carte Pliant bloquée (connecteur)", entity: "card", action: "update" },
  publier_carnet: { kind: "carnet_montre", summary: "Carnet montré au client (connecteur)", entity: "dossier", action: "update" },
  mettre_a_jour_dossier: { kind: "dossier_modifie", summary: "Dossier mis à jour (connecteur)", entity: "dossier", action: "update" },
  confirmer_service: { kind: "option_levee", summary: "Option levée : service confirmé (connecteur)", entity: "dossier", action: "update" },
  traiter_email: { kind: "dossier_modifie", summary: "E-mail fournisseur traité (connecteur)", entity: "dossier", action: "update" },
  creer_client: { kind: "client_cree", summary: "Client créé (connecteur)", entity: "client", action: "create" },
  mettre_a_jour_client: { kind: "client_modifie", summary: "Fiche client mise à jour (connecteur)", entity: "client", action: "update" },
  modifier_titulaire: { kind: "client_modifie", summary: "Titulaire modifié (connecteur)", entity: "client", action: "update" },
  definir_role_societe: { kind: "client_modifie", summary: "Rôle société du client modifié (connecteur)", entity: "client", action: "update" },
  inviter_client: { kind: "message_envoye", summary: "Invitation envoyée au client (connecteur)", entity: "message", action: "send" },
  ajouter_piece: { kind: "piece_deposee", summary: "Pièce déposée (connecteur)", entity: "document", action: "create" },
  requalifier_piece: { kind: "piece_deposee", summary: "Pièce requalifiée (connecteur)", entity: "document", action: "update" },
  notifier_piece: { kind: "whatsapp_envoye", summary: "WhatsApp « formalité prête » envoyé (connecteur)", entity: "message", action: "send" },
  notifier_carte_embarquement: { kind: "whatsapp_envoye", summary: "Carte d’embarquement envoyée par WhatsApp (connecteur)", entity: "message", action: "send" },
  creer_dossier: { kind: "dossier_cree", summary: "Dossier créé (connecteur)", entity: "dossier", action: "create" },
  ajouter_voyageur: { kind: "voyageurs_modifies", summary: "Voyageur ajouté (connecteur)", entity: "dossier", action: "update" },
  modifier_voyageur: { kind: "voyageurs_modifies", summary: "Voyageur modifié (connecteur)", entity: "dossier", action: "update" },
  retirer_voyageur: { kind: "voyageurs_modifies", summary: "Voyageur retiré (connecteur)", entity: "dossier", action: "update" },
  fusionner_compagnon: { kind: "client_modifie", summary: "Compagnon fusionné (connecteur)", entity: "client", action: "update" },
  ajouter_vol: { kind: "etape_ajoutee", summary: "Vol ajouté au carnet (connecteur)", entity: "dossier", action: "create", amount: true },
  modifier_vol: { kind: "etape_modifiee", summary: "Vol modifié (connecteur)", entity: "dossier", action: "update" },
  retirer_carte: { kind: "etape_retiree", summary: "Étape retirée du carnet (connecteur)", entity: "dossier", action: "delete" },
  definir_visibilite_carte: { kind: "etape_modifiee", summary: "Visibilité d’une étape modifiée (connecteur)", entity: "dossier", action: "update" },
  preparer_message_carnet: { kind: "dossier_modifie", summary: "Brouillon WhatsApp du carnet préparé (connecteur)", entity: "dossier", action: "update" },
  ajouter_hotel: { kind: "etape_ajoutee", summary: "Hôtel ajouté au carnet (connecteur)", entity: "dossier", action: "create", amount: true },
  modifier_hotel: { kind: "etape_modifiee", summary: "Hôtel modifié (connecteur)", entity: "dossier", action: "update" },
  ajouter_accueil_vip: { kind: "option_posee", summary: "Option posée : accueil VIP Airport (connecteur)", entity: "dossier", action: "create", amount: true },
  enregistrement_en_ligne: { kind: "etape_modifiee", summary: "Enregistrement en ligne mis à jour (connecteur)", entity: "dossier", action: "update" },
  envoyer_releve: { kind: "message_envoye", summary: "Relevé de compte envoyé par WhatsApp (connecteur)", entity: "message", action: "send" },
  create_restaurant: { kind: "reglage_modifie", summary: "Restaurant ajouté au catalogue (connecteur)", entity: "setting", action: "create" },
  update_restaurant: { kind: "reglage_modifie", summary: "Restaurant modifié (connecteur)", entity: "setting", action: "update" },
  tables_restaurant: { kind: "etape_modifiee", summary: "Table de restaurant (connecteur)", entity: "dossier", action: "update" },
  create_restaurant_whatsapp_templates: { kind: "reglage_modifie", summary: "Modèles WhatsApp restaurants déposés chez Twilio (connecteur)", entity: "setting", action: "create" },
};

/** Outils dont la lecture du numéro complet est déjà journalisée par la route carte : pas de seconde ligne. */
export const MCP_TOOLS_SELF_JOURNALED = new Set(["lire_carte_pliant"]);

function uuidIn(value: unknown) {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function readString(value: unknown, max = 80) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export type McpJournalLine = {
  action: JournalAction;
  entityType: JournalEntity;
  entityId: string | null;
  summary: string;
  kind: JournalKind;
  bookingId: string | null;
  amountCents: number | null;
  currency: string | null;
  cardLast4: string | null;
  actorLabel: string;
  sensitive: "payment" | "card_reveal" | null;
  diff: Record<string, unknown> | null;
};

/**
 * La ligne d’un outil d’écriture qui a réussi. Null pour un outil inconnu, en lecture, ou déjà journalisé.
 * Le dossier vient de `dossier_id` (arguments ou réponse), le montant de `montant` ou `prix` en euros.
 */
export function mcpJournalLine(input: {
  tool: string;
  write: boolean;
  actor: string;
  args: Record<string, unknown>;
  result: unknown;
}): McpJournalLine | null {
  if (!input.write || MCP_TOOLS_SELF_JOURNALED.has(input.tool)) return null;
  const def = MCP_TOOL_JOURNAL[input.tool];
  const result = (input.result && typeof input.result === "object" ? input.result : {}) as Record<string, unknown>;
  const line: ToolLine = def || { kind: "autre", summary: `Outil ${input.tool} (connecteur)`, entity: "setting", action: "update" };
  const bookingId =
    uuidIn(input.args.dossier_id) || uuidIn(result.dossier_id) || uuidIn(input.args.booking_id) || uuidIn(result.booking_id) || null;
  const customerId = uuidIn(input.args.customer_id) || uuidIn(result.customer_id) || uuidIn(result.client_id) || null;
  let amountCents: number | null = null;
  if (line.amount) {
    amountCents =
      centsFromAmount(input.args.montant) ??
      centsFromAmount(input.args.plafond) ??
      centsFromAmount(input.args.prix_total) ??
      centsFromAmount(input.args.prix) ??
      centsFromAmount(result.montant) ??
      null;
    if (amountCents != null && amountCents <= 0) amountCents = null;
  }
  const currency = readString(input.args.devise, 3) || readString(result.devise, 3) || null;
  const cardLast4 = cardLast4Of(readString(result.derniers_chiffres) || readString(result.last4));
  let kind = line.kind;
  let summary = line.summary;
  if (input.tool === "bloquer_carte_pliant" && input.args.debloquer === true) {
    kind = "carte_debloquee";
    summary = "Carte Pliant débloquée (connecteur)";
  }
  if (input.tool === "traiter_email") {
    const action = readString(input.args.action, 20);
    if (action === "creer_dossier") {
      kind = "dossier_cree";
      summary = "Dossier créé depuis un e-mail fournisseur (connecteur)";
    } else if (action === "rattacher" || action === "mettre_a_jour") {
      kind = "piece_deposee";
      summary = "Pièces d’un e-mail déposées sur le dossier (connecteur)";
    }
  }
  if (input.tool === "definir_visibilite_carte" && input.args.visible === true) summary = "Étape montrée au client (connecteur)";
  if (input.tool === "definir_visibilite_carte" && input.args.visible === false) summary = "Étape cachée au client (connecteur)";
  const amountWords = formatJournalAmount(amountCents, currency);
  const text = amountWords ? summary.replace(" (connecteur)", `, ${amountWords} (connecteur)`) : summary;
  const diff: Record<string, unknown> = {};
  const reference = readString(result.reference) || readString(input.args.reference);
  if (reference) diff.dossier = reference;
  const title = readString(result.titre) || readString(input.args.titre);
  if (title) diff.titre = title;
  return {
    action: line.action,
    entityType: line.entity,
    entityId: line.entity === "client" ? customerId : bookingId || customerId,
    summary: `${text}.`,
    kind,
    bookingId,
    amountCents,
    currency,
    cardLast4,
    actorLabel: input.actor.slice(0, 40),
    sensitive: line.sensitive ?? null,
    diff: Object.keys(diff).length ? diff : null,
  };
}
