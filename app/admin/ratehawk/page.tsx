import { RatehawkDesk, type RatehawkOrder } from "@/components/admin/RatehawkDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { CERTIFICATION_HOTELS } from "@/lib/crm/ratehawk/catalog";
import { certificationEnvironmentAllowed, safeConfig } from "@/lib/crm/ratehawk/config";
import { validateUserPhone } from "@/lib/crm/ratehawk/limits";
import { ratehawkDb } from "@/lib/crm/ratehawk/store";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata = { title: "Ratehawk" };
export const dynamic = "force-dynamic";

const ORDER_COLUMNS =
  "partner_order_id, status, status_reason, hotel_name, hid, checkin, checkout, sell_amount, currency, environment";

export default async function AdminRatehawkPage() {
  const { supabase, staff } = await requireStaffPage();
  const config = safeConfig();
  const cert = staff.role === "ratehawk_cert";
  if (cert && !certificationEnvironmentAllowed(config?.environment)) {
    return (
      <div>
        <PageEyebrow>Certification</PageEyebrow>
        <PageTitle title="Ratehawk" subtitle="La certification Ratehawk n’ouvre que le bac à sable." />
      </div>
    );
  }
  const { orders, mapped } = await loadRatehawkDesk(cert ? certDb() : supabase, cert);

  return (
    <div>
      <PageEyebrow>{cert ? "Certification" : "Espace agence"}</PageEyebrow>
      <PageTitle
        title="Ratehawk"
        subtitle={
          cert
            ? "Recherche, pré-réservation, confirmation et annulation dans le bac à sable Emerging Travel."
            : "Recherche, pré-réservation et confirmation Emerging Travel. Le carnet reste caché tant que l’agence ne le montre pas."
        }
      />
      <div className="mt-6">
        <RatehawkDesk
          configured={Boolean(config?.keyId && config.apiKey)}
          bookingReady={Boolean(config?.agencyEmail.includes("@"))}
          environment={config?.environment || "sandbox"}
          paymentType={config?.paymentType || "deposit"}
          priceIncreasePercent={config?.priceIncreasePercent ?? 10}
          marginPercent={config?.marginPercent ?? 12}
          orders={orders}
          mappedHotels={mapped}
          linkDossier={!cert}
          agencyPhone={config?.agencyPhone && !validateUserPhone(config.agencyPhone) ? config.agencyPhone.trim() : ""}
        />
      </div>
    </div>
  );
}

function certDb(): SupabaseClient | null {
  try {
    return ratehawkDb();
  } catch {
    return null;
  }
}

async function loadRatehawkDesk(reader: SupabaseClient | null, sandboxOnly: boolean) {
  if (!reader) return { orders: [] as RatehawkOrder[], mapped: [] as number[] };
  let ordersQuery = reader
    .from("crm_ratehawk_bookings")
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(40);
  if (sandboxOnly) ordersQuery = ordersQuery.eq("environment", "sandbox");
  const [{ data: orders }, { data: hotels }] = await Promise.all([
    ordersQuery,
    reader.from("crm_ratehawk_hotels").select("hid").in("hid", CERTIFICATION_HOTELS.map((hotel) => hotel.hid)),
  ]);
  return {
    orders: (orders || []) as RatehawkOrder[],
    mapped: (hotels || []).map((row) => Number(row.hid)),
  };
}
