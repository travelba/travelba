import { notFound } from "next/navigation";
import { RefonteShell } from "@/components/admin/refonte/RefonteShell";
import { loadRefonteSnapshot } from "@/lib/crm/refonte-load";
import { refontePreviewEnabled } from "@/lib/crm/refonte-preview";

export const dynamic = "force-dynamic";

export default async function RefonteLayout({ children }: { children: React.ReactNode }) {
  if (!refontePreviewEnabled()) notFound();
  const snapshot = await loadRefonteSnapshot();
  return (
    <RefonteShell
      staffName={snapshot.staffName}
      staffRole={snapshot.staffRole}
      hits={snapshot.search}
      taskCount={snapshot.counts.tasks}
      messageCount={snapshot.counts.messages}
    >
      {children}
    </RefonteShell>
  );
}
