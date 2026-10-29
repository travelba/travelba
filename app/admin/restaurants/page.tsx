import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RestaurantEveningDesk } from "@/components/admin/RestaurantEveningDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { eveningBanner } from "@/lib/crm/restaurant-desk";
import { loadRestaurantBoard } from "@/lib/crm/restaurant-board";
import { RESTAURANT_ALLOWED_BOOKINGS_ENV, restaurantAllowlist } from "@/lib/crm/restaurant-allowlist";
import { RESTAURANT_TEST_COOKIE, restaurantTestOperator, restaurantTestPhone } from "@/lib/crm/restaurant-test";
import { resolveContentSid, whatsappContentApproved } from "@/lib/crm/twilio-content-sid";
import { RESTAURANT_CAROUSEL_ENV, RESTAURANT_INTRO_ENV } from "@/lib/crm/restaurant-whatsapp";

export const metadata = { title: "Restaurants du soir" };

export default async function AdminRestaurantsPage() {
  const { supabase, user, staff } = await requireStaffPage();
  if (staff.role === "partner") redirect("/admin/little-emperors");
  const allowed = restaurantTestOperator(user.email);
  const jar = await cookies();
  const testOn = allowed && jar.get(RESTAURANT_TEST_COOKIE)?.value === "1";
  const intro = await resolveContentSid(RESTAURANT_INTRO_ENV);
  const carousel = await resolveContentSid(RESTAURANT_CAROUSEL_ENV);
  const templatesReady = Boolean(intro && (await whatsappContentApproved(intro)) && carousel && (await whatsappContentApproved(carousel)));
  const board = await loadRestaurantBoard(supabase, {
    test: testOn,
    templatesReady,
    testPhone: Boolean(restaurantTestPhone()),
  });
  const banner = eveningBanner(board.rows.map((row) => ({ phase: row.phase, clicks: row.clicks.length, faces: row.faces.map((face) => face.status) })));
  const allowlist = [...restaurantAllowlist()];

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Restaurants du soir"
          subtitle="Deux tables, un envoi, une annulation. Le compte à rebours va jusqu’à 18 h."
          actions={
            <Link href="/admin/restaurants/catalogue" className="admin-tap inline-flex min-h-11 items-center rounded-full border border-[#0B192C] px-4 text-sm font-semibold text-[#0B192C]">
              Catalogue
            </Link>
          }
        />
      </div>
      <p className="rounded-3xl bg-[#faf9f6] px-5 py-3 text-sm text-[#0B192C]">
        {allowlist.length
          ? `Liste d’essai : ${allowlist.join(", ")}. Les WhatsApp restaurant ne partent que pour ${allowlist.length > 1 ? "ces dossiers" : "ce dossier"}.`
          : `Liste d’essai vide (${RESTAURANT_ALLOWED_BOOKINGS_ENV}) : aucun WhatsApp restaurant ne part, pour aucun dossier.`}
      </p>
      {board.ready ? null : <p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-[#0B192C]">{board.message}</p>}
      <RestaurantEveningDesk rows={board.rows} banner={banner} test={allowed ? { allowed: true, on: testOn } : null} />
    </div>
  );
}
