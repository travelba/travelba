import type { Metadata } from "next";
import { CardLinkReveal } from "@/components/crm/CardLinkReveal";
import { cardLinkStatus, type CardLinkStatus } from "@/lib/crm/card-link-run";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Carte de paiement",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ code: string }> };

/** Lien carte envoyé à l’hôtel (B-04). La page n’ouvre rien : seul le bouton compte une ouverture. */
export default async function CardLinkPage({ params }: Props) {
  const { code } = await params;
  let status: CardLinkStatus = { alive: false };
  // Base injoignable : « réessayez », jamais « ce lien ne s’ouvre plus » (le lien est peut-être valable).
  let unavailable = false;
  try {
    status = await cardLinkStatus(code);
  } catch {
    unavailable = true;
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-[0_1px_8px_rgba(11,25,44,0.06)]">
        {unavailable ? (
          <section className="space-y-3">
            <h1 className="text-xl font-bold text-[#0b192c]">Lien momentanément indisponible</h1>
            <p className="text-sm text-[#5a5c60]">
              Le service ne répond pas pour l’instant. Votre lien est peut-être toujours valable : rechargez la page dans
              un instant.
            </p>
            <p className="text-sm text-[#5a5c60]">The service is temporarily unavailable. Please reload this page shortly.</p>
            <a href="" className="inline-flex min-h-11 items-center rounded-full bg-[#0b192c] px-5 text-sm font-semibold text-white">
              Recharger / Reload
            </a>
          </section>
        ) : status.alive ? (
          <CardLinkReveal
            code={code}
            hotel={status.hotel}
            reference={status.reference}
            opensLeft={status.opensLeft}
            expiresAt={status.expiresAt}
          />
        ) : (
          <section className="space-y-3">
            <h1 className="text-xl font-bold text-[#0b192c]">Ce lien ne s’ouvre plus</h1>
            <p className="text-sm text-[#5a5c60]">
              Il a expiré, a déjà servi le nombre de fois prévu, ou a été remplacé par un nouvel envoi. Demandez un
              nouveau lien à l’agence : {siteConfig.contactEmail}.
            </p>
            <p className="text-sm text-[#5a5c60]">
              This link no longer opens. Please ask the agency for a new one.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
