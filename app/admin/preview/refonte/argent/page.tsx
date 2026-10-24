import { RefonteArgent } from "@/components/admin/refonte/RefonteHome";
import { loadRefonteSnapshot } from "@/lib/crm/refonte-load";

export const metadata = { title: "Argent" };

export default async function RefonteArgentPage() {
  const snapshot = await loadRefonteSnapshot();
  return <RefonteArgent snapshot={snapshot} />;
}
