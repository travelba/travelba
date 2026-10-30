import { HotelButtonSetting } from "@/components/admin/HotelButtonSetting";
import { HotelPlatinum } from "@/components/account/HotelPlatinum";
import { requireAdminPage } from "@/lib/crm/auth";
import { HOTEL_BUTTON_AUTHORIZED, HOTEL_BUTTON_EVERYONE } from "@/lib/crm/hotel-access";
import { readHotelButtonVisibility } from "@/lib/crm/hotel-access-run";

export const metadata = { title: "Accès Hôtels" };

export default async function HotelAccessSettingsPage() {
  const { staff } = await requireAdminPage();
  if (staff.role !== "admin") {
    return (
      <div>
        <h2 className="mt-6 font-display text-lg font-bold text-[var(--admin-navy)]">Accès Hôtels</h2>
        <p className="mt-1 text-sm text-muted">Réservé aux administrateurs.</p>
      </div>
    );
  }
  const visibility = await readHotelButtonVisibility();
  return (
    <div>
      <h2 className="mt-6 font-display text-lg font-bold text-[var(--admin-navy)]">Accès Hôtels</h2>
      <p className="mt-1 text-sm text-muted">
        Le bouton doré. Au déploiement, seuls les clients dont l’accès est activé le voient.
      </p>
      <HotelButtonSetting value={visibility} />
      <p className="mt-8 text-sm text-muted">
        Aperçu local de l’écran {visibility === HOTEL_BUTTON_EVERYONE ? "ouvert à tous" : "réservé"}. Ce réglage en
        production reste « {visibility === HOTEL_BUTTON_AUTHORIZED ? "Clients autorisés seulement" : "Tous les clients"} ».
        L’aperçu n’enregistre rien.
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="relative h-[640px] overflow-hidden rounded-3xl border border-[#e5e3dc] bg-[#f4efe6]" style={{ transform: "translateZ(0)" }}>
          <HotelPlatinum pending={false} preview />
        </div>
        <div className="relative h-[640px] overflow-hidden rounded-3xl border border-[#e5e3dc] bg-[#f4efe6]" style={{ transform: "translateZ(0)" }}>
          <HotelPlatinum pending preview />
        </div>
      </div>
      <p className="sr-only">{HOTEL_BUTTON_EVERYONE}</p>
    </div>
  );
}
