import { RatehawkDesk, type RatehawkOrder } from "@/components/admin/RatehawkDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { CERTIFICATION_HOTELS } from "@/lib/crm/ratehawk/catalog";
import { safeConfig } from "@/lib/crm/ratehawk/config";

export const metadata = { title: "Ratehawk" };
export const dynamic = "force-dynamic";

export default async function AdminRatehawkPage() {
  const { supabase } = await requireStaffPage();
  const config = safeConfig();
  const [{ data: orders }, { data: hotels }] = await Promise.all([
    supabase
      .from("crm_ratehawk_bookings")
      .select("partner_order_id, status, status_reason, hotel_name, hid, checkin, checkout, sell_amount, currency, environment")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("crm_ratehawk_hotels").select("hid").in("hid", CERTIFICATION_HOTELS.map((hotel) => hotel.hid)),
  ]);
  const mapped = (hotels || []).map((row) => Number(row.hid));

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Ratehawk"
        subtitle="Recherche, pré-réservation et confirmation Emerging Travel. Le carnet reste caché tant que l’agence ne le montre pas."
      />
      <div className="mt-6">
        <RatehawkDesk
          configured={Boolean(config?.keyId && config.apiKey)}
          bookingReady={Boolean(config?.agencyEmail.includes("@"))}
          environment={config?.environment || "sandbox"}
          paymentType={config?.paymentType || "deposit"}
          priceIncreasePercent={config?.priceIncreasePercent ?? 10}
          marginPercent={config?.marginPercent ?? 12}
          orders={(orders || []) as RatehawkOrder[]}
          mappedHotels={mapped}
        />
      </div>
    </div>
  );
}
