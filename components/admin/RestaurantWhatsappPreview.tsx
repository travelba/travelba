import { restaurantDeskPreview, type DeskPreviewCard } from "@/lib/crm/restaurant-whatsapp";

const TONE: Record<DeskPreviewCard["kind"], string> = {
  salle: "from-[#1a3348] to-[#0B192C]",
  plat: "from-[#c5a880] to-[#8c7350]",
  carte: "from-[#efe7d8] to-[#d9d1c3]",
};

function Bubble({ children }: { children: string }) {
  return (
    <div className="max-w-xl rounded-2xl rounded-bl-md bg-[#f4efe4] px-3.5 py-3 text-sm leading-relaxed text-[#0B192C] shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
      <p className="whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function Card({ card }: { card: DeskPreviewCard }) {
  const light = card.kind === "carte";
  return (
    <article className="w-56 shrink-0 overflow-hidden rounded-2xl bg-white text-[#0B192C] shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
      <div className={`flex aspect-[16/10] items-end bg-gradient-to-br ${TONE[card.kind]} p-3`}>
        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${light ? "text-[#0B192C]" : "text-[#f4efe4]"}`}>
          {card.title}
        </p>
      </div>
      <div className="space-y-3 p-3">
        <p className="text-sm leading-snug">{card.body}</p>
        <div className="grid grid-cols-2 gap-1.5">
          <p className="rounded-full bg-[#f4efe4] py-1.5 text-center text-xs font-semibold">J&apos;accepte</p>
          <p className="rounded-full bg-[#f4efe4] py-1.5 text-center text-xs font-semibold">Je refuse</p>
        </div>
      </div>
    </article>
  );
}

/** Pré-message, puis un carrousel par restaurant. Les noms sont un exemple. */
export function RestaurantWhatsappPreview() {
  const preview = restaurantDeskPreview();
  return (
    <section id="apercu-whatsapp" className="admin-af-card space-y-4 rounded-3xl p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-[#0B192C]">Messages WhatsApp</h2>
        <p className="mt-1 text-sm text-muted">{preview.caption}</p>
      </div>
      <div className="space-y-5 rounded-3xl bg-[#0B192C] p-4">
        <Bubble>{preview.intro}</Bubble>
        {preview.restaurants.map((restaurant) => (
          <div key={restaurant.seat} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#C5A880]">
              Table {restaurant.seat} · {restaurant.name} · {restaurant.time}
            </p>
            <Bubble>{restaurant.intro}</Bubble>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {restaurant.cards.map((card) => (
                <Card key={`${restaurant.seat}-${card.kind}`} card={card} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
