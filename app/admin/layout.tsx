import { siteConfig } from "@/lib/site";
import { AdminNav } from "@/components/admin/AdminNav";
import { getStaffForUser } from "@/lib/crm/auth";
import { createClient } from "@/lib/supabase/server";
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
  let staffName = "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const staff = user ? await getStaffForUser(user.id) : null;
  if (staff) {
    staffName = staff.full_name || "";
    try {
      const admin = createServiceClient();
      const { count } = await admin
        .from("crm_revolut_transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "unmatched")
        .eq("direction", "credit");
      unmatched = count ?? 0;
    } catch {
      unmatched = 0;
    }
  }

  return (
    <div className="admin-af min-h-screen">
      <AdminNav unmatchedCount={unmatched} staffName={staffName}>
        {children}
      </AdminNav>
    </div>
  );
}
