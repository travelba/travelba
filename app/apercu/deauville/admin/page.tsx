import { RestaurantEveningDesk, type DeskRowView } from "@/components/admin/RestaurantEveningDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { deauvilleHouses, DEAUVILLE_GREETING, DEAUVILLE_STAY } from "@/lib/crm/deauville-preview";
import { eveningBanner, faceLabel, faceTone } from "@/lib/crm/restaurant-desk";
import { formatEveningFr, restaurantDefaultClock } from "@/lib/crm/restaurants";

function heading(date: string) {
  const raw = formatEveningFr(date);
  return raw ? raw.charAt(0).toLocaleUpperCase("fr-FR") + raw.slice(1) : date;
}

export default function DeauvilleAdminPage() {
  const clock = restaurantDefaultClock();
  const rows: DeskRowView[] = deauvilleHouses().map((evening) => ({
    bookingId: `deauville-${evening.date}`,
    date: evening.date,
    dateLabel: heading(evening.date),
    client: DEAUVILLE_STAY.client,
    reference: DEAUVILLE_STAY.reference,
    city: DEAUVILLE_STAY.city,
    hotel: `${DEAUVILLE_STAY.hotel} · ${DEAUVILLE_STAY.covers} couverts`,
    countdown: "avant 18 h",
    closesAt: Date.parse(`${evening.date}T17:00:00.000Z`),
    phase: "envoyer",
    sendBlock: null,
    allowed: true,
    delivery: "apercu",
    clicks: [],
    suggestions: [],
    previewIntro: evening.intro,
    faces: evening.houses.map(({ house }) => ({
      seat: house.seat,
      restaurantId: house.id,
      name: house.name,
      time: `${clock} · ${DEAUVILLE_STAY.covers} couverts`,
      photo: house.salle,
      status: "proposee" as const,
      label: faceLabel("proposee"),
      tone: faceTone("proposee"),
    })),
    previews: evening.houses.map(({ house, text, cards }) => ({
      seat: house.seat,
      name: house.name,
      time: clock,
      intro: text,
      cards: cards.map((card) => ({
        kind: card.title === "La salle" ? ("salle" as const) : ("plat" as const),
        title: card.title,
        body: card.body,
        photo: card.photo,
      })),
    })),
  }));
  const banner = eveningBanner(rows.map((row) => ({ phase: row.phase, clicks: row.clicks.length, faces: row.faces.map((face) => face.status) })));
  return (
    <div className="admin-af min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <PageEyebrow>Espace agence</PageEyebrow>
          <PageTitle
            title="Restaurants du soir"
            subtitle={`${DEAUVILLE_STAY.client} · ${DEAUVILLE_STAY.reference} · ${DEAUVILLE_STAY.hotel}. Aperçu fictif, rien n’est envoyé.`}
          />
        </div>
        <RestaurantEveningDesk rows={rows} banner={banner} readOnly />
        <p className="rounded-3xl bg-[#f4efe4] px-4 py-3 text-sm leading-relaxed text-[#0B192C]">
          L’Essentiel est étoilé. Une vraie sélection le refuserait. Il figure ici parce que cette liste a été demandée pour l’aperçu. Salutation utilisée : {DEAUVILLE_GREETING}.
        </p>
      </div>
    </div>
  );
}
