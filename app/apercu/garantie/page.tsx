import type { Metadata } from "next";
import { HotelGuaranteePreview } from "@/components/account/HotelGuaranteePreview";
import { leCardWidgetUrl } from "@/lib/crm/le-self-book";
import { GUARANTEE_VARIANTS, guaranteeFrameState, guaranteeVariant } from "@/lib/crm/hotel-guarantee";

export const metadata: Metadata = {
  title: "Garantie — aperçu",
  robots: { index: false, follow: false },
};

export default async function GuaranteePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ variante?: string; etat?: string; barre?: string }>;
}) {
  const query = await searchParams;
  const variant = guaranteeVariant(query.variante);
  const state = guaranteeFrameState(query.etat);
  const widgetUrl = leCardWidgetUrl("https://api-staging.littleemperors.com", "preview") || "";
  const showBar = query.barre !== "0";
  return (
    <main className={`min-h-screen ${variant === "nuit" ? "bg-[#0B192C]" : "bg-[#e7e1d6]"}`}>
      {showBar ? (
        <nav className="mx-auto flex max-w-[980px] flex-wrap gap-2 px-4 py-3 text-sm" aria-label="Variantes">
          {GUARANTEE_VARIANTS.map((item) => (
            <a
              key={item.id}
              href={`/apercu/garantie?variante=${item.id}&etat=${state}`}
              className={`rounded-full px-3 py-1.5 ${item.id === variant ? "bg-[#0B192C] text-[#f7f4ee]" : "bg-white text-[#1a1a1a]"}`}
              aria-current={item.id === variant ? "page" : undefined}
            >
              Option {item.option} · {item.title}
            </a>
          ))}
          <a className="rounded-full bg-white px-3 py-1.5 text-[#1a1a1a]" href={`/apercu/garantie?variante=${variant}&etat=chargement`}>
            Chargement
          </a>
          <a className="rounded-full bg-white px-3 py-1.5 text-[#1a1a1a]" href={`/apercu/garantie?variante=${variant}&etat=enregistree`}>
            Carte enregistrée
          </a>
        </nav>
      ) : null}
      <HotelGuaranteePreview variant={variant} state={state} widgetUrl={widgetUrl} />
    </main>
  );
}
