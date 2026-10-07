import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BookingStateFilter } from "@/lib/crm/admin-list";
import {
  readChercherClients,
  readChercherDossiers,
  readEmailsEnAttente,
  readFicheClient,
  readFicheDossier,
  readFormalites,
  readGrandLivre,
  readLittleEmperorsEnAttente,
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
  McpWriteError,
  publishCarnet,
  settleEmail,
  updateBooking,
  updateClient,
} from "@/lib/crm/mcp-write";
import { redactMcp } from "@/lib/crm/mcp-redact";

/** Au-delà, Grok n’arrive plus à garder tous les outils en tête. */
export const MCP_TOOL_CAP = 40;

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(redactMcp(value)) }],
});

function failed(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

async function guard(name: string, write: boolean, run: () => Promise<unknown>) {
  try {
    return text(await run());
  } catch (err) {
    console.error("[mcp]", name, err instanceof Error ? err.message : "error");
    if (write && err instanceof McpWriteError) return failed(err.message);
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
  run: (args: ToolArgs) => Promise<unknown>;
};

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
      "Dossiers. etat : a-venir, preparation, montre, archive. Sans filtre : les prochains départs. État : En préparation, Visible, ou Archivée.",
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
      "Un dossier : cartes (villes puis code aéroport), voyageurs, état. id ou reference. Pas les contacts d’hôtel.",
    input: {
      id,
      reference: z.string().trim().max(80).optional().describe("Référence du dossier"),
    },
    run: (args: ToolArgs) => readFicheDossier({ id: str(args, "id"), reference: str(args, "reference") }),
  },
  {
    name: "formalites",
    description: "Formalités ouvertes : ETA-IL, ESTA, Royaume-Uni, et tâches du bureau. Lecture seule.",
    run: () => readFormalites(),
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
      "Crée une fiche client (e-mail, prénom, nom). N’envoie pas d’invitation. Un e-mail déjà utilisé est refusé.",
    input: {
      email: z.string().trim().describe("E-mail du client"),
      prenom: z.string().trim().describe("Prénom"),
      nom: z.string().trim().describe("Nom"),
      telephone: z.string().trim().max(40).optional().describe("Téléphone"),
    },
    run: (args) => createClient(args),
  },
  {
    name: "mettre_a_jour_client",
    write: true,
    description:
      "Met à jour le prénom, le nom, l’e-mail, le téléphone ou la société d’un client déjà identifié. Ne crée pas de fiche.",
    input: {
      id: z.string().trim().describe("Identifiant du client"),
      prenom: z.string().max(80).optional().describe("Prénom"),
      nom: z.string().max(80).optional().describe("Nom"),
      email: z.string().trim().optional().describe("E-mail"),
      telephone: z.string().max(40).optional().describe("Téléphone"),
      societe: z.string().max(200).optional().describe("Société"),
    },
    run: (args) => updateClient(args),
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
      async (args) => guard(tool.name, tool.write === true, () => tool.run((args ?? {}) as ToolArgs))
    );
  }
}
