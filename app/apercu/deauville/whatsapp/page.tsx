import { RestaurantPhone } from "@/components/crm/RestaurantPhone";
import { deauvillePhones, DEAUVILLE_STAY } from "@/lib/crm/deauville-preview";

export default function DeauvilleWhatsappPage() {
  const phones = deauvillePhones();
  return (
    <div className="admin-af min-h-screen px-4 py-8">
      <div className="mx-auto max-w-lg space-y-10">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8c7350]">Aperçu fictif</p>
          <h1 className="font-display text-3xl font-semibold text-[#0B192C]">WhatsApp · {DEAUVILLE_STAY.client}</h1>
          <p className="mt-2 text-sm text-[#5c564c]">
            {DEAUVILLE_STAY.reference} · 2 couverts · 20h30. Aucun message n’est envoyé.
          </p>
        </header>
        {phones.map((phone) => (
          <div key={phone.id} id={phone.id}>
            <RestaurantPhone caption={phone.caption} blocks={phone.blocks} />
          </div>
        ))}
      </div>
    </div>
  );
}
