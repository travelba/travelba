import { siteConfig } from "@/lib/site";
import { AdminNav } from "@/components/admin/AdminNav";
import { getSessionUser, getStaffForUser } from "@/lib/crm/auth";
import { adminBadges, EMPTY_ADMIN_BADGES } from "@/lib/crm/admin-badges";

export const metadata = {
  title: `Admin — ${siteConfig.shortName}`,
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
  const badges = staff ? await adminBadges() : EMPTY_ADMIN_BADGES;

  return (
    <div className="admin-af min-h-screen">
      <AdminNav
        unmatchedCount={badges.revolut}
        emailCount={badges.emails}
        leCount={badges.le}
        staffName={staff?.full_name || ""}
        staffRole={staff?.role}
      >
        {children}
      </AdminNav>
    </div>
  );
}
