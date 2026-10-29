import { notFound } from "next/navigation";
import { RestaurantCatalog } from "@/components/admin/RestaurantCatalog";
import { RestaurantEveningDesk, type DeskRowView } from "@/components/admin/RestaurantEveningDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { eveningBanner } from "@/lib/crm/restaurant-desk";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import type { RestaurantRecord } from "@/lib/crm/restaurants";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: `Aperçu restaurants — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

const SALLE = "/covers/photo-1523906834658-6e24ef2386f9.webp";
const PLAT = "/covers/photo-1552832230-c0197dd311b5.webp";
const VERRIERE = "/covers/photo-1502602898657-3e91760cbb34.webp";

const soon = Date.now() + 2 * 60 * 60 * 1000;

function row(partial: Partial<DeskRowView> & Pick<DeskRowView, "bookingId" | "client" | "phase" | "faces">): DeskRowView {
  return {
    date: "2026-06-02",
    dateLabel: "mardi 2 juin",
    reference: "TB-EXEMPLE",
    city: "Milan",
    hotel: "Ostuni",
    countdown: "2 h 00",
    closesAt: soon,
    sendBlock: null,
    allowed: true,
    delivery: "modele",
    clicks: [],
    suggestions: [
      { id: "ostuni", name: "Ostuni", photo: SALLE, city: "Milan", complete: true },
      { id: "vittorio", name: "Da Vittorio", photo: VERRIERE, city: "Milan", complete: true },
    ],
    previewIntro: "Bonsoir Madame Morel, nous vous avons préparé une sélection de tables pour votre soirée du mardi 2 juin. Toutes sont déjà réservées à votre nom. Nous vous remercions de bien vouloir accepter celle de votre choix et de refuser les autres ; sans réponse de votre part, elles seront automatiquement annulées à 18 h.\n\nLa Conciergerie Travel BA",
    previews: [],
    ...partial,
  };
}

const ROWS: DeskRowView[] = [
  row({
    bookingId: "choisir",
    client: "Camille Morel",
    phase: "choisir",
    faces: [
      { seat: "A", restaurantId: null, name: "", time: "", photo: null, status: "a_choisir", label: "À choisir", tone: "gris" },
      { seat: "B", restaurantId: null, name: "", time: "", photo: null, status: "a_choisir", label: "À choisir", tone: "gris" },
    ],
  }),
  row({
    bookingId: "envoyer",
    client: "Madame Morel",
    phase: "envoyer",
    faces: [
      { seat: "A", restaurantId: "ostuni", name: "Ostuni", time: "20h30", photo: SALLE, status: "proposee", label: "Proposée", tone: "gris" },
      { seat: "B", restaurantId: "vittorio", name: "Da Vittorio", time: "20h45", photo: VERRIERE, status: "proposee", label: "Proposée", tone: "gris" },
    ],
    previews: [
      {
        seat: "A",
        name: "Ostuni",
        time: "20h30",
        intro: "Bonsoir Madame Morel, pour votre soirée, nous nous sommes permis de vous réserver une table pour deux chez Ostuni, à 20h30. La fiche de la maison suit.\n\nLa Conciergerie Travel BA",
        cards: [
          { kind: "salle", title: "La salle", body: "En salle, une salle calme, lumière basse. Lien https://exemple.invalid/ostuni ici.", photo: SALLE },
          { kind: "plat", title: "Le plat signature", body: "Comptez 90 à 140 € par personne, pour deux.", photo: PLAT },
          { kind: "carte", title: "La carte", body: "La carte du restaurant, à parcourir avant de vous installer.", photo: null },
        ],
      },
    ],
  }),
  row({
    bookingId: "reponse",
    client: "Inès Martin",
    phase: "annuler",
    countdown: "18 h passées",
    closesAt: Date.now() - 60_000,
    faces: [
      { seat: "A", restaurantId: "ostuni", name: "Ostuni", time: "20h30", photo: SALLE, status: "acceptee", label: "Acceptée", tone: "vert" },
      { seat: "B", restaurantId: "vittorio", name: "Da Vittorio", time: "20h45", photo: VERRIERE, status: "a_annuler", label: "À annuler", tone: "orange" },
    ],
    clicks: [{ at: "17 h 12", label: "J'accepte · Ostuni" }],
  }),
];

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
  guaranteeCard: false,
  cancelHours: null,
  cancelFeeCents: null,
  closedWeekdays: [],
  annualClosures: [],
  status: "actif",
  exclusionReason: null,
  starred: false,
  prepaidRequired: false,
  note: "",
  photoUrls: [SALLE],
  menuPhotoUrl: "",
  signaturePhotoUrl: PLAT,
  pitch: "Une salle calme, lumière basse.",
  priceBand: "90 à 140 €",
  placeUrl: "https://exemple.invalid/ostuni",
};

export default function RestaurantPreviewPage() {
  if (!exampleSessionEnabled()) notFound();
  const banner = eveningBanner(ROWS.map((item) => ({ phase: item.phase, clicks: item.clicks.length, faces: item.faces.map((face) => face.status) })));
  return (
    <div className="admin-af min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <PageEyebrow>Espace agence</PageEyebrow>
          <PageTitle title="Restaurants du soir" subtitle="Aperçu fictif. Rien n’est envoyé." />
        </div>
        <div id="soir">
          <RestaurantEveningDesk rows={ROWS} banner={banner} readOnly />
        </div>
        <div id="mode-test" className="rounded-3xl bg-[#8f1d1d] px-4 py-3 text-white">
          <p className="font-display text-lg font-semibold">MODE TEST</p>
          <p className="text-sm">Visible seulement pour Benjamin. Les messages iraient vers RESTAURANT_TEST_PHONE.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <p className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#8f1d1d]">Simuler 18 h</p>
            <p className="rounded-full border border-white px-4 py-2 text-sm font-semibold">Supprimer les données de test</p>
          </div>
        </div>
        <div id="fiche">
          <PageTitle title="Catalogue" subtitle="La carte se met à jour pendant la saisie." />
          <div className="mt-4">
            <RestaurantCatalog rows={[EXAMPLE]} query="" exampleForm />
          </div>
        </div>
      </div>
    </div>
  );
}
