import { applePayAssociationBody } from "@/lib/crm/apple-pay-app";

export const runtime = "nodejs";

/** Fichier de vérification Stripe / Apple Pay. Le contenu vient de l’environnement, pas du dépôt. */
export async function GET() {
  const body = applePayAssociationBody(process.env.APPLE_PAY_DOMAIN_ASSOCIATION);
  if (!body) return new Response("Introuvable", { status: 404 });
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
