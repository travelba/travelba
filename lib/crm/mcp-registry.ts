import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BookingStateFilter } from "@/lib/crm/admin-list";
import {
  readChercherClients,
  readChercherDossiers,
  readComptabiliteVoyage,
  readEmailsEnAttente,
  readFicheClient,
  readFicheDossier,
  readFormalites,
  readGrandLivre,
  readLittleEmperorsEnAttente,
  readRevolutDebits,
  readRevolutEnAttente,
  readStripeEnAttente,
  readServicesAConfirmer,
  readTableauDeBord,
} from "@/lib/crm/mcp-read";
import {
  confirmService,
  createClient,
  creditManualTransfer,
  creditRevolutTransfer,
  creditStripePayment,
  matchRevolutExpense,
  McpWriteError,
  publishCarnet,
  reconcilePliantDebit,
  settleEmail,
  updateBooking,
  updateClient,
} from "@/lib/crm/mcp-write";
import { notifyBoardingPass } from "@/lib/crm/mcp-boarding-pass";
import { addTravelPiece, notifyTravelPiece, requalifyPiece } from "@/lib/crm/mcp-piece";
import {
  addAccueilVip,
  addHotel,
  addVol,
  addVoyageur,
  createDossier,
  mergeCompagnon,
  removeCarte,
  removeVoyageur,
  setCarteVisibilite,
  prepareCarnetMessage,
  updateHotel,
  updateVol,
} from "@/lib/crm/mcp-trip";
import { inviteClientAccess, setCompanyRole, updateHolderProfile } from "@/lib/crm/mcp-account";
import { updateVoyageur } from "@/lib/crm/traveler-update";
import { readReservationLittleEmperors } from "@/lib/crm/mcp-le";
import { McpReadError, readPasseportVoyageur, readScanPasseport } from "@/lib/crm/mcp-passport";
import { enregistrementEnLigne } from "@/lib/crm/mcp-checkin";
import { blockPliantCard, createPliantCard, readPliantCard } from "@/lib/crm/mcp-pliant-card";
import { envoyerReleve } from "@/lib/crm/mcp-statement";
import { readLireEmail } from "@/lib/crm/mcp-email";
import {
  choixRestaurant,
  createRestaurantTool,
  listRestaurantsTool,
  sejoursRestaurants,
  tablesRestaurant,
  updateRestaurantTool,
} from "@/lib/crm/mcp-restaurants";
import { createRestaurantWhatsappTemplates, getRestaurantWhatsappTemplatesStatus } from "@/lib/crm/mcp-restaurant-templates";
import { redactMcp } from "@/lib/crm/mcp-redact";

/** Plafond = nombre d’outils. Le relever dans le même changement qu’un outil nouveau. */
export const MCP_TOOL_CAP = 62;

const COMPANY_FIELDS = {
  raison_sociale: z.string().trim().max(300).optional().describe("Raison sociale"),
  siret: z.string().trim().max(40).optional().describe("SIRET, 14 chiffres. Même SIRET : la société existante est mise à jour"),
  tva: z.string().trim().max(40).optional().describe("Numéro de TVA"),
  adresse: z.string().trim().max(300).optional().describe("Adresse de facturation"),
  code_postal: z.string().trim().max(20).optional().describe("Code postal de facturation"),
  ville: z.string().trim().max(80).optional().describe("Ville de facturation"),
  pays: z.string().trim().max(80).optional().describe("Pays de facturation"),
};

/** Champs d’une fiche restaurant, partagés par create_restaurant et update_restaurant. */
const RESTAURANT_FIELDS = {
  adresse: z.string().trim().max(300).optional().describe("Adresse"),
  lat: z.union([z.number(), z.string()]).optional(),
  lng: z.union([z.number(), z.string()]).optional(),
  telephone: z.string().trim().max(40).optional(),
  site: z.string().trim().max(300).optional().describe("Site officiel, https"),
  page: z.string().trim().max(500).optional().describe("Page Google ou site, https : lien « Découvrir l’adresse »"),
  categories: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("Séparées par des virgules, la première est la principale : pizzeria, japonais, francais, incontournable, italien, festif, enfants, terrasse…"),
  cuisine: z.string().trim().max(80).optional().describe("Cuisine, texte libre : italienne du sud, omakase"),
  style: z.string().trim().max(80).optional().describe("Style : bistrot, terrasse les pieds dans l’eau"),
  description: z.string().trim().max(400).optional().describe("Description courte, ton concierge (concierge_pitch)"),
  fourchette: z.string().trim().max(80).optional().describe("Prix par personne, par exemple 90 à 140 € (price_band)"),
  estimation: z.union([z.boolean(), z.string()]).optional().describe("La fourchette est une estimation, pas la carte"),
  horaires: z.string().trim().max(400).optional().describe("Horaires d’ouverture, texte libre"),
  fermeture_jours: z.string().trim().max(80).optional().describe("Jours fermés : lundi, mardi…"),
  fermetures: z.string().trim().max(400).optional().describe("Fermetures annuelles mois-jour/mois-jour, une par ligne"),
  plateforme: z.string().trim().max(40).optional().describe("resy, opentable, sevenrooms, thefork, zenchef, telephone, whatsapp, formulaire"),
  lien: z.string().trim().max(400).optional().describe("Lien de réservation (booking_url)"),
  bot: z.string().trim().max(20).optional().describe("Réservable par le bot : oui, partiel ou non"),
  empreinte_carte: z.union([z.boolean(), z.string()]).optional().describe("Empreinte de carte demandée à la réservation. Oui ou non, jamais un numéro"),
  annulation_en_ligne: z.union([z.boolean(), z.string()]).optional().describe("Annulation possible en ligne : oui ou non"),
  annulation_heures: z.union([z.number(), z.string()]).optional().describe("Délai d’annulation en heures"),
  annulation_frais: z.union([z.number(), z.string()]).optional().describe("Frais d’annulation en euros"),
  photos: z.string().trim().max(4000).optional().describe("Photos https, une par ligne. La première est la salle (photo_urls)"),
  photo_plat: z.string().trim().max(500).optional().describe("Photo https du plat signature (signature_photo_url)"),
  photo_carte: z.string().trim().max(500).optional().describe("Photo https de la carte, facultative (menu_photo_url)"),
  disponibilites: z.string().trim().max(1000).optional().describe("Disponibilités et conseils de réservation (availability_notes)"),
  statut: z.string().trim().max(20).optional().describe("actif, a_valider ou exclu"),
  motif: z.string().trim().max(40).optional().describe("ferme, gastronomique ou prepaiement"),
  etoile: z.union([z.boolean(), z.string()]).optional().describe("Étoilé : exclu"),
  prepaiement: z.union([z.boolean(), z.string()]).optional().describe("Prépaiement obligatoire : exclu"),
  note: z.string().trim().max(2000).optional().describe("Note interne"),
};

const PRIX_BILLET = "Prix d’un billet (unitaire). Zéro est accepté. Le séjour le multiplie par le nombre de billets.";
const PRIX_GROUPE =
  "Total du groupe pour cette carte, gardé au centime. Il n’est pas divisé par le nombre de billets. Zéro est accepté. Le nombre de billets n’est pas obligatoire. Un aller-retour au même prix n’est compté qu’une fois ; deux prix différents comptent tous les deux.";

const text = (value: unknown, keepPieceNumber = false, keepSignedUrl = false, keepCardSecrets = false) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(redactMcp(value, 0, keepPieceNumber, keepSignedUrl, keepCardSecrets)),
    },
  ],
});

