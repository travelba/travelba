import { siteConfig } from "@/lib/site";
import { AdminNav } from "@/components/admin/AdminNav";
import { navAllows } from "@/lib/crm/agency-guard";
import { getSessionUser, getStaffForUser } from "@/lib/crm/auth";
import { cachedAdminBadges, EMPTY_ADMIN_BADGES } from "@/lib/crm/admin-badges";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { cachedDockSnapshot, emptyDockSnapshot } from "@/lib/crm/whatsapp-dock-load";

export const metadata = {
  title: {
    default: `Accueil — ${siteConfig.shortName}`,
    template: `%s — ${siteConfig.shortName}`,
  },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getSessionUser();
  const staff = user ? await getStaffForUser(user.id) : null;
  const narrow = !staff || staff.role === "partner" || staff.role === "ratehawk_cert";
  const allows = !narrow ? await navAllows(staff) : null;
  // Compteurs et quai : 45 s en mémoire, lancés sans bloquer le rendu de la page.
  const countsPromise = narrow ? Promise.resolve(EMPTY_ADMIN_BADGES) : cachedAdminBadges();
  const dockPromise = narrow ? Promise.resolve(emptyDockSnapshot()) : cachedDockSnapshot();

  return (
    <div className="admin-af min-h-screen">
      <AdminNav
        countsPromise={countsPromise}
        dockPromise={dockPromise}
        staffName={staff?.full_name || ""}
        staffRole={staff?.role}
        allows={allows}
        showExample={exampleSessionEnabled()}
      >
        {children}
      </AdminNav>
    </div>
  );
}
