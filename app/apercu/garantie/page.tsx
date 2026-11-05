import type { Metadata } from "next";
import { HotelGuaranteeNight } from "@/components/account/HotelGuaranteeNight";
import { Icon } from "@/components/crm/icons";
import { leCardWidgetUrl } from "@/lib/crm/le-self-book";

export const metadata: Metadata = {
  title: "Garantie — aperçu",
  robots: { index: false, follow: false },
};

/** Même composant que l’étape réelle. Fermé en production par le proxy. */
export default function GuaranteePreviewPage() {
  const widgetUrl = leCardWidgetUrl("https://api-staging.littleemperors.com", "preview") || "";
  return (
    <main className="hotel-theme mx-auto min-h-screen w-full max-w-[480px]" style={{ background: "#0B192C", color: "#f7f4ee" }}>
      <header className="grid h-14 grid-cols-[2.75rem_1fr_2.75rem] items-center" style={{ background: "#0B192C", color: "#f7f4ee" }}>
        <span className="grid h-11 w-11 place-items-center" style={{ color: "#C5A880" }} aria-hidden="true">
          <Icon name="chevron_left" className="h-5 w-5" />
        </span>
        <p className="h-serif text-center text-[17px] font-semibold">Récapitulatif</p>
        <span />
      </header>
      <HotelGuaranteeNight widgetUrl={widgetUrl} state="ready" />
    </main>
  );
}
