import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MtripGuideWorkspace } from "@/components/admin/MtripGuideWorkspace";
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

  return <MtripGuideWorkspace initialGuide={data as AgencyMtripGuide} />;
}
