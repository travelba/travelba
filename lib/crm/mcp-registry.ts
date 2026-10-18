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
import { addTravelPiece, notifyTravelPiece } from "@/lib/crm/mcp-piece";
import { addHotel, addVol, addVoyageur, createDossier, updateVol } from "@/lib/crm/mcp-trip";
import { McpReadError, readPasseportVoyageur, readScanPasseport } from "@/lib/crm/mcp-passport";
import { createPliantCard, readPliantCard } from "@/lib/crm/mcp-pliant-card";
import { redactMcp } from "@/lib/crm/mcp-redact";

/** Au-delà, Grok n’arrive plus à garder tous les outils en tête. */
export const MCP_TOOL_CAP = 40;

const COMPANY_FIELDS = {
  raison_sociale: z.string().trim().max(300).optional().describe("Raison sociale"),
  siret: z.string().trim().max(40).optional().describe("SIRET, 14 chiffres. Même SIRET : la société existante est mise à jour"),
  tva: z.string().trim().max(40).optional().describe("Numéro de TVA"),
  adresse: z.string().trim().max(300).optional().describe("Adresse de facturation"),
  code_postal: z.string().trim().max(20).optional().describe("Code postal de facturation"),
  ville: z.string().trim().max(80).optional().describe("Ville de facturation"),
  pays: z.string().trim().max(80).optional().describe("Pays de facturation"),
};

