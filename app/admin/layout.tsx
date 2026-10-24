import { siteConfig } from "@/lib/site";
import { AdminNav } from "@/components/admin/AdminNav";
import { navAllows } from "@/lib/crm/agency-guard";
import { getSessionUser, getStaffForUser } from "@/lib/crm/auth";
import { adminBadges, EMPTY_ADMIN_BADGES } from "@/lib/crm/admin-badges";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { emptyDockSnapshot, loadDockSnapshot } from "@/lib/crm/whatsapp-dock-load";

export const metadata = {
  title: {
    default: `Tableau de bord — ${siteConfig.shortName}`,
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
  // Comptés une fois par requête : le tableau de bord réutilise le même résultat (A-23, D-41).
  const badges = staff && staff.role !== "partner" ? await adminBadges() : EMPTY_ADMIN_BADGES;
  const allows = staff && staff.role !== "partner" ? await navAllows(staff) : null;
  const dock = staff && staff.role !== "partner" ? await loadDockSnapshot() : emptyDockSnapshot();

  return (
    <div className="admin-af min-h-screen">
      <AdminNav
        unmatchedCount={badges.revolut}
        stripeCount={badges.stripe}
        emailCount={badges.emails}
        leCount={badges.le}
        pieceCount={badges.pieces}
        whatsappCount={badges.whatsapp}
        whatsappThreads={dock.threads}
        whatsappTemplates={dock.templates}
        whatsappPreview={dock.previewBlocked}
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
