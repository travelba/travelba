import { siteConfig } from "@/lib/site";
import { AdminNav } from "@/components/admin/AdminNav";
import { getSessionUser, getStaffForUser } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";

export const metadata = {
  title: `Admin — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let unmatched = 0;
  let emailPending = 0;
  let staffName = "";
  const { user } = await getSessionUser();
  const staff = user ? await getStaffForUser(user.id) : null;
  if (staff) {
    staffName = staff.full_name || "";
    try {
      const admin = createServiceClient();
      const [revolut, emails] = await Promise.all([
        admin
          .from("crm_revolut_transactions")
          .select("id", { count: "exact", head: true })
          .eq("status", "unmatched")
          .eq("direction", "credit"),
        admin
          .from("crm_email_ingest")
          .select("id", { count: "exact", head: true })
          .in("status", ["parsed", "matched"]),
      ]);
      unmatched = revolut.count ?? 0;
      emailPending = emails.count ?? 0;
    } catch {
      unmatched = 0;
      emailPending = 0;
    }
  }

  return (
    <div className="admin-af min-h-screen">
      <AdminNav
        unmatchedCount={unmatched}
        emailCount={emailPending}
        staffName={staffName}
        staffRole={staff?.role}
      >
        {children}
      </AdminNav>
    </div>
  );
}
