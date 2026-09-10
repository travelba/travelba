import { createClient } from "@/lib/supabase/server";
import { AdminHomeClient } from "@/components/admin/AdminHomeClient";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const guidesRes = await supabase
    .from("agency_mtrip_guides")
    .select("*")
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false });

  return (
    <AdminHomeClient
      guides={(guidesRes.data || []) as AgencyMtripGuide[]}
    />
  );
}
