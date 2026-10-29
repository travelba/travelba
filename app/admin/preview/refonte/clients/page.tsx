import { RefonteClients } from "@/components/admin/refonte/RefonteBoards";
import { loadRefonteSnapshot } from "@/lib/crm/refonte-load";

export const metadata = { title: "Clients" };

export default async function RefonteClientsPage() {
  const snapshot = await loadRefonteSnapshot();
  return <RefonteClients snapshot={snapshot} />;
}