const PRIX_BILLET = "Prix d’un billet (unitaire). Le séjour le multiplie par le nombre de billets.";
const PRIX_GROUPE =
  "Total du groupe pour cette carte. Unitaire = total / billets. Un aller-retour au même prix n’est compté qu’une fois ; deux prix différents comptent tous les deux.";

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
      "À faire aujourd’hui : mails, Little Emperors, formalités, services, départs, pièces, soldes Revolut, Stripe et Pliant. Lecture seule.",
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
      "Un dossier : cartes (villes puis code aéroport), voyageurs, état, société facturée (societe, paye_par). id ou reference. Pas les contacts d’hôtel.",
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
      "Comptabilité d’un voyage : ventes, coûts Pliant et Revolut rattachés, marge par ligne, facture MB3M, sorties proposées. id ou reference. Lecture seule, jamais montré au client.",
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
      "Mails fournisseurs en attente. L’identifiant sert à traiter_email : refuser, ou rattacher au dossier désigné.",
    run: () => readEmailsEnAttente(),
  },
  {
    name: "little_emperors_en_attente",
    description: "Séjours Little Emperors sans dossier. Ne crée rien.",
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
      "Crée une carte virtuelle Pliant sur le dossier (dossier_id ou reference), au nom indiqué (ex. Visa). Plafond obligatoire, en euros par défaut, une transaction de ce montant par défaut (usage unique, 20 au plus). La carte accepte tous les commerçants et toutes les devises. Elle est rattachée au dossier pour les débits. Ne renvoie pas le numéro : lire_carte_pliant. Réservé à l’assistant autorisé.",
    input: {
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier, ex. TB-2026-0082"),
      nom: z.string().trim().max(40).describe("Nom de la carte, ex. Visa"),
      plafond: z.union([z.number(), z.string()]).optional().describe("Plafond, ex. 10. Sans plafond, la carte n’est pas créée"),
      devise: z.string().trim().max(8).optional().describe("Devise du plafond, 3 lettres. Défaut EUR"),
      transactions: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Nombre de paiements. Défaut 1, maximum 20"),
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
      "Met à jour les notes ou les dates d’un dossier, puis le grand livre. L’état du dossier est En préparation, Visible ou Archivée.",
    input: {
      id: z.string().trim().optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      notes_client: z.string().max(5000).optional().describe("Note visible par le client"),
      notes_internes: z.string().max(5000).optional().describe("Note interne à l’agence"),
      date_depart: z.string().max(40).optional().describe("Date de départ, AAAA-MM-JJ, vide pour effacer"),
      date_retour: z.string().max(40).optional().describe("Date de retour, AAAA-MM-JJ, vide pour effacer"),
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
      "Sort un e-mail de la file. refuser le classe sans dossier. rattacher exige dossier_id : le mail met le séjour à jour, sans montrer le carnet.",
    input: {
      id: z.string().trim().describe("Identifiant de l’e-mail en attente"),
      action: z.enum(["rattacher", "refuser"]).describe("rattacher ou refuser"),
      dossier_id: z.string().trim().optional().describe("Dossier choisi, obligatoire pour rattacher"),
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
      "Met à jour le prénom, le nom, l’e-mail, le téléphone ou la société d’un client déjà identifié. La société est enregistrée sur la fiche (même SIRET : mise à jour, pas une seconde ligne). Ne crée pas de fiche. Aucun message.",
    input: {
      id: z.string().trim().describe("Identifiant du client"),
      prenom: z.string().max(80).optional().describe("Prénom"),
      nom: z.string().max(80).optional().describe("Nom"),
      email: z.string().trim().optional().describe("E-mail"),
      telephone: z.string().max(40).optional().describe("Téléphone"),
      societe: z.string().max(200).optional().describe("Raison sociale, comme raison_sociale"),
      ...COMPANY_FIELDS,
    },
    run: (args) => updateClient(args),
  },
  {
    name: "ajouter_piece",
    write: true,
    openWorld: true,
    description:
      "Dépose une pièce (visa, ETA, passeport, assurance) dans l’espace client, comme le formulaire Pièces. client_id, ou dossier_id / reference. voyageur_id : voyageur du séjour, ou accompagnateur déjà lié au client sans dossier. Fichier en base64. Sur un séjour, la pièce du même type déjà liée à ce voyageur est remplacée : une ETA ne remplace pas un visa. Un passeport déjà enregistré est complété : le fichier et les champs fournis (numéro, expiration, pays) sont écrits ; délivrance, autorité, noms, naissance, nationalité, sexe et lieu restent. Le pays émetteur n’est pas recopié dans la nationalité. Par défaut, une formalité (visa ou ETA) liée au séjour envoie le WhatsApp « formalité prête » au client et au voyageur concerné s’il a un autre numéro. Une fiche qui a activé WhatsApp reçoit le modèle avec bouton ; sinon le modèle sans lien, une fois approuvé. Le client déjà prévenu n’est pas renvoyé. Un passeport, ou une pièce sans séjour, n’envoie rien. notifier false coupe l’envoi. Le numéro n’est pas renvoyé.",
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
      type: z.string().trim().max(40).describe("visa, eta, passeport, carte_identite, assurance ou autre"),
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
    name: "creer_dossier",
    write: true,
    description:
      "Crée un dossier pour un client déjà en fiche. Titre, destination, dates, notes. Une correspondance aérienne (moins de 24 h, sans hôtel) n’est pas la destination : aller simple = dernière ville, aller-retour = ville où l’on fait demi-tour. societe_id ou facturer_societe facture la société du client (payer_kind société) ; sinon le séjour reste particulier. Erreur s’il n’y a aucune société ou plusieurs sans societe_id. L’état est En préparation : le client ne le voit pas. Aucune invitation, aucun message. Renvoie l’identifiant et la référence TB-AAAA-NNNN.",
    input: {
      client_id: z.string().trim().describe("Identifiant du client"),
      titre: z.string().trim().describe("Titre du séjour"),
      destination: z.string().trim().max(200).optional().describe("Destination"),
      date_depart: z.string().trim().max(40).optional().describe("Départ, AAAA-MM-JJ"),
      date_retour: z.string().trim().max(40).optional().describe("Retour, AAAA-MM-JJ"),
      notes: z.string().trim().max(5000).optional().describe("Note visible par le client une fois le séjour montré"),
      notes_internes: z.string().trim().max(5000).optional().describe("Note interne, jamais côté client"),
      devise: z.string().trim().max(12).optional().describe("Devise du dossier, 3 lettres. EUR si omise. THB reste THB"),
      societe_id: z.string().trim().max(80).optional().describe("Société de facturation déjà sur la fiche"),
      facturer_societe: z
        .boolean()
        .optional()
        .describe("Facturer l’unique société du client. Erreur s’il n’y en a aucune ou plusieurs"),
    },
    run: (args) => createDossier(args),
  },
  {
    name: "ajouter_voyageur",
    write: true,
    description:
      "Ajoute un voyageur au dossier et à la liste du client. Civilité, prénoms, nom, naissance, nationalité, téléphone. Le passeport est enregistré comme sur la fiche. Le numéro n’est pas renvoyé. L’e-mail n’ouvre pas de compte et n’est pas enregistré. Aucun message.",
    input: {
      client_id: z.string().trim().max(80).optional().describe("Identifiant du client"),
      dossier_id: z.string().trim().max(80).optional().describe("Identifiant du dossier"),
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
      prenoms: z.string().trim().describe("Prénoms"),
      nom: z.string().trim().describe("Nom"),
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
    name: "ajouter_vol",
    write: true,
    description:
      "Ajoute une carte vol au dossier, comme dans l’agence : compagnie, numéro, aéroports, horaires locaux, cabine, PNR, voyageurs, prix. Une correspondance (arrivée et départ en avion en moins de 24 h, sans hôtel ni autre service sur place) sort du titre et d’une destination qui n’est qu’une liste de villes. Une nuit d’hôtel garde la ville. Une devise différente de celle du dossier reste le prix du document, sans conversion. Le séjour caché ne débite pas. Aucun message.",
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
      devise: z.string().trim().max(12).optional().describe("Devise du prix. Celle du dossier si omise"),
      fournisseur: z.string().trim().max(120).optional().describe("Fournisseur"),
    },
    run: (args) => addVol(args),
  },
  {
    name: "modifier_vol",
    write: true,
    description:
      "Corrige une carte vol déjà au dossier : aéroports, horaires locaux, cabine, PNR, voyageurs, prix. L’heure saisie reste l’heure de l’aéroport ; le fuseau (Europe/Paris, Asia/Bangkok) est enregistré sur la carte. prix est un billet, prix_total est le total du groupe pour cette carte. Le séjour caché ne débite pas. Aucun message.",
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
      voyageurs: z.array(z.string()).optional().describe("Identifiants des voyageurs. Omis : les billets déjà sur la carte restent"),
      prix: z.union([z.number(), z.string()]).optional().describe(PRIX_BILLET),
      prix_total: z.union([z.number(), z.string()]).optional().describe(PRIX_GROUPE),
      devise: z.string().trim().max(12).optional().describe("Devise du prix. Celle du dossier si omise"),
      fournisseur: z.string().trim().max(120).optional().describe("Fournisseur"),
    },
    run: (args) => updateVol(args),
  },
  {
    name: "ajouter_hotel",
    write: true,
    description:
      "Ajoute une carte hôtel : nom, ville, pays, dates, chambre, pension, inclus, confirmation, fournisseur, prix (THB compris) et texte d’annulation s’il est indiqué. Le séjour caché ne débite pas. Aucun message.",
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
      voyageurs: z.array(z.string()).optional().describe("Identifiants des voyageurs du dossier"),
    },
    run: (args) => addHotel(args),
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
