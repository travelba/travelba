import { siteConfig } from "@/lib/site";
import { AdminNav } from "@/components/admin/AdminNav";
import { getSessionUser, getStaffForUser } from "@/lib/crm/auth";
import { adminBadges, EMPTY_ADMIN_BADGES } from "@/lib/crm/admin-badges";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { emptyDockSnapshot, loadDockSnapshot } from "@/lib/crm/whatsapp-dock-load";

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
  // Comptés une fois par requête : le tableau de bord réutilise le même résultat (A-23, D-41).
  const [badges, dock] =
    staff && staff.role !== "partner"
      ? await Promise.all([adminBadges(), loadDockSnapshot()])
      : [EMPTY_ADMIN_BADGES, emptyDockSnapshot()];

  return (
    <div className="admin-af min-h-screen">
      <AdminNav
        counts={badges}
        whatsappThreads={dock.threads}
        whatsappTemplates={dock.templates}
        whatsappPreview={dock.previewBlocked}
        staffName={staff?.full_name || ""}
        staffRole={staff?.role}
        showExample={exampleSessionEnabled()}
      >
        {children}
      </AdminNav>
    </div>
  );
}
