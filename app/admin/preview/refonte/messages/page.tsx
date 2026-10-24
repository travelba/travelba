import { RefonteMessages } from "@/components/admin/refonte/RefonteBoards";
import { loadRefonteSnapshot } from "@/lib/crm/refonte-load";

export const metadata = { title: "Messages" };

export default async function RefonteMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string | string[] }>;
}) {
  const query = await searchParams;
  const canal = Array.isArray(query.canal) ? query.canal[0] : query.canal;
  const snapshot = await loadRefonteSnapshot();
  return <RefonteMessages snapshot={snapshot} canal={canal || "tous"} />;
}
