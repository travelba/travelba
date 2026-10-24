import { RefonteKanban } from "@/components/admin/refonte/RefonteBoards";
import { loadRefonteSnapshot } from "@/lib/crm/refonte-load";

export const metadata = { title: "Dossiers" };

export default async function RefonteDossiersPage() {
  const snapshot = await loadRefonteSnapshot();
  return <RefonteKanban snapshot={snapshot} />;
}
