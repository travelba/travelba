import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextResponse } from "next/server";
import { mcpAuthorized } from "@/lib/crm/mcp-auth";
import { registerTravelbaTools } from "@/lib/crm/mcp-registry";

export const runtime = "nodejs";
export const maxDuration = 60;

const INSTRUCTIONS =
  "CRM Travel BA, lecture seule pour l’agence. Ne pas inventer d’horaires ni de prix. Ne pas créditer Revolut, publier un carnet, ni rattacher un mail. Les numéros de pièce ne sont pas dans les réponses.";

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
  if (!mcpAuthorized(request.headers.get("authorization"))) return unauthorized();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = new McpServer({ name: "travelba", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  registerTravelbaTools(server);
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
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
