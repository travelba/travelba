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
  readServicesAConfirmer,
  readTableauDeBord,
} from "@/lib/crm/mcp-read";
import { redactMcp } from "@/lib/crm/mcp-redact";

/** Au-delà, Grok n’arrive plus à garder tous les outils en tête. */
export const MCP_TOOL_CAP = 40;

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(redactMcp(value)) }],
});

const failed = {
  isError: true as const,
  content: [{ type: "text" as const, text: "Lecture impossible." }],
};

async function guard(name: string, run: () => Promise<unknown>) {
  try {
    return text(await run());
  } catch (err) {
    console.error("[mcp]", name, err instanceof Error ? err.message : "error");
    return failed;
  }
}

const q = z.string().trim().max(80).optional().describe("Nom, société, e-mail, téléphone ou référence");
const id = z.string().trim().max(80).optional().describe("Identifiant du client ou du dossier");

type ToolArgs = Record<string, unknown>;

type ToolDef = {
  name: string;
  description: string;
  input?: Record<string, z.ZodType>;
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
      "À faire aujourd’hui : virements, mails, Little Emperors, formalités, services, départs, pièces. Lecture seule.",
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
      "Dossiers. etat : a-venir, preparation, montre, archive. Sans filtre : les prochains départs. État : En préparation, Montré au client, ou Archivée.",
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
    description: "Chauffeur, accueil VIP et enregistrement encore à confirmer.",
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
    description: "Virements Revolut reçus, pas encore rapprochés. Ne crédite personne.",
    run: () => readRevolutEnAttente(),
  },
  {
    name: "emails_en_attente",
    description: "Mails fournisseurs en attente de relecture. Ne rattache rien.",
    run: () => readEmailsEnAttente(),
  },
  {
    name: "little_emperors_en_attente",
    description: "Séjours Little Emperors sans dossier. Ne crée rien.",
    run: () => readLittleEmperorsEnAttente(),
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
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async (args) => guard(tool.name, () => tool.run((args ?? {}) as ToolArgs))
    );
  }
}
