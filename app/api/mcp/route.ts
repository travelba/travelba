import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextResponse } from "next/server";
import { mcpAccessFromAuthorization, mcpAuthorized, runWithMcpAccess } from "@/lib/crm/mcp-auth";
import { registerTravelbaTools } from "@/lib/crm/mcp-registry";

export const runtime = "nodejs";
export const maxDuration = 60;

const INSTRUCTIONS =
  "CRM Travel BA pour l’agence. Lectures et écritures : crédit d’un virement, crédit Revolut vers le client désigné, montrer un carnet, mettre à jour un dossier, confirmer un service, traiter un e-mail (lire_email donne le corps, le texte des PDF et le billet déjà lu, sans numéro de passeport ni de carte ; rattacher et mettre_a_jour déposent les pièces sur la carte qui correspond, ou sur le dossier, et ne créent ni ne modifient aucune carte ; creer_dossier trouve ou crée la fiche, y compris sans e-mail si le billet n’en a pas, crée le dossier caché et les cartes du billet, un aller-retour au même PNR en une carte à l’écran, sans invitation), créer ou mettre à jour un client, déposer une pièce (ajouter_piece : WhatsApp « formalité prête » au client et au voyageur d’un autre numéro (bouton si la fiche a activé WhatsApp, sinon modèle sans lien une fois approuvé) ; notifier false pour le couper ; notifier_piece pour une pièce déjà déposée, destinataires tous, client ou voyageur ; notifier_carte_embarquement envoie au client du dossier le PDF déjà déposé, type carte d’embarquement, document_id, en-tête Document, un message par passager si le PDF a plusieurs pages, sans second envoi pour un passager déjà prévenu. Si la lecture échoue : prenom, vol, trajet, date_heure, siege, ou passagers. Rien n’est inventé. Sans modèle approuvé, l’outil refuse et décrit le modèle à soumettre. ajouter_piece type carte_embarquement dépose ce PDF sur le dossier. requalifier_piece(document_id, type) requalifie une pièce déjà liée au dossier, même liste de types, sans message). Ne pas inventer d’horaires ni de prix. Ne pas choisir un client à la place de l’agence. Un carnet sans carte reste caché. Les numéros de pièce ne sont pas dans les réponses. passeport_voyageur et scan_passeport sont l’espace travelba-passeports (jeton TRAVELBA_MCP_PASSPORT_TOKENS). L’espace travelba, jeton général, refuse : c’est voulu, on n’élargit pas l’accès. passeport_voyageur donne les numéros pour émettre un billet ; scan_passeport donne le fichier (URL dix minutes, un PDF est signalé). creer_carte_pliant et lire_carte_pliant exigent le jeton carte : une carte rattachée au dossier (1 transaction par défaut, usage unique ; un nombre plus grand crée une carte virtuelle réutilisable, plafond total et montant par transaction, aucune restriction), puis son numéro, son expiration et son CVV, pour cette carte seulement. Chaque débit de cette carte se rapproche du dossier. Le jeton général et le jeton passeport refusent. Le numéro n’est pas enregistré. enregistrement_en_ligne lit ou met à jour le statut d’enregistrement de chaque vol (à faire, ouvert, en cours, fait, cartes reçues, envoyées). Sans statut, c’est une lecture. creer_dossier, ajouter_voyageur, ajouter_vol et ajouter_hotel (photos https, adresse, heures seulement si elles sont connues) construisent un séjour En préparation : le client ne le voit pas, aucune invitation, aucun message. fiche_dossier renvoie voyageur_id pour chaque voyageur. modifier_vol corrige une carte vol : voyageur_ids rattache les passagers sans changer le prix, prix est un billet, prix_total est le total du groupe gardé au centime sans division, devise omise garde la devise de la carte (euro par défaut), l’heure reste l’heure locale de l’aéroport. definir_visibilite_carte montre ou cache une seule carte, et inclure_transactions coche ou décoche « Inclure dans les transactions », sans publier le carnet et sans rien envoyer. Sur un carnet déjà montré, un brouillon WhatsApp est préparé ; l’agence l’envoie en un clic. preparer_message_carnet prépare ce brouillon à la main, sans l’envoyer. Le débit reprend la même ligne ; un total de groupe reste au centime. Deux vols à des prix différents, même d’un centime, comptent tous les deux. Les frais de billeterie retirés ne reviennent pas dans le total. Une société (raison sociale, SIRET, TVA, adresse) est enregistrée sur la fiche du client. creer_dossier la facture par défaut (l’unique société, ou la première s’il y en a plusieurs ; societe_id en choisit une). particulier : true laisse le séjour particulier. Sans société, le séjour reste particulier. Un vol à 0 € est accepté. sans_frais, ou un vol à 0 € sans autre vol payant, retire les frais de billeterie. retirer_carte retire une carte et annule son débit. ajouter_voyageur reconnaît le nom d’usage et le premier prénom ; compagnon_id rattache un compagnon. retirer_voyageur retire un voyageur du séjour. fusionner_compagnon retire un doublon sans pièce. reservation_little_emperors lit une réservation Little Emperors (référence, ou nom et hôtel), y compris déjà rattachée, avec reservee_le. little_emperors_en_attente liste les séjours sans dossier du plus récent au plus ancien, sur la date de réservation. modifier_hotel corrige une carte hôtel : le prix de vente ne change que si prix est indiqué, y compris égal au coût net ; un coût en devise (MAD) garde son équivalent en euros. Aucun message. modifier_titulaire met à jour la fiche du titulaire et son passeport (prénoms, nom, nom de passeport, nom d’usage, naissance, lieu, sexe, nationalité, délivrance, adresse personnelle). Le numéro n’est pas renvoyé. pays_passeport n’est pas la nationalité. definir_role_societe pose admin, membre ou particulier, comme la fiche. inviter_client crée l’accès et envoie l’invitation (même flux, e-mail puis WhatsApp si le message part). Rien ne part sans cet appel. Un accès déjà invité ou prêt n’est pas renvoyé. Les autres outils n’invitent pas. envoyer_releve envoie le relevé de compte (customer_id) comme le bouton admin : même PDF, WhatsApp, modèle TWILIO_CONTENT_RELEVE hors 24 h, journal y compris l’échec. L’e-mail n’est pas ouvert. L’auteur est le jeton. Un second envoi réussi dans les cinq minutes est refusé, sauf force. La réponse donne le SID Twilio et le statut.";

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
