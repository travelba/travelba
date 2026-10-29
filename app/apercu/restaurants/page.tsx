import { notFound } from "next/navigation";
import { RestaurantCatalog } from "@/components/admin/RestaurantCatalog";
import { RestaurantWhatsappPreview } from "@/components/admin/RestaurantWhatsappPreview";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import type { RestaurantRecord } from "@/lib/crm/restaurants";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: `Aperçu restaurants — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

const EXAMPLE: RestaurantRecord = {
  id: "exemple-ostuni",
  name: "Ostuni",
  city: "Milan",
  cityKey: "milan",
  address: "Via Solferino 12",
  lat: 45.47,
  lng: 9.19,
  phone: "",
  website: "https://exemple.invalid/ostuni",
  categories: ["italien"],
  platform: "thefork",
  bookingUrl: "",
  bot: "partiel",
  guaranteeCard: true,
  cancelHours: 24,
  cancelFeeCents: null,
  closedWeekdays: [],
  annualClosures: [],
  status: "actif",
  exclusionReason: null,
  starred: false,
  prepaidRequired: false,
  note: "",
  photoUrls: ["https://exemple.invalid/ostuni-salle.jpg", "https://exemple.invalid/ostuni-bar.jpg"],
  menuPhotoUrl: "https://exemple.invalid/ostuni-carte.jpg",
  signaturePhotoUrl: "https://exemple.invalid/ostuni-plat.jpg",
  pitch: "Une salle calme, lumière basse.",
  priceBand: "90 à 140 €",
  placeUrl: "https://exemple.invalid/ostuni",
};

/** Même écran que l’admin, avec un restaurant fictif. Fermé en production. Aucune écriture. */
export default function RestaurantPreviewPage() {
  if (!exampleSessionEnabled()) notFound();
  return (
    <div className="admin-af min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <PageEyebrow>Espace agence</PageEyebrow>
          <PageTitle
            title="Restaurants"
            subtitle="Aperçu local. Madame Morel et Ostuni sont fictifs. Rien n’est enregistré ni envoyé."
          />
        </div>
        <RestaurantWhatsappPreview />
        <RestaurantCatalog rows={[EXAMPLE]} query="" exampleForm />
      </div>
    </div>
  );
}
