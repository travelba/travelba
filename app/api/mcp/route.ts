import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextResponse } from "next/server";
import { mcpAccessFromAuthorization, mcpAuthorized, runWithMcpAccess } from "@/lib/crm/mcp-auth";
import { registerTravelbaTools } from "@/lib/crm/mcp-registry";

export const runtime = "nodejs";
export const maxDuration = 60;

const INSTRUCTIONS =
  "CRM Travel BA pour l’agence. Lectures et écritures : crédit d’un virement, crédit Revolut vers le client désigné, montrer un carnet, mettre à jour un dossier, confirmer un service, traiter un e-mail, créer ou mettre à jour un client, déposer une pièce (ajouter_piece : WhatsApp « formalité prête » au client et au voyageur d’un autre numéro (bouton si la fiche a activé WhatsApp, sinon modèle sans lien une fois approuvé) ; notifier false pour le couper ; notifier_piece pour une pièce déjà déposée, destinataires tous, client ou voyageur). Ne pas inventer d’horaires ni de prix. Ne pas choisir un client à la place de l’agence. Un carnet sans carte reste caché. Les numéros de pièce ne sont pas dans les réponses. passeport_voyageur et scan_passeport sont l’espace travelba-passeports (jeton TRAVELBA_MCP_PASSPORT_TOKENS). L’espace travelba, jeton général, refuse : c’est voulu, on n’élargit pas l’accès. passeport_voyageur donne les numéros pour émettre un billet ; scan_passeport donne le fichier (URL dix minutes, un PDF est signalé). creer_carte_pliant et lire_carte_pliant exigent le jeton carte : une carte à usage unique rattachée au dossier, sans nombre de transactions et aucune restriction, puis son numéro, son expiration et son CVV, pour cette carte seulement. Le jeton général et le jeton passeport refusent. Le numéro n’est pas enregistré. creer_dossier, ajouter_voyageur, ajouter_vol et ajouter_hotel (photos https, adresse, heures seulement si elles sont connues) construisent un séjour En préparation : le client ne le voit pas, aucune invitation, aucun message. modifier_vol corrige une carte vol : prix est un billet, prix_total est le total du groupe pour cette carte, l’heure reste l’heure locale de l’aéroport. Une société (raison sociale, SIRET, TVA, adresse) est enregistrée sur la fiche du client. creer_dossier la facture par défaut (l’unique société, ou la première s’il y en a plusieurs ; societe_id en choisit une). particulier : true laisse le séjour particulier. Sans société, le séjour reste particulier. Un vol à 0 € est accepté. sans_frais, ou un vol à 0 € sans autre vol payant, retire les frais de billeterie. retirer_carte retire une carte et annule son débit. ajouter_voyageur reconnaît le nom d’usage et le premier prénom ; compagnon_id rattache un compagnon. retirer_voyageur retire un voyageur du séjour. fusionner_compagnon retire un doublon sans pièce. Aucun message.";

function unauthorized() {
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}

function methodNotAllowed() {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405, headers: { Allow: "POST" } }
  );
}

/** Streamable HTTP, sans session : un serveur neuf par requête, réponse JSON. */
export async function POST(request: Request) {
  const access = mcpAccessFromAuthorization(request.headers.get("authorization"));
  if (!access) return unauthorized();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = new McpServer({ name: "travelba", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  registerTravelbaTools(server);
  await server.connect(transport);
  try {
    return await runWithMcpAccess(access, () => transport.handleRequest(request));
  } finally {
    await server.close();
  }
}

export function GET(request: Request) {
  if (!mcpAuthorized(request.headers.get("authorization"))) return unauthorized();
  return methodNotAllowed();
}

export function DELETE(request: Request) {
  if (!mcpAuthorized(request.headers.get("authorization"))) return unauthorized();
  return methodNotAllowed();
}
