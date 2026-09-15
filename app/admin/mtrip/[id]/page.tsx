import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MtripGuideWorkspace } from "@/components/admin/MtripGuideWorkspace";
import { MtripCrmLinker } from "@/components/admin/MtripCrmLinker";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";

type Props = { params: Promise<{ id: string }> };

export default async function AdminMtripGuidePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data, error } = await supabase
    .from("agency_mtrip_guides")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) notFound();

  const guide = data as AgencyMtripGuide;
  const { data: bookings } = await supabase
    .from("crm_bookings")
    .select("id,reference,title")
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <MtripGuideWorkspace initialGuide={guide} />
      <MtripCrmLinker
        guideId={guide.id}
        status={guide.status}
        appLinks={guide.app_links || {}}
        bookings={bookings || []}
      />
    </div>
  );
}