function failed(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

async function guard(
  name: string,
  write: boolean,
  keepPieceNumber: boolean,
  keepSignedUrl: boolean,
  keepCardSecrets: boolean,
  run: () => Promise<unknown>
) {
  try {
    return text(await run(), keepPieceNumber, keepSignedUrl, keepCardSecrets);
  } catch (err) {
    console.error("[mcp]", name, err instanceof Error ? err.message : "error");
    if ((write && err instanceof McpWriteError) || err instanceof McpReadError) return failed(err.message);
    return failed(write ? "Écriture impossible." : "Lecture impossible.");
  }
}

const q = z.string().trim().max(80).optional().describe("Nom, société, e-mail, téléphone ou référence");
const id = z.string().trim().max(80).optional().describe("Identifiant du client ou du dossier");

type ToolArgs = Record<string, unknown>;

type ToolDef = {
  name: string;
  description: string;
  input?: Record<string, z.ZodType>;
  /** Écriture : le modèle doit nommer la cible. Pas de lecture seule. */
  write?: boolean;
  /** Appel hors Travelba (réservation chauffeur). */
  openWorld?: boolean;
  /** Garde le numéro de pièce dans la réponse. Tous les autres outils le retirent. */
  pieceNumbers?: boolean;
  /** Garde `url_signee`. Tous les autres outils retirent les URL signées. */
  signedUrl?: boolean;
  /** Garde `pan`, `cvv` et `expiration`. Tous les autres outils les retirent. */
  cardSecrets?: boolean;
  run: (args: ToolArgs) => Promise<unknown>;
};

function keepPieceNumber(tool: ToolDef) {
  return tool.pieceNumbers === true;
}

function keepSignedUrl(tool: ToolDef) {
  return tool.signedUrl === true;
}

function keepCardSecrets(tool: ToolDef) {
  return tool.cardSecrets === true;
}

/** Même masquage que la réponse de l’outil. Le numéro de carte ne sort que pour lire_carte_pliant. */
export function previewMcpTool(name: string, value: unknown) {
  const tool = MCP_TOOLS.find((item) => item.name === name);
  if (!tool) throw new Error("Outil inconnu.");
  return text(value, keepPieceNumber(tool), keepSignedUrl(tool), keepCardSecrets(tool));
}

function str(args: ToolArgs, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function flag(args: ToolArgs, key: string) {
  return args[key] === true;
}

/**
 * Liste unique des outils Grok. Une option admin nouvelle s’ajoute ici,
 * dans le même changement, en réutilisant `lib/crm`.
 */
export const MCP_TOOLS: ToolDef[] = [
  {
    name: "tableau_de_bord",
    description:
      "À faire aujourd’hui : mails, Little Emperors, formalités, services, départs, pièces, soldes Revolut, Stripe et Pliant. courriers_hotel : fils d’hôtel encore à traiter, statut synchronisé avec Gmail (Réponse à traiter, En attente de réponse, Sans réponse), qui a écrit en dernier. Un fil où l’agence a répondu en dernier, un paiement fait, une confirmation, un dossier annulé ou un séjour passé sans nouveau message n’y figurent pas. Lecture seule.",
    run: () => readTableauDeBord(),
  },
  {
    name: "chercher_clients",
    description:
      "Cherche un client par nom, société, e-mail ou téléphone. echeance vrai : pièces qui expirent dans 90 jours, sans numéro.",
    input: {
      q,
      echeance: z.boolean().optional().describe("Pièces à échéance, sans numéro de pièce"),
    },
    run: (args: ToolArgs) => readChercherClients({ q: str(args, "q"), echeance: flag(args, "echeance") }),
  },
  {
    name: "fiche_client",
    description:
      "Fiche d’un client : coordonnées, encours (signe brut), pièces à échéance (type et date, jamais le numéro). id ou q.",
    input: { id, q },
    run: (args: ToolArgs) => readFicheClient({ id: str(args, "id"), q: str(args, "q") }),
  },
  {
    name: "chercher_dossiers",
    description:
      "Dossiers. etat : a-venir, preparation, montre, archive. Sans filtre : les prochains départs. État : En préparation, Visible, ou Archivée. À côté du contact : societe et paye_par (société ou particulier).",
    input: {
      q,
      etat: z
        .enum(["a-venir", "preparation", "montre", "archive"])
        .optional()
        .describe("a-venir, preparation, montre ou archive"),
    },
    run: (args: ToolArgs) =>
      readChercherDossiers({
        q: str(args, "q"),
        etat: (str(args, "etat") as BookingStateFilter | undefined) ?? null,
      }),
  },
  {
    name: "fiche_dossier",
    description:
      "Un dossier : cartes (carte_id, villes puis code aéroport), voyageurs (voyageur_id et nom), état, société facturée (societe, paye_par), commission d’agence (commission_agence, commission_source, commission_appliquee). Chaque vol porte enregistrement (statut, ouverture, par, alerte). carte_id sert à modifier_vol, à modifier_hotel et à enregistrement_en_ligne. voyageur_id sert à modifier_voyageur, modifier_vol, ajouter_voyageur et retirer_voyageur. id ou reference. Pas les contacts d’hôtel. Pas de passeport ni de MRZ.",
    input: {
      id,
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
    },
    run: (args: ToolArgs) => readFicheDossier({ id: str(args, "id"), reference: str(args, "reference") }),
  },
  {
    name: "passeport_voyageur",
    pieceNumbers: true,
    description:
      "Passeports pour émettre un billet (APIS). Espace travelba-passeports seulement : jeton nommé dans TRAVELBA_MCP_PASSPORT_TOKENS. L’espace travelba (jeton général) refuse, c’est voulu, aucun numéro. client_id (fiche), dossier_id ou reference (voyageurs du séjour). Chaque pièce : nom, prénoms, naissance, lieu_naissance, sexe, nationalité, type, numero_piece, pays, délivrance, expiration, a_un_scan. Pas de champ biométrique. Le fichier est scan_passeport, même espace. Lecture seule.",
    input: {
      client_id: z.string().trim().max(80).optional().describe("Identifiant du client"),
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
    },
    run: (args: ToolArgs) =>
      readPasseportVoyageur({
        client_id: str(args, "client_id"),
        dossier_id: str(args, "dossier_id"),
        reference: str(args, "reference"),
      }),
  },
  {
    name: "scan_passeport",
    signedUrl: true,
    description:
      "Scan du passeport d’un voyageur du dossier. Même espace travelba-passeports que passeport_voyageur (jeton TRAVELBA_MCP_PASSPORT_TOKENS). L’espace travelba, jeton général, refuse : c’est voulu. dossier_id ou reference, et voyageur_id (celui de passeport_voyageur). URL signée dix minutes, nom du fichier, type mime. Un PDF est signalé : ce n’est pas une photo png, jpg ou jpeg. Lieu de naissance si le coffre l’a. Pas de champ biométrique. Lecture seule.",
    input: {
      client_id: z.string().trim().max(80).optional().describe("Identifiant du client, pour vérifier le dossier"),
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      voyageur_id: z.string().trim().max(80).optional().describe("Identifiant du voyageur sur le dossier"),
    },
    run: (args: ToolArgs) =>
      readScanPasseport({
        client_id: str(args, "client_id"),
        dossier_id: str(args, "dossier_id"),
        reference: str(args, "reference"),
        voyageur_id: str(args, "voyageur_id"),
      }),
  },
  {
    name: "formalites",
    description: "Formalités ouvertes : ETA-IL, ESTA, Royaume-Uni, et tâches du bureau. reference ou dossier_id limite au séjour. Lecture seule.",
    input: {
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
    },
    run: (args: ToolArgs) =>
      readFormalites({
        reference: str(args, "reference"),
        dossier_id: str(args, "dossier_id"),
      }),
  },
  {
    name: "services_a_confirmer",
    description:
      "Chauffeur, accueil VIP et enregistrement encore à confirmer. dossier_id et carte_id servent à confirmer_service.",
    run: () => readServicesAConfirmer(),
  },
  {
    name: "grand_livre",
    description:
      "Encours et derniers mouvements d’un client. Positif = avoir, négatif = reste à payer. id ou q. Lecture seule.",
    input: { id, q },
    run: (args: ToolArgs) => readGrandLivre({ id: str(args, "id"), q: str(args, "q") }),
  },
  {
    name: "revolut_en_attente",
    description:
      "Virements Revolut reçus, pas encore rapprochés. L’identifiant sert à crediter_revolut, avec le client désigné.",
    run: () => readRevolutEnAttente(),
  },
  {
    name: "revolut_debits",
    description:
      "Sorties du compte Revolut. Celles à rapprocher ont un id pour rapprocher_depense_revolut. Ne crédite pas un client.",
    run: () => readRevolutDebits(),
  },
  {
    name: "comptabilite_voyage",
    description:
      "Comptabilité d’un voyage : ventes, coûts Pliant et Revolut rattachés, marge par ligne, facture MB3M, sorties proposées, commission d’agence (taux et source). Chaque ligne a carte_id quand la vente est rattachée à une carte. id ou reference. Lecture seule, jamais montré au client.",
    input: {
      id,
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
    },
    run: (args: ToolArgs) => readComptabiliteVoyage({ id: str(args, "id"), reference: str(args, "reference") }),
  },
  {
    name: "stripe_en_attente",
    description:
      "Paiements Stripe reçus, pas encore rapprochés. L’identifiant sert à crediter_stripe, avec le client désigné.",
    run: () => readStripeEnAttente(),
  },
  {
    name: "emails_en_attente",
    description:
      "Mails fournisseurs en attente. L’identifiant sert à lire_email, puis à traiter_email : refuser, rattacher, mettre_a_jour (pièces sur la carte qui correspond, aucune carte créée) ou creer_dossier. Une annulation a alerte true seulement si son numéro est celui d’une carte active. suivi « remplacée » ou « historique » : pas d’alerte.",
    run: () => readEmailsEnAttente(),
  },
  {
    name: "lire_email",
    description:
      "Lit un e-mail (id de emails_en_attente). Renvoie le corps, les pièces (nom, type, texte extrait des PDF) et le billet déjà lu (cartes, voyageurs, références). Un aller-retour au même PNR est signalé : une carte à l’écran, une ligne par trajet. Une annulation porte suivi et alerte : alerte n’est true que si le numéro correspond à une carte active ; « remplacée » et « historique » se filtrent. Les numéros de passeport et de carte sont masqués. Pas de chemin de fichier, pas d’URL. Lecture seule.",
    input: {
      id: z.string().trim().describe("Identifiant de l’e-mail"),
    },
    run: (args) => readLireEmail({ id: str(args, "id") }),
  },
  {
    name: "reservation_little_emperors",
    description:
      "Lit une réservation Little Emperors, y compris déjà rattachée à un dossier. Par référence, ou par nom du client et hôtel (dates facultatives). Renvoie référence, statut, hôtel, dates, reservee_le (date de réservation : création Little Emperors, sinon e-mail de confirmation, sinon l’enregistrement), chambres, régime, voyageurs, prix net, prix public, avantages, conditions d’annulation, confirmations hôtel et le dossier lié. Plusieurs résultats sont cités du plus récent au plus ancien. Une annulation n’est Annulée, avec alerte true, que si le numéro est celui d’une carte active. Sinon statut Remplacée ou Historique, alerte false. Lecture seule. N’invente aucun prix.",
    input: {
      confirmation: z.string().trim().max(80).optional().describe("Référence Little Emperors ou confirmation hôtel"),
      nom: z.string().trim().max(120).optional().describe("Nom du client, avec l’hôtel"),
      hotel: z.string().trim().max(160).optional().describe("Hôtel, avec le nom du client"),
      arrivee: z.string().trim().max(10).optional().describe("Arrivée, AAAA-MM-JJ"),
      depart: z.string().trim().max(10).optional().describe("Départ, AAAA-MM-JJ"),
    },
    run: (args) => readReservationLittleEmperors(args),
  },
  {
    name: "little_emperors_en_attente",
    description:
      "Séjours Little Emperors sans dossier, date de réservation la plus récente d’abord (création Little Emperors, sinon e-mail de confirmation, sinon l’enregistrement). Chaque ligne porte reservee_le. Une annulation n’a alerte true que si son numéro est celui d’une carte active. suivi « remplacée » ou « historique », alerte false : la routine ne la signale pas. Ne crée rien.",
    run: () => readLittleEmperorsEnAttente(),
  },
  {
    name: "crediter_virement",
    write: true,
    description:
      "Crédite un virement au grand livre d’un client, comme la saisie agence. client_id obligatoire. Crédit seulement, jamais un débit.",
    input: {
      client_id: z.string().trim().describe("Identifiant du client"),
      montant: z.union([z.number(), z.string()]).describe("Montant du crédit, supérieur à zéro"),
      devise: z.string().trim().max(8).optional().describe("Devise, 3 lettres. Défaut EUR"),
      date: z.string().trim().max(40).optional().describe("Date du virement, AAAA-MM-JJ"),
      libelle: z.string().trim().max(200).optional().describe("Libellé du mouvement"),
      dossier_id: z.string().trim().optional().describe("Dossier lié, s’il y en a un"),
      sens: z.string().trim().optional().describe("Doit rester un crédit"),
      type: z.string().trim().optional().describe("Doit rester un virement"),
    },
    run: (args) => creditManualTransfer(args),
  },
  {
    name: "crediter_revolut",
    write: true,
    description:
      "Crédite un virement Revolut en attente au client désigné. Les deux identifiants sont obligatoires. Ne choisit pas un client à la place de l’agence.",
    input: {
      virement_id: z.string().trim().describe("Identifiant du virement Revolut en attente"),
      client_id: z.string().trim().describe("Identifiant du client à créditer"),
    },
    run: (args) => creditRevolutTransfer(args),
  },
  {
    name: "rapprocher_depense_revolut",
    write: true,
    description:
      "Rattache une sortie Revolut au client et au dossier désignés. Les trois identifiants sont obligatoires. Ne crédite pas le client et n’écrit pas le montant dans son encours. Ne choisit pas à la place de l’agence.",
    input: {
      depense_id: z.string().trim().describe("Identifiant de la sortie Revolut"),
      client_id: z.string().trim().describe("Identifiant du client"),
      dossier_id: z.string().trim().describe("Identifiant de la réservation de ce client"),
    },
    run: (args) => matchRevolutExpense(args),
  },
  {
    name: "crediter_stripe",
    write: true,
    description:
      "Crédite un paiement Stripe en attente au client désigné. Les deux identifiants sont obligatoires. Ne choisit pas un client à la place de l’agence.",
    input: {
      paiement_id: z.string().trim().describe("Identifiant du paiement Stripe en attente"),
      client_id: z.string().trim().describe("Identifiant du client à créditer"),
    },
    run: (args) => creditStripePayment(args),
  },
  {
    name: "rapprocher_pliant",
    write: true,
    description:
      "Rapproche un débit Pliant sur la réservation désignée. Les deux identifiants sont obligatoires. Le compte est celui qui règle le séjour. Ne choisit pas la réservation à la place de l’agence.",
    input: {
      mouvement_id: z.string().trim().describe("Identifiant de la dépense Pliant"),
      dossier_id: z.string().trim().describe("Identifiant de la réservation"),
    },
    run: (args) => reconcilePliantDebit(args),
  },
  {
    name: "creer_carte_pliant",
    write: true,
    openWorld: true,
    description:
      "Crée une carte Pliant sur le dossier (dossier_id ou reference), au nom indiqué (ex. Hôtel). Plafond total obligatoire, en euros par défaut. transactions : nombre d’achats, 1 par défaut (usage unique, un contrôle de passerelle ne compte pas). Au-delà, carte virtuelle réutilisable : le plafond total et le montant maximum par transaction sont envoyés, par exemple 1 500 € et 5 achats pour la garantie, les extras et le solde. Aucune restriction : ni devise, ni pays, ni commerçant, ni catégorie, ni mode d’acceptation. La carte reste rattachée au dossier : chaque débit s’y rapproche. Ne renvoie pas le numéro : lire_carte_pliant. Réservé à l’assistant autorisé.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier, ex. TB-2026-0082"),
      nom: z.string().trim().max(40).describe("Nom de la carte, ex. Visa"),
      plafond: z.union([z.number(), z.string()]).optional().describe("Plafond, ex. 10. Sans plafond, la carte n’est pas créée"),
      devise: z.string().trim().max(8).optional().describe("Devise du plafond, 3 lettres. Défaut EUR"),
      transactions: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Nombre d’achats autorisés. Défaut 1 : carte à usage unique. 5 : carte réutilisable, dans le plafond total"),
      montant_transaction: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Maximum d’un paiement. Défaut : le plafond"),
      prenom: z.string().trim().max(50).optional().describe("Prénom du titulaire. Défaut : le voyageur du dossier"),
      nom_titulaire: z.string().trim().max(50).optional().describe("Nom du titulaire"),
    },
    run: (args) =>
      createPliantCard({
        dossier_id: str(args, "dossier_id"),
        reference: str(args, "reference"),
        nom: str(args, "nom"),
        plafond: args.plafond,
        devise: str(args, "devise"),
        transactions: args.transactions,
        montant_transaction: args.montant_transaction,
        prenom: str(args, "prenom"),
        nom_titulaire: str(args, "nom_titulaire"),
      }),
  },
  {
    name: "lire_carte_pliant",
    openWorld: true,
    cardSecrets: true,
    description:
      "Numéro, expiration, CVV et titulaire d’une carte Pliant du dossier, et de celle-là seulement. dossier_id ou reference, et carte_id s’il y a plusieurs cartes (celui de creer_carte_pliant). Rien n’est enregistré. Réservé à l’assistant autorisé. Lecture seule.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      carte_id: z.string().trim().max(80).optional().describe("Identifiant de la carte sur le dossier"),
    },
    run: (args) =>
      readPliantCard({
        dossier_id: str(args, "dossier_id"),
        reference: str(args, "reference"),
        carte_id: str(args, "carte_id"),
      }),
  },
  {
    name: "bloquer_carte_pliant",
    write: true,
    openWorld: true,
    description:
      "Gèle une carte virtuelle Pliant du dossier : elle ne peut plus payer, et le gel se retire. dossier_id ou reference, et carte_id s’il y a plusieurs cartes. debloquer vrai retire le gel (lock Pliant, pas une suppression). Le statut est enregistré sur le dossier. Ne renvoie pas le numéro. Réservé à l’assistant autorisé.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier, ex. TB-2026-0088"),
      carte_id: z.string().trim().max(80).optional().describe("Identifiant de la carte sur le dossier, celui de creer_carte_pliant"),
      debloquer: z.boolean().optional().describe("Vrai pour retirer le gel. Absent ou faux : la carte est gelée"),
    },
    run: (args) =>
      blockPliantCard({
        dossier_id: str(args, "dossier_id"),
        reference: str(args, "reference"),
        carte_id: str(args, "carte_id"),
        debloquer: args.debloquer === true,
      }),
  },
  {
    name: "publier_carnet",
    write: true,
    description:
      "Montre le carnet au client. Il faut au moins une carte. Un dossier archivé reste caché. Un carnet déjà montré n’est pas renvoyé.",
    input: {
      id: z.string().trim().optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
    },
    run: (args) => publishCarnet(args),
  },
  {
    name: "mettre_a_jour_dossier",
    write: true,
    description:
      "Met à jour les notes, les dates, le titre, la couverture, la commission d’agence ou la société de facturation d’un dossier, puis le grand livre. titre est le nom du séjour. couverture : « catalogue », un lieu, ou un identifiant photo-… retire la photo importée et affiche la photo du catalogue de ce séjour. Une URL https, ou une image JPEG, PNG ou WebP en base64 (5 Mo maximum), dépose cette image. credit est la mention affichée, « Image générée par IA » par défaut. commission_agence : 10, 7,5, 5, ou compte pour suivre le compte. societe_id facture une société déjà sur la fiche. particulier : true retire la société du dossier. L’état du dossier est En préparation, Visible ou Archivée.",
    input: {
      id: z.string().trim().optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      notes_client: z.string().max(5000).optional().describe("Note visible par le client"),
      notes_internes: z.string().max(5000).optional().describe("Note interne à l’agence"),
      date_depart: z.string().max(40).optional().describe("Date de départ, AAAA-MM-JJ, vide pour effacer"),
      date_retour: z.string().max(40).optional().describe("Date de retour, AAAA-MM-JJ, vide pour effacer"),
      commission_agence: z
        .string()
        .trim()
        .max(20)
        .optional()
        .describe("Taux du dossier : 10, 7,5 ou 5. « compte » retire la dérogation."),
      societe_id: z
        .string()
        .trim()
        .max(80)
        .optional()
        .describe("Société de facturation déjà sur la fiche du client"),
      particulier: z
        .boolean()
        .optional()
        .describe("Séjour particulier. Retire la société du dossier"),
      titre: z.string().trim().max(200).optional().describe("Titre du séjour"),
      couverture: z
        .string()
        .trim()
        .max(8_000_000)
        .optional()
        .describe(
          "catalogue, un lieu, un identifiant photo-…, une URL https, ou une image JPEG, PNG ou WebP en base64 (5 Mo)"
        ),
      credit: z
        .string()
        .trim()
        .max(120)
        .optional()
        .describe("Mention de la couverture importée. Défaut : Image générée par IA"),
    },
    run: (args) => updateBooking(args),
  },
  {
    name: "confirmer_service",
    write: true,
    openWorld: true,
    description:
      "Confirme un chauffeur, un accueil VIP ou un enregistrement déjà demandé sur le dossier. dossier_id et carte_id viennent de services_a_confirmer.",
    input: {
      dossier_id: z.string().trim().describe("Identifiant du dossier"),
      carte_id: z.string().trim().describe("Identifiant de la carte de service"),
    },
    run: (args) => confirmService(args),
  },
  {
    name: "traiter_email",
    write: true,
    description:
      "Sort un e-mail de la file. refuser le classe sans dossier. rattacher et mettre_a_jour exigent dossier_id : ils déposent les pièces sur la carte qui correspond (PNR, puis compagnie et trajet, puis fournisseur), ou sur le dossier s’il n’y en a pas. Aucune carte n’est créée ni modifiée. Sans pièce, le mail est classé et rien n’est ajouté. creer_dossier est le bouton Créer un dossier : il trouve ou crée la fiche (client_id, ou email, ou le nom du billet ; sans e-mail si le billet n’en a pas), crée le dossier caché, les cartes du billet (aller-retour au même PNR : une carte à l’écran, une ligne par trajet) et dépose les fichiers. Une annulation ne crée pas de dossier. Aucune invitation.",
    input: {
      id: z.string().trim().describe("Identifiant de l’e-mail en attente"),
      action: z
        .enum(["rattacher", "mettre_a_jour", "refuser", "creer_dossier"])
        .describe("rattacher, mettre_a_jour, refuser ou creer_dossier"),
      dossier_id: z
        .string()
        .trim()
        .optional()
        .describe("Dossier choisi, obligatoire pour rattacher et mettre_a_jour"),
      client_id: z
        .string()
        .trim()
        .optional()
        .describe("Fiche déjà choisie, pour creer_dossier. Sinon le billet sert à trouver ou créer la fiche"),
      email: z
        .string()
        .trim()
        .max(254)
        .optional()
        .describe("E-mail du voyageur pour trouver ou créer la fiche. Pas une adresse fournisseur ni agence"),
      prenom: z.string().trim().max(80).optional().describe("Prénom, si la fiche est créée depuis le billet"),
      nom: z.string().trim().max(80).optional().describe("Nom, si la fiche est créée depuis le billet"),
    },
    run: (args) => settleEmail(args),
  },
  {
    name: "creer_client",
    write: true,
    description:
      "Crée une fiche client (e-mail, prénom, nom). Raison sociale, SIRET, TVA et adresse créent la société de facturation sur cette fiche, sans doublon de SIRET. N’envoie pas d’invitation. Un e-mail déjà utilisé est refusé.",
    input: {
      email: z.string().trim().describe("E-mail du client"),
      prenom: z.string().trim().describe("Prénom"),
      nom: z.string().trim().describe("Nom"),
      telephone: z.string().trim().max(40).optional().describe("Téléphone"),
      ...COMPANY_FIELDS,
    },
    run: (args) => createClient(args),
  },
  {
    name: "mettre_a_jour_client",
    write: true,
    description:
      "Met à jour le prénom, le nom, l’e-mail, le téléphone, la société ou la commission d’agence d’un client déjà identifié. commission_agence : 10, 7,5, 5, ou defaut pour 10 %. Les dossiers sans dérogation suivent. La société est enregistrée sur la fiche (même SIRET : mise à jour, pas une seconde ligne). supprimer_societe_id retire une société vide, sans raison sociale ni SIRET, qui n’est pas utilisée. Ne crée pas de fiche. Aucun message.",
    input: {
      id: z.string().trim().describe("Identifiant du client"),
      prenom: z.string().max(80).optional().describe("Prénom"),
      nom: z.string().max(80).optional().describe("Nom"),
      email: z.string().trim().optional().describe("E-mail"),
      telephone: z.string().max(40).optional().describe("Téléphone"),
      societe: z.string().max(200).optional().describe("Raison sociale, comme raison_sociale"),
      commission_agence: z
        .string()
        .trim()
        .max(20)
        .optional()
        .describe("Taux du compte : 10, 7,5 ou 5. « defaut » remet 10 %."),
      supprimer_societe_id: z
        .string()
        .trim()
        .max(80)
        .optional()
        .describe("Retire cette société si elle est vide et n’est pas utilisée"),
      ...COMPANY_FIELDS,
    },
    run: (args) => updateClient(args),
  },
  {
    name: "modifier_titulaire",
    write: true,
    description:
      "Met à jour la fiche du titulaire et son passeport : prénoms, nom, nom de passeport, nom d’usage, date de naissance, lieu de naissance, sexe, nationalité, date de délivrance, adresse personnelle. Mêmes champs d’identité que l’accompagnateur. Le nom de passeport peut différer du nom de la fiche. L’adresse (adresse, code_postal, ville, pays) est le domicile, pas la facturation. pays_passeport choisit le livret (FR, IL) et n’est pas recopié dans la nationalité. Plusieurs livrets : la délivrance, le lieu ou le nom de passeport exigent pays_passeport. L’autre nationalité reste. Le numéro n’est ni lu ni renvoyé. Aucun message.",
    input: {
      id: z.string().trim().describe("Identifiant du client, le titulaire"),
      prenoms: z.string().trim().max(120).optional().describe("Prénoms, dans l’ordre du passeport"),
      nom: z.string().trim().max(80).optional().describe("Nom de la fiche"),
      nom_passeport: z.string().trim().max(80).optional().describe("Nom imprimé sur le passeport, s’il diffère"),
      nom_usage: z.string().trim().max(80).optional().describe("Nom d’usage ou nom d’épouse"),
      date_naissance: z.string().trim().max(40).optional().describe("Naissance, AAAA-MM-JJ"),
      lieu_naissance: z.string().trim().max(120).optional().describe("Lieu de naissance"),
      sexe: z.string().trim().max(20).optional().describe("M, F ou X"),
      nationalite: z.string().trim().max(80).optional().describe("Nationalité, code ou nom. Pas le pays du passeport"),
      delivrance: z.string().trim().max(40).optional().describe("Délivrance du passeport, AAAA-MM-JJ"),
      adresse: z.string().trim().max(300).optional().describe("Adresse personnelle, pas la facturation"),
      code_postal: z.string().trim().max(20).optional().describe("Code postal du domicile"),
      ville: z.string().trim().max(80).optional().describe("Ville du domicile"),
      pays: z.string().trim().max(80).optional().describe("Pays du domicile"),
      pays_passeport: z.string().trim().max(80).optional().describe("Pays émetteur du livret à modifier. Pas la nationalité"),
    },
    run: (args) => updateHolderProfile(args),
  },
  {
    name: "definir_role_societe",
    write: true,
    description:
      "Pose le rôle du client sur sa société, comme la fiche agence. admin : wallet société, voit les carnets publiés de ses collaborateurs. membre : collaborateur, payeur_id est l’admin société qui paie (pas lui-même, pas un autre collaborateur). particulier : ni payeur ni plafond. droit_depense est le plafond en euros, vide pour l’effacer. Aucun message.",
    input: {
      id: z.string().trim().describe("Identifiant du client"),
      role: z.string().trim().describe("admin, membre ou particulier"),
      payeur_id: z.string().trim().max(80).optional().describe("Admin société qui paie, obligatoire pour un membre"),
      droit_depense: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Plafond personnel en euros. Vide : pas de plafond"),
    },
    run: (args) => setCompanyRole(args),
  },
  {
    name: "inviter_client",
    write: true,
    openWorld: true,
    description:
      "Crée l’accès à l’espace du client et envoie l’invitation, le même flux que le bouton de la fiche. L’e-mail part, et WhatsApp avec le même lien si le message part : le canal du lien suit. Rien ne part sans cet appel. Un accès déjà invité ou déjà ouvert n’est pas renvoyé. Le lien n’est pas renvoyé. Un compte de l’agence est refusé.",
    input: {
      id: z.string().trim().describe("Identifiant du client"),
    },
    run: (args) => inviteClientAccess(args),
  },
  {
    name: "ajouter_piece",
    write: true,
    openWorld: true,
    description:
      "Dépose une pièce (visa, ETA, passeport, assurance) dans l’espace client, comme le formulaire Pièces. client_id, ou dossier_id / reference. voyageur_id : voyageur du séjour, ou accompagnateur déjà lié au client sans dossier. Fichier en base64. Sur un séjour, la pièce du même type déjà liée à ce voyageur est remplacée : une ETA ne remplace pas un visa. Un passeport déjà enregistré est complété : le fichier et les champs fournis (numéro, expiration, pays) sont écrits ; délivrance, autorité, noms, naissance, nationalité, sexe et lieu restent. Le pays émetteur n’est pas recopié dans la nationalité. Par défaut, une formalité (visa ou ETA) liée au séjour envoie le WhatsApp « formalité prête » au client et au voyageur concerné s’il a un autre numéro. Une fiche qui a activé WhatsApp reçoit le modèle avec bouton ; sinon le modèle sans lien, une fois approuvé. Le client déjà prévenu n’est pas renvoyé. Un passeport, ou une pièce sans séjour, n’envoie rien. notifier false coupe l’envoi. carte_embarquement dépose un PDF sur le dossier, type carte d’embarquement, le même que le bouton Cartes d’embarquement : aucun WhatsApp. Le numéro n’est pas renvoyé.",
    input: {
      client_id: z.string().trim().max(80).optional().describe("Identifiant du client"),
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      voyageur_id: z
        .string()
        .trim()
        .max(80)
        .optional()
        .describe("Voyageur du dossier, ou accompagnateur déjà lié au client, sans dossier"),
      type: z.string().trim().max(40).describe("visa, eta, passeport, carte_identite, assurance, autre ou carte_embarquement"),
      pays: z.string().trim().max(80).optional().describe("Pays émetteur, code ou nom. Pas la nationalité"),
      numero: z.string().trim().max(40).optional().describe("Numéro de la pièce. Il n’est pas renvoyé"),
      expiration: z.string().trim().max(40).optional().describe("Expiration, AAAA-MM-JJ"),
      nom_fichier: z.string().trim().max(180).describe("Nom du fichier, ex. eta-il.pdf"),
      type_mime: z.string().trim().max(120).optional().describe("Type mime, ex. application/pdf"),
      contenu: z.string().trim().max(36_000_000).describe("Fichier en base64, 25 Mo maximum"),
      notifier: z
        .boolean()
        .optional()
        .describe("WhatsApp « formalité prête ». Vrai si omis. false pour ne pas écrire au client"),
    },
    run: (args) => addTravelPiece(args),
  },
  {
    name: "requalifier_piece",
    write: true,
    description:
      "Change le type d’une pièce déjà liée à son dossier. document_id et type : visa, eta, passeport, carte_identite, assurance, autre ou carte_embarquement. carte_embarquement aligne la pièce sur le PDF du dossier (type carte d’embarquement) que le bouton Cartes d’embarquement et notifier_carte_embarquement attendent. Le même identifiant est conservé, le fichier n’est pas recopié, aucun message ne part. Une pièce déjà sur le dossier ne se requalifie qu’en carte d’embarquement ou autre. Une pièce sans séjour n’est pas touchée. Le numéro n’est pas renvoyé.",
    input: {
      document_id: z.string().trim().max(80).describe("Identifiant de la pièce déjà déposée"),
      type: z
        .string()
        .trim()
        .max(40)
        .describe("visa, eta, passeport, carte_identite, assurance, autre ou carte_embarquement"),
    },
    run: (args) => requalifyPiece(args),
  },
  {
    name: "notifier_piece",
    write: true,
    openWorld: true,
    description:
      "Renvoie le WhatsApp « formalité prête » pour une pièce déjà déposée (visa ou ETA liée à un séjour). document_id. destinataires : tous (défaut), client ou voyageur. Le client déjà prévenu n’est pas renvoyé. Le voyageur d’un autre numéro reçoit le modèle avec bouton s’il a une fiche opt-in, sinon le modèle sans lien. Ne redépose pas le fichier.",
    input: {
      document_id: z.string().trim().max(80).describe("Identifiant de la pièce déjà dans l’espace"),
      destinataires: z
        .enum(["tous", "client", "voyageur"])
        .optional()
        .describe("tous par défaut. voyageur : seulement le voyageur de la pièce, sans renvoyer le client"),
    },
    run: (args) => notifyTravelPiece(args),
  },
  {
    name: "notifier_carte_embarquement",
    write: true,
    openWorld: true,
    description:
      "Envoie au client du dossier la carte d’embarquement déjà déposée. document_id : PDF de type carte d’embarquement. Le fichier part en en-tête Document du modèle carte_embarquement. Un PDF de plusieurs pages (une page par passager ; un bébé reste sur la page de l’adulte) part en un message par passager, avec le prénom, le vol, le trajet, l’horaire et le siège lus sur la page. Rien n’est inventé. Si la lecture échoue : prenom, vol, trajet, date_heure, siege, ou passagers (mêmes champs, nom facultatif). Un passager déjà prévenu ne repart pas. Sans modèle approuvé par Meta, rien ne part et la réponse décrit le modèle à soumettre. Le numéro de pièce n’est pas renvoyé.",
    input: {
      document_id: z.string().trim().max(80).describe("Identifiant de la carte d’embarquement déjà sur le dossier"),
      prenom: z.string().trim().max(80).optional().describe("Prénom, si la lecture du PDF a échoué"),
      nom: z.string().trim().max(80).optional().describe("Nom, facultatif, si la lecture du PDF a échoué"),
      vol: z.string().trim().max(40).optional().describe("Vol, si la lecture du PDF a échoué"),
      trajet: z.string().trim().max(80).optional().describe("Trajet, si la lecture du PDF a échoué"),
      date_heure: z.string().trim().max(60).optional().describe("Date et heure de départ, si la lecture du PDF a échoué"),
      siege: z.string().trim().max(12).optional().describe("Siège, si la lecture du PDF a échoué"),
      passagers: z
        .array(
          z.object({
            prenom: z.string().trim().max(80),
            nom: z.string().trim().max(80).optional(),
            vol: z.string().trim().max(40),
            trajet: z.string().trim().max(80),
            date_heure: z.string().trim().max(60),
            siege: z.string().trim().max(12),
          })
        )
        .max(9)
        .optional()
        .describe("Un passager par page, si la lecture du PDF a échoué. Rien n’est inventé."),
    },
    run: (args) => notifyBoardingPass(args),
  },
  {
    name: "creer_dossier",
    write: true,
    description:
      "Crée un dossier pour un client déjà en fiche. Destination, dates, notes. titre est facultatif : sans titre, le nom du séjour est la destination (la ville, pas le nom de l’hôtel). Une correspondance aérienne (moins de 24 h, sans hôtel) n’est pas la destination. Le titre et la destination ne citent pas le domicile (ville de départ, retour d’un aller-retour, ville de la fiche). Un aller simple vers une ville où l’on reste garde cette ville. Aller-retour = ville où l’on fait demi-tour. La société de la fiche est facturée par défaut : l’unique société, ou la première s’il y en a plusieurs. societe_id en choisit une autre. particulier : true laisse le séjour particulier. Sans société sur la fiche, le séjour reste particulier. facturer_societe sans société est une erreur. L’état est En préparation : le client ne le voit pas. Aucune invitation, aucun message. Renvoie l’identifiant et la référence TB-AAAA-NNNN.",
    input: {
      client_id: z.string().trim().describe("Identifiant du client"),
      titre: z
        .string()
        .trim()
        .max(200)
        .optional()
        .describe("Titre du séjour. Sans titre, la destination devient le nom"),
      destination: z.string().trim().max(200).optional().describe("Destination"),
      date_depart: z.string().trim().max(40).optional().describe("Départ, AAAA-MM-JJ"),
      date_retour: z.string().trim().max(40).optional().describe("Retour, AAAA-MM-JJ"),
      notes: z.string().trim().max(5000).optional().describe("Note visible par le client une fois le séjour montré"),
      notes_internes: z.string().trim().max(5000).optional().describe("Note interne, jamais côté client"),
      devise: z.string().trim().max(12).optional().describe("Devise du dossier, 3 lettres. EUR si omise. THB reste THB"),
      societe_id: z.string().trim().max(80).optional().describe("Société de facturation déjà sur la fiche"),
      particulier: z
        .boolean()
        .optional()
        .describe("Séjour particulier, même si la fiche a une société. Sinon la société est facturée"),
      facturer_societe: z
        .boolean()
        .optional()
        .describe("Demande explicite de facturer la société. Erreur s’il n’y en a aucune"),
    },
    run: (args) => createDossier(args),
  },
  {
    name: "ajouter_voyageur",
    write: true,
    description:
      "Ajoute un voyageur au dossier et à la liste du client. La correspondance est le prénom (le début des prénoms), le nom de naissance ou d’usage, et la date de naissance. Jamais le seul nom de famille. Une autre date, ou aucun compagnon exact, crée un accompagnant : on ne met pas à jour un autre voyageur sans compagnon_id. Le nom d’usage et le premier prénom rattachent un compagnon déjà en fiche quand la date concorde (Victoria Boukris = Victoria Marie Tetard, nom d’usage Boukris). Plusieurs homonymes : celui qui a un passeport, sinon il faut compagnon_id. Civilité, prénoms, nom, naissance, nationalité, téléphone. Le passeport est enregistré comme sur la fiche. Le numéro n’est pas renvoyé. L’e-mail n’ouvre pas de compte et n’est pas enregistré. Aucun message.",
    input: {
      client_id: z.string().trim().max(80).optional().describe("Identifiant du client"),
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      compagnon_id: z.string().trim().max(80).optional().describe("Compagnon déjà en fiche. Prénoms et nom deviennent facultatifs"),
      prenoms: z.string().trim().optional().describe("Prénoms. Le premier suffit pour reconnaître un compagnon"),
      nom: z.string().trim().optional().describe("Nom de naissance ou nom d’usage"),
      civilite: z.string().trim().max(40).optional().describe("Monsieur, Madame ou autre"),
      sexe: z.string().trim().max(20).optional().describe("M, F ou X"),
      date_naissance: z.string().trim().max(40).optional().describe("Naissance, AAAA-MM-JJ"),
      lieu_naissance: z.string().trim().max(120).optional().describe("Lieu de naissance"),
      nationalite: z.string().trim().max(80).optional().describe("Nationalité, code ou nom. Pas le pays du passeport"),
      telephone: z.string().trim().max(40).optional().describe("Téléphone"),
      email: z.string().trim().max(200).optional().describe("E-mail, contrôlé mais non enregistré"),
      passeport: z
        .object({
          numero: z.string().trim().max(40).optional().describe("Numéro. Il n’est pas renvoyé"),
          delivrance: z.string().trim().max(40).optional().describe("Délivrance, AAAA-MM-JJ"),
          expiration: z.string().trim().max(40).optional().describe("Expiration, AAAA-MM-JJ"),
          autorite: z.string().trim().max(160).optional().describe("Autorité de délivrance"),
          pays: z.string().trim().max(80).optional().describe("Pays de délivrance, pas la nationalité"),
        })
        .optional()
        .describe("Passeport, enregistré comme sur la fiche"),
    },
    run: (args) => addVoyageur(args),
  },
  {
    name: "modifier_voyageur",
    write: true,
    description:
      "Modifie un voyageur déjà sur le dossier, par voyageur_id (crm_booking_travelers, celui de fiche_dossier). Téléphone, e-mail, date de naissance, sexe, nationalité, prénoms, nom, nom d’usage, lien, programme de fidélité. Ce n’est pas compagnon_id : ajouter_voyageur refuse un voyageur_id. L’e-mail d’un accompagnateur est un contact, il n’ouvre pas de compte. L’e-mail du titulaire ne change pas ici (mettre_a_jour_client). Aucun message, aucun numéro de passeport.",
    input: {
      voyageur_id: z.string().trim().describe("Identifiant du voyageur sur le séjour"),
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier, pour vérifier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier, pour vérifier"),
      prenoms: z.string().trim().max(120).optional().describe("Prénoms"),
      nom: z.string().trim().max(80).optional().describe("Nom"),
      nom_usage: z.string().trim().max(80).optional().describe("Nom d’usage"),
      lien: z.string().trim().max(40).optional().describe("Lien avec le titulaire"),
      civilite: z.string().trim().max(40).optional().describe("Monsieur, Madame ou autre"),
      sexe: z.string().trim().max(20).optional().describe("M, F ou X"),
      date_naissance: z.string().trim().max(40).optional().describe("Naissance, AAAA-MM-JJ"),
      nationalite: z.string().trim().max(80).optional().describe("Nationalité, code ou nom"),
      telephone: z.string().trim().max(40).optional().describe("Téléphone"),
      email: z.string().trim().max(200).optional().describe("E-mail de contact d’un accompagnateur. Pas celui du titulaire"),
      programme: z.string().trim().max(40).optional().describe("Programme : Flying Blue, Marriott Bonvoy, ALL Accor…"),
      numero_fidelite: z.string().trim().max(40).optional().describe("Numéro du programme. Il n’est pas un numéro de passeport"),
    },
    run: (args) => updateVoyageur(args),
  },
  {
    name: "retirer_voyageur",
    write: true,
    description:
      "Retire un voyageur du séjour, et des cartes qui le citent. Le frais de billeterie suit le nombre de voyageurs. Le compagnon reste sur la fiche. Aucun message.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      voyageur_id: z.string().trim().max(80).optional().describe("Identifiant du voyageur sur le séjour"),
      compagnon_id: z.string().trim().max(80).optional().describe("Compagnon à retirer de ce séjour"),
    },
    run: (args) => removeVoyageur(args),
  },
  {
    name: "fusionner_compagnon",
    write: true,
    description:
      "Reprend les séjours d’un compagnon sans pièce sur le compagnon conservé, puis retire le doublon. Un compagnon qui a un passeport ou une autre pièce n’est pas retiré. Aucun message.",
    input: {
      garder_id: z.string().trim().describe("Compagnon conservé"),
      retirer_id: z.string().trim().describe("Doublon sans pièce"),
    },
    run: (args) => mergeCompagnon(args),
  },
  {
    name: "ajouter_vol",
    write: true,
    description:
      "Ajoute une carte vol au dossier, comme dans l’agence : compagnie, numéro, aéroports, horaires locaux, cabine, PNR, voyageurs, prix. Un prix à zéro est accepté. sans_frais retire les frais de billeterie (ils ne reviennent pas). Un vol à 0 €, sans autre vol payant sur le dossier, ne crée pas ces frais. Une correspondance (arrivée et départ en avion en moins de 24 h, sans hôtel ni autre service sur place) sort du titre et d’une destination qui n’est qu’une liste de villes. Le domicile (départ, retour, ville de la fiche) en sort aussi. Une nuit d’hôtel garde la ville, sauf si c’est seulement le domicile. Un aller simple vers une ville où l’on reste la garde. Une devise différente de celle du dossier reste le prix du document, sans conversion. Le séjour caché ne débite pas. Aucun message.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      compagnie: z.string().trim().describe("Compagnie"),
      numero: z.string().trim().max(20).optional().describe("Numéro de vol"),
      depart_iata: z.string().trim().describe("Aéroport de départ, 3 lettres"),
      arrivee_iata: z.string().trim().describe("Aéroport d’arrivée, 3 lettres"),
      ville_depart: z.string().trim().max(80).optional().describe("Ville de départ, avec la ville d’arrivée"),
      ville_arrivee: z.string().trim().max(80).optional().describe("Ville d’arrivée, avec la ville de départ"),
      depart: z.string().trim().describe("Décollage local, AAAA-MM-JJTHH:mm"),
      arrivee: z.string().trim().describe("Arrivée locale, AAAA-MM-JJTHH:mm"),
      decalage_jour: z.number().optional().describe("Jours à ajouter si l’arrivée est encore le jour du départ, 0 à 3"),
      cabine: z.string().trim().max(80).optional().describe("Cabine"),
      pnr: z.string().trim().max(40).optional().describe("PNR"),
      voyageurs: z.array(z.string()).optional().describe("Identifiants des voyageurs du dossier"),
      prix: z.union([z.number(), z.string()]).optional().describe(PRIX_BILLET),
      prix_total: z.union([z.number(), z.string()]).optional().describe(PRIX_GROUPE),
      sans_frais: z
        .boolean()
        .optional()
        .describe("Pas de frais de billeterie sur ce dossier. La ligne ne revient pas"),
      devise: z.string().trim().max(12).optional().describe("Devise du prix. Celle du dossier si omise"),
      fournisseur: z.string().trim().max(120).optional().describe("Fournisseur"),
    },
    run: (args) => addVol(args),
  },
  {
    name: "modifier_vol",
    write: true,
    description:
      "Corrige une carte vol déjà au dossier : aéroports, horaires locaux, cabine, PNR, voyageurs, prix. voyageur_ids remplace les passagers de la carte (les voyageur_id de fiche_dossier) et ne change pas le prix. Un prix à zéro est accepté. sans_frais retire les frais de billeterie. Quand depart_iata et arrivee_iata sont tous les deux connus, l’avertissement sur les codes IATA non imprimés est retiré. effacer_avertissement retire toute lecture douteuse. L’heure saisie reste l’heure de l’aéroport ; le fuseau (Europe/Paris, Asia/Bangkok) est enregistré sur la carte. prix est un billet. prix_total est le total du groupe, gardé au centime, sans prix unitaire imposé. devise omise garde la devise déjà sur la carte (euro par défaut), pas la devise du document fournisseur. Le séjour caché ne débite pas. Aucun message.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      carte_id: z.string().trim().describe("Identifiant de la carte vol"),
      compagnie: z.string().trim().max(120).optional().describe("Compagnie"),
      numero: z.string().trim().max(20).optional().describe("Numéro de vol"),
      depart_iata: z.string().trim().max(8).optional().describe("Aéroport de départ, 3 lettres"),
      arrivee_iata: z.string().trim().max(8).optional().describe("Aéroport d’arrivée, 3 lettres"),
      ville_depart: z.string().trim().max(80).optional().describe("Ville de départ, avec la ville d’arrivée"),
      ville_arrivee: z.string().trim().max(80).optional().describe("Ville d’arrivée, avec la ville de départ"),
      depart: z.string().trim().max(40).optional().describe("Décollage local, AAAA-MM-JJTHH:mm"),
      arrivee: z.string().trim().max(40).optional().describe("Arrivée locale, AAAA-MM-JJTHH:mm"),
      decalage_jour: z.number().optional().describe("Jours à ajouter si l’arrivée est encore le jour du départ, 0 à 3"),
      cabine: z.string().trim().max(80).optional().describe("Cabine"),
      pnr: z.string().trim().max(40).optional().describe("PNR"),
      voyageur_ids: z
        .array(z.string())
        .optional()
        .describe("Identifiants des voyageurs du dossier. Remplace les passagers de la carte"),
      voyageurs: z.array(z.string()).optional().describe("Même liste que voyageur_ids. Omis : les billets déjà sur la carte restent"),
      prix: z.union([z.number(), z.string()]).optional().describe(PRIX_BILLET),
      prix_total: z.union([z.number(), z.string()]).optional().describe(PRIX_GROUPE),
      sans_frais: z
        .boolean()
        .optional()
        .describe("Pas de frais de billeterie sur ce dossier. La ligne ne revient pas"),
      devise: z.string().trim().max(12).optional().describe("Devise du prix. Celle du dossier si omise"),
      fournisseur: z.string().trim().max(120).optional().describe("Fournisseur"),
      effacer_avertissement: z
        .boolean()
        .optional()
        .describe("Retire la lecture douteuse de cette carte, y compris l’avertissement sur les codes IATA"),
    },
    run: (args) => updateVol(args),
  },
  {
    name: "retirer_carte",
    write: true,
    description:
      "Retire une carte du dossier. Les frais de billeterie ne sont pas recréés, et leur débit au grand livre est annulé. Le séjour caché ne débite pas. Aucun message.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      carte_id: z.string().trim().describe("Identifiant de la carte"),
    },
    run: (args) => removeCarte(args),
  },
  {
    name: "definir_visibilite_carte",
    write: true,
    description:
      "Montre ou cache une seule carte du dossier (vol, hôtel, frais ou autre prestation), et peut cocher ou décocher « Inclure dans les transactions ». visible vrai la montre au client, faux la cache ; omis, la visibilité ne change pas. inclure_transactions vrai crée ou rétablit le débit, faux l’annule, sur la même ligne. Le prix est le total exact si la carte porte un total de groupe. Ne publie pas le carnet et n’envoie rien : ni e-mail, ni WhatsApp. Sur un carnet déjà montré, un brouillon est préparé ; l’agence l’envoie en un clic. Le grand livre est recalculé comme à l’enregistrement d’une carte dans l’agence, sans doublon. Le séjour caché ne débite pas. Une carte non incluse dans les transactions ne crée pas de ligne.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      carte_id: z.string().trim().describe("Identifiant de la carte"),
      visible: z.boolean().optional().describe("vrai : montrée au client. faux : cachée. Omis : la visibilité ne change pas"),
      inclure_transactions: z
        .boolean()
        .optional()
        .describe("Case « Inclure dans les transactions ». vrai coche, faux décoche. Omis : la case ne change pas"),
    },
    run: (args) => setCarteVisibilite(args),
  },
  {
    name: "preparer_message_carnet",
    write: true,
    description:
      "Prépare le message WhatsApp d’un dossier déjà montré au client : les prestations ajoutées au carnet, en une phrase, avec le lien. Plusieurs prestations tiennent dans un seul brouillon. carte_ids limite la phrase à ces cartes, sinon toutes les prestations déjà montrées. Rien n’est envoyé : l’agence l’envoie en un clic. Pas de prix, pas de commission, pas de fournisseur.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      carte_ids: z
        .array(z.string())
        .optional()
        .describe("Cartes à citer. Omis : les prestations déjà montrées dans le carnet"),
    },
    run: (args) => prepareCarnetMessage(args),
  },
  {
    name: "ajouter_hotel",
    write: true,
    description:
      "Ajoute une carte hôtel : nom, ville, pays, dates, chambre, pension, inclus, confirmation, fournisseur, prix (THB compris), adresse, heures d’arrivée et de départ, photos https et texte d’annulation s’ils sont indiqués. Le séjour caché ne débite pas. Aucun message.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      nom: z.string().trim().describe("Nom de l’hôtel"),
      ville: z.string().trim().max(80).optional().describe("Ville"),
      pays: z.string().trim().max(80).optional().describe("Pays"),
      arrivee: z.string().trim().describe("Arrivée, AAAA-MM-JJ"),
      depart: z.string().trim().describe("Départ, AAAA-MM-JJ"),
      chambre: z.string().trim().max(120).optional().describe("Type de chambre"),
      pension: z.string().trim().max(120).optional().describe("Pension"),
      inclus: z.union([z.string(), z.array(z.string())]).optional().describe("Inclus, une ligne ou une liste"),
      confirmation: z.string().trim().max(80).optional().describe("Référence de confirmation"),
      fournisseur: z.string().trim().max(120).optional().describe("Fournisseur, ex. Little Emperors"),
      prix: z.union([z.number(), z.string()]).optional().describe("Prix du séjour hôtel"),
      devise: z.string().trim().max(12).optional().describe("Devise du prix. THB reste THB"),
      annulation: z.string().trim().max(2000).optional().describe("Conditions d’annulation, seulement si elles sont connues"),
      adresse: z.string().trim().max(240).optional().describe("Adresse de l’hôtel"),
      heure_arrivee: z.string().trim().max(5).optional().describe("Heure d’arrivée HH:mm, seulement si elle est connue"),
      heure_depart: z.string().trim().max(5).optional().describe("Heure de départ HH:mm, seulement si elle est connue"),
      photos: z
        .array(
          z.union([
            z.string().trim().max(500),
            z.object({
              url: z.string().trim().max(500).describe("Adresse https de la photo"),
              legende: z.string().trim().max(120).optional().describe("Légende"),
            }),
          ])
        )
        .max(8)
        .optional()
        .describe("Jusqu’à huit photos https de la chambre ou de l’hôtel"),
      voyageurs: z.array(z.string()).optional().describe("Identifiants des voyageurs du dossier"),
    },
    run: (args) => addHotel(args),
  },
  {
    name: "modifier_hotel",
    write: true,
    description:
      "Corrige une carte hôtel déjà au dossier : hôtel, ville, dates, chambres, régime, confirmations, voyageurs, coût net, conditions d’annulation, avantages, notes. Le prix de vente ne change que si prix est indiqué, y compris égal au coût net, sans marge. Un coût net en devise (MAD) garde son équivalent en euros ; aucun taux n’est inventé. reference_le remplit la carte depuis la réservation Little Emperors, sans changer le prix de vente. Le séjour caché ne débite pas. Aucun message.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      carte_id: z.string().trim().describe("Identifiant de la carte hôtel"),
      nom: z.string().trim().max(160).optional().describe("Nom de l’hôtel"),
      ville: z.string().trim().max(80).optional().describe("Ville"),
      pays: z.string().trim().max(80).optional().describe("Pays"),
      adresse: z.string().trim().max(240).optional().describe("Adresse"),
      arrivee: z.string().trim().max(10).optional().describe("Arrivée, AAAA-MM-JJ"),
      depart: z.string().trim().max(10).optional().describe("Départ, AAAA-MM-JJ"),
      chambre: z.string().trim().max(120).optional().describe("Chambre, s’il n’y en a qu’une"),
      chambres: z
        .array(
          z.union([
            z.string().trim().max(120),
            z.object({
              type: z.string().trim().max(120).optional().describe("Type de chambre"),
              regime: z.string().trim().max(120).optional().describe("Régime de cette chambre"),
              confirmation: z.string().trim().max(80).optional().describe("Confirmation hôtel de cette chambre"),
              voyageurs: z.string().trim().max(240).optional().describe("Voyageurs de cette chambre"),
            }),
          ])
        )
        .max(8)
        .optional()
        .describe("Chambres de la carte"),
      pension: z.string().trim().max(120).optional().describe("Régime, ex. petit-déjeuner"),
      regime: z.string().trim().max(120).optional().describe("Régime, comme pension"),
      confirmation: z.string().trim().max(80).optional().describe("Confirmation. Le numéro déjà sur la carte reste"),
      confirmations: z.array(z.string().trim().max(80)).max(8).optional().describe("Confirmations hôtel"),
      voyageurs: z.array(z.string()).optional().describe("Identifiants des voyageurs du dossier"),
      fournisseur: z.string().trim().max(120).optional().describe("Fournisseur"),
      prix_net: z.union([z.number(), z.string()]).optional().describe("Coût net fournisseur. Ce n’est pas le prix de vente"),
      devise_net: z.string().trim().max(12).optional().describe("Devise du coût net, ex. MAD. EUR si omise"),
      prix_net_eur: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Équivalent en euros du coût net, s’il est connu. Aucun taux n’est inventé"),
      prix: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Prix de vente client. Absent : le prix de vente ne change pas. Peut être égal au coût net, sans marge. Zéro est accepté"),
      devise: z.string().trim().max(12).optional().describe("Devise du prix de vente. Celle du dossier si omise"),
      annulation: z.union([z.string(), z.array(z.string())]).optional().describe("Conditions d’annulation, seulement si elles sont connues"),
      avantages: z.union([z.string(), z.array(z.string())]).optional().describe("Avantages, une ligne ou une liste"),
      notes: z.string().trim().max(2000).optional().describe("Notes de la carte"),
      reference_le: z
        .string()
        .trim()
        .max(80)
        .optional()
        .describe("Référence Little Emperors. Remplit la carte depuis cette réservation, sans changer le prix de vente"),
    },
    run: (args) => updateHotel(args),
  },
  {
    name: "ajouter_accueil_vip",
    write: true,
    description:
      "Ajoute un accueil VIP collé à un vol du dossier. Chaque étape (arrivée, départ) exige le vol correspondant : l’aéroport et l’heure sont ceux de ce vol, et suivent le vol s’il change. Un aller-retour se relie à deux vols. Le prix est facultatif. Le séjour caché ne débite pas. Aucun message.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      fournisseur: z.string().trim().describe("Prestataire, ex. Coral Thailand"),
      type: z.string().trim().describe("arrivée, départ ou aller-retour"),
      vol_arrivee: z.string().trim().max(80).optional().describe("Vol d’arrivée du dossier. Obligatoire pour une arrivée ou un aller-retour"),
      vol_depart: z.string().trim().max(80).optional().describe("Vol de départ du dossier. Obligatoire pour un départ ou un aller-retour"),
      passagers: z.union([z.number(), z.string()]).describe("Nombre de voyageurs"),
      bagages: z.union([z.number(), z.string()]).describe("Nombre de bagages"),
      hotline: z.string().trim().max(40).optional().describe("Téléphone du prestataire"),
      email: z.string().trim().max(200).optional().describe("E-mail du prestataire"),
      confirmation: z.string().trim().max(80).optional().describe("Référence de réservation"),
      informations: z.string().trim().describe("Texte à montrer au client, listes à puces conservées"),
      prix: z.union([z.number(), z.string()]).optional().describe("Prix vendu, facultatif"),
      devise: z.string().trim().max(12).optional().describe("Devise du prix. Celle du dossier si omise"),
      document_id: z.string().trim().max(80).optional().describe("Confirmation déjà déposée sur le dossier"),
    },
    run: (args) => addAccueilVip(args),
  },
  {
    name: "enregistrement_en_ligne",
    write: true,
    description:
      "Enregistrement en ligne d’un vol du dossier. Sans statut : lecture, pour vérifier avant de proposer un enregistrement (statut, heure d’ouverture, qui l’a fait, alerte si c’est ouvert et pas fait). Avec carte_id et statut : met à jour. Statuts : à faire, ouvert, en cours, fait, cartes reçues, envoyées au client. Une carte d’embarquement déjà au dossier passe à cartes reçues, un envoi déjà fait reste envoyées. L’auteur est le bot Enregistrement en ligne. Pas de passeport, pas de MRZ.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      carte_id: z.string().trim().max(80).optional().describe("Identifiant de la carte vol. Obligatoire pour changer le statut"),
      statut: z
        .string()
        .trim()
        .max(80)
        .optional()
        .describe("à faire, ouvert, en cours, fait, cartes reçues ou envoyées au client. Omis : lecture seule"),
    },
    run: (args) => enregistrementEnLigne(args),
  },
  {
    name: "envoyer_releve",
    write: true,
    openWorld: true,
    description:
      "Envoie le relevé de compte du client, comme le bouton admin. customer_id. canal whatsapp par défaut. L’e-mail n’est pas ouvert. Le PDF est le même, déposé au coffre, puis envoyé sur WhatsApp : hors des 24 heures, le modèle approuvé TWILIO_CONTENT_RELEVE (en-tête Document) ; dans la fenêtre, le message de session. Chaque essai est écrit dans le journal, y compris un échec. L’auteur est le jeton, pas un collaborateur. La réponse donne twilio_sid et statut. Un second envoi réussi pour le même client dans les cinq minutes est refusé, sauf force.",
    input: {
      customer_id: z.string().trim().max(80).describe("Identifiant du client"),
      channel: z.enum(["whatsapp", "email"]).optional().describe("whatsapp par défaut. email est refusé : ce canal n’est pas ouvert"),
      force: z.boolean().optional().describe("Renvoie même si un relevé réussi est parti dans les cinq dernières minutes"),
    },
    run: (args) => envoyerReleve(args),
  },
  {
    name: "sejours_restaurants",
    description:
      "Dossiers en séjour ce soir, heure locale : hôtel, ville, dates, voyageurs, WhatsApp du client (téléphone et s’il peut recevoir un message). couverts vaut toujours 2. Lecture seule. Pas de passeport.",
    run: (args) => sejoursRestaurants(args),
  },
  {
    name: "list_restaurants",
    description:
      "Catalogue restaurants. ville : les fiches de cette ville (pour vérifier qu’une maison n’existe pas déjà avant create_restaurant). restaurant_id : une fiche. q : recherche sur le nom ou la ville. statut : actif, a_valider ou exclu. Chaque fiche porte fiche_complete et champs_manquants (photo de la salle, photo du plat, description, fourchette, lien), selection (pourquoi elle est hors sélection, sinon null) et tous les champs de create_restaurant. Lecture seule. Pas de numéro de carte.",
    input: {
      ville: z.string().trim().max(80).optional().describe("Ville. Seule : filtre la liste"),
      restaurant_id: z.string().trim().max(80).optional().describe("Identifiant : lit une fiche"),
      q: z.string().trim().max(80).optional().describe("Recherche sur le nom ou la ville"),
      statut: z.string().trim().max(20).optional().describe("actif, a_valider ou exclu"),
    },
    run: (args) => listRestaurantsTool(args),
  },
  {
    name: "create_restaurant",
    write: true,
    description:
      "Crée une fiche restaurant. nom et ville obligatoires. Une maison du même nom dans la même ville est refusée (la fiche existante est citée) sauf forcer true. Statut a_valider par défaut : la fiche reste hors sélection tant que l’agence ne l’active pas. categories : la première est la catégorie principale (pizzeria, japonais, francais, incontournable, italien, festif, enfants, terrasse…). Étoilé, gastronomique et prépaiement obligatoire sont exclus et ne peuvent pas être choisis. La réponse porte fiche_complete et champs_manquants. Pas de numéro de carte : empreinte_carte est seulement oui ou non.",
    input: {
      nom: z.string().trim().max(200).describe("Nom"),
      ville: z.string().trim().max(80).describe("Ville"),
      forcer: z.boolean().optional().describe("Crée malgré une fiche du même nom dans la ville"),
      ...RESTAURANT_FIELDS,
    },
    run: (args) => createRestaurantTool(args),
  },
  {
    name: "update_restaurant",
    write: true,
    description:
      "Met à jour une fiche restaurant (restaurant_id). Seuls les champs indiqués changent. statut actif active la fiche (elle entre dans la sélection), a_valider la remet en relecture, exclu la sort avec un motif. Mêmes champs que create_restaurant. La réponse porte fiche_complete et champs_manquants. Pas de numéro de carte.",
    input: {
      restaurant_id: z.string().trim().max(80).describe("Identifiant de la fiche"),
      nom: z.string().trim().max(200).optional().describe("Nom"),
      ville: z.string().trim().max(80).optional().describe("Ville"),
      ...RESTAURANT_FIELDS,
    },
    run: (args) => updateRestaurantTool(args),
  },
  {
    name: "tables_restaurant",
    write: true,
    description:
      "Crée ou met à jour une table du soir (A ou B) : restaurant, heure, confirmation, compte (défaut concierge@travelba.fr), statut. Les couverts sont fixés à 2. Garantie : quatre derniers chiffres seulement, jamais le numéro complet. statut annulee ou annuler true passe la table en annulée, avec l’heure et les frais. Un gastronomique, un étoilé ou un prépaiement est refusé.",
    input: {
      dossier_id: z.string().trim().max(80).optional(),
      reference: z.string().trim().max(80).optional(),
      date: z.string().trim().max(20).describe("Soir, aaaa-mm-jj"),
      table: z.string().trim().max(2).describe("A ou B"),
      restaurant_id: z.string().trim().max(80).optional(),
      heure: z.string().trim().max(8).optional(),
      couverts: z.union([z.number(), z.string()]).optional().describe("Toujours 2. Un autre nombre est refusé"),
      confirmation: z.string().trim().max(80).optional(),
      compte: z.string().trim().max(200).optional().describe("Défaut concierge@travelba.fr"),
      garantie: z.string().trim().max(8).optional().describe("Quatre derniers chiffres. Jamais le numéro complet"),
      statut: z.string().trim().max(40).optional().describe("a_reserver, reservee, proposee, choisie, a_annuler, annulee, echec"),
      annuler: z.union([z.boolean(), z.string()]).optional().describe("Passe la table en annulée"),
      frais: z.union([z.number(), z.string()]).optional().describe("Frais d’annulation en euros"),
    },
    run: (args) => tablesRestaurant(args),
  },
  {
    name: "choix_restaurant",
    description:
      "Choix du client et envoi de 16 h : pré-message, puis une fiche par restaurant. J’accepte sur l’une passe l’autre à annuler. Lecture seule. date limite à un soir.",
    input: {
      dossier_id: z.string().trim().max(80).optional(),
      reference: z.string().trim().max(80).optional(),
      date: z.string().trim().max(20).optional().describe("Soir aaaa-mm-jj. Omis : tous les soirs du dossier"),
    },
    run: (args) => choixRestaurant(args),
  },
  {
    name: "create_restaurant_whatsapp_templates",
    write: true,
    openWorld: true,
    description:
      "Dépose chez Twilio, depuis le serveur et avec ses identifiants, les trois modèles WhatsApp restaurants : restaurant_selection (pré-message), restaurant_proposition (carrousel salle et plat) et restaurant_proposition_carte (avec la carte). Mêmes textes que scripts/create-restaurant-whatsapp-templates.ts. Chaque modèle est soumis à Meta en catégorie UTILITY. Idempotent : un modèle qui porte déjà ce nom est repris, pas dupliqué. Renvoie pour chacun le nom, le content_sid (HX…) et le statut d’approbation. N’envoie aucun WhatsApp. Ne renvoie aucun secret. Le cron utilise un modèle approuvé dès la variable TWILIO_CONTENT_RESTAURANT_* posée, ou le retrouve par son nom si elle ne l’est pas.",
    run: (args) => createRestaurantWhatsappTemplates(args),
  },
  {
    name: "get_restaurant_whatsapp_templates_status",
    openWorld: true,
    description:
      "Statut d’approbation Meta des trois modèles WhatsApp restaurants (restaurant_selection, restaurant_proposition, restaurant_proposition_carte) : nom, content_sid, statut (approved, pending, rejected, unsubmitted, absent), source (variable ou retrouvé par son nom chez Twilio), motif de refus. pret vrai quand les trois sont approuvés. Lecture seule, n’envoie aucun message, ne crée rien.",
    run: (args) => getRestaurantWhatsappTemplatesStatus(args),
  },
];

export function registerTravelbaTools(server: McpServer) {
  for (const tool of MCP_TOOLS) {
    const input = "input" in tool ? tool.input : undefined;
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: input,
        annotations: {
          readOnlyHint: tool.write !== true,
          destructiveHint: false,
          openWorldHint: tool.openWorld === true,
        },
      },
      async (args) =>
        guard(
          tool.name,
          tool.write === true,
          keepPieceNumber(tool),
          keepSignedUrl(tool),
          keepCardSecrets(tool),
          () => tool.run((args ?? {}) as ToolArgs)
        )
    );
  }
}
